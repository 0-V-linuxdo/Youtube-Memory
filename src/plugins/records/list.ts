// Records list (N-5.4, replacing the layout of part one 1.4): the custom panel of the Records plugin's large
// settings dialog. Toolbar (search + filter; count, storage badge, refresh spinner), then a single column of
// Void++ cards. Data, titles, DeArrow, live updates and ordering (D-5) follow part one.

import { confirmDialog } from '../../api/dialogs';
import { currentDuration, urlVideoId } from '../../api/player';
import { listRecords, readRecord, recordChanges, removeRecord, updateRecord, type RecordEntry, type VideoRecord } from '../../api/records';
import { isRunning } from '../../api/plugins';
import { listRowButtons, rowsChanged, type RowContext } from '../../api/rows';
import { cachedDearrow, cachedOriginalTitle, fetchDearrowTitle, fetchOriginalTitle, getSources, resolveTitle } from '../../api/titles';
import { card, cardMark, emptyState, iconButton, searchBar, setIconButtonLabel, type CardHandle } from '../../api/ui';
import { EVT_DEARROW_READY, EVT_RECORD_UPDATED, EVT_VIDEO_STATUS, UNKNOWN_TITLE, watchUrl } from '../../utils/constants';
import { h, icon } from '../../utils/dom';
import { getMode } from '../../utils/storage';
import { tr } from '../../utils/i18n';
import { formatTime, isPlaceholderTitle, normalizeTitle, sameTitle } from '../../utils/text';

/** Title shown per video (original vs DeArrow), kept across rebuilds (fixes R-Q6). */
const showOriginal = new Map<string, boolean>();
/** U-29 DeArrow availability per video for this page session. */
const availability = new Map<string, { state: 'available'; title: string } | { state: 'missing' }>();

const FINISHED_MARGIN_S = 5;

/** N-5.4.1: name of the current storage backend for the toolbar badge. */
function storageName(): string {
  return getMode() === 'gm' ? tr('GM storage', 'GM 存储') : tr('Browser storage', '浏览器本地存储');
}

interface Progress { seconds: number; duration: number }

function progressOf(videoId: string, record: VideoRecord | null, liveProgress?: number): Progress {
  const raw = Number(liveProgress ?? (record ? record.videoProgress : 0));
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : 0;
  let duration = Number(record ? record.videoDuration : 0);
  if (!(duration > 0) && videoId === urlVideoId()) duration = currentDuration();
  return { seconds, duration: duration > 0 ? duration : 0 };
}

/** N-5.4.2 description: "Watched 51.4% · 5:26 / 10:34", or "Watched to 0:10" without a duration (N-2.6). */
export function progressText(videoId: string, record: VideoRecord | null, liveProgress?: number): string {
  const { seconds, duration } = progressOf(videoId, record, liveProgress);
  if (duration > 0) {
    const pct = Math.min(100, Math.max(0, (seconds / duration) * 100)).toFixed(1);
    return tr('Watched {pct}% · {pos} / {dur}', '已看 {pct}% · {pos} / {dur}', { pct, pos: formatTime(Math.min(seconds, duration)), dur: formatTime(duration) });
  }
  return tr('Watched to {pos}', '已看到 {pos}', { pos: formatTime(seconds) });
}

function isFinished(videoId: string, record: VideoRecord | null): boolean {
  const { seconds, duration } = progressOf(videoId, record);
  if (!(duration > 0)) return false;
  return duration - seconds < FINISHED_MARGIN_S || (seconds / duration) * 100 >= 99;
}

/** N-5.4.2 footer: local "YYYY-MM-DD HH:mm". */
function savedText(record: VideoRecord | null): string {
  const ms = Number(record ? record.saveDate : NaN);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return tr('Saved {time}', '保存于 {time}', { time: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` });
}

function noteOf(record: VideoRecord | null): string {
  return record && typeof record.videoNote === 'string' ? record.videoNote.trim() : '';
}

/** U-33/U-34/R-43: store the DeArrow title as videoName after making sure the original title is known. */
async function persistDearrow(videoId: string, title: string): Promise<void> {
  try {
    const rec = readRecord(videoId);
    if (!rec) return;
    if (typeof rec.originalTitle !== 'string' || !rec.originalTitle.trim()) await fetchOriginalTitle(videoId);
    updateRecord(videoId, cur => {
      if (!cur) return null;
      if (typeof cur.originalTitle === 'string' && sameTitle(cur.originalTitle, title)) return null;
      if (cur.videoName === title) return null;
      return { ...cur, videoName: title };
    }, 'content');
  } catch (err) {
    console.warn('[Video Memory] Failed to persist DeArrow title to storage:', err);
  }
}

const LOADING_ORIGINAL = () => tr('Loading original title…', '正在获取原标题…');
const ORIGINAL_UNAVAILABLE = () => tr('Original title unavailable', '未找到原标题');

class RecordCard {
  readonly card: CardHandle;
  private daBtn: HTMLButtonElement | null = null;
  private dearrow: string | null = null;
  private original: string | null = null;
  private originalDone = false;
  private loadingOriginal = false;
  private disposers: Array<() => void> = [];
  private record: VideoRecord;

  constructor(entry: RecordEntry & { record: VideoRecord }, private readonly isCurrent: boolean, private readonly onDeleted: (c: RecordCard) => void) {
    this.videoId = entry.videoId;
    this.record = entry.record;
    this.card = card({
      icon: isCurrent ? 'play' : 'clock-rotate-left',
      title: '',
      cls: `ysrp-record${isCurrent ? ' is-current' : ''}`,
      dataset: { videoId: entry.videoId }
    });
    this.card.titleEl.classList.add('ysrp-record-title');
    this.card.descEl.classList.add('ysrp-record-progress');

    this.initTitles();

    const ctx: RowContext = {
      videoId: this.videoId,
      record: entry.record,
      url: watchUrl(this.videoId),
      isCurrent,
      title: () => this.currentTitle(),
      refresh: () => this.refresh()
    };
    for (const contribution of listRowButtons()) {
      try {
        const parts = contribution.create(ctx);
        if (!parts) continue;
        this.card.controlsEl.appendChild(parts.button);
        if (parts.dispose) this.disposers.push(parts.dispose);
      } catch (err) {
        console.error(`[Video Memory] Record control ${contribution.id} failed:`, err);
      }
    }
    // Core delete button is always last (R-79), confirmed in a dialog (N-5.4.7).
    this.card.controlsEl.appendChild(iconButton('trash-can', tr('Delete record', '删除记录'), 'is-delete', () => { void this.confirmDelete(); }));
    this.refresh();
  }

  readonly videoId: string;

  get el(): HTMLElement { return this.card.el; }

  currentTitle(): string {
    return this.card.titleEl.textContent || UNKNOWN_TITLE;
  }

  /** Re-read the record and redraw marks, description and footer. */
  refresh(liveProgress?: number): void {
    const rec = readRecord(this.videoId);
    if (rec) this.record = rec;
    this.updateProgress(liveProgress);
    const marks: HTMLElement[] = [];
    if (this.isCurrent) marks.push(cardMark('circle-dot', tr('Now playing', '正在播放'), 'is-now'));
    const note = noteOf(this.record);
    if (note) marks.push(cardMark('note-sticky', note.length > 80 ? `${note.slice(0, 80)}…` : note, 'is-note-mark'));
    this.card.marksEl.replaceChildren(...marks);
  }

  /** N-5.4.8: a progress update only changes the description line (and the saved time). */
  updateProgress(liveProgress?: number): void {
    const rec = readRecord(this.videoId) || this.record;
    this.card.setDesc(progressText(this.videoId, rec, liveProgress));
    this.card.setFooter(savedText(rec));
  }

  matches(query: string, filter: string): boolean {
    const rec = readRecord(this.videoId) || this.record;
    if (filter === 'notes' && !noteOf(rec)) return false;
    if (filter === 'finished' && !isFinished(this.videoId, rec)) return false;
    if (filter === 'progress' && isFinished(this.videoId, rec)) return false;
    if (!query) return true;
    const hay = [this.currentTitle(), this.original || '', this.dearrow || '', String(rec.videoName || ''), String(rec.originalTitle || ''), this.videoId, noteOf(rec)]
      .join('\n').toLowerCase();
    return hay.includes(query);
  }

  destroy(): void {
    for (const fn of this.disposers.splice(0)) {
      try { fn(); } catch { /* ignore */ }
    }
  }

  private async confirmDelete(): Promise<void> {
    const ok = await confirmDialog({
      title: tr('Delete record', '删除记录'),
      desc: tr('Delete saved progress for “{title}”? This cannot be undone.', '删除“{title}”的保存进度？此操作无法撤销。', { title: this.currentTitle() }),
      confirmLabel: tr('Delete', '删除'),
      danger: true
    });
    if (!ok) return;
    // R-80 / N-7.7: the 'delete' change also removes the cloud copy.
    removeRecord(this.videoId, 'delete');
    showOriginal.delete(this.videoId);
    this.destroy();
    this.card.el.remove();
    this.onDeleted(this);
  }

  /* ------------------------------------------------------- titles (R-29..R-48) */

  private initTitles(): void {
    const { videoId, record } = this;
    const storedOriginal = typeof record.originalTitle === 'string' ? normalizeTitle(record.originalTitle) : '';
    this.original = storedOriginal || cachedOriginalTitle(videoId) || getSources(videoId).original || null;
    this.originalDone = Boolean(this.original);

    const avail = availability.get(videoId);
    if (avail && avail.state === 'missing') {
      this.dearrow = null;
    } else {
      const fromName = normalizeTitle(record.videoName);
      const resolved = resolveTitle(videoId);
      const candidates = [
        getSources(videoId).dearrow,
        resolved.source === 'dearrow' ? resolved.title : '',
        avail && avail.state === 'available' ? avail.title : '',
        cachedDearrow(videoId) || '',
        !isPlaceholderTitle(fromName) && !sameTitle(fromName, this.original) ? fromName : ''
      ];
      this.dearrow = candidates.find(c => c && !sameTitle(c, this.original)) || null;
      if (this.dearrow) availability.set(videoId, { state: 'available', title: this.dearrow });
    }

    // N-5.4.2: the DeArrow toggle exists only while a DeArrow title exists or is being checked.
    if (!(avail && avail.state === 'missing')) this.ensureDearrowButton();
    this.renderTitle();

    if (this.daBtn && !this.dearrow) {
      // R-39 (fix U-Q11: uses the cached verdict, network only when unknown).
      fetchDearrowTitle(videoId).then(title => {
        const clean = title ? normalizeTitle(title) : '';
        if (clean && !sameTitle(clean, this.original)) this.applyDearrow(clean);
        else this.markMissing();
      }).catch(err => console.warn('[Video Memory] Failed to load DeArrow title for records list:', err));
    }
    if (!this.original) {
      // R-47: background lookup of the original title.
      fetchOriginalTitle(videoId).then(title => {
        this.originalDone = true;
        if (title) this.original = normalizeTitle(title);
        if (this.dearrow && this.original && sameTitle(this.dearrow, this.original)) {
          this.dearrow = null;
          this.markMissing();
          return;
        }
        this.renderTitle();
      });
    }
  }

  private ensureDearrowButton(): void {
    if (this.daBtn) return;
    this.daBtn = iconButton('wand-magic-sparkles', '', 'is-dearrow ysrp-da', () => this.toggleDearrow());
    this.card.controlsEl.prepend(this.daBtn);
  }

  /** Called for ysrp-dearrow-title-ready too (R-84): only the card title changes (N-5.4.8). */
  applyDearrow(title: string): void {
    const clean = normalizeTitle(title);
    if (!clean || isPlaceholderTitle(clean) || sameTitle(clean, this.original)) return;
    availability.set(this.videoId, { state: 'available', title: clean });
    void persistDearrow(this.videoId, clean);
    this.dearrow = clean;
    this.ensureDearrowButton();
    this.renderTitle();
  }

  private markMissing(): void {
    if (this.dearrow) return;
    availability.set(this.videoId, { state: 'missing' });
    this.daBtn?.remove();
    this.daBtn = null;
    showOriginal.delete(this.videoId);
    this.renderTitle();
  }

  private showingOriginal(): boolean {
    return !this.dearrow || showOriginal.get(this.videoId) === true;
  }

  private renderTitle(): void {
    let text: string;
    if (!this.showingOriginal() && this.dearrow) text = this.dearrow;
    else if (this.loadingOriginal) text = LOADING_ORIGINAL();
    else if (this.original) text = this.original;
    else if (this.originalDone) text = ORIGINAL_UNAVAILABLE();
    else text = LOADING_ORIGINAL();
    this.card.setTitle(text);
    const btn = this.daBtn;
    if (!btn) return;
    const ready = Boolean(this.dearrow);
    btn.dataset.state = ready ? 'ready' : 'pending';
    btn.disabled = !ready;
    btn.dataset.loading = this.loadingOriginal ? 'true' : 'false';
    // N-5.1: the monochrome wand is dimmed to 0.4 while the original title is shown.
    btn.classList.toggle('is-off', ready && this.showingOriginal());
    setIconButtonLabel(btn, !ready
      ? tr('Checking DeArrow title…', '正在检测 DeArrow 标题…')
      : this.showingOriginal() ? tr('Show DeArrow title', '恢复 DeArrow 标题') : tr('Show original title', '显示原标题'));
  }

  /** R-44..R-46 */
  private toggleDearrow(): void {
    if (!this.dearrow || this.loadingOriginal) return;
    if (this.showingOriginal()) {
      showOriginal.set(this.videoId, false);
      this.renderTitle();
      return;
    }
    showOriginal.set(this.videoId, true);
    if (this.original || this.originalDone) {
      this.renderTitle();
      return;
    }
    this.loadingOriginal = true;
    this.renderTitle();
    fetchOriginalTitle(this.videoId).then(title => {
      this.originalDone = true;
      if (title) this.original = normalizeTitle(title);
    }).finally(() => {
      this.loadingOriginal = false;
      this.renderTitle();
    });
  }
}

class RecordsList {
  private readonly grid: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly badgeEl: HTMLElement;
  private readonly spinnerEl: HTMLElement;
  private readonly search;
  private spinUntil = 0;
  private spinTimer = 0;
  private cards = new Map<string, RecordCard>();
  private renderedCurrent: string | null = null;
  private building = false;
  private disposers: Array<() => void> = [];

  constructor(pane: HTMLElement) {
    this.search = searchBar('', [
      { value: 'all', label: tr('All', '全部') },
      { value: 'progress', label: tr('In progress', '未看完') },
      { value: 'finished', label: tr('Finished', '已看完') },
      { value: 'notes', label: tr('With notes', '有笔记') }
    ], () => this.applyFilter());
    this.search.input.classList.add('ysrp-records-search');
    this.search.filter.select.classList.add('ysrp-records-filter');
    this.countEl = h('span', { class: 'ysrp-records-count' });
    this.badgeEl = h('span', { class: 'ysrp-badge ysrp-records-storage' });
    this.spinnerEl = h('span', { class: 'ysrp-refresh', title: tr('Refreshing…', '正在更新列表…') }, icon('arrows-rotate', 'fa-spin'));
    const status = h('div', { class: 'ysrp-records-status' }, this.countEl, this.badgeEl, this.spinnerEl);
    // N-5.4.2: one card per row, 8 px apart.
    this.grid = h('div', { class: 'ysrp-records ysrp-record-list' });
    this.empty = emptyState('', 'ysrp-records-empty');
    pane.appendChild(h('div', { class: 'ysrp-records-panel' },
      h('div', { class: 'ysrp-records-toolbar' }, this.search.el, status), this.grid, this.empty));

    // N-5.4.8: live updates only while the panel is on screen.
    const on = (type: string, fn: (ev: CustomEvent) => void) => {
      const wrapped = (ev: Event) => { if (this.grid.isConnected) fn(ev as CustomEvent); };
      document.addEventListener(type, wrapped);
      this.disposers.push(() => document.removeEventListener(type, wrapped));
    };
    // N-5.4.8 / R-81..R-84 live updates.
    on(EVT_RECORD_UPDATED, ev => {
      const id = ev.detail && ev.detail.videoId;
      if (!id) return;
      const c = this.cards.get(id);
      if (!c) return this.rebuild();
      const live = typeof ev.detail.videoProgress === 'number' ? ev.detail.videoProgress : undefined;
      c.updateProgress(live);
    });
    on(EVT_VIDEO_STATUS, ev => {
      const id = ev.detail ? ev.detail.videoId : undefined;
      if (id !== undefined && (id || null) !== this.renderedCurrent) this.rebuild();
    });
    on(EVT_DEARROW_READY, ev => {
      const { videoId, title } = ev.detail || {};
      if (!videoId || !title) return;
      this.cards.get(videoId)?.applyDearrow(title);
    });
    this.disposers.push(rowsChanged.on(() => { if (this.grid.isConnected) this.rebuild(); }));
    this.disposers.push(recordChanges.on(change => {
      if (change.kind === 'bulk' && this.grid.isConnected) this.rebuild();
    }));
  }

  /** Refresh spinner (U-54/U-55), kept visible at least 300 ms so it can actually be seen (fixes U-Q4). */
  private setBusy(busy: boolean): void {
    const el = this.spinnerEl;
    if (busy) {
      this.spinUntil = Date.now() + 300;
      el.classList.add('is-active');
      return;
    }
    const wait = Math.max(0, this.spinUntil - Date.now());
    if (this.spinTimer) clearTimeout(this.spinTimer);
    this.spinTimer = window.setTimeout(() => el.classList.remove('is-active'), wait);
  }

  destroy(): void {
    for (const fn of this.disposers.splice(0)) fn();
    if (this.spinTimer) clearTimeout(this.spinTimer);
    for (const c of this.cards.values()) c.destroy();
    this.cards.clear();
  }

  /** N-5.4.1 / D-5 ordering: current video first, then newest saveDate first. */
  rebuild(): void {
    if (this.building) return;
    this.building = true;
    this.setBusy(true);
    try {
      for (const c of this.cards.values()) c.destroy();
      this.cards.clear();
      this.grid.replaceChildren();
      const current = urlVideoId() || null;
      this.renderedCurrent = current;
      const entries = listRecords().filter((e): e is RecordEntry & { record: VideoRecord } => {
        if (!e.record) console.warn('[Video Memory] Failed to parse saved video data:', e.key);
        return Boolean(e.record);
      });
      entries.sort((a, b) => {
        if (a.videoId === current) return -1;
        if (b.videoId === current) return 1;
        return (Number(b.record.saveDate) || 0) - (Number(a.record.saveDate) || 0);
      });
      for (const entry of entries) {
        try {
          const c = new RecordCard(entry, entry.videoId === current, removed => this.onDeleted(removed));
          this.cards.set(entry.videoId, c);
          this.grid.appendChild(c.el);
        } catch (err) {
          console.error('[Video Memory] Failed to render saved video:', err);
        }
      }
      this.badgeEl.textContent = storageName();
      this.countChanged();
    } finally {
      this.building = false;
      this.setBusy(false);
    }
  }

  private countChanged(): void {
    this.search.setPlaceholder(tr('Search {n} records...', '搜索 {n} 条记录...', { n: this.cards.size }));
    this.applyFilter();
  }

  private applyFilter(): void {
    const q = this.search.query();
    const filter = this.search.filter.value();
    let shown = 0;
    for (const c of this.cards.values()) {
      const ok = c.matches(q, filter);
      c.el.style.display = ok ? '' : 'none';
      if (ok) shown++;
    }
    this.grid.style.display = shown ? '' : 'none';
    // N-5.4.1: "N records", or "N matches" while searching or filtering.
    this.countEl.textContent = q || filter !== 'all'
      ? tr('{n} matches', '{n} 条匹配', { n: shown })
      : tr('{n} records', '{n} 条记录', { n: this.cards.size });
    this.empty.textContent = this.cards.size
      ? tr('No records match your search.', '没有符合条件的记录。')
      : tr('No saved videos yet.', '还没有保存的视频。');
    this.empty.style.display = shown ? 'none' : '';
  }

  private onDeleted(removed: RecordCard): void {
    this.cards.delete(removed.videoId);
    this.countChanged();
  }
}

/** Custom panel renderer for the Records plugin (N-5.4): builds the list now and cleans up on close. */
export function renderRecordsPanel(el: HTMLElement): (() => void) | void {
  // N-5.4.9: with the plugin off the list is shown nowhere, not even in its own settings dialog.
  if (!isRunning('Records')) {
    el.appendChild(emptyState(tr('The Records plugin is off. Turn it on to see your saved videos.', '记录插件已关闭。开启后才会显示已保存的视频。'), 'ysrp-records-off'));
    return;
  }
  const list = new RecordsList(el);
  list.rebuild();
  return () => list.destroy();
}
