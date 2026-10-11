// Storage backends (localStorage / GM), mode selection, migration, settings dual-write (S-9..S-37, N-1.3).

import { KEY_STORAGE_MODE, RECORD_PREFIX } from './constants';

export type StorageMode = 'local' | 'gm';

export interface Backend {
  readonly mode: StorageMode;
  /** Raw stored value (string for localStorage; GM may hold non-strings), null when absent. */
  get(key: string): unknown;
  /** Write a value. Throws on failure (BUG-6: failures are no longer swallowed). */
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

/** S-9: GM storage is usable only when all four functions exist. */
export const gmAvailable: boolean =
  typeof GM_getValue === 'function' && typeof GM_setValue === 'function' &&
  typeof GM_listValues === 'function' && typeof GM_deleteValue === 'function';

function ls(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export const localBackend: Backend = {
  mode: 'local',
  get(key) {
    try { return ls()?.getItem(key) ?? null; } catch { return null; }
  },
  set(key, value) {
    const s = ls();
    if (!s) throw new Error('localStorage is not available');
    s.setItem(key, value);
  },
  remove(key) {
    try { ls()?.removeItem(key); } catch { /* ignore */ }
  },
  keys() {
    try {
      const s = ls();
      if (!s) return [];
      const out: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k !== null) out.push(k);
      }
      return out;
    } catch { return []; }
  }
};

export const gmBackend: Backend = {
  mode: 'gm',
  get(key) {
    if (!gmAvailable) return null;
    try {
      const v = GM_getValue(key);
      return v === undefined ? null : v;
    } catch { return null; }
  },
  set(key, value) {
    if (!gmAvailable) throw new Error('GM storage is not available');
    GM_setValue(key, value);
  },
  remove(key) {
    if (!gmAvailable) return;
    try { GM_deleteValue(key); } catch { /* ignore */ }
  },
  keys() {
    if (!gmAvailable) return [];
    try { return GM_listValues() || []; } catch { return []; }
  }
};

export function backendFor(mode: StorageMode): Backend {
  return mode === 'gm' ? gmBackend : localBackend;
}

/** Entries of a backend whose key starts with the prefix (S-15, S-19). */
export function listPrefixed(backend: Backend, prefix = RECORD_PREFIX): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const k of backend.keys()) {
    if (k.startsWith(prefix)) out.push([k, backend.get(k)]);
  }
  return out;
}

/* ----------------------------------------------------------- settings keys */

function gmGetRaw(key: string): unknown {
  if (typeof GM_getValue !== 'function') return null;
  try {
    const v = GM_getValue(key);
    return v === undefined ? null : v;
  } catch { return null; }
}

function gmSetRaw(key: string, value: string): boolean {
  if (typeof GM_setValue !== 'function') return false;
  try { GM_setValue(key, value); return true; } catch { return false; }
}

/** Read a setting: localStorage first, then GM (N-1.3, S-48). Non-string GM values are JSON-encoded. */
export function readSetting(key: string): string | null {
  const local = localBackend.get(key);
  if (typeof local === 'string' && local !== '') return local;
  const gm = gmGetRaw(key);
  if (gm === null || gm === undefined || gm === '') return null;
  return typeof gm === 'string' ? gm : JSON.stringify(gm);
}

/** Write a setting to both localStorage and GM. Returns false only when both writes failed. */
export function writeSetting(key: string, value: string): boolean {
  let ok = false;
  try { localBackend.set(key, value); ok = true; } catch { /* ignore */ }
  if (gmSetRaw(key, value)) ok = true;
  return ok;
}

export function removeSetting(key: string): void {
  localBackend.remove(key);
  if (typeof GM_deleteValue === 'function') {
    try { GM_deleteValue(key); } catch { /* ignore */ }
  }
}

/** Secret settings (N-1.3 YSRP_DriveSettings): read GM first, write GM only (localStorage only without GM). */
export function readSecretSetting(key: string): string | null {
  const gm = gmGetRaw(key);
  if (gm !== null && gm !== undefined && gm !== '') return typeof gm === 'string' ? gm : JSON.stringify(gm);
  const local = localBackend.get(key);
  return typeof local === 'string' && local !== '' ? local : null;
}

export function writeSecretSetting(key: string, value: string): void {
  if (gmSetRaw(key, value)) {
    localBackend.remove(key);
    return;
  }
  localBackend.set(key, value);
}

/* ----------------------------------------------------------- storage mode */

let currentMode: StorageMode | null = null;

function detectMode(): StorageMode {
  let stored = localBackend.get(KEY_STORAGE_MODE);
  if (gmAvailable && (stored === null || stored === '')) stored = gmBackend.get(KEY_STORAGE_MODE);
  return stored === 'gm' && gmAvailable ? 'gm' : 'local';
}

function persistMode(mode: StorageMode): void {
  try { localBackend.set(KEY_STORAGE_MODE, mode); } catch { /* ignore */ }
  if (gmAvailable) {
    try { gmBackend.set(KEY_STORAGE_MODE, mode); } catch { /* ignore */ }
  }
}

/** Current storage mode, determined lazily and persisted to both stores on first use (S-20, S-21). */
export function getMode(): StorageMode {
  if (!currentMode) {
    currentMode = detectMode();
    persistMode(currentMode);
  }
  return currentMode;
}

export function activeBackend(): Backend {
  return backendFor(getMode());
}

export interface SwitchResult {
  ok: boolean;
  moved: number;
  error?: string;
}

/**
 * Switch storage backend and move all video records (S-24..S-29, T-37..T-42).
 * Fixes S-Q7: refuses GM when GM is unavailable, and only deletes source records
 * after every copy was verified in the target.
 */
export function switchMode(target: StorageMode, options: { migrate?: boolean; clearSource?: boolean } = {}): SwitchResult {
  const migrate = options.migrate !== false;
  const clearSource = options.clearSource !== false;
  if (target !== 'local' && target !== 'gm') return { ok: false, moved: 0, error: 'invalid mode' };
  const from = getMode();
  if (from === target) return { ok: true, moved: 0 };
  if (target === 'gm' && !gmAvailable) return { ok: false, moved: 0, error: 'GM storage is not available' };
  const src = backendFor(from);
  const dst = backendFor(target);
  let moved = 0;
  if (migrate) {
    const entries = listPrefixed(src);
    const failures: string[] = [];
    for (const [key, value] of entries) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      try {
        dst.set(key, text);
        const back = dst.get(key);
        if ((typeof back === 'string' ? back : JSON.stringify(back)) !== text) failures.push(key);
      } catch (err) {
        failures.push(key);
      }
    }
    if (failures.length) {
      return { ok: false, moved: 0, error: `${failures.length} record(s) could not be written to the target backend` };
    }
    moved = entries.length;
    if (clearSource) for (const [key] of entries) src.remove(key);
  }
  currentMode = target;
  persistMode(target);
  return { ok: true, moved };
}

/* ----------------------------------------------------------- export / import */

export interface ExportPayload {
  version: '1';
  exportedAt: number;
  storageMode: StorageMode;
  entries: Record<string, unknown>;
}

/** S-31/S-32, T-52: export every record of the active backend, raw values. */
export function exportData(): ExportPayload {
  const entries: Record<string, unknown> = {};
  for (const [k, v] of listPrefixed(activeBackend())) entries[k] = v;
  return { version: '1', exportedAt: Date.now(), storageMode: getMode(), entries };
}

/**
 * S-33..S-37, T-81, N-1.4: import entries into the active backend.
 * Object values are serialised first; the count only includes successful writes.
 */
export function importData(payload: unknown, options: { overwrite?: boolean } = {}): number {
  if (!payload || typeof payload !== 'object' || !('entries' in payload)) throw new Error('Invalid import payload');
  const entries = (payload as { entries: unknown }).entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Invalid import payload');
  const pairs = Object.entries(entries as Record<string, unknown>).filter(([k]) => k.startsWith(RECORD_PREFIX));
  const backend = activeBackend();
  if (options.overwrite) {
    if (!pairs.length) throw new Error('No records to import; existing records were kept');
    for (const [k] of listPrefixed(backend)) backend.remove(k);
  }
  let count = 0;
  for (const [key, value] of pairs) {
    if (value === null || value === undefined) continue;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      backend.set(key, text);
      count++;
    } catch (err) {
      console.error('[Video Memory] Import write failed:', key, err);
    }
  }
  return count;
}
