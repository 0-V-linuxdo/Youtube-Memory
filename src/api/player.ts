// YouTube player helpers (C-57..C-61, N-2.3).

import { parseTimeParam } from '../utils/text';

export interface YtPlayer extends HTMLElement {
  getCurrentTime(): number;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  getVideoData?(): { video_id?: string; title?: string; isLive?: boolean } | undefined;
  getPlayerState?(): number;
  pauseVideo?(): void;
  playVideo?(): void;
}

/** Video id from the address bar `v` parameter (C-58). */
export function urlVideoId(): string {
  try { return new URLSearchParams(location.search).get('v') || ''; } catch { return ''; }
}

/** Start time requested by the link: `t=`, `start=` or `#t=` (N-3.1). */
export function linkStartTime(): number | null {
  try {
    const params = new URLSearchParams(location.search);
    const fromQuery = parseTimeParam(params.get('t')) ?? parseTimeParam(params.get('start'));
    if (fromQuery !== null) return fromQuery;
    const hash = location.hash.replace(/^#/, '');
    if (hash) return parseTimeParam(new URLSearchParams(hash).get('t'));
  } catch { /* ignore */ }
  return null;
}

/** `#movie_player` with the API we need, or null. */
export function getPlayer(): YtPlayer | null {
  const el = document.getElementById('movie_player') as YtPlayer | null;
  if (!el) return null;
  if (typeof el.getCurrentTime !== 'function' || typeof el.getDuration !== 'function' || typeof el.seekTo !== 'function') return null;
  return el;
}

export function videoData(player: YtPlayer | null): { video_id?: string; title?: string; isLive?: boolean } | null {
  if (!player || typeof player.getVideoData !== 'function') return null;
  try { return player.getVideoData() || null; } catch { return null; }
}

export function isAdShowing(player: HTMLElement): boolean {
  return player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
}

function num(fn: () => number): number {
  try {
    const v = Number(fn());
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}

export function playerDuration(player: YtPlayer | null): number {
  return player ? num(() => player.getDuration()) : 0;
}

export function playerTime(player: YtPlayer | null): number {
  return player ? num(() => player.getCurrentTime()) : 0;
}

/** Duration of the page's current video, 0 when unknown. */
export function currentDuration(): number {
  return playerDuration(getPlayer());
}

/**
 * N-2.3 readiness for a session: player API present, player shows the session's video
 * (when known), duration > 0, no ad.
 */
export function readyPlayer(sessionId: string): YtPlayer | null {
  const player = getPlayer();
  if (!player) return null;
  const data = videoData(player);
  if (data && data.video_id && data.video_id !== sessionId) return null;
  if (playerDuration(player) <= 0) return null;
  if (isAdShowing(player)) return null;
  return player;
}

export function isPlaying(player: YtPlayer): boolean {
  if (typeof player.getPlayerState === 'function') {
    try { return player.getPlayerState() === 1; } catch { /* fall through */ }
  }
  const video = player.querySelector('video');
  return Boolean(video && !video.paused);
}
