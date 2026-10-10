// Video titles: original (oEmbed / player) and DeArrow community titles, current-video status (C-62..C-86, U-20..U-35).

import { DEARROW_URL, EVT_DEARROW_READY, EVT_VIDEO_STATUS, OEMBED_URL, UNKNOWN_TITLE } from '../utils/constants';
import { isPlaceholderTitle, normalizeTitle, sameTitle } from '../utils/text';
import { dispatch } from './events';
import { readRecord, updateRecord } from './records';

export type TitleSource = 'dearrow' | 'original' | 'fallback';

interface Sources { original: string; dearrow: string; }

const DEARROW_TTL = 6 * 60 * 60 * 1000;
/** Fix C-Q3: "no DeArrow title" results are cached too, so periodic saves do not poll the API. */
const DEARROW_NEGATIVE_TTL = 30 * 60 * 1000;
/** Fix C-Q2: failed oEmbed lookups are retried after this delay instead of never. */
const ORIGINAL_RETRY_MS = 5 * 60 * 1000;

const sources = new Map<string, Sources>();
const dearrowCache = new Map<string, { title: string | null; at: number }>();
const dearrowInflight = new Map<string, Promise<string | null>>();
const originalCache = new Map<string, { title: string | null; at: number }>();
const originalInflight = new Map<string, Promise<string | null>>();

function entry(videoId: string): Sources {
  let s = sources.get(videoId);
  if (!s) {
    s = { original: '', dearrow: '' };
    sources.set(videoId, s);
  }
  return s;
}

export function getSources(videoId: string): Readonly<Sources> {
  return entry(videoId);
}

/** C-65 (fix C-Q12: a DeArrow title equal to the original is simply dropped, no pointless 1.5 s retry). */
export function setOriginalTitle(videoId: string, title: unknown): boolean {
  if (!videoId) return false;
  const s = entry(videoId);
  s.original = normalizeTitle(title);
  if (s.dearrow && sameTitle(s.dearrow, s.original)) s.dearrow = '';
  refreshCurrent();
  return Boolean(s.original);
}

/** C-66: returns whether the DeArrow title was accepted. */
export function setDearrowTitle(videoId: string, title: unknown): boolean {
  if (!videoId) return false;
  const s = entry(videoId);
  const norm = normalizeTitle(title);
  if (!norm || sameTitle(norm, s.original)) {
    s.dearrow = '';
    refreshCurrent();
    return false;
  }
  s.dearrow = norm;
  refreshCurrent();
  return true;
}

/** C-68: DeArrow > original > fallback > Unknown Title. */
export function resolveTitle(videoId: string, fallback?: unknown): { title: string; source: TitleSource } {
  const fb = normalizeTitle(fallback) || UNKNOWN_TITLE;
  if (!videoId) return { title: fb, source: 'fallback' };
  const s = sources.get(videoId);
  if (s?.dearrow) return { title: s.dearrow, source: 'dearrow' };
  if (s?.original) return { title: s.original, source: 'original' };
  return { title: fb, source: 'fallback' };
}

/* ----------------------------------------------------------- oEmbed */

function persistOriginal(videoId: string, title: string): void {
  try {
    const rec = readRecord(videoId);
    if (!rec || rec.originalTitle === title) return;
    updateRecord(videoId, cur => (cur ? { ...cur, originalTitle: title } : null), 'meta');
  } catch (err) {
    console.warn('[Video Memory] Failed to persist original title:', err);
  }
}

/** Remember an original title we already know (e.g. from the player's own video data). */
export function knownOriginalTitle(videoId: string, title: unknown): void {
  const norm = normalizeTitle(title);
  if (!videoId || !norm) return;
  originalCache.set(videoId, { title: norm, at: Date.now() });
  setOriginalTitle(videoId, norm);
  persistOriginal(videoId, norm);
}

export function cachedOriginalTitle(videoId: string): string | null {
  return originalCache.get(videoId)?.title ?? null;
}

/** C-72..C-75 / R-48: original title via oEmbed; shared in-flight requests; success cached for the session. */
export function fetchOriginalTitle(videoId: string): Promise<string | null> {
  if (!videoId) return Promise.resolve(null);
  const cached = originalCache.get(videoId);
  if (cached && (cached.title || Date.now() - cached.at < ORIGINAL_RETRY_MS)) return Promise.resolve(cached.title);
  const running = originalInflight.get(videoId);
  if (running) return running;
  const url = OEMBED_URL + encodeURIComponent(`https://youtu.be/${videoId}`);
  const task = fetch(url, { credentials: 'omit', cache: 'no-store' })
    .then(async res => {
      if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
      const data = await res.json();
      const title = data && typeof data.title === 'string' ? data.title.trim() : '';
      return title || null;
    })
    .then(title => {
      originalCache.set(videoId, { title, at: Date.now() });
      if (title) {
        setOriginalTitle(videoId, title);
        persistOriginal(videoId, title);
      }
      return title;
    })
    .catch(err => {
      console.warn('[Video Memory] Failed to fetch original title:', err);
      originalCache.set(videoId, { title: null, at: Date.now() });
      return null;
    })
    .finally(() => { originalInflight.delete(videoId); });
  originalInflight.set(videoId, task);
  return task;
}

/* ----------------------------------------------------------- DeArrow */

/** C-77 / U-22: first non-original title that is locked or has votes >= 0. */
export function pickDearrowTitle(data: unknown): string | null {
  const titles = data && typeof data === 'object' ? (data as { titles?: unknown }).titles : null;
  if (!Array.isArray(titles) || !titles.length) return null;
  for (const item of titles) {
    if (!item || typeof item !== 'object') continue;
    const { title, original, locked, votes } = item as { title?: unknown; original?: unknown; locked?: unknown; votes?: unknown };
    if (typeof title !== 'string' || original === true) continue;
    const v = typeof votes === 'number' && Number.isFinite(votes) ? votes : 0;
    if (locked || v >= 0) return title;
  }
  return null;
}

/** Cached DeArrow verdict for a video: a title, null (none), or undefined (unknown / expired). */
export function cachedDearrow(videoId: string): string | null | undefined {
  const c = dearrowCache.get(videoId);
  if (!c) return undefined;
  const ttl = c.title ? DEARROW_TTL : DEARROW_NEGATIVE_TTL;
  if (Date.now() - c.at > ttl) return undefined;
  return c.title;
}

/** C-76..C-79. Returns the accepted DeArrow title or null. */
export function fetchDearrowTitle(videoId: string, options: { force?: boolean } = {}): Promise<string | null> {
  if (!videoId) return Promise.resolve(null);
  if (!options.force) {
    const cached = cachedDearrow(videoId);
    if (cached !== undefined) {
      if (cached) setDearrowTitle(videoId, cached);
      return Promise.resolve(cached);
    }
  }
  const running = dearrowInflight.get(videoId);
  if (running) return running;
  const task = fetch(DEARROW_URL + encodeURIComponent(videoId), { credentials: 'omit', cache: 'no-store' })
    .then(async res => (res.ok ? pickDearrowTitle(await res.json()) : null))
    .catch(err => {
      console.warn('[Video Memory] Failed to fetch DeArrow title:', err);
      return null;
    })
    .then(raw => {
      const accepted = raw ? setDearrowTitle(videoId, raw) : false;
      const title = accepted ? getSources(videoId).dearrow : null;
      dearrowCache.set(videoId, { title, at: Date.now() });
      if (title) dispatch(EVT_DEARROW_READY, { videoId, title });
      return title;
    })
    .finally(() => { dearrowInflight.delete(videoId); });
  dearrowInflight.set(videoId, task);
  return task;
}

/** Forget a DeArrow verdict (e.g. when it turned out to equal the original title). */
export function forgetDearrow(videoId: string): void {
  dearrowCache.delete(videoId);
}

/* ----------------------------------------------------------- current video status (C-69..C-71) */

export interface VideoStatus {
  videoId: string | null;
  title: string;
  isLoading: boolean;
  source: string;
  updatedAt: number;
}

let current: VideoStatus = { videoId: null, title: UNKNOWN_TITLE, isLoading: true, source: 'idle', updatedAt: Date.now() };

export function currentStatus(): VideoStatus {
  return { ...current };
}

function refreshCurrent(): void {
  const id = current.videoId;
  if (!id) return;
  const rec = readRecord(id);
  const stored = rec && typeof rec.videoName === 'string' && !isPlaceholderTitle(rec.videoName) ? rec.videoName : '';
  const { title, source } = resolveTitle(id, stored);
  const isLoading = source === 'fallback' && !stored;
  const label = source === 'fallback' ? (stored ? 'record' : 'loading') : source;
  if (title === current.title && isLoading === current.isLoading && label === current.source) return;
  current = { videoId: id, title, isLoading, source: label, updatedAt: Date.now() };
  dispatch(EVT_VIDEO_STATUS, { ...current });
}

/** Called by the engine when the watched video changes (C-81, C-82). Fixes C-Q11: events only on change. */
export function setCurrentVideo(videoId: string | null): void {
  if ((videoId || null) === current.videoId) return;
  if (!videoId) {
    current = { videoId: null, title: UNKNOWN_TITLE, isLoading: false, source: 'idle', updatedAt: Date.now() };
    dispatch(EVT_VIDEO_STATUS, { ...current });
    return;
  }
  current = { videoId, title: UNKNOWN_TITLE, isLoading: true, source: 'loading', updatedAt: Date.now() };
  refreshCurrent();
  dispatch(EVT_VIDEO_STATUS, { ...current });
  void fetchDearrowTitle(videoId);
  void fetchOriginalTitle(videoId);
}

/** Title to store as `videoName` (never a loading placeholder, C-Q14). */
export function titleForRecord(videoId: string, existing?: unknown): string {
  const keep = typeof existing === 'string' && !isPlaceholderTitle(existing) ? existing : '';
  return resolveTitle(videoId, keep).title;
}
