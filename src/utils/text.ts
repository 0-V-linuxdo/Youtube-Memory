// Time formatting and title helpers (C-37, C-62, C-63, U-17..U-19).

import { LEGACY_LOADING_TITLE, UNKNOWN_TITLE } from './constants';

/** C-37 / S-73. Fixes C-Q5: invalid or negative input renders as 0:00. */
export function formatTime(value: unknown): string {
  let seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** C-62: collapse whitespace and trim. */
export function normalizeTitle(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** C-63 / U-17. Fixes U-Q10: a single rule (whitespace-collapsed, case-insensitive) everywhere. */
export function sameTitle(a: unknown, b: unknown): boolean {
  const x = normalizeTitle(a).toLowerCase();
  const y = normalizeTitle(b).toLowerCase();
  return Boolean(x) && Boolean(y) && x === y;
}

/** U-18 / R-30 placeholder titles. */
export function isPlaceholderTitle(value: unknown): boolean {
  const s = normalizeTitle(value).toLowerCase();
  return !s || s === UNKNOWN_TITLE.toLowerCase() || s === LEGACY_LOADING_TITLE;
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && (err as Error).message) return String((err as Error).message);
  return err === undefined || err === null ? '' : String(err);
}

/** Parse a YouTube start-time value: 90, 90s, 1m30s, 1h2m3s (N-3.1). */
export function parseTimeParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (/^\d+(\.\d+)?s?$/.test(s)) return parseFloat(s);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}
