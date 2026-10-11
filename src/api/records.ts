// Video record access: read-merge-write on the active backend, change notifications (S-38..S-40, N-1).

import { RECORD_PREFIX, UNKNOWN_TITLE } from '../utils/constants';
import { activeBackend, listPrefixed } from '../utils/storage';
import { Emitter } from './events';

export interface DriveSyncMeta {
  lastUploadAt?: number;
  lastDownloadAt?: number;
  remoteModifiedAt?: number;
}

export interface VideoRecord {
  videoProgress?: number;
  saveDate?: number;
  videoName?: string;
  originalTitle?: string | null;
  videoNote?: string;
  videoTranscript?: string;
  videoTranscriptUpdatedAt?: number;
  videoDuration?: number;
  updatedAt?: number;
  driveSync?: DriveSyncMeta;
  [field: string]: unknown;
}

/**
 * Kind of change:
 * - content: progress/title/note/transcript changed locally (bumps updatedAt, triggers sync upload)
 * - meta: cached metadata such as originalTitle (no updatedAt bump)
 * - sync: sync bookkeeping or a downloaded remote record (never triggers an upload)
 * - delete: a user deleted the record
 * - bulk: import / migration / cleanup (no automatic sync)
 */
export type ChangeKind = 'content' | 'meta' | 'sync' | 'delete' | 'bulk';

export interface RecordChange {
  videoId: string;
  kind: ChangeKind;
  record: VideoRecord | null;
}

export const recordChanges = new Emitter<RecordChange>();

export const recordKey = (videoId: string): string => RECORD_PREFIX + videoId;

/** Parse a raw stored value; null when unparsable or not an object. */
export function parseRecord(raw: unknown): VideoRecord | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return Array.isArray(raw) ? null : { ...(raw as VideoRecord) };
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null) return {};
    return typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as VideoRecord) : null;
  } catch {
    return null;
  }
}

export function readRecord(videoId: string): VideoRecord | null {
  if (!videoId) return null;
  return parseRecord(activeBackend().get(recordKey(videoId)));
}

export function hasRecord(videoId: string): boolean {
  return Boolean(videoId) && activeBackend().get(recordKey(videoId)) !== null;
}

/** Write a full record. Throws when the backend write fails. */
export function writeRecord(videoId: string, record: VideoRecord, kind: ChangeKind = 'content'): VideoRecord {
  if (!videoId) throw new Error('Missing video id');
  const next = { ...record };
  if (kind === 'content') next.updatedAt = Date.now();
  activeBackend().set(recordKey(videoId), JSON.stringify(next));
  recordChanges.emit({ videoId, kind, record: next });
  return next;
}

/**
 * Read-merge-write (N-1.2). The updater receives the current record (null when missing or
 * unparsable) and returns the new one, or null to skip writing. Unknown fields survive because
 * updaters spread the existing record.
 */
export function updateRecord(videoId: string, updater: (current: VideoRecord | null) => VideoRecord | null, kind: ChangeKind = 'content'): VideoRecord | null {
  const current = readRecord(videoId);
  const next = updater(current ? { ...current } : null);
  if (!next) return null;
  return writeRecord(videoId, next, kind);
}

export function removeRecord(videoId: string, kind: ChangeKind = 'delete'): void {
  if (!videoId) return;
  activeBackend().remove(recordKey(videoId));
  recordChanges.emit({ videoId, kind, record: null });
}

export interface RecordEntry {
  videoId: string;
  key: string;
  raw: unknown;
  record: VideoRecord | null;
}

export function listRecords(): RecordEntry[] {
  return listPrefixed(activeBackend()).map(([key, raw]) => ({
    videoId: key.slice(RECORD_PREFIX.length),
    key,
    raw,
    record: parseRecord(raw)
  }));
}

/** Number of valid records (fixes R-Q4: the same count is used everywhere). */
export function countRecords(): number {
  return listRecords().filter(e => e.record !== null).length;
}

/**
 * L-69..L-73 startup cleanup of the active backend. Unparsable/non-object values are removed,
 * video names are trimmed / defaulted. Fixes L-Q18: a name equal to the original title is kept.
 */
export function cleanupRecords(): void {
  const backend = activeBackend();
  for (const entry of listRecords()) {
    try {
      const rec = entry.record;
      if (!rec || typeof rec !== 'object') {
        backend.remove(entry.key);
        continue;
      }
      let dirty = typeof entry.raw !== 'string';
      if (typeof rec.videoName !== 'string' || !rec.videoName.trim()) {
        rec.videoName = UNKNOWN_TITLE;
        dirty = true;
      } else if (rec.videoName.trim() !== rec.videoName) {
        rec.videoName = rec.videoName.trim();
        dirty = true;
      }
      if (dirty) {
        // A failing write (e.g. quota) must never cost the user the record itself.
        try { backend.set(entry.key, JSON.stringify(rec)); } catch { /* keep as is */ }
      }
    } catch {
      backend.remove(entry.key);
    }
  }
}
