// ==UserScript==
// @name         [Youtube] Video Memory [20261007] v2.0.0
// @namespace    0_V userscripts/Youtube Save & Resume Progress
// @description  Save & resume YouTube playback progress. Clean-room rewrite: per-video sessions that survive in-site navigation, ads, slow loads and multiple tabs. Records list with DeArrow titles, notes and transcripts; localStorage / GM storage with migration, import & export; Chinese / English UI.
// @version      [20261007] v2.0.0
// @update-log   [20261007] v2.0.0 · Clean-room rewrite against docs/functional-spec.md. Fixes progress being overwritten after in-site navigation, slow page loads, pre-roll ads and paused background tabs.
// @license      MIT
//
// @match        *://*.youtube.com/*
//
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
//
// @icon         https://github.com/0-V-linuxdo/Youtube-Memory/raw/refs/heads/main/main_icon/main_icon.svg
// ==/UserScript==

/*
 * Written from docs/functional-spec.md (clean-room). Spec item ids (F-x.y / BUG-n / D-n)
 * are referenced in comments where the behaviour is not obvious.
 *
 * YouTube enforces Trusted Types: never assign innerHTML anywhere in this file.
 */

(function () {
  'use strict';

  /* ======================================================================
   * Constants
   * ==================================================================== */

  const RECORD_PREFIX = 'Youtube_SaveResume_Progress-';
  const KEY_STORAGE_MODE = 'YSRP_StorageMode';
  const KEY_TRANSCRIPT = 'YSRP_TranscriptSettings';
  const KEY_LANGUAGE = 'YSRP_LanguagePreference';
  const UNKNOWN_TITLE = 'Unknown Title';
  const PLACEHOLDER_TITLES = new Set(['unknown title', '正在获取标题…']);

  const EVT_RECORD = 'ysrp-record-updated';
  const EVT_VIDEO = 'ysrp-current-video-status';
  const EVT_TITLE = 'ysrp-dearrow-title-ready';
  const EVT_LANG = 'ysrp-language-changed';

  const TICK_MS = 500;
  const SAVE_THROTTLE_MS = 1500;
  const MIN_SAVE_DELTA = 0.5;
  const MIN_RESTORE_POSITION = 1;
  const END_GUARD_SECONDS = 5;
  const RESTORE_TOLERANCE = 3;
  const RESTORE_MAX_ATTEMPTS = 8;
  const RESTORE_TIMEOUT_MS = 15000;
  const RESTORE_RETRY_MS = 1200;
  const RESUMED_NOTICE_MS = 3000;

  const FONT_AWESOME_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
  const DEARROW_API = 'https://sponsor.ajay.app/api/branding?videoID=';
  const OEMBED_API = 'https://www.youtube.com/oembed?format=json&url=';
  const DEARROW_TTL_MS = 6 * 60 * 60 * 1000;

  const TRANSCRIPT_SUFFIX = '/v1/chat/completions';
  const TRANSCRIPT_DEFAULTS = Object.freeze({
    endpoint: 'https://0-v-YouTube-Transcript-Generator-api.hf.space/v1/chat/completions',
    model: 'transcript',
    apiKey: 'sk-asdlfjalalfja',
    timeoutMs: 10 * 60 * 1000
  });
  const TRANSCRIPT_MIN_MINUTES = 1;
  const TRANSCRIPT_MAX_MINUTES = 60;
  const TRANSCRIPT_CACHE_TTL_MS = 30 * 60 * 1000;

  /* ======================================================================
   * Small helpers
   * ==================================================================== */

  const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function' &&
    typeof GM_deleteValue === 'function' && typeof GM_listValues === 'function';

  function readSetting(key) {
    let value = null;
    try { value = window.localStorage.getItem(key); } catch (_) { /* blocked */ }
    if ((value === null || value === '') && hasGM) {
      try { value = GM_getValue(key, null); } catch (_) { /* ignore */ }
    }
    return value === undefined ? null : value;
  }

  function writeSetting(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) { /* ignore */ }
    if (hasGM) { try { GM_setValue(key, value); } catch (_) { /* ignore */ } }
  }

  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) { /* ignore */ }
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  const normTitle = text => String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const sameTitle = (a, b) => Boolean(a) && Boolean(b) && normTitle(a).toLowerCase() === normTitle(b).toLowerCase();
  const isPlaceholderTitle = text => !normTitle(text) || PLACEHOLDER_TITLES.has(normTitle(text).toLowerCase());

  const runtime = (() => {
    const ua = String(navigator.userAgent || '').toLowerCase();
    const isIOS = /\b(ipad|iphone|ipod)\b/.test(ua) ||
      (ua.includes('mac') && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
    let canShareFile = false;
    if (isIOS && typeof File === 'function' && typeof navigator.share === 'function') {
      canShareFile = true;
      if (typeof navigator.canShare === 'function') {
        try {
          canShareFile = navigator.canShare({ files: [new File(['{}'], 'probe.json', { type: 'application/json' })] });
        } catch (_) { canShareFile = false; }
      }
    }
    return { isIOS, canShareFile };
  })();

  /* ======================================================================
   * i18n (F-4.24)
   * ==================================================================== */

  function detectBrowserLanguage() {
    const candidates = [].concat(navigator.languages || [], navigator.language || []).filter(Boolean);
    return candidates.length && String(candidates[0]).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function normalizeLanguagePreference(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw.startsWith('zh')) return 'zh';
    if (raw.startsWith('en')) return 'en';
    return 'auto';
  }

  let languagePreference = normalizeLanguagePreference(readSetting(KEY_LANGUAGE));
  const resolvedLanguage = () => (languagePreference === 'auto' ? detectBrowserLanguage() : languagePreference);

  function t(en, zh, params) {
    let text = resolvedLanguage() === 'zh' ? zh : en;
    if (params) {
      text = text.replace(/\{(\w+)\}/g, (_, key) => (Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : ''));
    }
    return text;
  }

  function setLanguagePreference(value) {
    const next = normalizeLanguagePreference(value);
    if (next === languagePreference) return false;
    languagePreference = next;
    writeSetting(KEY_LANGUAGE, next);
    emit(EVT_LANG, { preference: next, resolved: resolvedLanguage() });
    return true;
  }

  /* ======================================================================
   * Storage (F-1.x)
   * ==================================================================== */

  const backends = {
    local: {
      available: true,
      get(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } },
      set(key, value) { window.localStorage.setItem(key, value); }, // throws on quota errors (BUG-6)
      remove(key) { try { window.localStorage.removeItem(key); } catch (_) { /* ignore */ } },
      keys() {
        try {
          const out = [];
          for (let i = 0; i < window.localStorage.length; i++) out.push(window.localStorage.key(i));
          return out;
        } catch (_) { return []; }
      }
    },
    gm: {
      available: hasGM,
      get(key) {
        if (!hasGM) return null;
        try {
          const value = GM_getValue(key, null);
          if (value === null || value === undefined) return null;
          return typeof value === 'string' ? value : JSON.stringify(value);
        } catch (_) { return null; }
      },
      set(key, value) {
        if (!hasGM) throw new Error('GM storage is not available');
        GM_setValue(key, value);
      },
      remove(key) { if (hasGM) { try { GM_deleteValue(key); } catch (_) { /* ignore */ } } },
      keys() { if (!hasGM) return []; try { return GM_listValues() || []; } catch (_) { return []; } }
    }
  };

  const Store = (() => {
    let mode = null;

    function getMode() {
      if (!mode) {
        mode = readSetting(KEY_STORAGE_MODE) === 'gm' && hasGM ? 'gm' : 'local';
      }
      return mode;
    }

    const backend = () => backends[getMode()];
    const keyOf = id => RECORD_PREFIX + id;

    function parse(raw) {
      if (raw === null || raw === undefined) return null;
      try {
        const obj = JSON.parse(raw);
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
      } catch (_) { return null; }
    }

    function rawEntries(be) {
      return be.keys()
        .filter(k => typeof k === 'string' && k.startsWith(RECORD_PREFIX))
        .map(k => [k, be.get(k)])
        .filter(([, v]) => v !== null && v !== undefined);
    }

    function get(id) { return id ? parse(backend().get(keyOf(id))) : null; }

    // Read-merge-write so fields written elsewhere (notes, transcripts) survive.
    function update(id, mutate) {
      const key = keyOf(id);
      const current = parse(backend().get(key)) || {};
      const next = mutate(Object.assign({}, current)) || current;
      backend().set(key, JSON.stringify(next));
      return next;
    }

    function updateIfExists(id, mutate) {
      if (!get(id)) return null;
      try { return update(id, mutate); } catch (err) { console.error('[Video Memory] update failed', err); return null; }
    }

    function remove(id) { backend().remove(keyOf(id)); }

    function list() {
      const out = [];
      for (const [key, raw] of rawEntries(backend())) {
        const rec = parse(raw);
        if (rec) out.push({ id: key.slice(RECORD_PREFIX.length), rec });
      }
      return out;
    }

    function setMode(next) {
      if (!backends[next] || !backends[next].available) throw new Error(`Storage "${next}" is not available`);
      const current = getMode();
      if (current === next) return 0;
      const src = backends[current];
      const dst = backends[next];
      const items = rawEntries(src);
      for (const [k, v] of items) dst.set(k, v); // copy first; source is only cleared when every copy succeeded
      for (const [k] of items) src.remove(k);
      mode = next;
      writeSetting(KEY_STORAGE_MODE, next);
      return items.length;
    }

    function exportAll() {
      const entries = {};
      for (const [k, v] of rawEntries(backend())) entries[k] = v;
      return { version: '1', exportedAt: Date.now(), storageMode: getMode(), entries };
    }

    function importPayload(payload, overwrite) {
      if (!payload || typeof payload !== 'object' || !payload.entries || typeof payload.entries !== 'object') {
        throw new Error(t('Invalid import payload', '导入内容格式无效'));
      }
      const be = backend();
      if (overwrite) for (const [k] of rawEntries(be)) be.remove(k);
      let count = 0;
      for (const [k, v] of Object.entries(payload.entries)) {
        if (!k.startsWith(RECORD_PREFIX) || v === null || v === undefined) continue;
        be.set(k, typeof v === 'string' ? v : JSON.stringify(v)); // D-6
        count++;
      }
      return count;
    }

    // F-5.1
    function cleanup() {
      const be = backend();
      for (const [key, raw] of rawEntries(be)) {
        const rec = parse(raw);
        if (!rec) { be.remove(key); continue; }
        const name = typeof rec.videoName === 'string' && rec.videoName.trim() ? rec.videoName.trim() : UNKNOWN_TITLE;
        if (name !== rec.videoName) {
          rec.videoName = name;
          try { be.set(key, JSON.stringify(rec)); } catch (_) { /* ignore */ }
        }
      }
    }

    return { getMode, setMode, get, update, updateIfExists, remove, list, exportAll, importPayload, cleanup };
  })();

  /* ======================================================================
   * Titles: original (player / oEmbed) and DeArrow (F-2.5)
   * ==================================================================== */

  const Titles = (() => {
    const originals = new Map();
    const originalFetches = new Map();
    const dearrows = new Map(); // id -> { title: string|null, at }
    const dearrowFetches = new Map();

    function rememberOriginal(id, title) {
      const value = normTitle(title);
      if (id && value) originals.set(id, value);
    }

    function getOriginal(id) {
      if (!id) return Promise.resolve(null);
      if (originals.has(id)) return Promise.resolve(originals.get(id));
      if (originalFetches.has(id)) return originalFetches.get(id);
      const url = OEMBED_API + encodeURIComponent(`https://youtu.be/${id}`);
      const promise = fetch(url, { credentials: 'omit', cache: 'no-store' })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          const title = data && typeof data.title === 'string' ? normTitle(data.title) : null;
          if (title) {
            originals.set(id, title);
            Store.updateIfExists(id, rec => Object.assign(rec, { originalTitle: title }));
          }
          return title || null;
        })
        .catch(() => null)
        .finally(() => originalFetches.delete(id));
      originalFetches.set(id, promise);
      return promise;
    }

    function pickDeArrow(data) {
      if (!data || !Array.isArray(data.titles)) return null;
      const entry = data.titles.find(item => item && typeof item.title === 'string' && item.original !== true &&
        (Boolean(item.locked) || (typeof item.votes === 'number' ? item.votes : 0) >= 0));
      return entry ? normTitle(entry.title) || null : null;
    }

    function cachedDeArrow(id) {
      const hit = dearrows.get(id);
      return hit && Date.now() - hit.at < DEARROW_TTL_MS ? hit : null;
    }

    function getDeArrow(id) {
      if (!id) return Promise.resolve(null);
      const hit = cachedDeArrow(id);
      if (hit) return Promise.resolve(hit.title);
      if (dearrowFetches.has(id)) return dearrowFetches.get(id);
      const promise = fetch(DEARROW_API + encodeURIComponent(id), { credentials: 'omit', cache: 'no-store' })
        .then(res => {
          if (res.status === 404) return { titles: [] }; // DeArrow has no data for this video
          if (!res.ok) throw new Error(`DeArrow HTTP ${res.status}`);
          return res.json();
        })
        .then(data => {
          let title = pickDeArrow(data);
          if (title && sameTitle(title, originals.get(id))) title = null;
          dearrows.set(id, { title, at: Date.now() });
          if (title) emit(EVT_TITLE, { videoId: id, title });
          return title;
        })
        .catch(() => null) // network failure: not cached, retried next time
        .finally(() => dearrowFetches.delete(id));
      dearrowFetches.set(id, promise);
      return promise;
    }

    return {
      rememberOriginal,
      getOriginal,
      getDeArrow,
      knownOriginal: id => originals.get(id) || null,
      knownDeArrow: id => { const hit = cachedDeArrow(id); return hit ? hit.title : undefined; }
    };
  })();

  /* ======================================================================
   * Transcript settings & API (F-4.18 – F-4.22)
   * ==================================================================== */

  const Transcript = (() => {
    const cache = new Map(); // id -> { text, at }
    const inflight = new Map();

    function clampTimeoutMs(value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return TRANSCRIPT_DEFAULTS.timeoutMs;
      return Math.min(TRANSCRIPT_MAX_MINUTES * 60000, Math.max(TRANSCRIPT_MIN_MINUTES * 60000, Math.round(n)));
    }

    function normalizeEndpoint(value) {
      let raw = typeof value === 'string' ? value.trim() : '';
      if (!raw) return '';
      if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
      try {
        const url = new URL(raw);
        const path = url.pathname.replace(/\/+$/, '');
        url.pathname = path ? path : TRANSCRIPT_SUFFIX;
        return url.toString().replace(/\/+$/, '');
      } catch (_) {
        const trimmed = raw.replace(/\/+$/, '');
        return /\/\/[^/]+$/.test(trimmed) ? trimmed + TRANSCRIPT_SUFFIX : trimmed;
      }
    }

    function getSettings() {
      let stored = readSetting(KEY_TRANSCRIPT);
      if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch (_) { stored = null; } }
      const merged = Object.assign({}, TRANSCRIPT_DEFAULTS, stored && typeof stored === 'object' ? stored : {});
      return {
        endpoint: normalizeEndpoint(merged.endpoint) || TRANSCRIPT_DEFAULTS.endpoint,
        model: String(merged.model || TRANSCRIPT_DEFAULTS.model),
        apiKey: typeof merged.apiKey === 'string' ? merged.apiKey : '',
        timeoutMs: clampTimeoutMs(merged.timeoutMs)
      };
    }

    function saveSettings(partial) {
      const next = getSettings();
      if (typeof partial.endpoint === 'string' && partial.endpoint.trim()) next.endpoint = normalizeEndpoint(partial.endpoint);
      if (typeof partial.model === 'string' && partial.model.trim()) next.model = partial.model.trim();
      if (typeof partial.apiKey === 'string' && partial.apiKey.trim()) next.apiKey = partial.apiKey.trim();
      if (partial.timeoutMs !== undefined && Number(partial.timeoutMs) > 0) next.timeoutMs = clampTimeoutMs(partial.timeoutMs);
      writeSetting(KEY_TRANSCRIPT, JSON.stringify(next));
      return next;
    }

    function extractText(payload) {
      if (!payload) return '';
      if (typeof payload === 'string') return payload.trim();
      if (Array.isArray(payload)) return payload.map(extractText).filter(Boolean).join('\n').trim();
      if (payload.error && payload.error.message) throw new Error(payload.error.message);
      if (typeof payload.transcript === 'string') return payload.transcript.trim();
      if (Array.isArray(payload.transcript)) return payload.transcript.join('\n').trim();
      if (typeof payload.output_text === 'string') return payload.output_text.trim();
      if (Array.isArray(payload.output_text)) return payload.output_text.join('\n').trim();
      if (Array.isArray(payload.output)) {
        const joined = payload.output
          .flatMap(entry => (entry && Array.isArray(entry.content) ? entry.content : []))
          .map(part => (part && typeof part.text === 'string' ? part.text : ''))
          .filter(Boolean).join('\n').trim();
        if (joined) return joined;
      }
      if (Array.isArray(payload.choices)) {
        const joined = payload.choices.map(choice => {
          if (!choice) return '';
          const content = choice.message && choice.message.content;
          if (typeof content === 'string') return content;
          if (Array.isArray(content)) return content.map(part => (part && part.text) || '').join('\n');
          return typeof choice.text === 'string' ? choice.text : '';
        }).filter(Boolean).join('\n').trim();
        if (joined) return joined;
      }
      if (typeof payload.text === 'string') return payload.text.trim();
      if (typeof payload.data === 'string') return payload.data.trim();
      return '';
    }

    function cached(id) {
      const hit = cache.get(id);
      if (hit && Date.now() - hit.at <= TRANSCRIPT_CACHE_TTL_MS) return hit.text;
      const rec = Store.get(id);
      if (rec && typeof rec.videoTranscript === 'string' && rec.videoTranscript.trim()) {
        const text = rec.videoTranscript.trim();
        cache.set(id, { text, at: rec.videoTranscriptUpdatedAt || Date.now() });
        return text;
      }
      return '';
    }

    function fetchFor(id, force) {
      if (!id) return Promise.reject(new Error(t('Cannot detect the video id.', '无法识别当前视频 ID。')));
      if (!force) {
        const hit = cached(id);
        if (hit) return Promise.resolve(hit);
      }
      if (inflight.has(id)) return inflight.get(id);
      const settings = getSettings();
      if (!settings.endpoint) return Promise.reject(new Error(t('Please configure the transcript endpoint first.', '请先配置字幕接口路径。')));
      const headers = { 'Content-Type': 'application/json' };
      if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
      const body = JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: `https://www.youtube.com/watch?v=${id}` }]
      });
      const minutes = Math.round(settings.timeoutMs / 60000);
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      let timer = null;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          if (controller) { try { controller.abort(); } catch (_) { /* ignore */ } }
          reject(new Error(t('The transcript endpoint did not respond within {n} minute(s); request cancelled.',
            '字幕接口在 {n} 分钟内无响应，已自动取消请求。', { n: minutes })));
        }, settings.timeoutMs);
      });
      const request = (async () => {
        const res = await fetch(settings.endpoint, { method: 'POST', headers, body, signal: controller ? controller.signal : undefined });
        const rawText = await res.text();
        let payload = rawText;
        try { payload = rawText ? JSON.parse(rawText) : null; } catch (_) { /* plain text */ }
        if (!res.ok) {
          const detail = (payload && payload.error && payload.error.message) || (payload && payload.message) || rawText || `HTTP ${res.status}`;
          throw new Error(String(detail));
        }
        const text = extractText(payload);
        if (!text) throw new Error(t('The transcript endpoint returned no content.', '字幕接口未返回有效内容。'));
        cache.set(id, { text, at: Date.now() });
        Store.updateIfExists(id, rec => Object.assign(rec, { videoTranscript: text, videoTranscriptUpdatedAt: Date.now() }));
        return text;
      })();
      const promise = Promise.race([request, timeout]).finally(() => {
        clearTimeout(timer);
        inflight.delete(id);
      });
      inflight.set(id, promise);
      return promise;
    }

    return { getSettings, saveSettings, normalizeEndpoint, extractText, cached, fetchFor };
  })();

  /* ======================================================================
   * Player access (F-2.2)
   * ==================================================================== */

  function getPlayer() {
    const player = document.querySelector('#movie_player');
    return player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function' &&
      typeof player.seekTo === 'function' ? player : null;
  }

  function urlVideoId() {
    if (!/^\/watch\/?$/.test(location.pathname)) return null;
    const id = new URLSearchParams(location.search).get('v');
    return id && /^[\w-]+$/.test(id) ? id : null;
  }

  function urlHasStartTime() {
    const params = new URLSearchParams(location.search);
    if (params.has('t') || params.has('start')) return true;
    return /(?:^|[#&])t=/.test(location.hash.replace(/^#/, '&'));
  }

  // Seconds requested by a timestamp link (`t=90`, `t=1m30s`, `start=90`, `#t=90`), or null.
  function urlStartTime() {
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const raw = params.get('t') || params.get('start') || hash.get('t');
    if (!raw) return null;
    if (/^\d+(?:\.\d+)?s?$/.test(raw)) return parseFloat(raw);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
    return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : null;
  }

  function playerVideoData(player) {
    try {
      const data = player.getVideoData && player.getVideoData();
      return data && typeof data === 'object' ? data : {};
    } catch (_) { return {}; }
  }

  function isAdShowing(player) {
    return player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
  }

  function isPlayerReadyFor(player, id) {
    if (!player || !id) return false;
    const loadedId = playerVideoData(player).video_id;
    if (loadedId && loadedId !== id) return false;
    let duration = 0;
    try { duration = Number(player.getDuration()) || 0; } catch (_) { duration = 0; }
    return duration > 0 && !isAdShowing(player);
  }

  /* ======================================================================
   * Progress engine (section 2.2)
   * ==================================================================== */

  const Engine = (() => {
    let session = null;

    function newSession(id) {
      return {
        id,
        phase: 'waiting', // waiting -> (choosing) -> restoring -> tracking
        isLive: false,
        duration: 0,
        lastTime: null,
        lastWritten: null,
        lastWriteAt: 0,
        restoreTarget: null,
        restoreStartedAt: 0,
        lastSeekAt: 0,
        seekAttempts: 0,
        confirmations: 0
      };
    }

    function titleFor(id, rec) {
      const dearrow = Titles.knownDeArrow(id);
      const original = Titles.knownOriginal(id) || (rec && normTitle(rec.originalTitle)) || null;
      if (dearrow) return { videoName: dearrow, originalTitle: original };
      const stored = rec && !isPlaceholderTitle(rec.videoName) ? normTitle(rec.videoName) : null;
      return { videoName: stored || original || UNKNOWN_TITLE, originalTitle: original };
    }

    function write(s) {
      if (s.phase !== 'tracking' || s.isLive || s.lastTime === null) return false;
      const position = Math.round(s.lastTime * 1000) / 1000;
      try {
        Store.update(s.id, rec => {
          const titles = titleFor(s.id, rec);
          return Object.assign(rec, {
            videoProgress: position,
            saveDate: Date.now(),
            videoName: titles.videoName,
            originalTitle: titles.originalTitle || rec.originalTitle || null,
            videoDuration: s.duration || rec.videoDuration
          });
        });
      } catch (err) {
        console.error('[Video Memory] Failed to save progress:', err);
        Badge.show({ kind: 'error', message: err && err.message ? err.message : String(err) });
        return false;
      }
      s.lastWritten = position;
      s.lastWriteAt = Date.now();
      Badge.show({ kind: 'saved', seconds: position });
      emit(EVT_RECORD, { videoId: s.id, videoProgress: position });
      return true;
    }

    function maybeWrite(s, force) {
      if (!s || s.phase !== 'tracking' || s.isLive || s.lastTime === null) return;
      if (s.lastWritten !== null && Math.abs(s.lastTime - s.lastWritten) < MIN_SAVE_DELTA) return; // BUG-5
      if (!force && Date.now() - s.lastWriteAt < SAVE_THROTTLE_MS) return;
      write(s);
    }

    function enterTracking(s, notice) {
      s.phase = 'tracking';
      if (notice) Badge.show(notice);
      else if (s.lastWritten === null) Badge.show({ kind: 'idle' });
    }

    function beginRestore(s, player) {
      const data = playerVideoData(player);
      s.isLive = Boolean(data.isLive);
      if (data.title) Titles.rememberOriginal(s.id, data.title);
      if (s.isLive) return enterTracking(s, { kind: 'live' }); // D-3
      const rec = Store.get(s.id);
      const target = rec ? Number(rec.videoProgress) : NaN;
      if (!Number.isFinite(target) || target <= MIN_RESTORE_POSITION) return enterTracking(s);
      if (target >= s.duration - END_GUARD_SECONDS) return enterTracking(s); // D-2
      s.restoreTarget = target;
      if (urlHasStartTime()) return askForChoice(s, player); // D-1
      startRestoring(s, player);
    }

    function startRestoring(s, player) {
      s.phase = 'restoring';
      s.restoreStartedAt = Date.now();
      s.seekAttempts = 0;
      seek(s, player);
    }

    // D-1: a timestamp link and a saved position disagree; the user picks one (F-2.6).
    function askForChoice(s, player) {
      const linkTime = urlStartTime() ?? (Number(player.getCurrentTime()) || 0);
      if (Math.abs(linkTime - s.restoreTarget) <= RESTORE_TOLERANCE) return enterTracking(s);
      s.phase = 'choosing';
      let wasPlaying = false;
      try { wasPlaying = player.getPlayerState() === 1; player.pauseVideo(); } catch (_) { /* keep going */ }
      Badge.show({ kind: 'choosing' });
      ResumePrompt.open({ saved: s.restoreTarget, link: linkTime }, choice => {
        if (session !== s || s.phase !== 'choosing') return;
        const current = getPlayer();
        if (choice === 'saved' && current) startRestoring(s, current);
        else enterTracking(s);
        if (wasPlaying && current) { try { current.playVideo(); } catch (_) { /* ignore */ } }
      });
    }

    function seek(s, player) {
      s.seekAttempts++;
      s.lastSeekAt = Date.now();
      s.confirmations = 0;
      try { player.seekTo(s.restoreTarget, true); } catch (err) { console.error('[Video Memory] seekTo failed', err); }
    }

    function continueRestore(s, player, now) {
      const current = Number(player.getCurrentTime()) || 0;
      if (Math.abs(current - s.restoreTarget) <= RESTORE_TOLERANCE) {
        s.confirmations++;
        if (s.confirmations >= 2) {
          s.lastWritten = s.restoreTarget; // nothing to write until playback actually moves on
          enterTracking(s, { kind: 'resumed', seconds: s.restoreTarget });
        }
        return;
      }
      s.confirmations = 0;
      if (s.seekAttempts >= RESTORE_MAX_ATTEMPTS || now - s.restoreStartedAt > RESTORE_TIMEOUT_MS) {
        console.warn('[Video Memory] Could not restore position for', s.id);
        s.lastWritten = current; // give up: do not overwrite the record until the user actually watches
        enterTracking(s);
        return;
      }
      if (now - s.lastSeekAt >= RESTORE_RETRY_MS) seek(s, player);
    }

    function startSession(id) {
      ResumePrompt.close();
      session = id ? newSession(id) : null;
      Badge.show({ kind: 'loading' });
      if (id) {
        const rec = Store.get(id);
        if (rec && normTitle(rec.originalTitle)) Titles.rememberOriginal(id, rec.originalTitle);
        Titles.getDeArrow(id).then(title => {
          if (title) Store.updateIfExists(id, r => Object.assign(r, { videoName: title }));
        });
      }
      emit(EVT_VIDEO, { videoId: id, title: id ? titleFor(id, Store.get(id)).videoName : null });
    }

    // Reads the player only when it is showing this session's video (BUG-3).
    function sample(s) {
      const player = getPlayer();
      if (!isPlayerReadyFor(player, s.id)) return null;
      const time = Number(player.getCurrentTime());
      s.duration = Number(player.getDuration()) || s.duration;
      if (s.phase === 'tracking' && Number.isFinite(time)) s.lastTime = time;
      return player;
    }

    function tick() {
      const id = urlVideoId();
      if (!session || session.id !== id) {
        if (session) { sample(session); maybeWrite(session, true); }
        startSession(id);
      }
      const s = session;
      if (!s) return;
      const player = sample(s);
      if (!player) return; // not ready / ad / other video: never save (BUG-2, BUG-4)
      if (s.phase === 'waiting') beginRestore(s, player);
      else if (s.phase === 'restoring') continueRestore(s, player, Date.now());
      if (s.phase === 'tracking') {
        if (s.lastTime === null) sample(s);
        maybeWrite(s, false);
      }
    }

    function flush() {
      const s = session;
      if (!s || s.id !== urlVideoId()) { tick(); return; }
      sample(s);
      maybeWrite(s, true);
    }

    return {
      tick,
      flush,
      currentId: () => (session ? session.id : null),
      currentDuration: () => (session ? session.duration : 0),
      phase: () => (session ? session.phase : null),
      _debug: () => session
    };
  })();

  /* ======================================================================
   * DOM helpers & styles
   * ==================================================================== */

  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'style') Object.assign(node.style, value);
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (typeof value === 'boolean') node[key] = value;
        else node.setAttribute(key, String(value));
      }
    }
    for (const child of children.flat()) {
      if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
  }

  const icon = name => h('i', { class: `fa-solid fa-${name} ysrp-icon`, 'aria-hidden': 'true' });

  function iconButton(name, title, onClick, extraClass) {
    return h('button', { type: 'button', class: `ysrp-ibtn ${extraClass || ''}`, title, 'aria-label': title, onclick: onClick }, icon(name));
  }

  function textButton(name, label, onClick, extraClass) {
    return h('button', { type: 'button', class: `ysrp-btn ${extraClass || ''}`, title: label, onclick: onClick }, icon(name), h('span', { text: label }));
  }

  function deArrowIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('aria-hidden', 'true');
    [[18, '#1213BD'], [13, '#88C9F9'], [6, '#0A62A5']].forEach(([r, fill]) => {
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', '18');
      circle.setAttribute('cy', '18');
      circle.setAttribute('r', String(r));
      circle.setAttribute('fill', fill);
      svg.appendChild(circle);
    });
    return svg;
  }

  const CSS = `
.ysrp-theme, .last-save-info-container {
  --ysrp-bg: #ffffff; --ysrp-fg: #0f0f0f; --ysrp-sub: #666; --ysrp-border: #d5d5d5; --ysrp-card: #f2f2f2;
  --ysrp-input: #ffffff; --ysrp-input-border: #c9ced6; --ysrp-accent: #0b57d0; --ysrp-danger: #d93025;
  --ysrp-ok: #188038; --ysrp-link: #1a73e8; --ysrp-note: #2e9e5b; --ysrp-storage: #e8710a; --ysrp-display: #d01884;
  --ysrp-transcript: #e8263c; --ysrp-hover: rgba(11, 87, 208, .10); --ysrp-backdrop: rgba(0, 0, 0, .35);
  --ysrp-thumb: #9aa0a6; --ysrp-track: #e6e8ea;
}
@media (prefers-color-scheme: dark) {
  .ysrp-theme, .last-save-info-container {
    --ysrp-bg: #262626; --ysrp-fg: #f1f1f1; --ysrp-sub: #b0b0b0; --ysrp-border: #444; --ysrp-card: #333;
    --ysrp-input: #2b2b2b; --ysrp-input-border: #555; --ysrp-accent: #8ab4f8; --ysrp-danger: #f28b82;
    --ysrp-ok: #81c995; --ysrp-link: #8ab4f8; --ysrp-note: #81c995; --ysrp-storage: #fcad70; --ysrp-display: #ff8bcb;
    --ysrp-transcript: #ff7b8a; --ysrp-hover: rgba(255, 255, 255, .08); --ysrp-backdrop: rgba(0, 0, 0, .5);
    --ysrp-thumb: #6b7280; --ysrp-track: #2b2b2b;
  }
}
.last-save-info-container { display: flex; align-items: center; margin-left: 8px; font-family: Roboto, Arial, sans-serif; font-size: 13px; line-height: normal; text-shadow: none; }
.last-save-info { display: flex; align-items: center; gap: 6px; padding: 4px 4px 4px 8px; border-radius: 8px; background: var(--ysrp-bg); color: var(--ysrp-fg); }
.last-save-info-text { white-space: nowrap; font-variant-numeric: tabular-nums; }
.last-save-info-text.is-error { color: var(--ysrp-danger); font-weight: 600; }
.last-save-info-text.is-resumed { color: var(--ysrp-ok); font-weight: 600; }
.ysrp-settings-button { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: none; border-radius: 6px; background: transparent; color: var(--ysrp-fg); cursor: pointer; font-size: 13px; }
.ysrp-settings-button:hover { background: var(--ysrp-hover); }
.ysrp-backdrop { position: fixed; inset: 0; background: var(--ysrp-backdrop); z-index: 9998; }
.ysrp-settings-container { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 9999; box-sizing: border-box;
  display: flex; flex-direction: column; width: 500px; max-width: 90vw; max-height: 80vh; padding: 16px; border-radius: 10px;
  border: 1px solid var(--ysrp-border); background: var(--ysrp-bg); color: var(--ysrp-fg); box-shadow: rgba(0,0,0,.24) 0 3px 8px;
  font-family: Roboto, Arial, sans-serif; font-size: 13px; line-height: 1.45; text-align: left; overflow: hidden; }
.ysrp-settings-container *, .ysrp-settings-container *::before, .ysrp-settings-container *::after { box-sizing: border-box; }
.ysrp-settings-container, .ysrp-settings-container * { scrollbar-width: thin; scrollbar-color: var(--ysrp-thumb) var(--ysrp-track); }
.ysrp-settings-container ::-webkit-scrollbar { width: 10px; height: 10px; }
.ysrp-settings-container ::-webkit-scrollbar-track { background: var(--ysrp-track); border-radius: 8px; }
.ysrp-settings-container ::-webkit-scrollbar-thumb { background: var(--ysrp-thumb); border-radius: 8px; border: 2px solid var(--ysrp-track); }
.ysrp-settings-container button { font: inherit; color: inherit; }
.ysrp-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ysrp-header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ysrp-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--ysrp-fg); }
.ysrp-badge { font-size: 11px; padding: 2px 8px; border-radius: 8px; background: var(--ysrp-hover); color: var(--ysrp-accent); white-space: nowrap; }
.ysrp-spinner { display: none; color: var(--ysrp-accent); }
.ysrp-spinner.is-active { display: inline-flex; }
.ysrp-close { background: transparent; border: none; cursor: pointer; font-size: 18px; color: var(--ysrp-fg); padding: 0 4px; }
.ysrp-tabs { display: flex; gap: 4px; margin-top: 10px; border-bottom: 1px solid var(--ysrp-border); overflow-x: auto; }
.ysrp-tab { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border: none; border-bottom: 2px solid transparent; background: transparent; cursor: pointer; color: var(--ysrp-sub); font-weight: 700; font-size: 14px; white-space: nowrap; }
.ysrp-tab.is-active { color: var(--ysrp-accent); border-bottom-color: var(--ysrp-accent); }
.ysrp-body { display: flex; flex-direction: column; flex: 1; min-height: 0; margin-top: 10px; overflow: hidden; }
.ysrp-pane { display: none; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; padding-right: 4px; -webkit-overflow-scrolling: touch; }
.ysrp-pane.is-active { display: flex; }
.ysrp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ysrp-empty { color: var(--ysrp-sub); font-style: italic; padding: 12px 0; }
.ysrp-row { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 8px; background: var(--ysrp-card); color: var(--ysrp-fg); }
.ysrp-row.is-current { box-shadow: inset 3px 0 0 var(--ysrp-accent); }
.ysrp-row-top { display: flex; align-items: center; gap: 4px; }
.ysrp-pct { min-width: 44px; text-align: right; margin-right: 6px; color: var(--ysrp-sub); font-variant-numeric: tabular-nums; }
.ysrp-title { flex: 1; min-width: 0; word-break: break-word; }
.ysrp-ibtn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex: 0 0 auto; padding: 0; border: none; border-radius: 6px; background: transparent; cursor: pointer; color: var(--ysrp-fg); }
.ysrp-ibtn:hover:not(:disabled) { background: var(--ysrp-hover); }
.ysrp-ibtn:disabled { cursor: default; }
.ysrp-ibtn.ysrp-da.is-pending { filter: grayscale(1); opacity: .4; }
.ysrp-ibtn.ysrp-da.is-off { filter: grayscale(1); opacity: .6; }
.ysrp-ibtn.is-transcript { color: var(--ysrp-accent); }
.ysrp-ibtn.is-note { color: var(--ysrp-note); }
.ysrp-ibtn.is-link { color: var(--ysrp-link); }
.ysrp-ibtn.is-delete { color: var(--ysrp-danger); border: 1px solid var(--ysrp-border); }
.ysrp-ibtn.is-copied { color: var(--ysrp-ok); }
.ysrp-panel { display: none; flex-direction: column; gap: 6px; padding: 8px; border-radius: 8px; background: var(--ysrp-bg); }
.ysrp-panel.is-open { display: flex; }
.ysrp-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.ysrp-panel-label { font-weight: 600; color: var(--ysrp-sub); }
.ysrp-status { font-size: 12px; color: var(--ysrp-accent); }
.ysrp-status.is-error { color: var(--ysrp-danger); }
.ysrp-url { display: flex; align-items: center; gap: 4px; word-break: break-all; color: var(--ysrp-sub); }
.ysrp-url span { flex: 1; }
.ysrp-note-text { white-space: pre-wrap; word-break: break-word; }
.ysrp-note-text.is-empty { color: var(--ysrp-sub); font-style: italic; }
.ysrp-textarea, .ysrp-input { width: 100%; padding: 8px 10px; border: 1px solid var(--ysrp-input-border); border-radius: 6px; background: var(--ysrp-input); color: var(--ysrp-fg); font: inherit; outline: none; }
.ysrp-textarea { resize: vertical; min-height: 64px; }
.ysrp-textarea.is-mono { font-family: monospace; }
.ysrp-textarea:focus, .ysrp-input:focus { box-shadow: 0 0 0 2px var(--ysrp-accent); }
.ysrp-card { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 10px; border: 1px solid var(--ysrp-input-border); background: var(--ysrp-card); }
.ysrp-card-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; }
.ysrp-card-sub { color: var(--ysrp-sub); margin-top: -6px; }
.ysrp-choice { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--ysrp-input-border); background: var(--ysrp-bg); cursor: pointer; }
.ysrp-choice input { display: none; }
.ysrp-choice.is-selected { border-color: var(--ysrp-choice-accent); box-shadow: 0 0 0 1px var(--ysrp-choice-accent); }
.ysrp-choice.is-disabled { opacity: .5; cursor: not-allowed; }
.ysrp-choice-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 8px; color: var(--ysrp-choice-accent); border: 1px solid var(--ysrp-choice-accent); flex: 0 0 auto; }
.ysrp-choice.is-selected .ysrp-choice-badge { background: var(--ysrp-choice-accent); color: var(--ysrp-bg); }
.ysrp-choice-text { display: flex; flex-direction: column; min-width: 0; }
.ysrp-choice-label { font-weight: 600; }
.ysrp-choice.is-selected .ysrp-choice-label { color: var(--ysrp-choice-accent); }
.ysrp-choice-hint { color: var(--ysrp-sub); font-size: 12px; }
.ysrp-row-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ysrp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 32px; padding: 4px 12px; border-radius: 8px; border: 1px solid var(--ysrp-btn-accent, var(--ysrp-accent)); color: var(--ysrp-btn-accent, var(--ysrp-accent)) !important; background: var(--ysrp-bg); font-weight: 600; cursor: pointer; flex: 1 1 auto; }
.ysrp-btn:hover { background: var(--ysrp-hover); }
.ysrp-btn:disabled { opacity: .6; cursor: default; }
.ysrp-file { position: relative; overflow: hidden; display: flex; align-items: center; gap: 8px; flex: 1 1 200px; min-height: 36px; padding: 6px 12px; border: 1px dashed var(--ysrp-input-border); border-radius: 8px; cursor: pointer; }
.ysrp-file:hover, .ysrp-file:focus-within { border-color: var(--ysrp-accent); color: var(--ysrp-accent); }
.ysrp-file-name { flex: 1; color: var(--ysrp-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ysrp-file input { display: none; }
.ysrp-file.is-ios input { display: block; position: absolute; inset: 0; width: 100%; height: 100%; opacity: .01; margin: 0; cursor: pointer; }
.ysrp-check { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; cursor: pointer; }
.ysrp-check input { width: 16px; height: 16px; margin: 0; accent-color: var(--ysrp-accent); }
.ysrp-field { display: flex; flex-direction: column; gap: 4px; }
.ysrp-field > span { font-weight: 600; color: var(--ysrp-sub); font-size: 12px; }
.ysrp-inline { display: flex; gap: 8px; }
.ysrp-inline .ysrp-btn { flex: 0 0 auto; }
.ysrp-info { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-radius: 8px; background: var(--ysrp-bg); }
.ysrp-info-row { display: flex; gap: 8px; flex-wrap: wrap; }
.ysrp-info-row b { color: var(--ysrp-sub); font-weight: 600; white-space: nowrap; }
.ysrp-mono { font-family: monospace; }
.ysrp-msg { color: var(--ysrp-sub); font-size: 12px; }
.ysrp-msg.is-ok { color: var(--ysrp-ok); }
.ysrp-msg.is-error { color: var(--ysrp-danger); }
.ysrp-resume { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 1000; box-sizing: border-box;
  display: flex; flex-direction: column; gap: 10px; width: 360px; max-width: calc(100% - 32px); padding: 16px; border-radius: 10px;
  border: 1px solid var(--ysrp-border); background: var(--ysrp-bg); color: var(--ysrp-fg); box-shadow: rgba(0,0,0,.4) 0 4px 16px;
  font-family: Roboto, Arial, sans-serif; font-size: 13px; line-height: 1.45; text-align: left; text-shadow: none; }
.ysrp-resume * { box-sizing: border-box; }
.ysrp-resume button { font: inherit; }
.ysrp-resume-title { font-size: 16px; font-weight: 700; }
.ysrp-resume-sub { color: var(--ysrp-sub); }
.ysrp-resume .ysrp-btn { font-variant-numeric: tabular-nums; }
.ysrp-resume-saved { --ysrp-btn-accent: var(--ysrp-ok); }
`;

  function injectStyles() {
    if (!document.getElementById('ysrp-style')) {
      (document.head || document.documentElement).appendChild(h('style', { id: 'ysrp-style', text: CSS }));
    }
    if (!document.getElementById('ysrp-fontawesome')) {
      (document.head || document.documentElement).appendChild(h('link', { id: 'ysrp-fontawesome', rel: 'stylesheet', href: FONT_AWESOME_CSS }));
    }
  }

  // Stops pointer/click/touch from reaching the player (F-3.4).
  function shieldFromPlayer(button, onActivate) {
    const swallow = event => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); };
    button.addEventListener('pointerdown', event => { swallow(event); onActivate(); }, { capture: true });
    button.addEventListener('mousedown', swallow, { capture: true });
    button.addEventListener('click', swallow, { capture: true });
    button.addEventListener('touchstart', swallow, { capture: true, passive: false });
  }

  /* ======================================================================
   * Player badge (section 3)
   * ==================================================================== */

  const Badge = (() => {
    let node = null;
    let textNode = null;
    let state = { kind: 'loading' };
    let resumedTimer = null;

    function render() {
      if (!textNode) return;
      textNode.classList.remove('is-error', 'is-resumed');
      textNode.removeAttribute('title');
      switch (state.kind) {
        case 'saved':
          textNode.textContent = formatTime(state.seconds);
          textNode.title = t('Last saved position', '最近保存的位置');
          break;
        case 'resumed':
          textNode.textContent = t('Resumed {time}', '已恢复 {time}', { time: formatTime(state.seconds) });
          textNode.classList.add('is-resumed');
          break;
        case 'error':
          textNode.textContent = t('⚠ Save failed', '⚠ 保存失败');
          textNode.title = state.message || '';
          textNode.classList.add('is-error');
          break;
        case 'live':
          textNode.textContent = t('Live · not saved', '直播 · 不保存');
          break;
        case 'choosing':
          textNode.textContent = t('Choose a position…', '请选择播放位置…');
          break;
        case 'idle':
          textNode.textContent = formatTime(0);
          break;
        default:
          textNode.textContent = t('Loading...', '加载中...');
      }
    }

    function show(next) {
      if (state.kind === 'resumed' && next.kind === 'saved' && resumedTimer) {
        state.pending = next; // keep the "resumed" notice visible for a moment
        return;
      }
      clearTimeout(resumedTimer);
      resumedTimer = null;
      state = next;
      if (next.kind === 'resumed') {
        resumedTimer = setTimeout(() => {
          resumedTimer = null;
          state = state.pending || { kind: 'saved', seconds: next.seconds };
          render();
        }, RESUMED_NOTICE_MS);
      }
      render();
    }

    function build() {
      textNode = h('span', { class: 'last-save-info-text' });
      const label = t('Open settings', '打开设置');
      const button = h('button', { type: 'button', class: 'ysrp-settings-button', title: label, 'aria-label': label }, icon('gear'));
      shieldFromPlayer(button, () => Modal.open());
      node = h('div', { class: 'last-save-info-container' }, h('div', { class: 'last-save-info' }, textNode, button));
      render();
    }

    // F-3.1 / F-3.3
    function ensure() {
      const host = document.querySelector('#movie_player .ytp-left-controls');
      if (!host) return;
      if (node && node.parentNode === host) return;
      document.querySelectorAll('.last-save-info-container').forEach(n => n.remove());
      if (!node) build();
      host.appendChild(node);
    }

    function rebuild() {
      if (node) node.remove();
      node = null;
      textNode = null;
      ensure();
    }

    return { show, ensure, rebuild };
  })();

  /* ======================================================================
   * Resume choice dialog (F-2.6)
   * ==================================================================== */

  const ResumePrompt = (() => {
    let node = null;

    function close() {
      if (node) node.remove();
      node = null;
    }

    function open(times, onChoose) {
      close();
      const host = document.getElementById('movie_player');
      if (!host) { onChoose('link'); return; }
      const choose = choice => { close(); onChoose(choice); };
      const option = (choice, iconName, label, seconds) => {
        const button = h('button', { type: 'button', class: `ysrp-btn ysrp-resume-${choice}`, dataset: { choice } },
          icon(iconName), h('span', { text: `${label} ${formatTime(seconds)}` }));
        shieldFromPlayer(button, () => choose(choice));
        button.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          choose(choice);
        });
        return button;
      };
      const saved = option('saved', 'clock-rotate-left', t('Saved progress', '上次进度'), times.saved);
      node = h('div', { class: 'ysrp-theme ysrp-resume', role: 'dialog', 'aria-modal': 'false',
        'aria-label': t('Where to continue?', '从哪里继续播放？') },
      h('div', { class: 'ysrp-resume-title', text: t('Where to continue?', '从哪里继续播放？') }),
      h('div', { class: 'ysrp-resume-sub', text: t('This link starts at a different time than your saved progress.', '这个链接指定的时间与你上次的进度不同。') }),
      h('div', { class: 'ysrp-row-actions' }, saved, option('link', 'link', t('Link time', '链接时间'), times.link)));
      // Clicks on the card must not toggle playback underneath it.
      ['click', 'mousedown', 'pointerdown', 'touchstart', 'dblclick'].forEach(type =>
        node.addEventListener(type, event => event.stopPropagation()));
      node.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.stopPropagation(); choose('link'); }
      });
      host.appendChild(node);
      saved.focus({ preventScroll: true });
    }

    return { open, close, isOpen: () => Boolean(node) };
  })();

  /* ======================================================================
   * Settings modal (section 4)
   * ==================================================================== */

  const TABS = ['records', 'storage', 'transcript', 'display'];

  const Modal = (() => {
    let ui = null;
    let activeTab = 'records';

    function hostRoot() {
      return document.querySelector('ytd-app #content') || document.querySelector('#content') ||
        document.querySelector('#page-manager') || document.body;
    }

    function lockScroll() {
      if (!document.body.hasAttribute('data-ysrp-body-overflow')) {
        document.body.setAttribute('data-ysrp-body-overflow', document.body.style.overflow || '');
      }
      document.body.style.overflow = 'hidden';
    }

    function unlockScroll() {
      const previous = document.body.getAttribute('data-ysrp-body-overflow');
      document.body.style.overflow = previous || '';
      document.body.removeAttribute('data-ysrp-body-overflow');
    }

    function isOpen() { return Boolean(ui && ui.container.style.display !== 'none' && ui.container.isConnected); }

    function open(tab) {
      injectStyles();
      if (!ui) ui = build();
      const root = hostRoot();
      if (!ui.backdrop.isConnected) root.appendChild(ui.backdrop);
      if (!ui.container.isConnected) root.appendChild(ui.container);
      ui.backdrop.style.display = 'block';
      ui.container.style.display = 'flex';
      ui.setTab(tab || activeTab);
      ui.refresh();
      lockScroll();
    }

    function close() {
      if (!ui) return;
      ui.container.style.display = 'none';
      ui.backdrop.style.display = 'none';
      unlockScroll();
    }

    function rebuild() {
      const wasOpen = isOpen();
      if (ui) { ui.destroy(); ui = null; }
      if (wasOpen) open(activeTab); else unlockScroll();
    }

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isOpen()) { event.stopPropagation(); close(); }
    }, true);

    function build() {
      const cleanups = [];
      const listen = (target, name, fn) => { target.addEventListener(name, fn); cleanups.push(() => target.removeEventListener(name, fn)); };

      const backdrop = h('div', { class: 'ysrp-backdrop ysrp-theme', style: { display: 'none' } });
      backdrop.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); close(); });

      const title = h('h3');
      const modeBadge = h('span', { class: 'ysrp-badge' });
      const spinner = h('span', { class: 'ysrp-spinner', title: t('Refreshing…', '正在更新列表…') }, h('i', { class: 'fa-solid fa-arrows-rotate fa-spin' }));
      const setCount = n => { title.textContent = t('Saved Videos - ({count})', '已保存视频 - ({count})', { count: n }); };
      const renderModeBadge = () => {
        modeBadge.textContent = Store.getMode() === 'gm' ? t('GM Storage', 'GM 存储') : t('localStorage', '浏览器本地存储');
      };
      setCount(0);
      renderModeBadge();

      const header = h('div', { class: 'ysrp-header' },
        h('div', { class: 'ysrp-header-left' }, title, modeBadge),
        h('div', { class: 'ysrp-header-left' }, spinner,
          h('button', { type: 'button', class: 'ysrp-close', title: t('Close', '关闭'), 'aria-label': t('Close', '关闭'), text: '✖', onclick: close })));

      const ctx = {
        setCount,
        spin: on => spinner.classList.toggle('is-active', on),
        renderModeBadge,
        listen
      };

      const panes = {
        records: RecordsPane(ctx),
        storage: StoragePane(ctx),
        transcript: TranscriptPane(ctx),
        display: DisplayPane(ctx)
      };
      const tabLabels = {
        records: [t('Records', '记录'), 'database'],
        storage: [t('Storage', '存储'), 'gear'],
        transcript: [t('Transcript', '字幕'), 'closed-captioning'],
        display: [t('Display', '界面'), 'globe']
      };
      const tabButtons = {};
      const tabsBar = h('div', { class: 'ysrp-tabs', role: 'tablist' });
      TABS.forEach(id => {
        tabButtons[id] = h('button', { type: 'button', class: 'ysrp-tab', role: 'tab', dataset: { tabId: id }, onclick: () => setTab(id) },
          icon(tabLabels[id][1]), h('span', { text: tabLabels[id][0] }));
        tabsBar.appendChild(tabButtons[id]);
      });

      const body = h('div', { class: 'ysrp-body ysrp-settings-container-body' }, TABS.map(id => panes[id].node));
      const container = h('div', { class: 'ysrp-settings-container ysrp-theme', role: 'dialog', 'aria-modal': 'true', style: { display: 'none' } },
        header, tabsBar, body);
      // Keep keyboard / pointer events inside the dialog away from YouTube's global shortcuts and player.
      ['keydown', 'keyup', 'keypress'].forEach(name => container.addEventListener(name, event => {
        if (event.key !== 'Escape') event.stopPropagation();
      }));

      function setTab(id) {
        activeTab = TABS.includes(id) ? id : 'records';
        container.dataset.activeTab = activeTab;
        TABS.forEach(key => {
          const on = key === activeTab;
          tabButtons[key].classList.toggle('is-active', on);
          tabButtons[key].setAttribute('aria-selected', String(on));
          panes[key].node.classList.toggle('is-active', on);
        });
      }

      listen(document, EVT_RECORD, () => { if (isOpen()) panes.records.render(); });
      listen(document, EVT_VIDEO, () => { if (isOpen()) panes.records.render(); panes.transcript.updateVideo(); });
      listen(document, EVT_TITLE, event => panes.records.onDeArrow(event.detail));

      return {
        backdrop,
        container,
        setTab,
        refresh() {
          renderModeBadge();
          panes.records.render();
          panes.transcript.updateVideo();
        },
        destroy() {
          cleanups.forEach(fn => fn());
          container.remove();
          backdrop.remove();
        }
      };
    }

    return { open, close, isOpen, rebuild };
  })();

  /* ---------------- Records tab (F-4.7 – F-4.14) ---------------- */

  const transcriptOpenState = new Set(); // ids whose transcript panel stays open across re-renders

  function RecordsPane(ctx) {
    const list = h('ul', { class: 'ysrp-list' });
    const empty = h('div', { class: 'ysrp-empty', text: t('No saved videos yet.', '还没有保存的视频。') });
    const node = h('div', { class: 'ysrp-pane', dataset: { pane: 'records' } }, empty, list);
    const rows = new Map();
    let renderedKey = null;

    function render() {
      ctx.spin(true);
      try {
        const current = Engine.currentId();
        const items = Store.list().sort((a, b) =>
          (Number(b.id === current) - Number(a.id === current)) || ((Number(b.rec.saveDate) || 0) - (Number(a.rec.saveDate) || 0)));
        ctx.setCount(items.length);
        empty.style.display = items.length ? 'none' : '';
        const key = `${current}|${items.map(item => item.id).join(',')}`;
        if (key !== renderedKey) {
          renderedKey = key;
          const next = new Map();
          list.replaceChildren(...items.map(({ id, rec }) => {
            const row = rows.get(id) || RecordRow(id, rec, () => remove(id));
            next.set(id, row);
            return row.node;
          }));
          rows.clear();
          next.forEach((row, id) => rows.set(id, row));
        }
        items.forEach(({ id, rec }) => rows.get(id).update(rec, id === current));
      } finally {
        ctx.spin(false);
      }
    }

    function remove(id) {
      Store.remove(id);
      transcriptOpenState.delete(id);
      render();
    }

    function onDeArrow(detail) {
      if (!detail || !rows.has(detail.videoId)) return;
      rows.get(detail.videoId).setDeArrow(detail.title);
    }

    return { node, render, onDeArrow };
  }

  function RecordRow(id, initialRecord, onDelete) {
    const url = `https://www.youtube.com/watch?v=${id}`;
    let rec = initialRecord;
    let isCurrent = false;

    /* --- title / DeArrow (F-4.9) --- */
    let original = normTitle(rec.originalTitle) || Titles.knownOriginal(id) || null;
    let dearrow; // undefined = unknown, null = none, string = title
    let showOriginal = false;
    const titleEl = h('span', { class: 'ysrp-title' });
    const pctEl = h('span', { class: 'ysrp-pct' });
    const daButton = h('button', { type: 'button', class: 'ysrp-ibtn ysrp-da' }, deArrowIcon());
    daButton.addEventListener('click', () => {
      if (typeof dearrow !== 'string') return;
      showOriginal = !showOriginal;
      if (showOriginal && !original) {
        titleEl.textContent = t('Loading original title…', '正在获取原标题…');
        Titles.getOriginal(id).then(value => { original = value || original; renderTitle(); });
        return;
      }
      renderTitle();
    });

    function storedName() { return isPlaceholderTitle(rec.videoName) ? null : normTitle(rec.videoName); }

    function renderTitle() {
      const missing = t('Original title unavailable', '未找到原标题');
      if (dearrow === null) {
        daButton.remove();
        titleEl.textContent = original || storedName() || missing;
        return;
      }
      if (dearrow === undefined) {
        daButton.disabled = true;
        daButton.classList.add('is-pending');
        daButton.title = t('Checking DeArrow title…', '正在检测 DeArrow 标题…');
        titleEl.textContent = original || storedName() || t('Loading original title…', '正在获取原标题…');
        return;
      }
      daButton.disabled = false;
      daButton.classList.remove('is-pending');
      daButton.classList.toggle('is-off', showOriginal);
      daButton.title = showOriginal ? t('Show DeArrow title', '恢复 DeArrow 标题') : t('Show original title', '显示原标题');
      daButton.setAttribute('aria-label', daButton.title);
      titleEl.textContent = showOriginal ? (original || missing) : dearrow;
    }

    function setDeArrow(value) {
      const title = normTitle(value);
      if (title && !sameTitle(title, original)) {
        dearrow = title;
        if (rec.videoName !== title) Store.updateIfExists(id, r => Object.assign(r, { videoName: title }));
      } else {
        dearrow = null;
        if (isPlaceholderTitle(rec.videoName) && original) Store.updateIfExists(id, r => Object.assign(r, { videoName: original }));
      }
      renderTitle();
    }

    function resolveTitles() {
      const cached = Titles.knownDeArrow(id);
      if (cached !== undefined) { setDeArrow(cached); }
      else if (original && storedName() && !sameTitle(storedName(), original)) { dearrow = storedName(); renderTitle(); }
      const originalReady = original ? Promise.resolve(original) : Titles.getOriginal(id);
      originalReady.then(value => {
        if (value && !original) { original = value; renderTitle(); }
        if (Titles.knownDeArrow(id) !== undefined || typeof dearrow === 'string') return;
        return Titles.getDeArrow(id).then(setDeArrow);
      });
    }

    /* --- link panel (F-4.12) --- */
    const copyBtn = iconButton('copy', t('Copy URL', '复制 URL'), async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.classList.add('is-copied');
        copyBtn.firstChild.className = 'fa-solid fa-check ysrp-icon';
        copiedTip.style.display = '';
        setTimeout(() => { copyBtn.classList.remove('is-copied'); copyBtn.firstChild.className = 'fa-solid fa-copy ysrp-icon'; }, 1000);
        setTimeout(() => { copiedTip.style.display = 'none'; }, 2000);
      } catch (err) { console.error('[Video Memory] copy failed', err); }
    }, 'is-link');
    const copiedTip = h('span', { class: 'ysrp-status', text: t('Copied', '已复制'), style: { display: 'none', flex: '0 0 auto' } });
    const linkPanel = h('div', { class: 'ysrp-panel ysrp-url' },
      h('span', { text: t('URL: {url}', '链接：{url}', { url }) }), copiedTip, copyBtn,
      iconButton('arrow-up-right-from-square', t('Open in new tab', '在新标签页中打开 URL'), () => window.open(url, '_blank'), 'is-note'));

    /* --- transcript panel (F-4.10) --- */
    const tStatus = h('span', { class: 'ysrp-status' });
    const tOutput = h('textarea', { class: 'ysrp-textarea is-mono', readonly: 'readonly', rows: '5', placeholder: t('Transcript will appear here…', '字幕内容加载后会显示在这里…') });
    let tLoading = false;
    const tRefresh = iconButton('arrows-rotate', t('Refresh transcript', '刷新字幕'), () => loadTranscript(true));
    const tCopy = iconButton('copy', t('Copy transcript', '复制字幕'), async () => {
      if (!tOutput.value.trim()) return setTStatus(t('No transcript content to copy.', '暂无字幕内容可复制。'));
      try {
        await navigator.clipboard.writeText(tOutput.value.trim());
        setTStatus(t('Transcript copied.', '字幕内容已复制。'));
      } catch (err) {
        setTStatus(t('Copy failed: {message}', '复制失败：{message}', { message: err && err.message ? err.message : String(err) }), true);
      }
    }, 'is-link');
    const transcriptPanel = h('div', { class: 'ysrp-panel ysrp-transcript-container' },
      h('div', { class: 'ysrp-panel-head' },
        h('div', { class: 'ysrp-header-left' }, h('strong', { class: 'ysrp-panel-label', text: t('Transcript', '字幕') }), tStatus),
        h('div', { class: 'ysrp-header-left' }, tRefresh, tCopy)),
      tOutput);

    function setTStatus(text, isError) {
      tStatus.textContent = text || '';
      tStatus.classList.toggle('is-error', Boolean(isError));
    }

    function setTranscriptOpen(open) {
      transcriptPanel.classList.toggle('is-open', open);
      transcriptButton.title = open ? t('Hide transcript', '隐藏字幕') : t('Show transcript', '获取字幕');
      if (open) transcriptOpenState.add(id); else transcriptOpenState.delete(id);
      if (open && !tOutput.value) loadTranscript(false);
    }

    function loadTranscript(force) {
      if (tLoading) return;
      if (!force) {
        const hit = Transcript.cached(id);
        if (hit) { tOutput.value = hit; tCopy.disabled = false; setTStatus(t('Transcript loaded from cache.', '字幕来自缓存。')); return; }
      }
      tLoading = true;
      tRefresh.disabled = true;
      transcriptButton.disabled = true;
      setTStatus(t('Loading…', '正在获取…'));
      Transcript.fetchFor(id, force)
        .then(text => {
          tOutput.value = text;
          setTStatus(t('Transcript updated ({time})', '字幕已更新（{time}）', { time: new Date().toLocaleTimeString() }));
        })
        .catch(err => setTStatus(t('Transcript failed: {message}', '字幕获取失败：{message}', { message: err && err.message ? err.message : String(err) }), true))
        .finally(() => {
          tLoading = false;
          tRefresh.disabled = false;
          transcriptButton.disabled = false;
          tCopy.disabled = !tOutput.value;
        });
    }

    /* --- notes (F-4.11) --- */
    let editing = false;
    let noteTextarea = null;
    const noteText = h('div', { class: 'ysrp-note-text' });
    const noteEditButton = iconButton('pencil', t('Edit note', '编辑笔记'), () => (editing ? commitNote() : startNote()), 'is-link');
    const notePanel = h('div', { class: 'ysrp-panel ysrp-note-container' },
      h('div', { class: 'ysrp-panel-head' }, h('strong', { class: 'ysrp-panel-label', text: t('Notes', '笔记') }), noteEditButton),
      noteText);

    const noteValue = () => (typeof rec.videoNote === 'string' ? rec.videoNote : '');

    function renderNote() {
      const value = noteValue();
      noteText.textContent = value || t('No notes yet', '暂无笔记');
      noteText.classList.toggle('is-empty', !value);
      const noteOpen = notePanel.classList.contains('is-open');
      noteButton.title = editing ? t('Save & collapse note', '保存并折叠笔记')
        : value ? (noteOpen ? t('Hide notes', '隐藏笔记') : t('Show notes', '显示笔记')) : t('Add note', '添加笔记');
      noteEditButton.title = editing ? t('Save note', '保存笔记') : t('Edit note', '编辑笔记');
      noteEditButton.firstChild.className = `fa-solid fa-${editing ? 'floppy-disk' : 'pencil'} ysrp-icon`;
    }

    function setNoteOpen(open) {
      notePanel.classList.toggle('is-open', open);
      renderNote();
    }

    function startNote() {
      if (editing) return;
      editing = true;
      noteTextarea = h('textarea', { class: 'ysrp-textarea', rows: '3' });
      noteTextarea.value = noteValue();
      noteText.replaceWith(noteTextarea);
      setNoteOpen(true);
      requestAnimationFrame(() => { try { noteTextarea.focus(); noteTextarea.setSelectionRange(noteTextarea.value.length, noteTextarea.value.length); } catch (_) { /* ignore */ } });
    }

    function commitNote() {
      if (!editing) return;
      const value = noteTextarea.value.trim();
      editing = false;
      noteTextarea.replaceWith(noteText);
      noteTextarea = null;
      try {
        rec = Store.update(id, r => {
          if (value) r.videoNote = value; else delete r.videoNote;
          return r;
        });
      } catch (err) { console.error('[Video Memory] Failed to save note', err); }
      renderNote();
    }

    /* --- top row --- */
    const transcriptButton = iconButton('closed-captioning', t('Show transcript', '获取字幕'),
      () => setTranscriptOpen(!transcriptPanel.classList.contains('is-open')), 'is-transcript');
    const noteButton = iconButton('pen-to-square', t('Show notes', '显示笔记'), () => {
      if (editing) { commitNote(); setNoteOpen(false); return; }
      if (!noteValue()) { startNote(); return; }
      setNoteOpen(!notePanel.classList.contains('is-open'));
    }, 'is-note');
    const linkButton = iconButton('link', t('Show / hide URL', '显示/隐藏 URL'), () => linkPanel.classList.toggle('is-open'), 'is-link');
    const deleteButton = iconButton('trash-can', t('Delete record', '删除保存记录'), () => onDelete(), 'is-delete');

    const node = h('li', { class: 'ysrp-row', dataset: { videoId: id } },
      h('div', { class: 'ysrp-row-top' }, pctEl, titleEl, daButton, transcriptButton, noteButton, linkButton, deleteButton),
      linkPanel, transcriptPanel, notePanel);

    function renderPercent() {
      const progress = Number(rec.videoProgress) || 0;
      const duration = Number(rec.videoDuration) || (isCurrent ? Engine.currentDuration() : 0);
      pctEl.textContent = duration > 0 ? `${Math.min(100, (progress / duration) * 100).toFixed(1)}%` : '—';
      pctEl.title = formatTime(progress);
    }

    function update(nextRecord, current) {
      rec = nextRecord;
      isCurrent = Boolean(current);
      node.classList.toggle('is-current', isCurrent);
      if (!original && normTitle(rec.originalTitle)) original = normTitle(rec.originalTitle);
      renderPercent();
      renderTitle();
      if (!editing) renderNote();
    }

    renderTitle();
    renderNote();
    resolveTitles();
    if (transcriptOpenState.has(id)) setTranscriptOpen(true);

    return { node, update, setDeArrow };
  }

  /* ---------------- choice cards (storage / language) ---------------- */

  function ChoiceGroup(name, accentVar, options, selected, onPick) {
    const items = new Map();
    const node = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
    options.forEach(option => {
      const input = h('input', { type: 'radio', name, value: option.value });
      const row = h('label', { class: `ysrp-choice${option.disabled ? ' is-disabled' : ''}`, style: { '--ysrp-choice-accent': `var(${accentVar})` }, dataset: { value: option.value } },
        input,
        h('span', { class: 'ysrp-choice-badge', text: option.badge }),
        h('span', { class: 'ysrp-choice-text' },
          h('span', { class: 'ysrp-choice-label', text: option.label }),
          option.hint ? h('span', { class: 'ysrp-choice-hint', text: option.hint }) : null));
      row.style.setProperty('--ysrp-choice-accent', `var(${accentVar})`);
      row.addEventListener('click', event => {
        event.preventDefault();
        if (option.disabled) return;
        select(option.value);
        if (onPick) onPick(option.value);
      });
      items.set(option.value, { row, input });
      node.appendChild(row);
    });
    function select(value) {
      items.forEach((item, key) => {
        item.input.checked = key === value;
        item.row.classList.toggle('is-selected', key === value);
      });
    }
    select(selected);
    return { node, select, value: () => [...items].find(([, item]) => item.input.checked)?.[0] };
  }

  function setMessage(el, text, kind) {
    el.textContent = text || '';
    el.className = `ysrp-msg${kind ? ` is-${kind}` : ''}`;
    el.style.display = text ? '' : 'none';
  }

  function card(iconName, accentVar, titleText, subtitle, ...children) {
    const ic = icon(iconName);
    ic.style.color = `var(${accentVar})`;
    return h('div', { class: 'ysrp-card' },
      h('div', { class: 'ysrp-card-title' }, ic, h('span', { text: titleText })),
      subtitle ? h('div', { class: 'ysrp-card-sub', text: subtitle }) : null,
      ...children);
  }

  /* ---------------- Storage tab (F-4.15 – F-4.17) ---------------- */

  function StoragePane(ctx) {
    const modeMsg = h('div', { class: 'ysrp-msg', style: { display: 'none' } });
    const modeChoice = ChoiceGroup('ysrp-storage-mode', '--ysrp-storage', [
      { value: 'local', badge: t('LOCAL', '本地'), label: t('localStorage (default)', 'localStorage（默认）'), hint: t('Fast storage scoped to this browser profile.', '快速、本地浏览器可用的存储。') },
      { value: 'gm', badge: 'GM', label: t('GM storage', 'GM 存储'), hint: hasGM ? t('Userscript-manager storage that can sync across profiles.', '由脚本管理器提供、可在配置间同步的存储。') : t('Not available in this userscript manager.', '当前脚本管理器不支持。'), disabled: !hasGM }
    ], Store.getMode());

    const applyButton = textButton('right-left', t('Apply & Migrate', '应用并迁移'), () => {
      const target = modeChoice.value();
      if (!target || target === Store.getMode()) { setMessage(modeMsg, t('Already using this backend.', '当前已在使用该存储。')); return; }
      try {
        const moved = Store.setMode(target);
        ctx.renderModeBadge();
        setMessage(modeMsg, t('Moved {count} record(s).', '已迁移 {count} 条记录。', { count: moved }), 'ok');
        emit(EVT_RECORD, { videoId: null });
      } catch (err) {
        modeChoice.select(Store.getMode());
        setMessage(modeMsg, t('Migration failed: {message}', '迁移失败：{message}', { message: err.message || err }), 'error');
      }
    });
    applyButton.style.setProperty('--ysrp-btn-accent', 'var(--ysrp-storage)');
    applyButton.style.flex = '0 0 auto';

    const storageCard = card('database', '--ysrp-storage', t('Storage Backend', '存储后端'), t('Choose where to store your progress data.', '选择保存进度的存储方式。'),
      modeChoice.node,
      h('div', { class: 'ysrp-row-actions' }, applyButton,
        h('span', { class: 'ysrp-msg', text: t('Migrates all saved records to the selected backend (moves data).', '将所有记录迁移至所选存储后端（移动数据）。') })),
      modeMsg);

    /* export */
    const exportMsg = h('div', { class: 'ysrp-msg', style: { display: 'none' } });
    const exportJson = () => JSON.stringify(Store.exportAll(), null, 2);
    const exportFileName = () => {
      const now = new Date();
      const p = n => String(n).padStart(2, '0');
      return `[Youtube] Video Memory「${now.getFullYear()} ${p(now.getMonth() + 1)} ${p(now.getDate())}」「${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}」.json`;
    };
    const copyExport = textButton('copy', t('Copy JSON', '复制 JSON'), async () => {
      try {
        await navigator.clipboard.writeText(exportJson());
        setMessage(exportMsg, t('JSON copied to clipboard.', 'JSON 已复制到剪贴板。'), 'ok');
      } catch (err) {
        setMessage(exportMsg, t('Copy export failed: {message}', '复制导出失败：{message}', { message: err.message || err }), 'error');
      }
    });
    const downloadExport = textButton('file-arrow-down', t('Download JSON', '下载 JSON'), async () => {
      try {
        const json = exportJson();
        const fileName = exportFileName();
        if (runtime.isIOS) {
          if (runtime.canShareFile) {
            try {
              await navigator.share({
                files: [new File([json], fileName, { type: 'application/json' })],
                title: t('Video Memory Export', '视频记忆导出'),
                text: t('Choose “Save to Files” to store your backup.', '请选择“存储到文件”以保存备份。')
              });
              setMessage(exportMsg, t('Share sheet opened. Choose “Save to Files”.', '已打开系统分享面板，请选择“存储到文件”。'), 'ok');
              return;
            } catch (err) {
              if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
                setMessage(exportMsg, t('Share cancelled.', '已取消分享。'));
                return;
              }
            }
          } else if (window.open(`data:application/json;charset=utf-8,${encodeURIComponent(json)}`, '_blank', 'noopener')) {
            setMessage(exportMsg, t('Export opened in a new tab. Use the share menu to save it.', '已在新标签页打开导出，请通过分享菜单保存。'), 'ok');
            return;
          }
        }
        const blobUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const anchor = h('a', { href: blobUrl, download: fileName, style: { display: 'none' } });
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => { anchor.remove(); URL.revokeObjectURL(blobUrl); }, 1000);
        setMessage(exportMsg, t('Export download started.', '导出下载已开始。'), 'ok');
      } catch (err) {
        setMessage(exportMsg, t('Download failed: {message}', '下载失败：{message}', { message: err.message || err }), 'error');
      }
    });
    [copyExport, downloadExport].forEach(btn => btn.style.setProperty('--ysrp-btn-accent', 'var(--ysrp-ok)'));
    const exportCard = card('file-arrow-down', '--ysrp-ok', t('Export Data', '导出数据'), t('Back up your saved progress as JSON.', '将保存的进度备份为 JSON。'),
      h('div', { class: 'ysrp-row-actions' }, copyExport, downloadExport),
      h('div', { class: 'ysrp-msg', text: t('Exports all saved records from the currently selected backend.', '导出当前存储后端中的所有记录。') }),
      exportMsg);

    /* import */
    const importMsg = h('div', { class: 'ysrp-msg', style: { display: 'none' } });
    const overwrite = h('input', { type: 'checkbox', class: 'ysrp-overwrite' });
    const importText = h('textarea', { class: 'ysrp-textarea', rows: '3', placeholder: t('Paste exported JSON here...', '在此粘贴导出的 JSON...') });
    function doImport(text) {
      try {
        const count = Store.importPayload(JSON.parse(text), overwrite.checked);
        setMessage(importMsg, t('Imported {count} record(s).', '已导入 {count} 条记录。', { count }), 'ok');
        emit(EVT_RECORD, { videoId: null });
      } catch (err) {
        setMessage(importMsg, t('Import failed: {message}', '导入失败：{message}', { message: err.message || err }), 'error');
      }
    }
    const importButton = textButton('file-arrow-up', t('Import from Text', '从文本导入'), () => {
      const text = importText.value.trim();
      if (!text) { setMessage(importMsg, t('Nothing to import.', '没有可导入的内容。')); return; }
      doImport(text);
    });
    const noFile = t('No file chosen', '未选择文件');
    const fileName = h('span', { class: 'ysrp-file-name', text: noFile });
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json' });
    const fileLabel = h('label', { class: `ysrp-file${runtime.isIOS ? ' is-ios' : ''}`, tabindex: '0', title: t('Select an export JSON file', '选择要导入的 JSON 文件') },
      icon('file-arrow-up'), h('strong', { text: t('Choose File', '选择文件') }), fileName, fileInput);
    if (!runtime.isIOS) {
      const openPicker = event => {
        event.preventDefault();
        try { if (typeof fileInput.showPicker === 'function') { fileInput.showPicker(); return; } } catch (_) { /* fall back */ }
        fileInput.click();
      };
      fileLabel.addEventListener('click', openPicker);
      fileLabel.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openPicker(event); });
    }
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      fileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = () => {
        importText.value = String(reader.result || '');
        doImport(importText.value);
        fileInput.value = '';
        fileName.textContent = noFile;
      };
      reader.readAsText(file);
    });
    const importCard = card('file-arrow-up', '--ysrp-accent', t('Import Data', '导入数据'), t('Restore a previous export to merge or replace your saved records.', '导入之前的导出文件，用于合并或替换记录。'),
      h('label', { class: 'ysrp-check' }, overwrite, h('strong', { text: t('Overwrite', '覆盖') }),
        h('span', { class: 'ysrp-msg', text: t('Clears the current backend before importing; otherwise records are merged.', '勾选后导入前先清空当前存储后端，否则合并。') })),
      importText,
      h('div', { class: 'ysrp-row-actions' }, importButton, fileLabel),
      importMsg);

    const node = h('div', { class: 'ysrp-pane', dataset: { pane: 'storage' } }, storageCard, exportCard, importCard);
    return { node };
  }

  /* ---------------- Transcript tab (F-4.18 – F-4.23) ---------------- */

  function TranscriptPane() {
    const settings = Transcript.getSettings();
    const field = (label, control) => h('label', { class: 'ysrp-field' }, h('span', { text: label }), control);
    const endpoint = h('input', { class: 'ysrp-input', type: 'text', placeholder: 'https://example.com/v1/chat/completions', autocomplete: 'off', spellcheck: 'false' });
    const model = h('input', { class: 'ysrp-input', type: 'text', placeholder: 'transcript', autocomplete: 'off', spellcheck: 'false' });
    const apiKey = h('input', { class: 'ysrp-input', type: 'password', placeholder: 'sk-***', autocomplete: 'new-password', spellcheck: 'false' });
    const timeout = h('input', { class: 'ysrp-input', type: 'number', min: String(TRANSCRIPT_MIN_MINUTES), max: String(TRANSCRIPT_MAX_MINUTES), step: '1', placeholder: '10' });
    endpoint.value = settings.endpoint;
    model.value = settings.model;
    apiKey.value = settings.apiKey;
    timeout.value = String(Math.round(settings.timeoutMs / 60000));
    const toggle = h('button', { type: 'button', class: 'ysrp-btn', text: t('Show', '显示') });
    toggle.style.setProperty('--ysrp-btn-accent', 'var(--ysrp-transcript)');
    toggle.addEventListener('click', () => {
      const hidden = apiKey.type === 'password';
      apiKey.type = hidden ? 'text' : 'password';
      toggle.textContent = hidden ? t('Hide', '隐藏') : t('Show', '显示');
    });
    let timer = null;
    const persist = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const minutes = parseFloat(timeout.value);
        Transcript.saveSettings({
          endpoint: endpoint.value,
          model: model.value,
          apiKey: apiKey.value,
          timeoutMs: Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : undefined
        });
      }, 250);
    };
    [endpoint, model, apiKey, timeout].forEach(input => { input.addEventListener('input', persist); input.addEventListener('change', persist); });

    const videoTitle = h('span');
    const videoId = h('span', { class: 'ysrp-mono' });
    const videoIdRow = h('div', { class: 'ysrp-info-row' }, h('b', { text: t('Video ID', '视频 ID') }), videoId);

    function updateVideo() {
      const id = Engine.currentId();
      if (!id) {
        videoTitle.textContent = t('No active video detected', '未检测到可用的影片');
        videoIdRow.style.display = 'none';
        return;
      }
      const rec = Store.get(id);
      videoTitle.textContent = Titles.knownDeArrow(id) || Titles.knownOriginal(id) || (rec && !isPlaceholderTitle(rec.videoName) ? rec.videoName : '') || UNKNOWN_TITLE;
      videoId.textContent = id;
      videoIdRow.style.display = '';
    }
    updateVideo();

    const node = h('div', { class: 'ysrp-pane', dataset: { pane: 'transcript' } },
      card('closed-captioning', '--ysrp-transcript', t('Subtitles · Transcript', '字幕与接口设置'),
        t('Configure the OpenAI-compatible endpoint used for subtitles. Fetching lives in the Records tab.', '配置字幕接口（兼容 OpenAI）。字幕获取功能位于“记录”标签。'),
        field(t('API Endpoint', 'API 接口路径'), endpoint),
        field(t('Model', '模型名称'), model),
        field(t('API Key', 'API 密钥'), h('div', { class: 'ysrp-inline' }, apiKey, toggle)),
        field(t('Timeout (minutes)', '超时时长（分钟）'), timeout)),
      card('pen-to-square', '--ysrp-fg', t('Status & Tips', '状态与提示'),
        t('These settings apply instantly. Use the Records tab to fetch transcripts for specific videos.', '设置立即生效，具体字幕获取请在“记录”标签中触发。'),
        h('div', { class: 'ysrp-info' },
          h('div', { class: 'ysrp-info-row' }, h('b', { text: t('Active video', '当前视频') }), videoTitle),
          videoIdRow)));
    return { node, updateVideo };
  }

  /* ---------------- Display tab (F-4.24) ---------------- */

  function DisplayPane() {
    const names = { zh: '中文', en: 'English' };
    const status = h('div', { class: 'ysrp-msg', style: { display: 'none' } });
    const choice = ChoiceGroup('ysrp-language', '--ysrp-display', [
      { value: 'auto', badge: t('Auto', '自动'), label: t('Auto', '自动'), hint: t('Match the browser language automatically.', '自动跟随浏览器语言。') },
      { value: 'zh', badge: '中文', label: '中文', hint: '始终使用简体中文。' },
      { value: 'en', badge: 'English', label: 'English', hint: 'Always use English.' }
    ], languagePreference, value => {
      if (!setLanguagePreference(value)) setMessage(status, t('Already using this language.', '当前已使用该语言。'));
    });
    choice.node.classList.add('ysrp-language-options');
    const node = h('div', { class: 'ysrp-pane', dataset: { pane: 'display' } },
      card('globe', '--ysrp-display', t('Interface Language', '界面语言'), t('Choose how the script UI should appear.', '为脚本界面选择显示语言。'),
        choice.node,
        h('div', { class: 'ysrp-info' },
          h('div', { class: 'ysrp-info-row' }, h('b', { text: t('Active language', '当前语言') }), h('span', { text: names[resolvedLanguage()] })),
          h('div', { class: 'ysrp-info-row' }, h('b', { text: t('Browser language', '浏览器语言') }), h('span', { text: names[detectBrowserLanguage()] }))),
        status));
    return { node };
  }

  /* ======================================================================
   * Bootstrap (section 5)
   * ==================================================================== */

  function initialize() {
    Store.cleanup();
    injectStyles();

    // Progress engine + badge maintenance.
    const loop = () => {
      try { Engine.tick(); } catch (err) { console.error('[Video Memory] tick failed', err); }
      try { Badge.ensure(); } catch (err) { console.error('[Video Memory] badge failed', err); }
    };
    setInterval(loop, TICK_MS);
    loop();

    const flush = () => { try { Engine.flush(); } catch (err) { console.error('[Video Memory] flush failed', err); } };
    // Media events do not bubble; capture them at the document (F-2.4).
    ['pause', 'seeked'].forEach(name => document.addEventListener(name, event => {
      if (event.target && event.target.closest && event.target.closest('#movie_player')) flush();
    }, true));
    ['loadedmetadata', 'durationchange', 'playing'].forEach(name => document.addEventListener(name, event => {
      if (event.target && event.target.closest && event.target.closest('#movie_player')) loop();
    }, true));
    window.addEventListener('yt-navigate-start', flush, true);
    window.addEventListener('yt-navigate-finish', loop, true);
    window.addEventListener('popstate', loop);
    document.addEventListener('visibilitychange', () => (document.hidden ? flush() : loop()));
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);

    let languageTimer = null;
    document.addEventListener(EVT_LANG, () => {
      clearTimeout(languageTimer);
      languageTimer = setTimeout(() => { Badge.rebuild(); Modal.rebuild(); }, 50);
    });
  }

  initialize();
})();
