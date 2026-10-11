// Transcript service: endpoint settings (S-41..S-54, L-19..L-25) and per-video fetching (S-56..S-70).

import { readRecord, updateRecord } from '../../api/records';
import { KEY_TRANSCRIPT, watchUrl } from '../../utils/constants';
import { tr } from '../../utils/i18n';
import { readSetting, writeSetting } from '../../utils/storage';

export const ENDPOINT_SUFFIX = '/v1/chat/completions';
export const DEFAULT_ENDPOINT_RAW = 'https://0-v-YouTube-Transcript-Generator-api.hf.space/v1/chat/completions';
export const DEFAULT_MODEL = 'transcript';
export const DEFAULT_API_KEY = 'sk-asdlfjalalfja';
export const DEFAULT_TIMEOUT_MS = 600000;
export const MIN_TIMEOUT_MS = 60000;
export const MAX_TIMEOUT_MS = 3600000;
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface TranscriptSettings {
  endpoint: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
}

/** S-43a */
export function normalizeTimeoutMs(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(n)));
}

/** S-43c */
export function timeoutMinutes(ms: unknown): number {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.round(n / 60000);
}

/** S-44..S-47 / L-22: endpoint normalisation. */
export function normalizeEndpoint(value: unknown): string {
  if (typeof value !== 'string') return '';
  let s = value.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const url = new URL(s);
    let path = url.pathname.replace(/\/+$/, '');
    if (path.toLowerCase().includes(ENDPOINT_SUFFIX)) {
      if (!path.startsWith('/')) path = `/${path}`;
    } else if (!path) {
      path = ENDPOINT_SUFFIX;
    }
    url.pathname = path;
    return url.toString().replace(/\/+$/, '');
  } catch {
    const trimmed = s.replace(/\/+$/, '');
    return trimmed.toLowerCase().includes(ENDPOINT_SUFFIX) ? trimmed : trimmed + ENDPOINT_SUFFIX;
  }
}

export const DEFAULTS: TranscriptSettings = {
  endpoint: normalizeEndpoint(DEFAULT_ENDPOINT_RAW),
  model: DEFAULT_MODEL,
  apiKey: DEFAULT_API_KEY,
  timeoutMs: DEFAULT_TIMEOUT_MS
};

function readStored(): Record<string, unknown> {
  const raw = readSetting(KEY_TRANSCRIPT);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** S-51/S-52: current settings (stored values over defaults). */
export function getSettings(): TranscriptSettings {
  const stored = readStored();
  const endpoint = normalizeEndpoint(stored.endpoint) || DEFAULTS.endpoint;
  const model = typeof stored.model === 'string' && stored.model.trim() ? stored.model.trim() : DEFAULTS.model;
  const apiKey = typeof stored.apiKey === 'string' ? stored.apiKey.trim() : DEFAULTS.apiKey;
  const timeoutMs = stored.timeoutMs ? normalizeTimeoutMs(stored.timeoutMs) : DEFAULTS.timeoutMs;
  return { endpoint, model, apiKey, timeoutMs };
}

export interface SettingsInput {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  timeoutMinutes?: number;
}

/**
 * S-49/S-53 update. Fixes S-Q16/L-Q6: an emptied API key is stored as "" (no key) instead of being
 * ignored; an emptied endpoint / model falls back to the default.
 */
export function updateSettings(input: SettingsInput): TranscriptSettings {
  const stored = readStored();
  const next: Record<string, unknown> = { ...DEFAULTS, ...stored };
  if (input.endpoint !== undefined) next.endpoint = normalizeEndpoint(input.endpoint) || DEFAULTS.endpoint;
  if (input.model !== undefined) next.model = input.model.trim() || DEFAULTS.model;
  if (input.apiKey !== undefined) next.apiKey = input.apiKey.trim();
  if (input.timeoutMinutes !== undefined && Number.isFinite(input.timeoutMinutes) && input.timeoutMinutes > 0) {
    next.timeoutMs = normalizeTimeoutMs(input.timeoutMinutes * 60000);
  }
  writeSetting(KEY_TRANSCRIPT, JSON.stringify(next));
  return getSettings();
}

/* ----------------------------------------------------------- response parsing (S-70) */

export function extractText(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  if (Array.isArray(payload)) return payload.map(extractText).filter(Boolean).join('\n').trim();
  if (typeof payload !== 'object') return '';
  const p = payload as Record<string, any>;
  if (p.error && typeof p.error === 'object' && p.error.message) throw new Error(String(p.error.message));
  if (typeof p.transcript === 'string') return p.transcript.trim();
  if (Array.isArray(p.transcript)) return p.transcript.join('\n').trim();
  if (p.output_text) {
    if (Array.isArray(p.output_text)) return p.output_text.join('\n').trim();
    if (typeof p.output_text === 'string') return p.output_text.trim();
  }
  if (Array.isArray(p.output)) {
    const parts: string[] = [];
    for (const item of p.output) {
      if (item && Array.isArray(item.content)) {
        for (const c of item.content) if (c && typeof c.text === 'string') parts.push(c.text);
      }
    }
    const joined = parts.join('\n').trim();
    if (joined) return joined;
  }
  if (Array.isArray(p.choices)) {
    const parts = p.choices.map((choice: any) => {
      const content = choice && choice.message ? choice.message.content : undefined;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) return content.map((part: any) => (part && typeof part.text === 'string' ? part.text : '')).join('\n');
      if (choice && typeof choice.text === 'string') return choice.text;
      return '';
    }).filter((s: string) => s && s.trim());
    const joined = parts.join('\n').trim();
    if (joined) return joined;
  }
  if (typeof p.text === 'string') return p.text.trim();
  if (typeof p.data === 'string' && p.data) return p.data.trim();
  return '';
}

/* ----------------------------------------------------------- cache + persistence (S-56..S-58) */

const cache = new Map<string, { text: string; at: number }>();
const inflight = new Map<string, { promise: Promise<string>; token: number }>();
let tokenSeq = 0;

export function forgetTranscript(videoId: string): void {
  cache.delete(videoId);
}

function persist(videoId: string, text: string): void {
  try {
    updateRecord(videoId, cur => {
      const out = { ...(cur || {}) };
      if (text.trim()) {
        out.videoTranscript = text.trim();
        out.videoTranscriptUpdatedAt = Date.now();
      } else {
        delete out.videoTranscript;
        delete out.videoTranscriptUpdatedAt;
      }
      return out;
    }, 'content');
  } catch (err) {
    console.error('[Video Memory] Failed to persist transcript to storage:', err);
  }
}

/** S-58 (fixes S-Q13: an expired memory entry is refreshed from the record only once per TTL). */
export function cachedTranscript(videoId: string): string | null {
  if (!videoId) return null;
  const hit = cache.get(videoId);
  if (hit && Date.now() - hit.at <= CACHE_TTL_MS) return hit.text;
  const rec = readRecord(videoId);
  const stored = rec && typeof rec.videoTranscript === 'string' ? rec.videoTranscript.trim() : '';
  if (!stored) return null;
  cache.set(videoId, { text: stored, at: Date.now() });
  return stored;
}

export class TranscriptTimeoutError extends Error {
  constructor(minutes: number) {
    super(tr('The transcript service did not respond within {n} minute(s); the request was cancelled.', '字幕接口在 {n} 分钟内无响应，已自动取消请求。', { n: minutes }));
    this.name = 'TranscriptTimeoutError';
  }
}

/** S-59..S-69d */
export function fetchTranscript(videoId: string, options: { force?: boolean; videoUrl?: string } = {}): Promise<string> {
  if (!videoId) return Promise.reject(new Error(tr('Cannot detect the current video ID.', '无法识别当前视频 ID。')));
  if (!options.force) {
    const cached = cachedTranscript(videoId);
    if (cached) return Promise.resolve(cached);
    const running = inflight.get(videoId);
    if (running) return running.promise;
  }
  const settings = getSettings();
  if (!settings.endpoint.trim()) return Promise.reject(new Error(tr('Please configure the transcript endpoint first.', '请先配置字幕接口路径。')));
  const token = ++tokenSeq;
  const promise = (async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
    const body = JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      messages: [{ role: 'user', content: (options.videoUrl || '').trim() || watchUrl(videoId) }]
    });
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    // Fix S-Q15: the timeout covers the whole request including the body.
    const timer = window.setTimeout(() => { timedOut = true; controller?.abort(); }, settings.timeoutMs);
    try {
      let text: string;
      let status: number;
      try {
        const res = await fetch(settings.endpoint, { method: 'POST', headers, body, signal: controller?.signal, credentials: 'omit', cache: 'no-store' });
        status = res.status;
        text = await res.text();
      } catch (err) {
        if (timedOut) throw new TranscriptTimeoutError(timeoutMinutes(settings.timeoutMs));
        throw err;
      }
      let payload: unknown = null;
      if (text) {
        try { payload = JSON.parse(text); } catch { payload = text; }
      }
      if (status < 200 || status >= 300) {
        const p = payload as Record<string, any> | null;
        const message = (p && typeof p === 'object' && ((p.error && p.error.message) || p.message)) || text || `HTTP ${status}`;
        throw new Error(String(message));
      }
      const result = extractText(payload).trim();
      if (!result) throw new Error(tr('The transcript service returned no usable content.', '字幕接口未返回有效内容。'));
      cache.set(videoId, { text: result, at: Date.now() });
      persist(videoId, result);
      return result;
    } finally {
      clearTimeout(timer);
      // Fix S-Q14: only the latest request clears the in-flight entry.
      if (inflight.get(videoId)?.token === token) inflight.delete(videoId);
    }
  })();
  inflight.set(videoId, { promise, token });
  return promise;
}

export function isFetching(videoId: string): boolean {
  return inflight.has(videoId);
}
