// Drive synchronisation engine (N-7.6..N-7.10): upload queue, delete, per-session pull, first full sync.

import { dispatch } from '../../api/events';
import { listRecords, readRecord, updateRecord, writeRecord, type RecordChange, type VideoRecord } from '../../api/records';
import { EVT_DRIVE_STATUS, KEY_DRIVE_FULL_SYNC, RECORD_PREFIX, watchUrl } from '../../utils/constants';
import { readSetting, writeSetting } from '../../utils/storage';
import { errorMessage } from '../../utils/text';
import { DriveClient, fileNameFor, hasCredentials, LEGACY_FILE_NAME, readCredentials, type DriveCredentials } from './drive';

const FIRST_DELAY_MS = 1500;
const MIN_INTERVAL_MS = 15000;

export type SyncState = 'start' | 'progress' | 'done' | 'deferred' | 'idle' | 'error';

export interface SyncStatus {
  state: SyncState;
  done: number;
  total: number;
  message: string;
  at: number;
}

type Task =
  | { kind: 'upload'; videoId: string }
  | { kind: 'delete'; videoId: string }
  | { kind: 'full' };

export class DriveSync {
  readonly client: DriveClient;
  private creds: DriveCredentials = readCredentials();
  private pending = new Map<string, number>();
  private lastUpload = new Map<string, number>();
  private deletes: string[] = [];
  private fullRequested = false;
  private working = false;
  private timer = 0;
  private stopped = false;
  status: SyncStatus = { state: 'idle', done: 0, total: 0, message: '', at: Date.now() };
  onStatus: ((s: SyncStatus) => void) | null = null;

  constructor() {
    this.client = new DriveClient(() => this.creds);
  }

  configured(): boolean {
    return hasCredentials(this.creds);
  }

  reloadCredentials(): void {
    this.creds = readCredentials();
    this.client.reset();
  }

  start(): void {
    this.stopped = false;
    if (!this.configured()) {
      this.setStatus('idle', 0, 0, '');
      return;
    }
    if (readSetting(KEY_DRIVE_FULL_SYNC) !== '1') this.requestFullSync();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    this.pending.clear();
    this.deletes = [];
  }

  private setStatus(state: SyncState, done: number, total: number, message: string): void {
    this.status = { state, done, total, message, at: Date.now() };
    dispatch(EVT_DRIVE_STATUS, { state, done, total, message });
    this.onStatus?.(this.status);
  }

  /** Local record changes (N-7.6, N-7.7). Bulk operations and sync writes are ignored. */
  handleChange(change: RecordChange): void {
    if (this.stopped || !this.configured()) return;
    if (change.kind === 'content') this.queueUpload(change.videoId, false);
    else if (change.kind === 'delete') {
      this.pending.delete(change.videoId);
      this.deletes.push(change.videoId);
      this.kick();
    }
  }

  /** N-7.6: first change uploads after 1.5 s (later changes do not postpone it), max once per 15 s per video. */
  queueUpload(videoId: string, force: boolean): void {
    if (this.stopped || !this.configured()) return;
    if (this.pending.has(videoId)) return;
    const rec = readRecord(videoId);
    if (!rec) return;
    const uploadedAt = rec.driveSync?.lastUploadAt || 0;
    if (!force && (Number(rec.updatedAt) || 0) <= uploadedAt) return;
    const now = Date.now();
    const earliest = (this.lastUpload.get(videoId) || 0) + MIN_INTERVAL_MS;
    const due = Math.max(now + FIRST_DELAY_MS, earliest);
    this.pending.set(videoId, due);
    if (earliest > now + FIRST_DELAY_MS) this.setStatus('deferred', 0, 0, '');
    this.schedule();
  }

  requestFullSync(): void {
    if (!this.configured()) return;
    this.fullRequested = true;
    this.kick();
  }

  uploadAll(): void {
    if (!this.configured()) return;
    this.fullRequested = true;
    this.kick();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    if (this.stopped || this.working || !this.pending.size) return;
    const next = Math.min(...this.pending.values());
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.kick();
    }, Math.max(0, next - Date.now()));
  }

  private nextTask(): Task | null {
    if (this.deletes.length) return { kind: 'delete', videoId: this.deletes.shift() as string };
    if (this.fullRequested) {
      this.fullRequested = false;
      return { kind: 'full' };
    }
    const now = Date.now();
    for (const [videoId, due] of this.pending) {
      if (due <= now) {
        this.pending.delete(videoId);
        return { kind: 'upload', videoId };
      }
    }
    return null;
  }

  /** Single worker: one Drive write at a time. */
  private async kick(): Promise<void> {
    if (this.working || this.stopped) return;
    this.working = true;
    try {
      for (let task = this.nextTask(); task && !this.stopped; task = this.nextTask()) {
        try {
          if (task.kind === 'upload') {
            this.setStatus('start', 0, 1, '');
            await this.upload(task.videoId);
            this.setStatus('done', 1, 1, '');
          } else if (task.kind === 'delete') {
            await this.deleteRemote(task.videoId);
          } else {
            await this.fullSync();
          }
        } catch (err) {
          console.warn('[Video Memory] Drive sync failed:', err);
          this.setStatus('error', 0, 0, errorMessage(err));
        }
      }
    } finally {
      this.working = false;
      this.schedule();
    }
  }

  private payload(videoId: string, record: VideoRecord): string {
    const copy: VideoRecord = { ...record };
    delete copy.driveSync;
    return JSON.stringify({ version: '2', videoId, videoUrl: watchUrl(videoId), exportedAt: Date.now(), record: copy });
  }

  private async upload(videoId: string): Promise<void> {
    const rec = readRecord(videoId);
    if (!rec) return;
    const snapshotAt = Date.now();
    this.lastUpload.set(videoId, snapshotAt);
    const name = fileNameFor(rec.videoName, videoId);
    const content = this.payload(videoId, rec);
    const files = await this.client.filesFor(videoId);
    let file;
    if (files.length) {
      file = await this.client.update(files[0].id, name, content);
      for (const extra of files.slice(1)) {
        try { await this.client.remove(extra.id); } catch (err) { console.warn('[Video Memory] Drive cleanup failed:', err); }
      }
    } else {
      file = await this.client.create(name, content);
    }
    const remoteModifiedAt = Date.parse(file && file.modifiedTime) || Date.now();
    const uploadedAt = Math.max(Number(rec.updatedAt) || 0, 1);
    updateRecord(videoId, cur => (cur ? { ...cur, driveSync: { ...(cur.driveSync || {}), lastUploadAt: uploadedAt, remoteModifiedAt } } : null), 'sync');
  }

  private async deleteRemote(videoId: string): Promise<void> {
    const files = await this.client.filesFor(videoId);
    for (const f of files) await this.client.remove(f.id);
  }

  /** N-7.8: run before restoring a video. */
  async pull(videoId: string): Promise<void> {
    if (!this.configured() || this.stopped) return;
    try {
      const files = await this.client.filesFor(videoId);
      const local = readRecord(videoId);
      if (!files.length) {
        if (local) this.queueUpload(videoId, true);
        return;
      }
      const remoteMs = Date.parse(files[0].modifiedTime) || 0;
      const meta = (local && local.driveSync) || {};
      const localUpdated = Number(local && local.updatedAt) || 0;
      if (!(remoteMs > localUpdated && remoteMs > (meta.lastDownloadAt || 0) && remoteMs !== meta.remoteModifiedAt)) return;
      const parsed = JSON.parse(await this.client.download(files[0].id));
      const remote = parsed && typeof parsed === 'object' ? parsed.record : null;
      if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return;
      const now = Date.now();
      const incoming: VideoRecord = { ...remote };
      delete incoming.driveSync;
      const current = readRecord(videoId) || {};
      writeRecord(videoId, {
        ...current,
        ...incoming,
        driveSync: { ...(current.driveSync || {}), lastDownloadAt: now, lastUploadAt: now, remoteModifiedAt: remoteMs }
      }, 'sync');
      this.setStatus('done', 1, 1, '');
    } catch (err) {
      console.warn('[Video Memory] Drive pull failed:', err);
      this.setStatus('error', 0, 0, errorMessage(err));
    }
  }

  /** N-7.9: import the v1.4.0 single-file backup, then upload every local record once. */
  private async fullSync(): Promise<void> {
    this.setStatus('start', 0, 0, '');
    await this.importLegacy();
    const entries = listRecords().filter(e => e.record);
    const total = entries.length;
    let done = 0;
    this.setStatus('progress', done, total, '');
    for (const entry of entries) {
      if (this.stopped) return;
      this.pending.delete(entry.videoId);
      await this.upload(entry.videoId);
      done++;
      this.setStatus('progress', done, total, '');
    }
    writeSetting(KEY_DRIVE_FULL_SYNC, '1');
    this.setStatus('done', done, total, '');
  }

  private async importLegacy(): Promise<void> {
    let files;
    try {
      files = await this.client.findByName(LEGACY_FILE_NAME);
    } catch (err) {
      console.warn('[Video Memory] Legacy Drive file lookup failed:', err);
      return;
    }
    if (!files.length) return;
    const parsed = JSON.parse(await this.client.download(files[0].id));
    const entries = parsed && typeof parsed === 'object' ? (parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : parsed) : null;
    if (!entries || typeof entries !== 'object') return;
    for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
      if (!key.startsWith(RECORD_PREFIX)) continue;
      const videoId = key.slice(RECORD_PREFIX.length);
      let remote: VideoRecord | null = null;
      try { remote = typeof value === 'string' ? JSON.parse(value) : (value as VideoRecord); } catch { remote = null; }
      if (!remote || typeof remote !== 'object') continue;
      const local = readRecord(videoId);
      if (!local || (Number(remote.saveDate) || 0) > (Number(local.saveDate) || 0)) {
        writeRecord(videoId, { ...(local || {}), ...remote }, 'bulk');
      }
    }
  }
}
