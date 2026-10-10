// "Records" tab (R-1..R-84 with N-2.6, N-5.3.8, D-5, D-13): saved videos list with DeArrow toggle,
// note / link / delete buttons and plugin-contributed buttons (transcript).

import { currentDuration, urlVideoId } from '../../../api/player';
import { countRecords, listRecords, readRecord, recordChanges, removeRecord, updateRecord, type RecordEntry, type VideoRecord } from '../../../api/records';
import { listRowButtons, rowsChanged, type RowContext, type RowUiState } from '../../../api/rows';
import { cachedDearrow, cachedOriginalTitle, fetchDearrowTitle, fetchOriginalTitle, getSources, resolveTitle } from '../../../api/titles';
import { isSettingsOpen, refreshSettingsHeader, type TabDef } from '../../../api/tabs';
import { EVT_DEARROW_READY, EVT_RECORD_UPDATED, EVT_VIDEO_STATUS, UNKNOWN_TITLE, watchUrl } from '../../../utils/constants';
import { clear, dearrowIcon, h } from '../../../utils/dom';
import { tr } from '../../../utils/i18n';
import { formatTime, isPlaceholderTitle, normalizeTitle, sameTitle } from '../../../utils/text';
import { iconButton } from './ui';

/** Per-video UI state, kept across rebuilds and modal rebuilds (fixes R-Q6). */
const uiStates = new Map<string, RowUiState>();
/** U-29 DeArrow availability per video for this page session. */
const availability = new Map<string, { state: 'available'; title: string } | { state: 'missing' }>();

function uiFor(videoId: string): RowUiState {
  let s = uiStates.get(videoId);
  if (!s) {
    s = {};
    uiStates.set(videoId, s);
  }
  return s;
}

export function forgetRowUi(videoId: string): void {
  uiStates.delete(videoId);
}

let rowCount = 0;
export function recordsHeading(): string {
  return tr('Saved Videos - ({count})', '已保存视频 - ({count})', { count: rowCount });
}

/** N-2.6: progress / duration with one decimal; without a duration: current video uses the player, else M:SS. */
export function progressText(videoId: string, record: VideoRecord | null, liveProgress?: number): string {
  if (!record) return '0%';
  const progress = Number(liveProgress ?? record.videoProgress);
  const seconds = Number.isFinite(progress) && progress > 0 ? progress : 0;
  let duration = Number(record.videoDuration);
  if (!(duration > 0) && videoId === urlVideoId()) duration = currentDuration();
  if (duration > 0) return `${Math.min(100, Math.max(0, (seconds / duration) * 100)).toFixed(1)}%`;
  return formatTime(seconds);
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

class RecordRow {
  readonly li: HTMLLIElement;
  private titleEl: HTMLElement;
  private pctEl: HTMLElement;
  private daBtn: HTMLButtonElement | null = null;
  private dearrow: string | null = null;
  private original: string | null = null;
  private originalDone = false;
  private loadingOriginal = false;
  private disposers: Array<() => void> = [];
  private ui: RowUiState;

  constructor(private readonly entry: RecordEntry & { record: VideoRecord }, isCurrent: boolean, private readonly onDeleted: (row: RecordRow) => void) {
    const { videoId, record } = entry;
    this.ui = uiFor(videoId);
    this.pctEl = h('span', { class: 'ysrp-pct ysrp-record-progress', text: progressText(videoId, record) });
    this.titleEl = h('span', { class: 'ysrp-title ysrp-record-title' });
    const top = h('div', { class: 'ysrp-row-top' }, this.pctEl, this.titleEl);
    this.li = h('li', { class: `ysrp-row${isCurrent ? ' is-current' : ''}`, dataset: { videoId } }, top);

    this.initTitles();

    const ctx: RowContext = {
      videoId,
      record,
      url: watchUrl(videoId),
      isCurrent,
      ui: this.ui,
      title: () => this.titleEl.textContent || UNKNOWN_TITLE
    };
    const panels: Array<{ order: number; el: HTMLElement }> = [];
    for (const contribution of listRowButtons()) {
      try {
        const parts = contribution.create(ctx);
        if (!parts) continue;
        top.appendChild(parts.button);
        if (parts.panel) panels.push({ order: contribution.panelOrder ?? contribution.order, el: parts.panel });
        if (parts.dispose) this.disposers.push(parts.dispose);
      } catch (err) {
        console.error(`[Video Memory] Row button ${contribution.id} failed:`, err);
      }
    }
    // Core delete button is always last (R-79).
    top.appendChild(iconButton('trash-can', tr('Delete record', '删除保存记录'), 'is-delete', ev => {
      ev.preventDefault();
      this.delete();
    }));
    panels.sort((a, b) => a.order - b.order);
    for (const p of panels) this.li.appendChild(p.el);
  }

  get videoId(): string { return this.entry.videoId; }

  updateProgress(liveProgress?: number): void {
    this.pctEl.textContent = progressText(this.videoId, readRecord(this.videoId), liveProgress);
  }

  destroy(): void {
    for (const fn of this.disposers.splice(0)) {
      try { fn(); } catch { /* ignore */ }
    }
  }

  private delete(): void {
    // R-80: immediate delete; also removes the cloud copy through the 'delete' change (N-7.7).
    removeRecord(this.videoId, 'delete');
    forgetRowUi(this.videoId);
    this.destroy();
    this.li.remove();
    this.onDeleted(this);
  }

  /* ------------------------------------------------------- titles (R-29..R-48) */

  private initTitles(): void {
    const { videoId, record } = this.entry;
    const storedOriginal = typeof record.originalTitle === 'string' ? normalizeTitle(record.originalTitle) : '';
    this.original = storedOriginal || cachedOriginalTitle(videoId) || getSources(videoId).original || null;
    this.originalDone = Boolean(this.original);

    const avail = availability.get(videoId);
    if (avail && avail.state === 'missing') {
      this.dearrow = null;
    } else {
      const fromName = normalizeTitle(record.videoName);
      const candidates = [
        getSources(videoId).dearrow,
        resolveTitle(videoId).source === 'dearrow' ? resolveTitle(videoId).title : '',
        avail && avail.state === 'available' ? avail.title : '',
        cachedDearrow(videoId) || '',
        !isPlaceholderTitle(fromName) && !sameTitle(fromName, this.original) ? fromName : ''
      ];
      this.dearrow = candidates.find(c => c && !sameTitle(c, this.original)) || null;
      if (this.dearrow) availability.set(videoId, { state: 'available', title: this.dearrow });
    }

    if (!(avail && avail.state === 'missing')) {
      this.daBtn = h('button', { class: 'ysrp-ibtn ysrp-da', type: 'button' }, dearrowIcon(20));
      this.daBtn.addEventListener('click', ev => {
        ev.preventDefault();
        this.toggleDearrow();
      });
      this.titleEl.after(this.daBtn);
    }
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

  /** Called for ysrp-dearrow-title-ready too (R-84), in place instead of a full rebuild (fixes R-Q7). */
  applyDearrow(title: string): void {
    const clean = normalizeTitle(title);
    if (!clean || isPlaceholderTitle(clean) || sameTitle(clean, this.original)) return;
    availability.set(this.videoId, { state: 'available', title: clean });
    void persistDearrow(this.videoId, clean);
    this.dearrow = clean;
    if (!this.daBtn) {
      this.daBtn = h('button', { class: 'ysrp-ibtn ysrp-da', type: 'button' }, dearrowIcon(20));
      this.daBtn.addEventListener('click', ev => { ev.preventDefault(); this.toggleDearrow(); });
      this.titleEl.after(this.daBtn);
    }
    this.renderTitle();
  }

  private markMissing(): void {
    if (this.dearrow) return;
    availability.set(this.videoId, { state: 'missing' });
    this.daBtn?.remove();
    this.daBtn = null;
    this.ui.showOriginal = false;
    this.renderTitle();
  }

  private showingOriginal(): boolean {
    return !this.dearrow || this.ui.showOriginal === true;
  }

  private renderTitle(): void {
    let text: string;
    if (!this.showingOriginal() && this.dearrow) text = this.dearrow;
    else if (this.loadingOriginal) text = LOADING_ORIGINAL();
    else if (this.original) text = this.original;
    else if (this.originalDone) text = ORIGINAL_UNAVAILABLE();
    else text = LOADING_ORIGINAL();
    this.titleEl.textContent = text;
    this.titleEl.title = text;
    const btn = this.daBtn;
    if (!btn) return;
    const ready = Boolean(this.dearrow);
    btn.dataset.state = ready ? 'ready' : 'pending';
    btn.disabled = !ready;
    btn.dataset.loading = this.loadingOriginal ? 'true' : 'false';
    btn.classList.toggle('is-off', ready && this.showingOriginal());
    const tip = !ready
      ? tr('Checking DeArrow title…', '正在检测 DeArrow 标题…')
      : this.showingOriginal() ? tr('Show DeArrow title', '恢复 DeArrow 标题') : tr('Show original title', '显示原标题');
    btn.title = tip;
    btn.setAttribute('aria-label', tip);
  }

  /** R-44..R-46 */
  private toggleDearrow(): void {
    if (!this.dearrow || this.loadingOriginal) return;
    if (this.showingOriginal()) {
      this.ui.showOriginal = false;
      this.renderTitle();
      return;
    }
    this.ui.showOriginal = true;
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
  private readonly list: HTMLUListElement;
  private rows = new Map<string, RecordRow>();
  private renderedCurrent: string | null = null;
  private building = false;
  private disposers: Array<() => void> = [];

  constructor(pane: HTMLElement, private readonly setBusy: (busy: boolean) => void) {
    this.list = h('ul', { class: 'ysrp-records' });
    pane.appendChild(this.list);
    const on = (type: string, fn: (ev: CustomEvent) => void) => {
      const wrapped = (ev: Event) => { if (isSettingsOpen() && this.list.isConnected) fn(ev as CustomEvent); };
      document.addEventListener(type, wrapped);
      this.disposers.push(() => document.removeEventListener(type, wrapped));
    };
    // R-81..R-84 live updates.
    on(EVT_RECORD_UPDATED, ev => {
      const id = ev.detail && ev.detail.videoId;
      if (!id) return;
      const row = this.rows.get(id);
      if (!row) return this.rebuild();
      const live = typeof ev.detail.videoProgress === 'number' ? ev.detail.videoProgress : undefined;
      row.updateProgress(live);
    });
    on(EVT_VIDEO_STATUS, ev => {
      const id = ev.detail ? ev.detail.videoId : undefined;
      if (id !== undefined && (id || null) !== this.renderedCurrent) this.rebuild();
    });
    on(EVT_DEARROW_READY, ev => {
      const { videoId, title } = ev.detail || {};
      if (!videoId || !title) return;
      this.rows.get(videoId)?.applyDearrow(title);
    });
    this.disposers.push(rowsChanged.on(() => { if (isSettingsOpen()) this.rebuild(); }));
    this.disposers.push(recordChanges.on(change => {
      if (change.kind === 'bulk' && isSettingsOpen()) this.rebuild();
    }));
  }

  destroy(): void {
    for (const fn of this.disposers.splice(0)) fn();
    for (const row of this.rows.values()) row.destroy();
    this.rows.clear();
  }

  /** R-10..R-19 with D-5 ordering: current video first, then newest saveDate first. */
  rebuild(): void {
    if (this.building) return;
    this.building = true;
    this.setBusy(true);
    try {
      for (const row of this.rows.values()) row.destroy();
      this.rows.clear();
      clear(this.list);
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
          const row = new RecordRow(entry, entry.videoId === current, r => this.onDeleted(r));
          this.rows.set(entry.videoId, row);
          this.list.appendChild(row.li);
        } catch (err) {
          console.error('[Video Memory] Failed to render saved video:', err);
        }
      }
      rowCount = this.rows.size;
      if (!rowCount) {
        this.list.appendChild(h('li', { class: 'ysrp-empty-row', text: tr('No saved videos yet.', '还没有保存的视频。') }));
      }
      refreshSettingsHeader();
    } finally {
      this.building = false;
      this.setBusy(false);
    }
  }

  private onDeleted(row: RecordRow): void {
    this.rows.delete(row.videoId);
    rowCount = this.rows.size;
    if (!rowCount) this.list.appendChild(h('li', { class: 'ysrp-empty-row', text: tr('No saved videos yet.', '还没有保存的视频。') }));
    refreshSettingsHeader();
  }
}

export function createRecordsTab(setBusy: (busy: boolean) => void): TabDef {
  let list: RecordsList | null = null;
  return {
    id: 'records',
    group: 'main',
    order: 10,
    icon: 'database',
    label: () => tr('Records', '记录'),
    heading: () => recordsHeading(),
    storageBadge: true,
    render(pane) {
      rowCount = countRecords();
      list = new RecordsList(pane, setBusy);
      return () => {
        list?.destroy();
        list = null;
      };
    },
    onShow() {
      list?.rebuild();
    }
  };
}
