// Progress engine (N-2): per-video sessions, wait -> (choose) -> restore -> track.
// Replaces the original fixed 1.5 s save loop and the one-shot restore poll (S-74..S-85).

import { flashStatus, resetBadge, showSavedTime, showStatus } from '../../../api/badge';
import { dispatch } from '../../../api/events';
import { runBeforeRestoreHooks } from '../../../api/hooks';
import { getPlayer, isPlaying, linkStartTime, playerDuration, playerTime, readyPlayer, urlVideoId, videoData, type YtPlayer } from '../../../api/player';
import { definePlugin, type PluginContext } from '../../../api/plugins';
import { readRecord, updateRecord } from '../../../api/records';
import { askResume, type ResumePromptHandle } from '../../../api/resumePrompt';
import { cachedOriginalTitle, getSources, knownOriginalTitle, setCurrentVideo, titleForRecord } from '../../../api/titles';
import { EVT_RECORD_UPDATED } from '../../../utils/constants';
import { errorMessage, formatTime } from '../../../utils/text';

const TICK_MS = 250;
const SAVE_EVERY_MS = 1500;
const MIN_DELTA_S = 0.5;
const CONFIRM_EVERY_MS = 500;
const CONFIRM_TOLERANCE_S = 3;
const CONFIRMATIONS = 2;
const MAX_SEEKS = 8;
const RESTORE_WINDOW_MS = 15000;
const HOOK_TIMEOUT_MS = 4000;
const MIN_RESUMABLE_S = 1;
const FINISHED_MARGIN_S = 5;

type Phase = 'sync' | 'waiting' | 'choosing' | 'restoring' | 'tracking' | 'live';

interface RestoreState {
  target: number;
  seeks: number;
  firstSeekAt: number;
  lastCheckAt: number;
  confirms: number;
}

interface Session {
  id: string;
  phase: Phase;
  lastReadyTime: number | null;
  lastDuration: number;
  lastWritten: number | null;
  lastSaveAt: number;
  restore: RestoreState | null;
  prompt: ResumePromptHandle | null;
  ended: boolean;
}

class Engine {
  private session: Session | null = null;

  constructor(private readonly ctx: PluginContext) {}

  start(): void {
    const ctx = this.ctx;
    ctx.interval(() => this.tick(), TICK_MS);
    // N-2.5.1: immediate writes on navigation start, background, pagehide, pause, seeked.
    ctx.listen(window, 'yt-navigate-start', () => this.flush(), true);
    for (const type of ['yt-navigate-finish', 'yt-page-data-updated', 'yt-page-data-fetched', 'yt-history-popstate']) {
      ctx.listen(window, type, () => this.tick(), true);
    }
    ctx.listen(window, 'popstate', () => this.tick());
    ctx.listen(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(); });
    ctx.listen(window, 'pagehide', () => this.flush());
    const onMedia = (ev: Event) => {
      const target = ev.target as Element | null;
      if (target && target.tagName === 'VIDEO' && target.closest('#movie_player')) this.flush();
    };
    ctx.listen(document, 'pause', onMedia, true);
    ctx.listen(document, 'seeked', onMedia, true);
    ctx.onDispose(() => { if (this.session) this.endSession(this.session); });
    // First tick after every plugin has started, so "before restore" hooks are registered.
    ctx.timeout(() => this.tick(), 0);
  }

  /** Write the current session position right away (still only in the tracking phase). */
  private flush(): void {
    if (this.session) this.save(this.session, true);
  }

  private tick(): void {
    const id = urlVideoId();
    if (id !== (this.session ? this.session.id : '')) this.switchTo(id);
    const s = this.session;
    if (!s || s.phase === 'sync' || s.phase === 'choosing' || s.phase === 'live') return;

    // N-2.4.4: live streams are neither restored nor saved.
    const raw = getPlayer();
    const data = videoData(raw);
    if (raw && data && data.video_id === s.id && data.isLive) {
      s.phase = 'live';
      return;
    }

    const player = readyPlayer(s.id);
    if (player) {
      s.lastReadyTime = playerTime(player);
      s.lastDuration = playerDuration(player);
    }
    switch (s.phase) {
      case 'waiting':
        if (player) this.decide(s, player);
        break;
      case 'restoring':
        if (player) this.continueRestore(s, player);
        break;
      case 'tracking':
        if (Date.now() - s.lastSaveAt >= SAVE_EVERY_MS) this.save(s, false);
        break;
    }
  }

  private switchTo(id: string): void {
    if (this.session) this.endSession(this.session);
    this.session = null;
    setCurrentVideo(id || null);
    resetBadge();
    if (!id) return;
    const s: Session = {
      id, phase: 'sync', lastReadyTime: null, lastDuration: 0, lastWritten: null,
      lastSaveAt: 0, restore: null, prompt: null, ended: false
    };
    this.session = s;
    // N-2.4.6: wait (max 4 s) for "before restore" hooks such as the Drive pull.
    void runBeforeRestoreHooks(id, HOOK_TIMEOUT_MS, () => {
      if (this.session === s) showStatus('Syncing…', '正在同步…');
    }).then(() => {
      if (this.session !== s || s.phase !== 'sync') return;
      s.phase = 'waiting';
      resetBadge();
      this.tick();
    });
  }

  private endSession(s: Session): void {
    // N-2.5.3: the last write of a session uses its own last ready reading, never the new video's.
    if (s.phase === 'tracking') this.save(s, true);
    if (s.prompt) s.prompt.cancel();
    s.prompt = null;
    s.ended = true;
  }

  /** N-2.4.2 */
  private decide(s: Session, player: YtPlayer): void {
    const data = videoData(player);
    if (data && data.title) knownOriginalTitle(s.id, data.title);
    const rec = readRecord(s.id);
    const saved = Number(rec ? rec.videoProgress : NaN);
    const resumable = Number.isFinite(saved) && saved > MIN_RESUMABLE_S;
    const duration = playerDuration(player);
    const finished = resumable && duration - saved < FINISHED_MARGIN_S;
    const link = linkStartTime();
    if (!resumable) {
      this.startTracking(s);
    } else if (finished) {
      // D-2: a finished video starts from the beginning (a link time wins if present).
      if (link === null) {
        try { player.seekTo(0, true); } catch { /* ignore */ }
      }
      this.startTracking(s);
    } else if (link !== null) {
      if (Math.abs(link - saved) > CONFIRM_TOLERANCE_S) this.choose(s, player, saved, link);
      else this.startTracking(s);
    } else {
      this.beginRestore(s, player, saved);
    }
  }

  /** N-3: link time and saved progress disagree. */
  private choose(s: Session, player: YtPlayer, saved: number, link: number): void {
    s.phase = 'choosing';
    const wasPlaying = isPlaying(player);
    try { player.pauseVideo?.(); } catch { /* ignore */ }
    showStatus('Choose a position…', '请选择播放位置…');
    const handle = askResume({ videoId: s.id, saved, link });
    s.prompt = handle;
    void handle.result.then(choice => {
      if (this.session !== s || s.ended) return;
      s.prompt = null;
      const p = getPlayer();
      resetBadge();
      if (choice === 'saved' && p) {
        s.phase = 'restoring';
        s.restore = { target: saved, seeks: 0, firstSeekAt: 0, lastCheckAt: 0, confirms: 0 };
        this.seek(s.restore, p);
        if (wasPlaying) {
          try { p.playVideo?.(); } catch { /* ignore */ }
        }
      } else {
        if (wasPlaying && p) {
          try { p.playVideo?.(); } catch { /* ignore */ }
        }
        this.startTracking(s);
      }
    });
  }

  private beginRestore(s: Session, player: YtPlayer, target: number): void {
    s.phase = 'restoring';
    s.restore = { target, seeks: 0, firstSeekAt: 0, lastCheckAt: 0, confirms: 0 };
    this.continueRestore(s, player);
  }

  private seek(r: RestoreState, player: YtPlayer): void {
    const now = Date.now();
    try { player.seekTo(r.target, true); } catch { /* ignore */ }
    r.seeks++;
    r.lastCheckAt = now;
    if (!r.firstSeekAt) r.firstSeekAt = now;
  }

  /** N-2.4.3: confirm twice (500 ms apart) within 3 s of the target; re-seek when YouTube moves it back. */
  private continueRestore(s: Session, player: YtPlayer): void {
    const r = s.restore;
    if (!r) return this.startTracking(s);
    if (r.seeks === 0) {
      this.seek(r, player);
      return;
    }
    const now = Date.now();
    if (now - r.lastCheckAt < CONFIRM_EVERY_MS) return;
    r.lastCheckAt = now;
    if (Math.abs(playerTime(player) - r.target) <= CONFIRM_TOLERANCE_S) {
      r.confirms++;
      if (r.confirms >= CONFIRMATIONS) this.finishRestore(s, true);
      return;
    }
    r.confirms = 0;
    if (r.seeks < MAX_SEEKS && now - r.firstSeekAt < RESTORE_WINDOW_MS) this.seek(r, player);
    else this.finishRestore(s, false);
  }

  private finishRestore(s: Session, ok: boolean): void {
    const target = s.restore ? s.restore.target : 0;
    s.restore = null;
    this.startTracking(s);
    if (ok) flashStatus('Resumed {t}', '已恢复 {t}', { t: formatTime(target) }, 2500);
  }

  private startTracking(s: Session): void {
    s.phase = 'tracking';
    s.lastWritten = null;
    this.save(s, false);
  }

  /** N-2.5: only while tracking and with a ready player (or the session's last ready reading). */
  private save(s: Session, useLastReading: boolean): void {
    if (s.phase !== 'tracking') return;
    s.lastSaveAt = Date.now();
    let time: number | null = null;
    let duration = s.lastDuration;
    const player = s.ended ? null : readyPlayer(s.id);
    if (player) {
      time = playerTime(player);
      duration = playerDuration(player);
      s.lastReadyTime = time;
      s.lastDuration = duration;
    } else if (useLastReading) {
      time = s.lastReadyTime;
    }
    if (time === null) return;
    if (s.lastWritten !== null && Math.abs(time - s.lastWritten) < MIN_DELTA_S) return;
    this.write(s, time, duration);
  }

  private write(s: Session, time: number, duration: number): void {
    const id = s.id;
    try {
      updateRecord(id, cur => {
        const base = cur || {};
        const original = cachedOriginalTitle(id) || getSources(id).original || null;
        return {
          ...base,
          videoProgress: time,
          saveDate: Date.now(),
          videoDuration: duration > 0 ? duration : base.videoDuration,
          videoName: titleForRecord(id, base.videoName),
          // Fix S-Q11: an unknown original title never erases a stored one.
          originalTitle: original || base.originalTitle || null
        };
      }, 'content');
      s.lastWritten = time;
      if (this.session === s) showSavedTime(time);
      dispatch(EVT_RECORD_UPDATED, { videoId: id, videoProgress: time });
    } catch (err) {
      // N-2.5.5 / fix BUG-6: failures are reported instead of swallowed.
      console.error('[Video Memory] Failed to save video progress:', err);
      if (this.session === s) showStatus('⚠ Save failed', '⚠ 保存失败', undefined, { tooltip: errorMessage(err), error: true });
    }
  }
}

export default definePlugin({
  name: 'Engine',
  displayName: { en: 'Progress engine', zh: '进度引擎' },
  description: {
    en: 'Saves and restores the playback position of every video; waits for the player, skips ads and handles timestamp links.',
    zh: '保存并恢复每个视频的播放进度；等待播放器就绪、避开广告并处理时间戳链接。'
  },
  authors: ['0_V'],
  icon: 'gauge-high',
  required: true,
  start(ctx) {
    new Engine(ctx).start();
  }
});
