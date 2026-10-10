// Google OAuth token + Drive v3 client used by the DriveSync plugin (N-7.2..N-7.5).

import { KEY_DRIVE, UNKNOWN_TITLE } from '../../utils/constants';
import { httpRequest, type HttpResponse } from '../../utils/net';
import { readSecretSetting, writeSecretSetting } from '../../utils/storage';

export const FOLDER_NAME = '[Youtube] Video Memory';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const LEGACY_FILE_NAME = '[Youtube] Video Memory Sync.json';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export function readCredentials(): DriveCredentials {
  const empty = { clientId: '', clientSecret: '', refreshToken: '' };
  const raw = readSecretSetting(KEY_DRIVE);
  if (!raw) return empty;
  try {
    let parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (!parsed || typeof parsed !== 'object') return empty;
    const p = parsed as Record<string, unknown>;
    return {
      clientId: typeof p.clientId === 'string' ? p.clientId.trim() : '',
      clientSecret: typeof p.clientSecret === 'string' ? p.clientSecret.trim() : '',
      refreshToken: typeof p.refreshToken === 'string' ? p.refreshToken.trim() : ''
    };
  } catch {
    return empty;
  }
}

export function saveCredentials(creds: DriveCredentials): void {
  writeSecretSetting(KEY_DRIVE, JSON.stringify({
    clientId: creds.clientId.trim(),
    clientSecret: creds.clientSecret.trim(),
    refreshToken: creds.refreshToken.trim()
  }));
}

export function hasCredentials(creds: DriveCredentials): boolean {
  return Boolean(creds.clientId && creds.clientSecret && creds.refreshToken);
}

/** N-7.4 file name: "<title>｜<videoId>.json". */
export function fileNameFor(title: unknown, videoId: string): string {
  let clean = typeof title === 'string' ? title : '';
  clean = clean.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/:*?"<>|]/g, '-').trim();
  if (clean.length > 120) clean = clean.slice(0, 120).trim();
  if (!clean) clean = UNKNOWN_TITLE;
  return `${clean}｜${videoId}.json`;
}

/** Video id from "…｜<id>.json" or "…[<id>].json". */
export function videoIdFromName(name: string): string | null {
  const m = /｜([^｜]+)\.json$/.exec(name) || /\[([^\]]+)\]\.json$/.exec(name);
  return m ? m[1] : null;
}

const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function errorFrom(res: HttpResponse): Error {
  let message = `HTTP ${res.status}`;
  try {
    const data = res.json<{ error?: { message?: string } | string; error_description?: string }>();
    if (data && typeof data.error === 'object' && data.error.message) message = data.error.message;
    else if (data && data.error_description) message = data.error_description;
    else if (data && typeof data.error === 'string') message = data.error;
  } catch { /* keep HTTP status */ }
  const err = new Error(message) as Error & { status?: number };
  err.status = res.status;
  return err;
}

export class DriveClient {
  private token: { value: string; expiresAt: number } | null = null;
  private folder: string | null = null;
  private folderTask: Promise<string> | null = null;

  constructor(private readonly creds: () => DriveCredentials) {}

  reset(): void {
    this.token = null;
    this.folder = null;
    this.folderTask = null;
  }

  /** N-7.2: refresh-token grant, cached until 60 s before expiry. */
  async accessToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const c = this.creds();
    if (!hasCredentials(c)) throw new Error('Missing Google Drive credentials');
    const body = new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: 'refresh_token'
    }).toString();
    const res = await httpRequest({ method: 'POST', url: TOKEN_URL, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, timeoutMs: 30000 });
    if (!res.ok) throw errorFrom(res);
    const data = res.json<{ access_token?: string; expires_in?: number }>();
    if (!data.access_token) throw new Error('No access token in response');
    const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 3600000;
    this.token = { value: data.access_token, expiresAt: Date.now() + ttl - 60000 };
    return data.access_token;
  }

  /** Authorised request; a 401 drops the cached token and retries once. */
  private async call(method: string, url: string, body?: string, headers: Record<string, string> = {}): Promise<HttpResponse> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken(attempt > 0);
      const res = await httpRequest({ method, url, body, headers: { ...headers, Authorization: `Bearer ${token}` }, timeoutMs: 60000 });
      if (res.status === 401 && attempt === 0) {
        this.token = null;
        continue;
      }
      if (!res.ok) throw errorFrom(res);
      return res;
    }
    throw new Error('Unauthorized');
  }

  async list(q: string): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      q,
      orderBy: 'modifiedTime desc',
      fields: 'files(id,name,modifiedTime)',
      pageSize: '100',
      spaces: 'drive'
    });
    const res = await this.call('GET', `${API}?${params.toString()}`);
    const data = res.json<{ files?: DriveFile[] }>();
    return Array.isArray(data.files) ? data.files : [];
  }

  /** N-7.3: the "[Youtube] Video Memory" folder, created when missing; id cached for the page. */
  folderId(): Promise<string> {
    if (this.folder) return Promise.resolve(this.folder);
    if (!this.folderTask) {
      this.folderTask = (async () => {
        const found = await this.list(`name = '${quote(FOLDER_NAME)}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
        if (found.length) return found[0].id;
        const res = await this.call('POST', `${API}?fields=id`, JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }), { 'Content-Type': 'application/json' });
        const id = res.json<{ id?: string }>().id;
        if (!id) throw new Error('Folder creation returned no id');
        return id;
      })().then(id => {
        this.folder = id;
        return id;
      }).finally(() => { this.folderTask = null; });
    }
    return this.folderTask;
  }

  /** N-7.5: files of one video in the folder, newest first, matching the parsed id exactly. */
  async filesFor(videoId: string): Promise<DriveFile[]> {
    const folder = await this.folderId();
    const files = await this.list(`name contains '${quote(videoId)}' and mimeType = 'application/json' and '${quote(folder)}' in parents and trashed = false`);
    return files.filter(f => videoIdFromName(f.name) === videoId);
  }

  async findByName(name: string): Promise<DriveFile[]> {
    return this.list(`name = '${quote(name)}' and trashed = false`);
  }

  async download(fileId: string): Promise<string> {
    const res = await this.call('GET', `${API}/${encodeURIComponent(fileId)}?alt=media`);
    return res.text;
  }

  private multipart(metadata: Record<string, unknown>, content: string): { body: string; type: string } {
    const boundary = `ysrp${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      content,
      `--${boundary}--`,
      ''
    ].join('\r\n');
    return { body, type: `multipart/related; boundary=${boundary}` };
  }

  async create(name: string, content: string): Promise<DriveFile> {
    const folder = await this.folderId();
    const { body, type } = this.multipart({ name, parents: [folder], mimeType: 'application/json' }, content);
    const res = await this.call('POST', `${UPLOAD}?uploadType=multipart&fields=id,name,modifiedTime`, body, { 'Content-Type': type });
    return res.json<DriveFile>();
  }

  async update(fileId: string, name: string, content: string): Promise<DriveFile> {
    const { body, type } = this.multipart({ name }, content);
    const res = await this.call('PATCH', `${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime`, body, { 'Content-Type': type });
    return res.json<DriveFile>();
  }

  async remove(fileId: string): Promise<void> {
    await this.call('DELETE', `${API}/${encodeURIComponent(fileId)}`);
  }
}
