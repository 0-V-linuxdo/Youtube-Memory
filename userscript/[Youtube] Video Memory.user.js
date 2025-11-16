// ==UserScript==
// @name         [Youtube] Video Memory [20251112] v1.0.0
// @namespace    0_V userscripts/Youtube Save & Resume Progress
// @description  Save & resume YouTube playback progress. Storage backend selection (localStorage or GM storage) with migration, import/export under a settings sub-tab. Fix: On YouTube new UI, the settings popup opens reliably on the page (not on the player), without causing player zoom/jitter, even right after page load.
// @version      [20251112] v1.0.0
// @update-log   [20251112] v1.0.0 · Added bilingual UI with language selector tab and refreshed transcript/records labels
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

// ================================================
// 原脚本信息：
// 名称：Youtube Save/Resume Progress
// 作者：Costin Alexandru Sandu
// 链接：https://greasyfork.org/scripts/487305
// 版本：v1.5.1
// ================================================

/* ===================== IMPORTANT · NOTICE · START =====================
 *
 * 1. [编辑指引 | Edit Guidance]
 *    • ⚠️ 这是一个自动生成的文件：请在 `src/modules` 目录下的模块中进行修改，然后运行 `npm run build` 在 `dist/` 目录下重新生成。
 *    • ⚠️ This project bundles auto-generated artifacts. Make changes inside the modules under `src/modules`, then run `npm run build` to regenerate everything under `dist/`.
 *
 * ----------------------------------------------------------------------
 *
 * 2. [安全提示 | Safety Reminder]
 *    • ✅ 必须使用 `setTrustedHTML`，不得使用 `innerHTML`。
 *    • ✅ Always call `setTrustedHTML`; never rely on `innerHTML`.
 *
 * ====================== IMPORTANT · NOTICE · END ======================
 */

/* -------------------------------------------------------------------------- *
 * Module 01 · Global constants and key identifiers
 * -------------------------------------------------------------------------- */

(function () {
  'use strict';

  // ========== Constants ==========
  const KEY_PREFIX = 'Youtube_SaveResume_Progress-';
  const SETTINGS_MODE_KEY = 'YSRP_StorageMode';
  const TRANSCRIPT_CONFIG_KEY = 'YSRP_TranscriptSettings';
  const DEFAULT_VIDEO_NAME = 'Unknown Title';
  const TITLE_PENDING_PLACEHOLDER = '正在获取标题…';

/* -------------------------------------------------------------------------- *
 * Module 02 · Runtime configuration defaults and flags
 * -------------------------------------------------------------------------- */

  // ========== Config ==========
  const configData = {
    savedProgressAlreadySet: false,
    savingInterval: 1500,
    currentVideoId: null,
    lastSaveTime: 0,
    storageMode: null,
    cachedVideoTitle: {
      videoId: null,
      value: DEFAULT_VIDEO_NAME,
      updatedAt: 0,
      isFallback: true,
      source: 'default',
      confidence: 0
    },
    transcript: {
      endpoint: 'https://0-v-YouTube-Transcript-Generator-api.hf.space/v1/chat/completions',
      apiKey: 'sk-asdlfjalalfja',
      model: 'transcript',
      timeoutMs: 600000,
      lastVideoId: null,
      lastFetchedAt: 0,
      lastTranscript: '',
      lastError: null,
      isFetching: false
    },
    dependenciesURLs: {
      fontAwesomeIcons: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
    }
  };

/* -------------------------------------------------------------------------- *
 * Module 03 · Font Awesome icon presets for UI buttons
 * -------------------------------------------------------------------------- */

  // ========== Icons ==========
  const FontAwesomeIcons = {
    trash: ['fa-solid', 'fa-trash-can'],
    gear: ['fa-solid', 'fa-gear'],
    link: ['fa-solid', 'fa-link'],
    edit: ['fa-solid', 'fa-pencil'],
    note: ['fa-solid', 'fa-pen-to-square'],
    save: ['fa-solid', 'fa-save'],
    copy: ['fa-solid', 'fa-copy'],
    check: ['fa-solid', 'fa-check'],
    captions: ['fa-solid', 'fa-closed-captioning'],
    open: ['fa-solid', 'fa-arrow-up-right-from-square'],
    database: ['fa-solid', 'fa-database'],
    download: ['fa-solid', 'fa-file-arrow-down'],
    upload: ['fa-solid', 'fa-file-arrow-up'],
    arrows: ['fa-solid', 'fa-right-left'],
    refresh: ['fa-solid', 'fa-arrows-rotate'],
    globe: ['fa-solid', 'fa-globe']
  };

/* -------------------------------------------------------------------------- *
 * Module 04 · Theme palettes plus helpers for prefers-color-scheme
 * -------------------------------------------------------------------------- */

  // ========== Theme ==========
  const themeStyles = {
    light: {
      background: '#ffffff',
      color: '#000000',
      border: '1px solid #d5d5d5',
      buttonBackground: '#ffffff',
      buttonBorder: 'rgba(0, 0, 0, 0.3) 1px solid',
      deleteButtonColor: '#e74c3c',
      linkButtonColor: '#3498db',
      editButtonColor: '#2ecc71',
      saveButtonColor: '#f1c40f',
      copyButtonColor: '#2980b9',
      openButtonColor: '#27ae60',
      urlTextColor: '#555555',
      urlBackground: '#f9f9f9',
      recordBackground: '#f0f0f0',
      progressTextColor: '#333333',
      copySuccessBackground: '#2980b9',
      copySuccessTextColor: '#ffffff',
      tabActive: '#0b57d0',
      tabInactive: '#666666',
      badgeBg: '#eef4ff',
      badgeText: '#0b57d0',
      inputBg: '#ffffff',
      inputBorder: '#d0d7de',
      subtleText: '#777777',
      scrollbarThumb: '#9aa0a6',
      scrollbarThumbHover: '#7a7f85',
      scrollbarTrack: '#e6e8ea',
      scrollbarCorner: 'transparent',
      backdrop: 'rgba(0,0,0,0.35)'
    },
    dark: {
      background: '#2c2c2c',
      color: '#ffffff',
      border: '1px solid #444444',
      buttonBackground: '#3c3c3c',
      buttonBorder: 'rgba(255, 255, 255, 0.3) 1px solid',
      deleteButtonColor: '#e74c3c',
      linkButtonColor: '#3498db',
      editButtonColor: '#2ecc71',
      saveButtonColor: '#f1c40f',
      copyButtonColor: '#1abc9c',
      openButtonColor: '#16a085',
      urlTextColor: '#dddddd',
      urlBackground: '#3c3c3c',
      recordBackground: '#3a3a3a',
      progressTextColor: '#dddddd',
      copySuccessBackground: '#1abc9c',
      copySuccessTextColor: '#2c2c2c',
      tabActive: '#7aa2ff',
      tabInactive: '#aaaaaa',
      badgeBg: '#3a4a6a',
      badgeText: '#cfe0ff',
      inputBg: '#2f2f2f',
      inputBorder: '#555',
      subtleText: '#bbbbbb',
      scrollbarThumb: '#6b7280',
      scrollbarThumbHover: '#9ca3af',
      scrollbarTrack: '#2f2f2f',
      scrollbarCorner: 'transparent',
      backdrop: 'rgba(0,0,0,0.45)'
    }
  };
  function getCurrentTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  const currentTheme = getCurrentTheme();
  const styles = themeStyles[currentTheme] || themeStyles.light;

  const CLASS_NAMES = Object.freeze({
    infoContainer: 'last-save-info-container',
    settingsContainer: 'ysrp-settings-container',
    settingsContainerBody: 'ysrp-settings-container-body'
  });

  const SELECTORS = Object.freeze({
    infoContainer: `.${CLASS_NAMES.infoContainer}`,
    settingsContainer: `.${CLASS_NAMES.settingsContainer}`,
    settingsContainerBody: `.${CLASS_NAMES.settingsContainerBody}`
  });

/* -------------------------------------------------------------------------- *
 * Module 05 · Generic DOM, timing, and formatting utilities
 * -------------------------------------------------------------------------- */

  // ========== Utilities ==========
  function createIcon(iconName, color) {
    const icon = document.createElement('i');
    const cssClasses = FontAwesomeIcons[iconName];
    if (cssClasses) icon.classList.add(...cssClasses);
    icon.style.color = color;
    return icon;
  }

  function createDeArrowIcon(size) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.setAttribute('width', String(size || 20));
    svg.setAttribute('height', String(size || 20));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('role', 'img');

    const outer = document.createElementNS(svgNS, 'path');
    outer.setAttribute('fill', '#1213BD');
    outer.setAttribute('d', 'M36 18.302c0 4.981-2.46 9.198-5.655 12.462s-7.323 5.152-12.199 5.152s-9.764-1.112-12.959-4.376S0 23.283 0 18.302s2.574-9.38 5.769-12.644S13.271 0 18.146 0s9.394 2.178 12.589 5.442C33.931 8.706 36 13.322 36 18.302z');

    const mid = document.createElementNS(svgNS, 'path');
    mid.setAttribute('fill', '#88c9f9');
    mid.setAttribute('d', 'm 30.394282,18.410186 c 0,3.468849 -1.143025,6.865475 -3.416513,9.137917 -2.273489,2.272442 -5.670115,2.92874 -9.137918,2.92874 -3.467803,0 -6.373515,-1.147212 -8.6470033,-3.419654 -2.2734888,-2.272442 -3.5871299,-5.178154 -3.5871299,-8.647003 0,-3.46885 0.9420533,-6.746149 3.2144954,-9.0196379 2.2724418,-2.2734888 5.5507878,-3.9513905 9.0196378,-3.9513905 3.46885,0 6.492841,1.9322561 8.76633,4.204698 2.273489,2.2724424 3.788101,5.2974804 3.788101,8.7663304 z');

    const inner = document.createElementNS(svgNS, 'path');
    inner.setAttribute('fill', '#0a62a5');
    inner.setAttribute('d', 'm 23.95823,17.818306 c 0,3.153748 -2.644888,5.808102 -5.798635,5.808102 -3.153748,0 -5.599825,-2.654354 -5.599825,-5.808102 0,-3.153747 2.446077,-5.721714 5.599825,-5.721714 3.153747,0 5.798635,2.567967 5.798635,5.721714 z');

    svg.appendChild(outer);
    svg.appendChild(mid);
    svg.appendChild(inner);
    return svg;
  }

  const originalTitleCache = new Map();
  const pendingOriginalTitleFetches = new Map();
  const OEMBED_ENDPOINT = 'https://www.youtube.com/oembed?format=json&url=';

  function getOriginalTitle(videoId) {
    if (!videoId) return Promise.resolve(null);
    if (originalTitleCache.has(videoId)) {
      return Promise.resolve(originalTitleCache.get(videoId));
    }
    if (pendingOriginalTitleFetches.has(videoId)) {
      return pendingOriginalTitleFetches.get(videoId);
    }
    const videoUrl = `https://youtu.be/${videoId}`;
    const requestUrl = `${OEMBED_ENDPOINT}${encodeURIComponent(videoUrl)}`;
    const fetchPromise = fetch(requestUrl, { credentials: 'omit', cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error(`oEmbed HTTP ${res.status}`);
        const data = await res.json();
        const title = data && typeof data.title === 'string' ? data.title.trim() : null;
        originalTitleCache.set(videoId, title);
        try { if (typeof setTitleSource === 'function') setTitleSource(videoId, 'original', title); } catch {}
        try { updateStoredOriginalTitle(videoId, title); } catch {}
        return title;
      })
      .catch(err => {
        console.error('Failed to fetch original title:', err);
        originalTitleCache.set(videoId, null);
        try { if (typeof setTitleSource === 'function') setTitleSource(videoId, 'original', null); } catch {}
        try { updateStoredOriginalTitle(videoId, null); } catch {}
        return null;
      })
      .finally(() => {
        pendingOriginalTitleFetches.delete(videoId);
      });
    pendingOriginalTitleFetches.set(videoId, fetchPromise);
    return fetchPromise;
  }

  function fancyTimeFormat(duration) {
    const hrs = Math.floor(duration / 3600);
    const mins = Math.floor((duration % 3600) / 60);
    const secs = Math.floor(duration % 60);
    let ret = '';
    if (hrs > 0) ret += `${hrs}:` + (mins < 10 ? '0' : '');
    ret += `${mins}:` + (secs < 10 ? '0' : '');
    ret += `${secs}`;
    return ret;
  }

  function waitForElm(selector) {
    return new Promise(resolve => {
      const element = document.querySelector(selector);
      if (element) return resolve(element);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

/* -------------------------------------------------------------------------- *
 * Module 05a · Internationalization helpers and language preference storage
 * -------------------------------------------------------------------------- */

  const LANGUAGE_STORAGE_KEY = 'YSRP_LanguagePreference';
  const LANGUAGE_CHANGED_EVENT = 'ysrp-language-changed';
  const LANGUAGE_PREFERENCE_OPTIONS = Object.freeze(['auto', 'zh', 'en']);
  const LANGUAGE_FALLBACK = 'en';

  function normalizeLanguagePreference(value) {
    const raw = (value || '').toString().trim().toLowerCase();
    if (raw === 'auto') return 'auto';
    if (raw.startsWith('zh')) return 'zh';
    if (raw === 'en' || raw.startsWith('en')) return 'en';
    return 'auto';
  }

  function detectBrowserLanguage() {
    const candidates = [];
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      candidates.push(...navigator.languages);
    }
    if (typeof navigator.language === 'string') {
      candidates.push(navigator.language);
    }
    if (typeof navigator.userLanguage === 'string') {
      candidates.push(navigator.userLanguage);
    }
    const match = candidates.find(lang => typeof lang === 'string' && lang.trim());
    if (!match) return LANGUAGE_FALLBACK;
    const normalized = match.trim().toLowerCase();
    if (normalized.startsWith('zh')) return 'zh';
    return 'en';
  }

  function readStoredLanguagePreference() {
    let stored = null;
    try {
      if (window.localStorage) {
        stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      }
    } catch {}
    if (!stored && typeof GM_getValue === 'function') {
      try {
        stored = GM_getValue(LANGUAGE_STORAGE_KEY);
      } catch {}
    }
    return normalizeLanguagePreference(stored);
  }

  function persistLanguagePreference(value) {
    const normalized = normalizeLanguagePreference(value);
    try {
      if (window.localStorage) {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
      }
    } catch {}
    if (typeof GM_setValue === 'function') {
      try {
        GM_setValue(LANGUAGE_STORAGE_KEY, normalized);
      } catch {}
    }
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    const output = target && typeof target === 'object' ? target : {};
    Object.keys(source).forEach(key => {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        output[key] = deepMerge(output[key], value);
      } else {
        output[key] = value;
      }
    });
    return output;
  }

  const translationStore = { en: {}, zh: {} };

  function resolveMessage(lang, path) {
    if (!path) return null;
    const segments = path.split('.');
    let current = translationStore[lang];
    for (const segment of segments) {
      if (!current || typeof current !== 'object') {
        return null;
      }
      current = current[segment];
    }
    return typeof current === 'string' ? current : null;
  }

  function formatTemplate(template, params) {
    if (typeof template !== 'string' || !params) return template;
    return template.replace(/\{([^}]+)\}/g, (_, token) => {
      const key = token.trim();
      if (!key) return '';
      return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : '';
    });
  }

  let languagePreference = readStoredLanguagePreference();
  if (!LANGUAGE_PREFERENCE_OPTIONS.includes(languagePreference)) {
    languagePreference = 'auto';
  }

  function getResolvedLanguage() {
    if (languagePreference === 'auto') {
      return detectBrowserLanguage();
    }
    return languagePreference;
  }

  function updateConfigLanguageState() {
    if (!configData || typeof configData !== 'object') return;
    const resolved = getResolvedLanguage();
    configData.language = Object.assign({}, configData.language || {}, {
      preference: languagePreference,
      resolved,
      eventName: LANGUAGE_CHANGED_EVENT
    });
  }

  updateConfigLanguageState();

  const I18n = (() => {
    function extend(messages) {
      if (!messages || typeof messages !== 'object') return;
      Object.keys(messages).forEach(langKey => {
        if (!langKey) return;
        const normalizedLang = langKey.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        translationStore[normalizedLang] = deepMerge(translationStore[normalizedLang], messages[langKey] || {});
      });
    }

    function pick(messages, params) {
      if (!messages || typeof messages !== 'object') return '';
      const resolved = getResolvedLanguage();
      const candidate = Object.prototype.hasOwnProperty.call(messages, resolved)
        ? messages[resolved]
        : (messages.en ?? messages.zh ?? messages[LANGUAGE_FALLBACK]);
      let value = candidate;
      if (typeof candidate === 'function') {
        try {
          value = candidate(params || {});
        } catch {
          value = '';
        }
      }
      if (typeof value === 'string') {
        return formatTemplate(value, params);
      }
      return '';
    }

    function t(path, params, fallback) {
      if (!path) return typeof fallback === 'string' ? fallback : path;
      const resolvedLang = getResolvedLanguage();
      const primary = resolveMessage(resolvedLang, path);
      if (primary) {
        return formatTemplate(primary, params);
      }
      const secondary = resolveMessage('en', path);
      if (secondary) {
        return formatTemplate(secondary, params);
      }
      const tertiary = resolveMessage('zh', path);
      if (tertiary) {
        return formatTemplate(tertiary, params);
      }
      if (typeof fallback === 'string') return formatTemplate(fallback, params);
      return path;
    }

    function setPreference(value) {
      const normalized = normalizeLanguagePreference(value);
      if (normalized === languagePreference) return;
      languagePreference = normalized;
      persistLanguagePreference(languagePreference);
      updateConfigLanguageState();
      try {
        document.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, {
          detail: {
            preference: languagePreference,
            resolved: getResolvedLanguage()
          }
        }));
      } catch {}
    }

    function getPreference() {
      return languagePreference;
    }

    function getOptions() {
      return LANGUAGE_PREFERENCE_OPTIONS.slice();
    }

    return {
      t,
      extend,
      setPreference,
      getPreference,
      getResolvedLanguage,
      getOptions,
      detectBrowserLanguage,
      getEventName: () => LANGUAGE_CHANGED_EVENT,
      pick
    };
  })();

  I18n.extend({
    en: {
      language: {
        tabLabel: 'Display',
        heading: 'Language',
        description: 'Choose how the script UI should appear.',
        options: {
          auto: 'Auto',
          zh: 'Chinese',
          en: 'English'
        },
        optionHints: {
          auto: 'Match the browser language automatically.',
          zh: 'Always use Simplified Chinese.',
          en: 'Always use English.'
        },
        badges: {
          auto: 'Auto',
          zh: 'ZH',
          en: 'EN'
        }
      }
    },
    zh: {
      language: {
        tabLabel: '界面',
        heading: '界面语言',
        description: '为脚本 UI 选择显示语言。',
        options: {
          auto: '自动',
          zh: '中文',
          en: '英文'
        },
        optionHints: {
          auto: '自动跟随浏览器语言。',
          zh: '始终使用简体中文。',
          en: '始终使用英文。'
        },
        badges: {
          auto: '自动',
          zh: '中文',
          en: '英文'
        }
      }
    }
  });

  updateConfigLanguageState();

/* -------------------------------------------------------------------------- *
 * Module 06 · YouTube player detection and DeArrow title fetching
 * -------------------------------------------------------------------------- */

  const DEARROW_API_ENDPOINT = 'https://sponsor.ajay.app/api/branding?videoID=';
  const DEARROW_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours
  const TITLE_REFRESH_DEBOUNCE_MS = 250;
  const DEARROW_DUPLICATE_RETRY_INTERVAL = 1000 * 60 * 5;
  const CURRENT_VIDEO_STATUS_EVENT = 'ysrp-current-video-status';
  const DEARROW_TITLE_READY_EVENT = 'ysrp-dearrow-title-ready';
  const RECORD_UPDATED_EVENT = 'ysrp-record-updated';

  let titleEventsBound = false;
  let pendingTitleRefresh = null;
  let lastObservedVideoId = null;
  let videoIdMonitorInterval = null;
  const dearrowCache = new Map();   // videoId -> { title, fetchedAt }
  const dearrowFetches = new Map(); // videoId -> Promise
  const dearrowRetryTimestamps = new Map();
  const titleSources = new Map();   // videoId -> { original, dearrow }
  configData.titleSources = titleSources;

  function getPlayerElement() {
    return document.querySelector('#movie_player');
  }

  function normalizeTitleText(text) {
    if (!text) return '';
    return String(text).replace(/\s+/g, ' ').trim();
  }

  function titlesEqual(a, b) {
    if (!a || !b) return false;
    return normalizeTitleText(a).toLowerCase() === normalizeTitleText(b).toLowerCase();
  }

  function scheduleDeArrowRetry(videoId) {
    if (!videoId) return;
    const now = Date.now();
    const last = dearrowRetryTimestamps.get(videoId) || 0;
    if ((now - last) < DEARROW_DUPLICATE_RETRY_INTERVAL) return;
    dearrowRetryTimestamps.set(videoId, now);
    setTimeout(() => {
      try { requestDeArrowTitle(videoId, { force: true }); } catch (err) { console.error('Retry DeArrow fetch failed:', err); }
    }, 1500);
  }

  function setTitleSource(videoId, type, value) {
    if (!videoId) return false;
    const normalized = normalizeTitleText(value);
    const entry = titleSources.get(videoId) || { original: null, dearrow: null };
    if (type === 'original') {
      entry.original = normalized || null;
      if (entry.dearrow && normalized && titlesEqual(entry.dearrow, normalized)) {
        entry.dearrow = null;
        scheduleDeArrowRetry(videoId);
      }
    } else if (type === 'dearrow') {
      if (!normalized) {
        entry.dearrow = null;
      } else if (entry.original && titlesEqual(entry.original, normalized)) {
        entry.dearrow = null;
        scheduleDeArrowRetry(videoId);
        titleSources.set(videoId, entry);
        return false;
      } else {
        entry.dearrow = normalized;
      }
    }
    titleSources.set(videoId, entry);
    return Boolean(type === 'dearrow' ? entry.dearrow : entry.original);
  }

  function resolveEffectiveTitle(videoId, fallbackTitle) {
    const fallback = normalizeTitleText(fallbackTitle) || DEFAULT_VIDEO_NAME;
    if (!videoId) return { title: fallback, source: 'fallback', type: 'fallback' };
    const entry = titleSources.get(videoId);
    if (entry) {
      if (entry.dearrow) return { title: entry.dearrow, source: 'dearrow', type: 'dearrow' };
      if (entry.original) return { title: entry.original, source: 'original', type: 'original' };
    }
    return { title: fallback, source: 'fallback', type: 'fallback' };
  }

  configData.resolveEffectiveTitle = resolveEffectiveTitle;

  function publishCurrentVideoStatus() {
    try {
      const cached = configData.cachedVideoTitle || {};
      const detail = {
        videoId: cached.videoId || null,
        title: cached.value || DEFAULT_VIDEO_NAME,
        isLoading: Boolean(!cached.videoId || cached.isFallback || cached.value === TITLE_PENDING_PLACEHOLDER),
        source: cached.source || 'unknown',
        updatedAt: cached.updatedAt || Date.now()
      };
      document.dispatchEvent(new CustomEvent(CURRENT_VIDEO_STATUS_EVENT, { detail }));
    } catch {}
  }

  function cacheVideoTitle(videoId, title, options) {
    const resolved = resolveEffectiveTitle(videoId, title);
    const normalized = resolved.title || DEFAULT_VIDEO_NAME;
    const opts = Object.assign({ source: resolved.source || 'unknown', confidence: 0 }, options || {});
    const isPlaceholderValue = resolved.type === 'fallback' || normalized === DEFAULT_VIDEO_NAME || normalized === TITLE_PENDING_PLACEHOLDER;
    configData.cachedVideoTitle = {
      videoId,
      value: normalized,
      updatedAt: Date.now(),
      isFallback: isPlaceholderValue,
      source: opts.source,
      confidence: opts.confidence
    };
    publishCurrentVideoStatus();
    return normalized;
  }

  function ensureVideoCache(videoId) {
    if (configData.cachedVideoTitle.videoId !== videoId) {
      cacheVideoTitle(videoId, TITLE_PENDING_PLACEHOLDER, { source: 'loading', confidence: 0 });
    }
  }

  function parseDeArrowPayload(data) {
    if (!data || !Array.isArray(data.titles) || data.titles.length === 0) return null;
    const validEntry = data.titles.find(entry => {
      if (!entry || typeof entry.title !== 'string') return false;
      if (entry.original === true) return false;
      const votes = typeof entry.votes === 'number' ? entry.votes : 0;
      const locked = Boolean(entry.locked);
      if (!locked && votes < 0) return false;
      return true;
    });
    return validEntry ? validEntry.title : null;
  }

  async function fetchDeArrowTitle(videoId) {
    if (!videoId) return null;
    const url = `${DEARROW_API_ENDPOINT}${encodeURIComponent(videoId)}`;
    try {
      const response = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (!response.ok) return null;
      const data = await response.json();
      return parseDeArrowPayload(data);
    } catch (error) {
      console.error('Failed to fetch DeArrow title:', error);
      return null;
    }
  }

  function requestDeArrowTitle(videoId, options) {
    if (!videoId) return Promise.resolve(null);
    const opts = Object.assign({ force: false }, options || {});

    if (!opts.force) {
      const cached = dearrowCache.get(videoId);
      if (cached && (Date.now() - cached.fetchedAt) < DEARROW_CACHE_TTL) {
        setTitleSource(videoId, 'dearrow', cached.title);
        cacheVideoTitle(videoId, cached.title, { source: 'dearrow-cache', confidence: 1 });
        return Promise.resolve(cached.title);
      }
    }

    if (dearrowFetches.has(videoId)) {
      return dearrowFetches.get(videoId);
    }
    const fetchPromise = fetchDeArrowTitle(videoId)
      .then(title => {
        if (title) {
          const accepted = setTitleSource(videoId, 'dearrow', title);
          if (accepted) {
            dearrowCache.set(videoId, { title, fetchedAt: Date.now() });
            cacheVideoTitle(videoId, title, { source: 'dearrow', confidence: 1 });
            try {
              document.dispatchEvent(new CustomEvent(DEARROW_TITLE_READY_EVENT, {
                detail: { videoId, title }
              }));
            } catch (err) {
              console.error('Failed to dispatch DeArrow title ready event:', err);
            }
          }
        }
        return title || null;
      })
      .catch(() => null)
      .finally(() => {
        dearrowFetches.delete(videoId);
      });
    dearrowFetches.set(videoId, fetchPromise);
    return fetchPromise;
  }

  function debounceTitleRefresh() {
    if (pendingTitleRefresh) {
      clearTimeout(pendingTitleRefresh);
    }
    pendingTitleRefresh = setTimeout(() => {
      pendingTitleRefresh = null;
      const videoId = getVideoId();
      if (videoId) requestDeArrowTitle(videoId, { force: true });
    }, TITLE_REFRESH_DEBOUNCE_MS);
  }

  function bindTitleRefreshEvents() {
    if (titleEventsBound) return;
    titleEventsBound = true;

    const navigationEvents = ['yt-page-data-fetched', 'yt-page-data-updated', 'yt-navigate-start', 'yt-navigate-finish'];
    navigationEvents.forEach(evt => {
      window.addEventListener(evt, () => {
        debounceTitleRefresh();
        handleVideoIdChange(getVideoId());
      }, true);
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        debounceTitleRefresh();
        handleVideoIdChange(getVideoId());
      }
    });

    window.addEventListener('popstate', () => handleVideoIdChange(getVideoId()));
    window.addEventListener('yt-history-popstate', () => handleVideoIdChange(getVideoId()));
    window.addEventListener('yt-viewport-change', () => handleVideoIdChange(getVideoId()), true);

    waitForElm('#title').then(titleEl => {
      const observer = new MutationObserver(() => {
        debounceTitleRefresh();
        handleVideoIdChange(getVideoId());
      });
      observer.observe(titleEl, { childList: true, subtree: true, characterData: true });
    }).catch(() => {});

    startVideoIdMonitor();
  }

  // ========== YouTube Player Helpers ==========
  function getVideoCurrentTime() {
    const player = getPlayerElement();
    if (player && typeof player.getCurrentTime === 'function') {
      return player.getCurrentTime();
    }
    return 0;
  }

  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  function getVideoDuration() {
    const player = getPlayerElement();
    if (player && typeof player.getDuration === 'function') {
      return player.getDuration();
    }
    return 0;
  }

  function playerExists() {
    return Boolean(getPlayerElement());
  }

  function setVideoProgress(progress) {
    const player = getPlayerElement();
    if (player && typeof player.seekTo === 'function') {
      player.seekTo(progress, true);
    }
  }

  function ensureTitleFetchForVideo(videoId, options) {
    if (!videoId) return;
    ensureVideoCache(videoId);
    const dearrowPromise = requestDeArrowTitle(videoId, options);
    if (dearrowPromise && typeof dearrowPromise.catch === 'function') {
      dearrowPromise.catch(() => null);
    }
    getOriginalTitle(videoId)
      .then(title => {
        if (!title) return null;
        const cached = configData.cachedVideoTitle;
        const stillLoading = cached.videoId === videoId &&
          (cached.value === TITLE_PENDING_PLACEHOLDER || cached.isFallback);
        if (stillLoading) {
          cacheVideoTitle(videoId, title, { source: 'original', confidence: 0.7 });
        }
        return title;
      })
      .catch(() => null);
  }

  function handleVideoIdChange(newVideoId) {
    if (newVideoId === lastObservedVideoId) return;
    lastObservedVideoId = newVideoId || null;
    if (!newVideoId) {
      cacheVideoTitle(null, DEFAULT_VIDEO_NAME, { source: 'idle', confidence: 0 });
      return;
    }
    ensureTitleFetchForVideo(newVideoId, { force: true });
    try { saveVideoProgress(); } catch (err) { console.error('Failed to seed progress on navigation:', err); }
  }

  function startVideoIdMonitor() {
    if (videoIdMonitorInterval) return;
    lastObservedVideoId = getVideoId();
    videoIdMonitorInterval = setInterval(() => {
      const current = getVideoId();
      if (current !== lastObservedVideoId) {
        handleVideoIdChange(current);
      }
    }, 500);
  }

  function getVideoName() {
    const videoId = getVideoId();
    if (!videoId) return DEFAULT_VIDEO_NAME;

    bindTitleRefreshEvents();
    startVideoIdMonitor();
    ensureTitleFetchForVideo(videoId);

    return configData.cachedVideoTitle.value || DEFAULT_VIDEO_NAME;
  }

/* -------------------------------------------------------------------------- *
 * Module 07 · Storage mode abstraction with GM/local backends
 * -------------------------------------------------------------------------- */

  // ========== Storage Backend Abstraction ==========
  const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function' &&
                typeof GM_listValues === 'function' && typeof GM_deleteValue === 'function';

  const LocalBackend = {
    mode: 'local',
    getItem(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
    setItem(key, value) { try { window.localStorage.setItem(key, value); } catch {} },
    removeItem(key) { try { window.localStorage.removeItem(key); } catch {} },
    keys() { try { return Object.keys(window.localStorage) || []; } catch { return []; } },
    entriesWithPrefix(prefix) {
      try { return Object.entries(window.localStorage).filter(([k]) => k.startsWith(prefix)); } catch { return []; }
    }
  };

  const GMBackend = {
    mode: 'gm',
    getItem(key) { try { return hasGM ? (GM_getValue(key) ?? null) : null; } catch { return null; } },
    setItem(key, value) { try { if (hasGM) GM_setValue(key, value); } catch {} },
    removeItem(key) { try { if (hasGM) GM_deleteValue(key); } catch {} },
    keys() { try { return hasGM ? (GM_listValues() || []) : []; } catch { return []; } },
    entriesWithPrefix(prefix) {
      try {
        if (!hasGM) return [];
        const keys = GM_listValues() || [];
        const filtered = keys.filter(k => k.startsWith(prefix));
        return filtered.map(k => [k, GM_getValue(k)]);
      } catch { return []; }
    }
  };

  const Storage = (() => {
    const backends = { local: LocalBackend, gm: GMBackend };
    let mode = null;

    function detectInitialMode() {
      let saved = null;
      try { saved = LocalBackend.getItem(SETTINGS_MODE_KEY); } catch {}
      if (hasGM && !saved) {
        try { saved = GMBackend.getItem(SETTINGS_MODE_KEY); } catch {}
      }
      if (saved === 'gm' && hasGM) return 'gm';
      return 'local';
    }

    function persistMode(newMode) {
      try { LocalBackend.setItem(SETTINGS_MODE_KEY, newMode); } catch {}
      if (hasGM) { try { GMBackend.setItem(SETTINGS_MODE_KEY, newMode); } catch {} }
    }

    function setMode(newMode, opts) {
      const options = Object.assign({ migrate: true, clearSource: true }, opts || {});
      if (!backends[newMode]) return;
      if (!mode) mode = detectInitialMode();
      if (mode === newMode) return;

      const src = backends[mode];
      const dst = backends[newMode];
      if (options.migrate && src) {
        const items = src.entriesWithPrefix(KEY_PREFIX);
        for (const [k, v] of items) { try { dst.setItem(k, v); } catch {} }
        if (options.clearSource) {
          for (const [k] of items) { try { src.removeItem(k); } catch {} }
        }
      }
      mode = newMode;
      persistMode(newMode);
    }

    function getMode() {
      if (!mode) {
        mode = detectInitialMode();
        persistMode(mode);
      }
      return mode;
    }

    function backend() { return backends[getMode()] || LocalBackend; }

    function getItem(key) { return backend().getItem(key); }
    function setItem(key, value) { backend().setItem(key, value); }
    function removeItem(key) { backend().removeItem(key); }
    function keys() { return backend().keys(); }
    function listEntriesWithPrefix(prefix) { return backend().entriesWithPrefix(prefix); }

    function listSavedVideos() {
      return listEntriesWithPrefix(KEY_PREFIX);
    }

    function exportAll() {
      const entries = listSavedVideos();
      const out = {};
      for (const [k, v] of entries) out[k] = v;
      return {
        version: '1',
        exportedAt: Date.now(),
        storageMode: getMode(),
        entries: out
      };
    }

    function importPayload(payload, options) {
      const { clearExisting = false } = options || {};
      if (!payload || typeof payload !== 'object' || !payload.entries || typeof payload.entries !== 'object') {
        throw new Error('Invalid import payload');
      }
      if (clearExisting) {
        const entries = listSavedVideos();
        for (const [k] of entries) removeItem(k);
      }
      const entriesObj = payload.entries;
      let count = 0;
      for (const k of Object.keys(entriesObj)) {
        if (k.startsWith(KEY_PREFIX)) {
          try { setItem(k, entriesObj[k]); count++; } catch {}
        }
      }
      return count;
    }

    return {
      getMode, setMode, persistMode,
      getItem, setItem, removeItem, keys, listEntriesWithPrefix,
      listSavedVideos, exportAll, importPayload
    };
  })();

/* -------------------------------------------------------------------------- *
 * Module 07a · Transcript settings persistence and subtitle API helpers
 * -------------------------------------------------------------------------- */

  // ========== Transcript Settings & API ==========
  const TRANSCRIPT_DEFAULT_BASE = 'https://0-v-YouTube-Transcript-Generator-api.hf.space';
  const TRANSCRIPT_ENDPOINT_SUFFIX = '/v1/chat/completions';
  const TRANSCRIPT_TIMEOUT_MIN_MINUTES = 1;
  const TRANSCRIPT_TIMEOUT_MAX_MINUTES = 60;
  const TRANSCRIPT_TIMEOUT_DEFAULT_MINUTES = 10;
  const TRANSCRIPT_TIMEOUT_MIN_MS = TRANSCRIPT_TIMEOUT_MIN_MINUTES * 60 * 1000;
  const TRANSCRIPT_TIMEOUT_MAX_MS = TRANSCRIPT_TIMEOUT_MAX_MINUTES * 60 * 1000;
  const TRANSCRIPT_DEFAULT_TIMEOUT_MS = TRANSCRIPT_TIMEOUT_DEFAULT_MINUTES * 60 * 1000;

  function clampTranscriptTimeoutMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return TRANSCRIPT_DEFAULT_TIMEOUT_MS;
    }
    return Math.max(
      TRANSCRIPT_TIMEOUT_MIN_MS,
      Math.min(TRANSCRIPT_TIMEOUT_MAX_MS, Math.round(numeric))
    );
  }

  function transcriptMinutesToMs(minutes) {
    return clampTranscriptTimeoutMs(Number(minutes) * 60 * 1000);
  }

  function transcriptMsToMinutes(ms) {
    const numeric = Number(ms);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return TRANSCRIPT_TIMEOUT_DEFAULT_MINUTES;
    }
    return Math.round(numeric / 60000);
  }

  function normalizeTranscriptEndpoint(value) {
    if (!value || typeof value !== 'string') return '';
    let trimmed = value.trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    }
    try {
      const url = new URL(trimmed);
      const normalizedPath = (url.pathname || '').replace(/\/+$/, '');
      const hasSuffix = normalizedPath.toLowerCase().includes(TRANSCRIPT_ENDPOINT_SUFFIX);
      if (!hasSuffix) {
        if (!normalizedPath || normalizedPath === '' || normalizedPath === '/') {
          url.pathname = TRANSCRIPT_ENDPOINT_SUFFIX;
        } else {
          url.pathname = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
        }
      } else if (!normalizedPath) {
        url.pathname = TRANSCRIPT_ENDPOINT_SUFFIX;
      } else {
        url.pathname = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
      }
      return url.toString().replace(/\/+$/, '');
    } catch {
      const withoutTrailing = trimmed.replace(/\/+$/, '');
      if (withoutTrailing.toLowerCase().includes(TRANSCRIPT_ENDPOINT_SUFFIX)) {
        return withoutTrailing;
      }
      return `${withoutTrailing}${TRANSCRIPT_ENDPOINT_SUFFIX}`;
    }
  }

  const DEFAULT_TRANSCRIPT_SETTINGS = Object.freeze({
    endpoint: normalizeTranscriptEndpoint(
      (configData.transcript && configData.transcript.endpoint) || TRANSCRIPT_DEFAULT_BASE
    ),
    model: (configData.transcript && configData.transcript.model) || 'transcript',
    apiKey: (configData.transcript && configData.transcript.apiKey) || 'sk-asdlfjalalfja',
    timeoutMs: clampTranscriptTimeoutMs(
      (configData.transcript && configData.transcript.timeoutMs) || TRANSCRIPT_DEFAULT_TIMEOUT_MS
    )
  });
  const TRANSCRIPT_CACHE_TTL = 1000 * 60 * 30; // 30 minutes
  const transcriptCache = new Map();
  const transcriptFetches = new Map();

  function getVideoStorageKey(videoId) {
    if (!videoId) return null;
    return `${KEY_PREFIX}${videoId}`;
  }

  function readVideoRecord(videoId) {
    const storageKey = getVideoStorageKey(videoId);
    if (!storageKey) return null;
    const raw = Storage.getItem(storageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) || {};
    } catch {
      return null;
    }
  }

  function persistTranscriptForVideo(videoId, transcriptText) {
    const storageKey = getVideoStorageKey(videoId);
    if (!storageKey) return;
    let record = readVideoRecord(videoId) || {};
    const trimmed = typeof transcriptText === 'string' ? transcriptText.trim() : '';
    if (trimmed) {
      record.videoTranscript = trimmed;
      record.videoTranscriptUpdatedAt = Date.now();
    } else {
      delete record.videoTranscript;
      delete record.videoTranscriptUpdatedAt;
    }
    try {
      Storage.setItem(storageKey, JSON.stringify(record));
    } catch (err) {
      console.error('Failed to persist transcript to storage:', err);
    }
  }

  function readStoredTranscriptForVideo(videoId) {
    const record = readVideoRecord(videoId);
    if (!record || typeof record.videoTranscript !== 'string' || !record.videoTranscript.trim()) {
      return null;
    }
    return {
      text: record.videoTranscript.trim(),
      fetchedAt: record.videoTranscriptUpdatedAt || 0
    };
  }

  function sanitizeTranscriptSettings(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    ['endpoint', 'model', 'apiKey'].forEach(key => {
      if (typeof raw[key] !== 'string') return;
      const value = raw[key].trim();
      if (!value) return;
      if (key === 'endpoint') {
        out[key] = normalizeTranscriptEndpoint(value);
      } else {
        out[key] = value;
      }
    });
    if (typeof raw.timeoutMs !== 'undefined') {
      const numeric = Number(raw.timeoutMs);
      if (Number.isFinite(numeric) && numeric > 0) {
        out.timeoutMs = clampTranscriptTimeoutMs(numeric);
      }
    } else if (typeof raw.timeoutMinutes !== 'undefined') {
      const minutes = Number(raw.timeoutMinutes);
      if (Number.isFinite(minutes) && minutes > 0) {
        out.timeoutMs = clampTranscriptTimeoutMs(minutes * 60 * 1000);
      }
    }
    return out;
  }

  function readStoredTranscriptSettings() {
    let stored = null;
    try {
      stored = window.localStorage ? window.localStorage.getItem(TRANSCRIPT_CONFIG_KEY) : null;
    } catch {}
    if (!stored && typeof GM_getValue === 'function') {
      try {
        stored = GM_getValue(TRANSCRIPT_CONFIG_KEY);
      } catch {}
    }
    if (!stored) return null;
    if (typeof stored === 'string') {
      try { return JSON.parse(stored); } catch { return null; }
    }
    if (typeof stored === 'object') return stored;
    return null;
  }

  function persistTranscriptSettings(settings) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(TRANSCRIPT_CONFIG_KEY, JSON.stringify(settings));
      }
    } catch {}
    if (typeof GM_setValue === 'function') {
      try { GM_setValue(TRANSCRIPT_CONFIG_KEY, JSON.stringify(settings)); } catch {}
    }
  }

  function hydrateTranscriptSettings() {
    const stored = readStoredTranscriptSettings();
    const merged = Object.assign({}, DEFAULT_TRANSCRIPT_SETTINGS, stored || {});
    merged.endpoint = normalizeTranscriptEndpoint(merged.endpoint || DEFAULT_TRANSCRIPT_SETTINGS.endpoint);
    merged.timeoutMs = clampTranscriptTimeoutMs(merged.timeoutMs || DEFAULT_TRANSCRIPT_SETTINGS.timeoutMs);
    configData.transcript = Object.assign({}, configData.transcript || {}, merged);
    return configData.transcript;
  }
  hydrateTranscriptSettings();

  function getTranscriptSettings() {
    if (!configData.transcript) {
      return hydrateTranscriptSettings();
    }
    const { endpoint, model, apiKey, timeoutMs } = configData.transcript;
    return {
      endpoint: normalizeTranscriptEndpoint(endpoint || DEFAULT_TRANSCRIPT_SETTINGS.endpoint),
      model: model || DEFAULT_TRANSCRIPT_SETTINGS.model,
      apiKey: apiKey || '',
      timeoutMs: clampTranscriptTimeoutMs(timeoutMs || DEFAULT_TRANSCRIPT_SETTINGS.timeoutMs)
    };
  }

  function updateTranscriptSettings(partial) {
    const sanitized = sanitizeTranscriptSettings(partial);
    const prev = readStoredTranscriptSettings() || {};
    const merged = Object.assign({}, DEFAULT_TRANSCRIPT_SETTINGS, prev, sanitized);
    persistTranscriptSettings(merged);
    configData.transcript = Object.assign({}, configData.transcript || {}, merged);
    return Object.assign({}, configData.transcript);
  }

  function getCachedTranscript(videoId) {
    if (!videoId) return null;
    const cached = transcriptCache.get(videoId);
    if (cached) {
      if ((Date.now() - cached.fetchedAt) > TRANSCRIPT_CACHE_TTL) {
        transcriptCache.delete(videoId);
      } else {
        return cached.text;
      }
    }
    const stored = readStoredTranscriptForVideo(videoId);
    if (stored && stored.text) {
      transcriptCache.set(videoId, {
        text: stored.text,
        fetchedAt: stored.fetchedAt || Date.now()
      });
      return stored.text;
    }
    return null;
  }

  function setTranscriptError(message) {
    configData.transcript.lastError = message || '';
  }

  function buildTranscriptPrompt(videoId, context) {
    const ctxUrl = context && typeof context.videoUrl === 'string' ? context.videoUrl.trim() : '';
    return ctxUrl || `https://www.youtube.com/watch?v=${videoId}`;
  }

  function buildTranscriptRequestBody(videoId, context) {
    const settings = getTranscriptSettings();
    const videoUrl = buildTranscriptPrompt(videoId, context);
    return {
      model: settings.model || DEFAULT_TRANSCRIPT_SETTINGS.model,
      messages: [
        { role: 'user', content: videoUrl }
      ]
    };
  }

  function extractTranscriptText(payload) {
    if (!payload) return '';
    if (typeof payload === 'string') return payload.trim();
    if (Array.isArray(payload)) {
      return payload.map(item => extractTranscriptText(item)).filter(Boolean).join('\n').trim();
    }
    if (payload.error && payload.error.message) {
      throw new Error(payload.error.message);
    }
    if (typeof payload.transcript === 'string') return payload.transcript.trim();
    if (Array.isArray(payload.transcript)) return payload.transcript.join('\n').trim();
    if (payload.output_text) {
      if (Array.isArray(payload.output_text)) return payload.output_text.join('\n').trim();
      if (typeof payload.output_text === 'string') return payload.output_text.trim();
    }
    if (Array.isArray(payload.output)) {
      const pieces = [];
      payload.output.forEach(entry => {
        if (entry && Array.isArray(entry.content)) {
          entry.content.forEach(part => {
            if (part && typeof part.text === 'string') {
              pieces.push(part.text);
            }
          });
        }
      });
      const joined = pieces.join('\n').trim();
      if (joined) return joined;
    }
    if (Array.isArray(payload.choices)) {
      const collected = payload.choices.map(choice => {
        if (!choice) return '';
        if (choice.message && typeof choice.message.content === 'string') {
          return choice.message.content;
        }
        if (choice.message && Array.isArray(choice.message.content)) {
          return choice.message.content.map(part => part && part.text ? part.text : '').join('\n');
        }
        if (typeof choice.text === 'string') return choice.text;
        return '';
      }).filter(Boolean);
      const joined = collected.join('\n').trim();
      if (joined) return joined;
    }
    if (typeof payload.text === 'string') return payload.text.trim();
    if (payload.data && typeof payload.data === 'string') return payload.data.trim();
    return '';
  }

  async function fetchTranscriptForVideo(videoId, options) {
    const opts = Object.assign({ force: false }, options || {});
    if (!videoId) throw new Error('无法识别当前视频 ID。');
    if (!opts.force) {
      const cachedValue = getCachedTranscript(videoId);
      if (cachedValue) return cachedValue;
      if (transcriptFetches.has(videoId)) {
        return transcriptFetches.get(videoId);
      }
    }

    const settings = getTranscriptSettings();
    const endpoint = (settings.endpoint || '').trim();
    if (!endpoint) throw new Error('请先配置字幕接口路径。');

    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey && settings.apiKey.trim()) {
      headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
    }

    const timeoutMs = clampTranscriptTimeoutMs(settings.timeoutMs || DEFAULT_TRANSCRIPT_SETTINGS.timeoutMs);
    const timeoutMinutesLabel = transcriptMsToMinutes(timeoutMs);
    const requestBody = buildTranscriptRequestBody(videoId, { videoTitle: opts.videoTitle, videoUrl: opts.videoUrl });
    const fetchPromise = (async () => {
      configData.transcript.isFetching = true;
      configData.transcript.lastVideoId = videoId;
      let timeoutId = null;
      try {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const response = await Promise.race([
          fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal: controller ? controller.signal : undefined
          }),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              const timeoutError = new Error(`字幕接口在 ${timeoutMinutesLabel} 分钟内无响应，已自动取消请求。`);
              timeoutError.name = 'TranscriptTimeoutError';
              if (controller && typeof controller.abort === 'function') {
                try { controller.abort(); } catch {}
              }
              reject(timeoutError);
            }, timeoutMs);
          })
        ]);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        const rawText = await response.text();
        let payload = null;
        if (rawText) {
          try { payload = JSON.parse(rawText); } catch { payload = rawText; }
        }
        if (!response.ok) {
          const detail = (payload && payload.error && payload.error.message) ||
                        (payload && payload.message) ||
                        (typeof rawText === 'string' ? rawText : '') ||
                        `HTTP ${response.status}`;
          throw new Error(detail);
        }
        const transcriptText = extractTranscriptText(payload);
        if (!transcriptText || !transcriptText.trim()) {
          throw new Error('字幕接口未返回有效内容。');
        }
        const normalized = transcriptText.trim();
        const fetchedAt = Date.now();
        transcriptCache.set(videoId, { text: normalized, fetchedAt });
        persistTranscriptForVideo(videoId, normalized);
        configData.transcript.lastTranscript = normalized;
        configData.transcript.lastFetchedAt = fetchedAt;
        setTranscriptError('');
        return normalized;
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        const message = (error && error.message) ? error.message : String(error);
        setTranscriptError(message);
        throw error;
      } finally {
        configData.transcript.isFetching = false;
        transcriptFetches.delete(videoId);
      }
    })();

    transcriptFetches.set(videoId, fetchPromise);
    return fetchPromise;
  }

/* -------------------------------------------------------------------------- *
 * Module 08 · "Last saved" info banner rendering and updates
 * -------------------------------------------------------------------------- */

  // ========== UI: Last save info ==========
  function updateLastSaved(videoProgress) {
    const lastSaveEl = document.querySelector('.last-save-info-text');
    if (lastSaveEl) {
      lastSaveEl.textContent = fancyTimeFormat(videoProgress);
      if (lastSaveEl.dataset) {
        delete lastSaveEl.dataset.i18nKey;
      }
    }
  }

/* -------------------------------------------------------------------------- *
 * Module 09 · Video progress saving, restoration, and migration
 * -------------------------------------------------------------------------- */

  // ========== Save / Load Progress ==========
  function saveVideoProgress() {
    const videoProgress = getVideoCurrentTime();
    const videoId = getVideoId();
    if (!videoId) return;

    const videoName = getVideoName() || DEFAULT_VIDEO_NAME;
    configData.currentVideoId = videoId;
    configData.lastSaveTime = Date.now();
    updateLastSaved(videoProgress);

    const idToStore = `${KEY_PREFIX}${videoId}`;
    const originalTitle = originalTitleCache.get(videoId) || null;
    let previousData = null;
    try {
      const existingRecord = Storage.getItem(idToStore);
      if (existingRecord) {
        previousData = JSON.parse(existingRecord) || {};
      }
    } catch {
      previousData = null;
    }
    const progressData = Object.assign({}, previousData || {}, {
      videoProgress,
      saveDate: Date.now(),
      videoName,
      originalTitle
    });
    try {
      Storage.setItem(idToStore, JSON.stringify(progressData));
      try {
        document.dispatchEvent(new CustomEvent(RECORD_UPDATED_EVENT, { detail: { videoId, videoProgress } }));
      } catch (evtErr) {
        console.error('Failed to dispatch record update event:', evtErr);
      }
    } catch (e) {
      console.error('Failed to save video progress:', e);
    }
  }
  function updateStoredOriginalTitle(videoId, originalTitle) {
    if (!videoId) return;
    const idToStore = `${KEY_PREFIX}${videoId}`;
    const savedVideoData = Storage.getItem(idToStore);
    if (!savedVideoData) return;
    try {
      const parsed = JSON.parse(savedVideoData) || {};
      if (parsed.originalTitle === originalTitle) return;
      parsed.originalTitle = originalTitle || null;
      Storage.setItem(idToStore, JSON.stringify(parsed));
      try { if (typeof setTitleSource === 'function') setTitleSource(videoId, 'original', originalTitle); } catch {}
    } catch (err) {
      console.error('Failed to persist original title:', err);
    }
  }

  function getSavedVideoList() {
    return Storage.listSavedVideos();
  }

  function getSavedVideoProgress() {
    const videoId = getVideoId();
    if (!videoId) return null;
    const idToStore = `${KEY_PREFIX}${videoId}`;
    const savedVideoData = Storage.getItem(idToStore);
    if (!savedVideoData) return null;
    try {
      const { videoProgress } = JSON.parse(savedVideoData);
      return videoProgress;
    } catch { return null; }
  }

  function setSavedProgress() {
    const savedProgress = getSavedVideoProgress();
    if (savedProgress !== null) {
      setVideoProgress(savedProgress);
      configData.savedProgressAlreadySet = true;
    }
  }

  async function onPlayerElementExist(callback) {
    await waitForElm('#movie_player');
    callback();
  }

  function isReadyToSetSavedProgress() {
    return !configData.savedProgressAlreadySet && playerExists() && getSavedVideoProgress() !== null && getVideoDuration() > 0;
  }

/* -------------------------------------------------------------------------- *
 * Module 10 · DOM insertion helpers for host/backdrop/buttons
 * -------------------------------------------------------------------------- */

  // ========== UI: Insert helpers ==========
  function insertInfoElement(element) {
    if (!element) return;
    const leftControls = document.querySelector('.ytp-left-controls');
    if (leftControls && !document.querySelector(SELECTORS.infoContainer)) {
      leftControls.appendChild(element);
    }
  }

  function insertInfoElementInChaptersContainer(element) {
    if (!element) return;
    const chaptersContainer = document.querySelector('.ytp-chapter-container[style=""]');
    if (chaptersContainer && !document.querySelector(SELECTORS.infoContainer)) {
      chaptersContainer.style.display = 'flex';
      chaptersContainer.appendChild(element);
    }
  }

  // Prefer a host within the page, not inside the player
  function getHostRoot() {
    return (
      document.querySelector('ytd-app #content') ||
      document.querySelector('#content') ||
      document.querySelector('#page-manager') ||
      document.body
    );
  }

  // Backdrop to avoid player handling clicks behind the popup
  function ensureBackdrop(host) {
    let bd = document.querySelector('.ysrp-backdrop');
    if (bd) return bd;
    bd = document.createElement('div');
    bd.className = 'ysrp-backdrop';
    Object.assign(bd.style, {
      position: 'fixed',
      inset: '0',
      background: styles.backdrop,
      zIndex: '9998',
      display: 'none'
    });
    host.appendChild(bd);
    return bd;
  }

  // Body scroll lock while settings popup is open
  function lockBodyScroll() {
    if (!document.body.hasAttribute('data-ysrp-body-overflow')) {
      document.body.setAttribute('data-ysrp-body-overflow', document.body.style.overflow || '');
    }
    document.body.style.overflow = 'hidden';
  }
  function unlockBodyScroll() {
    const prev = document.body.getAttribute('data-ysrp-body-overflow');
    if (prev !== null) {
      document.body.style.overflow = prev;
      document.body.removeAttribute('data-ysrp-body-overflow');
    } else {
      document.body.style.overflow = '';
    }
  }

  // Centered popup positioning (fixed in viewport)
  function centerSettingsContainer() {
    const settingsContainer = document.querySelector(SELECTORS.settingsContainer);
    if (!settingsContainer) return;
    Object.assign(settingsContainer.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      margin: '0',
      maxWidth: '90vw',
      maxHeight: '80vh'
    });
  }

  function getSettingsElements() {
    return {
      button: document.querySelector('.ysrp-settings-button'),
      container: document.querySelector(SELECTORS.settingsContainer),
      backdrop: document.querySelector('.ysrp-backdrop')
    };
  }

  // Attach robust, early toggle binding that prevents player jitter
  function bindSettingsToggle() {
    const { button: settingsButton, container: settingsContainer, backdrop } = getSettingsElements();
    if (!settingsButton || !settingsContainer || !backdrop) return;

    centerSettingsContainer();

    // Idempotent
    if (!settingsContainer.style.display) settingsContainer.style.display = 'none';

    const openPopup = () => {
      settingsContainer.style.display = 'flex';
      backdrop.style.display = 'block';
      centerSettingsContainer();
      injectSettingsScrollbarsCSS();
      lockBodyScroll();
    };
    const closePopup = () => {
      settingsContainer.style.display = 'none';
      backdrop.style.display = 'none';
      unlockBodyScroll();
    };

    // Avoid duplicate bindings
    if (!settingsButton._ysrpBound) {
      settingsButton._ysrpBound = true;

      // Use pointerdown in capture phase to preempt player handlers (prevents zoom/jitter)
      const handlerPointerDown = (e) => {
        try {
          e.preventDefault();
          e.stopImmediatePropagation();
          e.stopPropagation();
        } catch {}
        const hidden = (settingsContainer.style.display === 'none' || !settingsContainer.style.display);
        if (hidden) openPopup();
      };
      settingsButton.addEventListener('pointerdown', handlerPointerDown, { capture: true });
      // Also guard click bubbling to player
      settingsButton.addEventListener('click', (e) => {
        try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch {}
      }, { capture: true });
      // Touchstart fallback for some mobile browsers
      settingsButton.addEventListener('touchstart', (e) => {
        try { e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation(); } catch {}
      }, { capture: true, passive: false });
    }

    if (!backdrop._ysrpBound) {
      backdrop._ysrpBound = true;
      backdrop.addEventListener('click', (event) => {
        try {
          event.preventDefault();
          event.stopImmediatePropagation();
          event.stopPropagation();
        } catch {}
      });
    }

    // Expose for programmatic toggles
    settingsContainer._ysrpClose = closePopup;
    settingsContainer._ysrpOpen = openPopup;

    // Keep centered on resize
    if (!window._ysrpResizeBound) {
      window._ysrpResizeBound = true;
      window.addEventListener('resize', centerSettingsContainer);
    }
  }

/* -------------------------------------------------------------------------- *
 * Module 11 · Settings panel UI, tabs, and event bindings
 * -------------------------------------------------------------------------- */

  // ========== UI: Settings Panel (with sub-tabs) ==========
  const PLACEHOLDER_DEARROW = new Set([
    DEFAULT_VIDEO_NAME.toLowerCase(),
    (TITLE_PENDING_PLACEHOLDER || '').toLowerCase()
  ]);
  const LANGUAGE_EVENT_NAME = (typeof I18n !== 'undefined' && I18n && typeof I18n.getEventName === 'function')
    ? I18n.getEventName()
    : 'ysrp-language-changed';

  const SETTINGS_TABS = Object.freeze({
    records: 'records',
    storage: 'storage',
    transcript: 'transcript',
    display: 'display'
  });

  function localizeText(enValue, zhValue, params) {
    if (typeof I18n !== 'undefined' && I18n && typeof I18n.pick === 'function') {
      return I18n.pick({ en: enValue, zh: zhValue }, params);
    }
    const fallback = typeof enValue !== 'undefined' ? enValue : zhValue;
    if (typeof fallback === 'function') {
      try {
        return fallback(params || {});
      } catch {
        return '';
      }
    }
    return typeof fallback === 'string' ? fallback : '';
  }

  function getNoteEmptyPlaceholder() {
    return localizeText('No notes yet', '暂无笔记');
  }

  function getLanguageStateSnapshot() {
    const state = configData.language || {};
    const preference = (state.preference ||
      (typeof I18n !== 'undefined' && I18n && typeof I18n.getPreference === 'function' ? I18n.getPreference() : null) ||
      'auto');
    const resolved = (state.resolved ||
      (typeof I18n !== 'undefined' && I18n && typeof I18n.getResolvedLanguage === 'function' ? I18n.getResolvedLanguage() : null) ||
      'en');
    const browser = (typeof I18n !== 'undefined' && I18n && typeof I18n.detectBrowserLanguage === 'function')
      ? I18n.detectBrowserLanguage()
      : 'en';
    return { preference, resolved, browser };
  }

  const LANGUAGE_OPTION_PRESETS = Object.freeze({
    auto: {
      label: () => localizeText('Auto', '自动'),
      hint: () => localizeText('Match the browser language automatically.', '自动跟随浏览器语言。'),
      badge: () => localizeText('Auto', '自动')
    },
    zh: {
      label: '中文',
      hint: '始终使用简体中文。',
      badge: '中文'
    },
    en: {
      label: 'English',
      hint: 'Always use English.',
      badge: 'English'
    }
  });

  function resolveLanguageOptionText(value, key) {
    const entry = LANGUAGE_OPTION_PRESETS[value];
    if (!entry) return '';
    const val = entry[key];
    if (typeof val === 'function') {
      try { return val(); } catch { return ''; }
    }
    return typeof val === 'string' ? val : '';
  }

  function getLanguageOptionLabel(value) {
    const label = resolveLanguageOptionText(value, 'label');
    if (label) return label;
    return localizeText('Auto', '自动');
  }

  function getLanguageOptionHint(value) {
    const hint = resolveLanguageOptionText(value, 'hint');
    if (hint) return hint;
    return localizeText('Match the browser language automatically.', '自动跟随浏览器语言。');
  }

  function getLanguageBadgeLabel(value) {
    const badge = resolveLanguageOptionText(value, 'badge');
    if (badge) return badge;
    return getLanguageOptionLabel(value);
  }

  function getLanguageDisplayName(code) {
    if (code === 'zh') return '中文';
    return 'English';
  }

  function isPlaceholderDeArrowTitle(text) {
    if (!text) return true;
    return PLACEHOLDER_DEARROW.has(text.trim().toLowerCase());
  }

  function areSameTitle(a, b) {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  const dearrowAvailabilityCache = new Map(); // videoId -> { status: 'available'|'missing', title?: string }
  const pendingDeArrowLookups = new Map();
  let currentVideoStatusListener = null;
  let recordUpdatedListener = null;
  let dearrowTitleReadyListener = null;
  let lastRenderedVideoId = null;
  let isRebuildingRecords = false;

  function fetchDeArrowTitleOnce(videoId) {
    if (!videoId) return Promise.resolve(null);
    if (pendingDeArrowLookups.has(videoId)) {
      return pendingDeArrowLookups.get(videoId);
    }
    const promise = requestDeArrowTitle(videoId, { force: true })
      .finally(() => {
        pendingDeArrowLookups.delete(videoId);
      });
    pendingDeArrowLookups.set(videoId, promise);
    return promise;
  }

  const pendingOriginalTitleGuarantees = new Map();
  const transcriptVisibilityState = new Map(); // videoId -> true when transcript section is expanded

  function queueDearrowRetry(videoId) {
    if (!videoId) return;
    dearrowAvailabilityCache.delete(videoId);
    if (typeof scheduleDeArrowRetry === 'function') {
      scheduleDeArrowRetry(videoId);
    }
  }

  function ensureOriginalTitleStoredBeforeDearrow(videoId) {
    if (!videoId) return null;
    if (pendingOriginalTitleGuarantees.has(videoId)) {
      return pendingOriginalTitleGuarantees.get(videoId);
    }
    const promise = (async () => {
      const storageKey = `${KEY_PREFIX}${videoId}`;
      const saved = Storage.getItem(storageKey);
      if (!saved) return;
      let parsed;
      try {
        parsed = JSON.parse(saved) || {};
      } catch {
        return;
      }
      const originalAlreadyPresent = typeof parsed.originalTitle === 'string' && Boolean(parsed.originalTitle.trim());
      if (originalAlreadyPresent) return;
      try {
        const original = await getOriginalTitle(videoId);
        if (original) updateStoredOriginalTitle(videoId, original);
      } catch (err) {
        console.error('Failed to ensure original title before DeArrow:', err);
      }
    })().finally(() => {
      pendingOriginalTitleGuarantees.delete(videoId);
    });
    pendingOriginalTitleGuarantees.set(videoId, promise);
    return promise;
  }

  function persistRecordDeArrowTitle(videoId, title) {
    if (!videoId || !title) return;
    const storageKey = `${KEY_PREFIX}${videoId}`;
    const commitDearrowTitle = () => {
      const saved = Storage.getItem(storageKey);
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved) || {};
        const originalTitle = typeof parsed.originalTitle === 'string' ? parsed.originalTitle : null;
        if (originalTitle && areSameTitle(originalTitle, title)) {
          queueDearrowRetry(videoId);
          return;
        }
        if (parsed.videoName === title) return;
        parsed.videoName = title;
        Storage.setItem(storageKey, JSON.stringify(parsed));
      } catch (err) {
        console.error('Failed to persist DeArrow title to storage:', err);
      }
    };
    const pendingOriginal = ensureOriginalTitleStoredBeforeDearrow(videoId);
    if (pendingOriginal && typeof pendingOriginal.then === 'function') {
      pendingOriginal.then(() => commitDearrowTitle()).catch(() => commitDearrowTitle());
    } else {
      commitDearrowTitle();
    }
  }

  function normalizeDisplayTitle(text) {
    if (typeof text !== 'string') return '';
    return typeof normalizeTitleText === 'function'
      ? normalizeTitleText(text)
      : String(text).replace(/\s+/g, ' ').trim();
  }

  function resolveRecordTitle(videoId, fallbackTitle) {
    const fallback = normalizeDisplayTitle(fallbackTitle) || DEFAULT_VIDEO_NAME;
    if (!videoId) {
      return { title: fallback, source: 'fallback', type: 'fallback' };
    }
    if (typeof configData.resolveEffectiveTitle === 'function') {
      try {
        const resolved = configData.resolveEffectiveTitle(videoId, fallback);
        if (resolved && typeof resolved === 'object') {
          const normalized = normalizeDisplayTitle(resolved.title) || fallback;
          return {
            title: normalized,
            source: resolved.source || 'fallback',
            type: resolved.type || resolved.source || 'fallback'
          };
        }
      } catch (err) {
        console.error('Shared resolver failed:', err);
      }
    }
    return { title: fallback, source: 'fallback', type: 'fallback' };
  }


  function injectSettingsScrollbarsCSS() {
    if (document.getElementById('ysrp-scrollbar-style')) return;
    const containerSelector = SELECTORS.settingsContainer;
    const css = `
      ${containerSelector},
      ${containerSelector} * {
        scrollbar-width: thin;
        scrollbar-color: ${styles.scrollbarThumb} ${styles.scrollbarTrack};
      }
      ${containerSelector} ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      ${containerSelector} ::-webkit-scrollbar-track {
        background: ${styles.scrollbarTrack};
        border-radius: 8px;
      }
      ${containerSelector} ::-webkit-scrollbar-thumb {
        background-color: ${styles.scrollbarThumb};
        border-radius: 8px;
        border: 2px solid ${styles.scrollbarTrack};
      }
      ${containerSelector} ::-webkit-scrollbar-thumb:hover {
        background-color: ${styles.scrollbarThumbHover};
      }
      ${containerSelector} ::-webkit-scrollbar-corner {
        background: ${styles.scrollbarCorner};
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'ysrp-scrollbar-style';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function createSettingsUI(options) {
    const opts = Object.assign({ defaultTab: SETTINGS_TABS.records }, options || {});
    const savedVideos = getSavedVideoList();
    const videosCount = savedVideos.length;

    const existingSettingsContainer = document.querySelector(SELECTORS.settingsContainer);
    if (existingSettingsContainer) return; // Prevent duplicate settings containers

    const infoElContainer = document.querySelector(SELECTORS.infoContainer);
    if (!infoElContainer) return;

    const hostRoot = getHostRoot();
    const backdrop = ensureBackdrop(hostRoot);

    const settingsContainer = document.createElement('div');
    settingsContainer.classList.add(CLASS_NAMES.settingsContainer);

    const LARGE_FORM_CONTROL_MAX_WIDTH = '48rem';

    // Header
    const settingsContainerHeader = document.createElement('div');
    settingsContainerHeader.style.display = 'flex';
    settingsContainerHeader.style.justifyContent = 'space-between';
    settingsContainerHeader.style.alignItems = 'center';

    const headerLeft = document.createElement('div');
    headerLeft.style.display = 'flex';
    headerLeft.style.alignItems = 'center';
    headerLeft.style.gap = '0.5rem';

    const settingsContainerHeaderTitle = document.createElement('h3');
    function renderSavedVideosTitle(countValue) {
      settingsContainerHeaderTitle.textContent = localizeText(
        'Saved Videos - ({count})',
        '已保存视频 - ({count})',
        { count: countValue }
      );
    }
    renderSavedVideosTitle(videosCount);
    settingsContainerHeaderTitle.style.color = styles.color;
    settingsContainerHeaderTitle.style.margin = '0';

    const modeBadge = document.createElement('span');
    modeBadge.textContent = Storage.getMode() === 'gm'
      ? localizeText('GM Storage', 'GM 存储')
      : localizeText('localStorage', '浏览器本地存储');
    Object.assign(modeBadge.style, {
      fontSize: '0.8rem',
      padding: '0.15rem 0.5rem',
      borderRadius: '0.5rem',
      background: styles.badgeBg,
      color: styles.badgeText
    });

    headerLeft.appendChild(settingsContainerHeaderTitle);
    headerLeft.appendChild(modeBadge);

    const headerRight = document.createElement('div');
    Object.assign(headerRight.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.35rem'
    });

    const refreshStatusIndicator = document.createElement('span');
    Object.assign(refreshStatusIndicator.style, {
      display: 'none',
      borderRadius: '999px',
      padding: '0.15rem',
      background: styles.recordBackground,
      border: styles.border
    });
    refreshStatusIndicator.title = localizeText('Refreshing…', '正在更新列表…');
    const refreshStatusIcon = createIcon('refresh', styles.tabInactive);
    refreshStatusIcon.style.fontSize = '1rem';
    refreshStatusIndicator.appendChild(refreshStatusIcon);

    const settingsContainerCloseButton = document.createElement('button');
    settingsContainerCloseButton.textContent = '✖';
    settingsContainerCloseButton.style.background = 'transparent';
    settingsContainerCloseButton.style.border = 'none';
    settingsContainerCloseButton.style.color = styles.color;
    settingsContainerCloseButton.style.cursor = 'pointer';
    settingsContainerCloseButton.style.fontSize = '1.2rem';
    settingsContainerCloseButton.addEventListener('click', () => {
      settingsContainer.style.display = 'none';
      backdrop.style.display = 'none';
      unlockBodyScroll();
    });

    headerRight.appendChild(refreshStatusIndicator);
    headerRight.appendChild(settingsContainerCloseButton);

    settingsContainerHeader.appendChild(headerLeft);
    settingsContainerHeader.appendChild(headerRight);

    function setRefreshIndicatorActive(active) {
      if (!refreshStatusIndicator || !refreshStatusIcon) return;
      refreshStatusIndicator.style.display = active ? 'inline-flex' : 'none';
      refreshStatusIcon.style.color = active ? styles.tabActive : styles.tabInactive;
      refreshStatusIcon.classList.toggle('fa-spin', active);
    }

    // Tabs
    const tabsBar = document.createElement('div');
    tabsBar.style.display = 'flex';
    tabsBar.style.gap = '1rem';
    tabsBar.style.marginTop = '0.75rem';
    tabsBar.style.borderBottom = styles.border;
    tabsBar.style.paddingBottom = '0.25rem';

    function makeTab(id, label, iconName) {
      const btn = document.createElement('button');
      btn.style.background = 'transparent';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '0.5rem';
      btn.style.padding = '0.25rem 0.75rem';
      btn.style.color = styles.tabInactive;
      btn.style.fontWeight = '700';
      btn.style.fontSize = '1.6rem';
      const ic = createIcon(iconName, styles.tabInactive);
      if (ic) ic.style.fontSize = '1.6rem';
      const span = document.createElement('span');
      span.textContent = label;
      btn.appendChild(ic);
      btn.appendChild(span);
      btn._icon = ic;
      btn.dataset.tabId = id;
      return btn;
    }

    const tabRecords = makeTab(SETTINGS_TABS.records, localizeText('Records', '记录'), 'database');
    const tabPrefs = makeTab(SETTINGS_TABS.storage, localizeText('Storage', '存储'), 'gear');
    const tabTranscript = makeTab(SETTINGS_TABS.transcript, localizeText('Transcript', '字幕'), 'captions');
    const tabDisplay = makeTab(SETTINGS_TABS.display,
      (typeof I18n !== 'undefined' && I18n && typeof I18n.t === 'function')
        ? I18n.t('language.tabLabel', null, localizeText('Display', '界面'))
        : localizeText('Display', '界面'),
      'globe'
    );
    let displayContainer = null;

    tabsBar.appendChild(tabRecords);
    tabsBar.appendChild(tabPrefs);
    tabsBar.appendChild(tabTranscript);
    tabsBar.appendChild(tabDisplay);

    function setActiveTab(tab) {
      [tabRecords, tabPrefs, tabTranscript, tabDisplay].forEach(b => {
        const active = (b === tab);
        b.style.color = active ? styles.tabActive : styles.tabInactive;
        if (b._icon) b._icon.style.color = active ? styles.tabActive : styles.tabInactive;
      });
      const activeTabId = tab && tab.dataset ? tab.dataset.tabId : SETTINGS_TABS.records;
      settingsContainer.dataset.activeTab = activeTabId;
      recordsContainer.style.display = activeTabId === SETTINGS_TABS.records ? 'flex' : 'none';
      prefsContainer.style.display = activeTabId === SETTINGS_TABS.storage ? 'flex' : 'none';
      transcriptContainer.style.display = activeTabId === SETTINGS_TABS.transcript ? 'flex' : 'none';
      displayContainer.style.display = activeTabId === SETTINGS_TABS.display ? 'flex' : 'none';
    }

    // Body root
    const settingsContainerBody = document.createElement('div');
    settingsContainerBody.classList.add(CLASS_NAMES.settingsContainerBody);
    Object.assign(settingsContainerBody.style, {
      display: 'flex',
      flexDirection: 'column',
      flex: '1',
      minHeight: '0',
      overflow: 'hidden',
      marginTop: '0.75rem'
    });

    // Records container
    const recordsContainer = document.createElement('div');
    Object.assign(recordsContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      overflow: 'hidden'
    });

    const listViewport = document.createElement('div');
    Object.assign(listViewport.style, {
      display: 'flex',
      minHeight: '0',
      overflowY: 'auto',
      marginTop: '0.5rem',
      WebkitOverflowScrolling: 'touch'
    });

    const PROGRESS_CLASS = 'ysrp-record-progress';
    const videosList = document.createElement('ul');
    Object.assign(videosList.style, {
      display: 'flex',
      flexDirection: 'column',
      rowGap: '1rem',
      listStyle: 'none',
      padding: '0',
      margin: '0',
      width: '100%'
    });

    function updateRecordProgressDisplay(videoId, overrideProgressSeconds) {
      if (!videoId) return;
      const node = videosList.querySelector(`[data-video-id="${videoId}"]`);
      if (!node) return;
      const progressEl = node.querySelector(`.${PROGRESS_CLASS}`);
      if (!progressEl) return;
      let percentageText = '0%';
      const useOverride = typeof overrideProgressSeconds === 'number' && videoId === getVideoId();
      if (useOverride) {
        const totalDuration = getVideoDuration();
        if (totalDuration > 0) {
          const pct = ((overrideProgressSeconds / totalDuration) * 100).toFixed(1);
          percentageText = `${pct}%`;
        } else {
          percentageText = `${getProgressPercentage(videoId)}%`;
        }
      } else {
        percentageText = `${getProgressPercentage(videoId)}%`;
      }
      progressEl.textContent = percentageText;
    }

    function getProgressPercentage(videoId) {
      const idToStore = `${KEY_PREFIX}${videoId}`;
      const savedVideoData = Storage.getItem(idToStore);
      if (!savedVideoData) return 0;
      try {
        const { videoProgress } = JSON.parse(savedVideoData);
        const totalDuration = getVideoDuration();
        if (totalDuration === 0) return 0;
        const percentage = ((videoProgress / totalDuration) * 100).toFixed(1);
        return percentage;
      } catch { return 0; }
    }

    function handleDearrowTitleEvent(event) {
      if (!event || !event.detail) return;
      const { videoId, title } = event.detail;
      if (!videoId || !title) return;
      const normalized = normalizeDisplayTitle(title);
      if (!normalized || isPlaceholderDeArrowTitle(normalized)) return;
      dearrowAvailabilityCache.set(videoId, { status: 'available', title: normalized });
      persistRecordDeArrowTitle(videoId, normalized);
      if (!isRebuildingRecords) {
        rebuildRecords();
      }
    }

    function rebuildRecords() {
      if (isRebuildingRecords) return;
      isRebuildingRecords = true;
      try {
        setRefreshIndicatorActive(true);
        while (videosList.firstChild) videosList.removeChild(videosList.firstChild);
        const all = getSavedVideoList();
        renderSavedVideosTitle(all.length);

        const currentVideoId = getVideoId();
        lastRenderedVideoId = currentVideoId || null;
        const currentRecords = [];
        const otherRecords = [];

      function createRecordEntry(key, value) {
        try {
          const parsedData = JSON.parse(value) || {};
          const videoName = parsedData.videoName;
          const videoProgress = parsedData.videoProgress;
          const storedOriginalTitle = parsedData.originalTitle;
          const storedNoteValue = typeof parsedData.videoNote === 'string' ? parsedData.videoNote : '';
          const progress = videoProgress || 0;
          const videoId = key.split(KEY_PREFIX)[1];
          let currentNoteValue = storedNoteValue;
          let isEditingNote = false;
          let noteTextarea = null;
          let noteVisible = false;

          const videoEl = document.createElement('li');
          Object.assign(videoEl.style, {
            display: 'flex',
            flexDirection: 'column',
            background: styles.recordBackground,
            padding: '0.5rem',
            borderRadius: '0.5rem',
            color: styles.color
          });
          videoEl.dataset.videoId = videoId;

          const videoElTop = document.createElement('div');
          Object.assign(videoElTop.style, {
            display: 'flex',
            alignItems: 'center'
          });

          const progressEl = document.createElement('span');
          const percentage = getProgressPercentage(videoId);
          progressEl.textContent = `${percentage}%`;
          progressEl.classList.add(PROGRESS_CLASS);
          Object.assign(progressEl.style, {
            marginRight: '0.5rem',
            color: styles.progressTextColor,
            minWidth: '40px',
            textAlign: 'right'
          });

          const videoElText = document.createElement('span');
          videoElText.classList.add('ysrp-record-title');
          videoElText.style.flex = '1';
          videoElText.style.wordBreak = 'break-word';

          const normalizedSavedName = normalizeDisplayTitle(videoName);
          let originalTitleValue = typeof storedOriginalTitle === 'string' && storedOriginalTitle.trim() ? storedOriginalTitle.trim() : undefined;

          const resolvedTitleInfo = resolveRecordTitle(
            videoId,
            normalizedSavedName || originalTitleValue || DEFAULT_VIDEO_NAME
          );
          videoElText.textContent = resolvedTitleInfo.title;

          const availabilityEntry = dearrowAvailabilityCache.get(videoId);
          let storedHasDeArrow = Boolean(normalizedSavedName) && !isPlaceholderDeArrowTitle(normalizedSavedName);
          if (storedHasDeArrow && originalTitleValue && areSameTitle(normalizedSavedName, originalTitleValue)) {
            storedHasDeArrow = false;
            queueDearrowRetry(videoId);
          }

          const titleSourcesMap = configData.titleSources;
          const runtimeSourceEntry = titleSourcesMap && typeof titleSourcesMap.get === 'function'
            ? titleSourcesMap.get(videoId)
            : null;

          let dearrowTitle = null;
          if (runtimeSourceEntry && runtimeSourceEntry.dearrow) {
            dearrowTitle = runtimeSourceEntry.dearrow;
          } else if (resolvedTitleInfo.type === 'dearrow') {
            dearrowTitle = resolvedTitleInfo.title;
          } else if (availabilityEntry && availabilityEntry.status === 'available' && availabilityEntry.title) {
            dearrowTitle = availabilityEntry.title;
          } else if (storedHasDeArrow) {
            dearrowTitle = normalizedSavedName;
          }

          if (dearrowTitle) {
            const cachedEntry = dearrowAvailabilityCache.get(videoId);
            if (!cachedEntry || cachedEntry.status !== 'available' || cachedEntry.title !== dearrowTitle) {
              dearrowAvailabilityCache.set(videoId, { status: 'available', title: dearrowTitle });
            }
          }

          if (dearrowTitle && originalTitleValue && areSameTitle(dearrowTitle, originalTitleValue)) {
            queueDearrowRetry(videoId);
            dearrowTitle = null;
          }

          const latestAvailability = dearrowAvailabilityCache.get(videoId);
          let confirmedNoDeArrow = Boolean(latestAvailability && latestAvailability.status === 'missing');
          let showingOriginalTitle = !dearrowTitle;
          const loadingOriginalPlaceholder = localizeText('Loading original title…', '正在获取原标题…');
          const missingOriginalPlaceholder = localizeText('Original title unavailable', '未找到原标题');
          let dearrowToggleButton = null;

          if (!confirmedNoDeArrow) {
            dearrowToggleButton = document.createElement('button');
            Object.assign(dearrowToggleButton.style, {
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginRight: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '2.4rem',
              height: '2.4rem',
              borderRadius: '0.6rem',
              padding: '0.25rem'
            });
            const dearrowIcon = createDeArrowIcon(26);
            dearrowToggleButton.appendChild(dearrowIcon);
          } else {
            videoElText.textContent = originalTitleValue || loadingOriginalPlaceholder;
          }

          function updateToggleTooltip() {
            if (!dearrowToggleButton) return;
            if (dearrowToggleButton.dataset.state === 'pending') {
              dearrowToggleButton.title = localizeText('Checking DeArrow title…', '正在检测 DeArrow 标题…');
              return;
            }
            dearrowToggleButton.title = showingOriginalTitle
              ? localizeText('Show DeArrow title', '恢复 DeArrow 标题')
              : localizeText('Show original title', '显示原标题');
          }

          function setButtonPending() {
            if (!dearrowToggleButton) return;
            dearrowToggleButton.dataset.state = 'pending';
            dearrowToggleButton.disabled = true;
            dearrowToggleButton.style.filter = 'grayscale(1)';
            dearrowToggleButton.style.opacity = '0.4';
            updateToggleTooltip();
          }

          function setButtonReady() {
            if (!dearrowToggleButton) return;
            dearrowToggleButton.dataset.state = 'ready';
            dearrowToggleButton.disabled = false;
            updateToggleTooltip();
          }

          function removeDearrowButton() {
            if (!dearrowToggleButton) return;
            dearrowToggleButton.remove();
            dearrowToggleButton = null;
          }

          function showDeArrowTitle() {
            if (!dearrowTitle) return;
            showingOriginalTitle = false;
            videoElText.textContent = dearrowTitle;
            if (dearrowToggleButton) {
              dearrowToggleButton.style.filter = '';
              dearrowToggleButton.style.opacity = '';
              setButtonReady();
            }
          }

          function showOriginalTitle(text) {
            showingOriginalTitle = true;
            videoElText.textContent = text || originalTitleValue || missingOriginalPlaceholder;
            if (dearrowToggleButton && dearrowToggleButton.dataset.state === 'ready') {
              dearrowToggleButton.style.filter = 'grayscale(1)';
              dearrowToggleButton.style.opacity = '0.6';
              updateToggleTooltip();
            }
          }

          if (dearrowToggleButton) {
            if (dearrowTitle) {
              showDeArrowTitle();
            } else {
              videoElText.textContent = originalTitleValue || loadingOriginalPlaceholder;
              setButtonPending();
            }
          }

          const needsDearrowLookup = !dearrowTitle && !confirmedNoDeArrow && Boolean(dearrowToggleButton);
          if (needsDearrowLookup) {
            fetchDeArrowTitleOnce(videoId)
              .then(title => {
                if (!title) {
                  confirmedNoDeArrow = true;
                  dearrowAvailabilityCache.set(videoId, { status: 'missing' });
                  removeDearrowButton();
                  if (!originalTitleValue) {
                    videoElText.textContent = missingOriginalPlaceholder;
                  }
                  return;
                }
                dearrowTitle = String(title).trim();
                dearrowAvailabilityCache.set(videoId, { status: 'available', title: dearrowTitle });
                persistRecordDeArrowTitle(videoId, dearrowTitle);
                showDeArrowTitle();
              })
              .catch(err => {
                console.error('Failed to load DeArrow title for records list:', err);
                setButtonPending();
              });
          }

          if (dearrowToggleButton) {
            dearrowToggleButton.addEventListener('click', async () => {
              if (dearrowToggleButton.dataset.state !== 'ready') return;
              if (dearrowToggleButton.dataset.loading === 'true') return;
              if (!showingOriginalTitle) {
                if (typeof originalTitleValue === 'string' && originalTitleValue) {
                  showOriginalTitle(originalTitleValue);
                  return;
                }
                dearrowToggleButton.dataset.loading = 'true';
                const previousText = videoElText.textContent;
                videoElText.textContent = loadingOriginalPlaceholder;
                try {
                  const fetched = await getOriginalTitle(videoId);
                  originalTitleValue = fetched || undefined;
                  if (fetched) updateStoredOriginalTitle(videoId, fetched);
                  showOriginalTitle(fetched);
                } catch (err) {
                  console.error('Failed to load original title:', err);
                  videoElText.textContent = previousText;
                } finally {
                  dearrowToggleButton.dataset.loading = 'false';
                  updateToggleTooltip();
                }
              } else {
                showDeArrowTitle();
              }
            });

            updateToggleTooltip();
          }

          const urlButton = document.createElement('button');
          urlButton.style.background = 'transparent';
          urlButton.style.border = 'none';
          urlButton.style.cursor = 'pointer';
          urlButton.style.marginRight = '0.5rem';
          urlButton.style.display = 'flex';
          urlButton.style.alignItems = 'center';
          urlButton.style.justifyContent = 'center';
          urlButton.style.width = '2rem';
          urlButton.style.height = '2rem';
          urlButton.style.borderRadius = '0.5rem';
          urlButton.title = localizeText('Show / hide URL', '显示/隐藏 URL');
          const linkIcon = createIcon('link', styles.linkButtonColor);
          urlButton.appendChild(linkIcon);

          const noteButton = document.createElement('button');
          noteButton.style.background = 'transparent';
          noteButton.style.border = 'none';
          noteButton.style.cursor = 'pointer';
          noteButton.style.marginRight = '0.5rem';
          noteButton.style.display = 'flex';
          noteButton.style.alignItems = 'center';
          noteButton.style.justifyContent = 'center';
          noteButton.style.width = '2rem';
          noteButton.style.height = '2rem';
          noteButton.style.borderRadius = '0.5rem';
          noteButton.title = localizeText('Show notes', '显示笔记');
          const noteIcon = createIcon('note', styles.editButtonColor);
          noteButton.appendChild(noteIcon);

          const transcriptButton = document.createElement('button');
          transcriptButton.style.background = 'transparent';
          transcriptButton.style.border = 'none';
          transcriptButton.style.cursor = 'pointer';
          transcriptButton.style.marginRight = '0.5rem';
          transcriptButton.style.display = 'flex';
          transcriptButton.style.alignItems = 'center';
          transcriptButton.style.justifyContent = 'center';
          transcriptButton.style.width = '2rem';
          transcriptButton.style.height = '2rem';
          transcriptButton.style.borderRadius = '0.5rem';
          transcriptButton.title = localizeText('Show transcript', '获取字幕');
          const transcriptIcon = createIcon('captions', styles.tabActive);
          transcriptButton.appendChild(transcriptIcon);

          if (!originalTitleValue) {
            getOriginalTitle(videoId)
              .then(title => {
                originalTitleValue = title || undefined;
                if (title) updateStoredOriginalTitle(videoId, title);
                if (showingOriginalTitle) {
                  videoElText.textContent = originalTitleValue || missingOriginalPlaceholder;
                }
              })
              .catch(err => {
                console.error('Failed to load original title:', err);
                if (showingOriginalTitle && !originalTitleValue) {
                  videoElText.textContent = missingOriginalPlaceholder;
                }
              });
          }

          const deleteButton = document.createElement('button');
          deleteButton.style.background = styles.buttonBackground;
          deleteButton.style.border = styles.buttonBorder;
          deleteButton.style.borderRadius = '0.5rem';
          deleteButton.style.cursor = 'pointer';
          deleteButton.style.display = 'flex';
          deleteButton.style.alignItems = 'center';
          deleteButton.style.justifyContent = 'center';
          deleteButton.style.width = '2rem';
          deleteButton.style.height = '2rem';
          deleteButton.title = localizeText('Delete record', '删除保存记录');
          const trashIcon = createIcon('trash', styles.deleteButtonColor);
          deleteButton.appendChild(trashIcon);

          videoElTop.appendChild(progressEl);
          videoElTop.appendChild(videoElText);
          if (dearrowToggleButton) {
            videoElTop.appendChild(dearrowToggleButton);
          }
          videoElTop.appendChild(transcriptButton);
          videoElTop.appendChild(noteButton);
          videoElTop.appendChild(urlButton);
          videoElTop.appendChild(deleteButton);
          videoEl.appendChild(videoElTop);

          const urlDisplay = document.createElement('div');
          const videoURL = `https://www.youtube.com/watch?v=${videoId}`;
          urlDisplay.textContent = localizeText('URL: {url}', '链接：{url}', { url: videoURL });
          Object.assign(urlDisplay.style, {
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: styles.urlBackground,
            color: styles.urlTextColor,
            borderRadius: '0.5rem',
            display: 'none',
            wordBreak: 'break-word',
            position: 'relative',
            alignItems: 'center',
            gap: '0.25rem'
          });

          const copySuccessTip = document.createElement('span');
          copySuccessTip.textContent = localizeText('Copied', '已复制');
          Object.assign(copySuccessTip.style, {
            position: 'absolute',
            top: '50%',
            right: '1rem',
            transform: 'translateY(-50%)',
            background: styles.copySuccessBackground,
            color: styles.copySuccessTextColor,
            padding: '0.2rem 0.5rem',
            borderRadius: '0.3rem',
            fontSize: '0.8rem',
            opacity: '0',
            transition: 'opacity 0.3s ease',
            pointerEvents: 'none'
          });
          urlDisplay.appendChild(copySuccessTip);

          const copyButton = document.createElement('button');
          copyButton.style.background = 'transparent';
          copyButton.style.border = 'none';
          copyButton.style.cursor = 'pointer';
          copyButton.style.marginLeft = '0.5rem';
          copyButton.style.display = 'flex';
          copyButton.style.alignItems = 'center';
          copyButton.style.justifyContent = 'center';
          copyButton.style.width = '1.5rem';
          copyButton.style.height = '1.5rem';
          copyButton.style.borderRadius = '0.3rem';
          copyButton.title = localizeText('Copy URL', '复制 URL');
          const copyIcon = createIcon('copy', styles.copyButtonColor);
          copyButton.appendChild(copyIcon);

          const openButton = document.createElement('button');
          openButton.style.background = 'transparent';
          openButton.style.border = 'none';
          openButton.style.cursor = 'pointer';
          openButton.style.marginLeft = '0.3rem';
          openButton.style.display = 'flex';
          openButton.style.alignItems = 'center';
          openButton.style.justifyContent = 'center';
          openButton.style.width = '1.5rem';
          openButton.style.height = '1.5rem';
          openButton.style.borderRadius = '0.3rem';
          openButton.title = localizeText('Open in new tab', '在新标签页中打开 URL');
          const openIcon = createIcon('open', styles.openButtonColor);
          openButton.appendChild(openIcon);

          urlDisplay.appendChild(copyButton);
          urlDisplay.appendChild(openButton);
          videoEl.appendChild(urlDisplay);

          const transcriptContainer = document.createElement('div');
          transcriptContainer.classList.add('ysrp-transcript-container');
          Object.assign(transcriptContainer.style, {
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: styles.urlBackground,
            color: styles.color,
            borderRadius: '0.5rem',
            display: 'none',
            flexDirection: 'column',
            gap: '0.35rem'
          });

          const transcriptHeader = document.createElement('div');
          Object.assign(transcriptHeader.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexWrap: 'wrap'
          });

          const transcriptLabelGroup = document.createElement('div');
          Object.assign(transcriptLabelGroup.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            flexWrap: 'wrap',
            minWidth: 0
          });
          const transcriptLabel = document.createElement('strong');
          transcriptLabel.textContent = localizeText('Transcript', '字幕');
          transcriptLabel.style.fontSize = '1rem';
          transcriptLabel.style.fontWeight = '600';
          transcriptLabel.style.color = styles.subtleText;
          transcriptLabelGroup.appendChild(transcriptLabel);

          const transcriptStatusText = document.createElement('span');
          Object.assign(transcriptStatusText.style, {
            fontSize: '0.85rem',
            color: styles.tabActive || styles.subtleText,
            opacity: '0.85',
            display: 'none',
            whiteSpace: 'nowrap'
          });
          transcriptLabelGroup.appendChild(transcriptStatusText);

          const transcriptHeaderRight = document.createElement('div');
          Object.assign(transcriptHeaderRight.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          });

          function makeTranscriptActionButton(titleText, iconName, iconColor) {
            const btn = document.createElement('button');
            Object.assign(btn.style, {
              background: 'transparent',
              border: styles.buttonBorder,
              borderRadius: '0.4rem',
              cursor: 'pointer',
              padding: '0.25rem 0.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            });
            btn.title = titleText;
            btn.appendChild(createIcon(iconName, iconColor));
            return btn;
          }

          const transcriptRefreshButton = makeTranscriptActionButton(
            localizeText('Refresh transcript', '刷新字幕'),
            'refresh',
            styles.tabInactive
          );
          const transcriptCopyButton = makeTranscriptActionButton(
            localizeText('Copy transcript', '复制字幕'),
            'copy',
            styles.copyButtonColor
          );
          transcriptCopyButton.disabled = true;
          transcriptHeaderRight.appendChild(transcriptRefreshButton);
          transcriptHeaderRight.appendChild(transcriptCopyButton);
          transcriptHeader.appendChild(transcriptLabelGroup);
          transcriptHeader.appendChild(transcriptHeaderRight);

    const transcriptOutput = document.createElement('textarea');
    Object.assign(transcriptOutput.style, {
      width: '100%',
      minHeight: '6rem',
      border: `1px solid ${styles.inputBorder}`,
      background: styles.inputBg,
      borderRadius: '0.3rem',
      padding: '0.4rem',
      fontFamily: 'monospace',
      fontSize: '1.05rem',
      lineHeight: '1.4',
      color: styles.color,
      resize: 'vertical',
      boxSizing: 'border-box'
    });
    transcriptOutput.readOnly = true;
    transcriptOutput.placeholder = localizeText('Transcript will appear here…', '字幕内容加载后会显示在这里…');
    const transcriptPlaceholderDefault = transcriptOutput.placeholder;
    applyFocusRing(transcriptOutput);

          transcriptContainer.appendChild(transcriptHeader);
          transcriptContainer.appendChild(transcriptOutput);
          videoEl.appendChild(transcriptContainer);

          let transcriptVisible = false;
          let transcriptLoading = false;
          let transcriptValue = '';
          const shouldRestoreTranscript = transcriptVisibilityState.has(videoId);

          const cachedTranscript = typeof getCachedTranscript === 'function' ? getCachedTranscript(videoId) : '';
          if (cachedTranscript) {
            transcriptValue = cachedTranscript;
            transcriptOutput.value = transcriptValue;
            transcriptCopyButton.disabled = false;
            transcriptContainer.dataset.loaded = 'true';
            setTranscriptStatus(localizeText('Transcript loaded from cache.', '字幕来自缓存。'));
          }

          function normalizeTranscriptStatusMessage(rawText) {
            if (!rawText) return '';
            return rawText
              .replace(/^\s*(?:字幕|transcript)(?:[:：]\s*)?/i, '')
              .trim();
          }

          function setTranscriptStatus(text) {
            const rawMessage = typeof text === 'string' ? text.trim() : '';
            const message = normalizeTranscriptStatusMessage(rawMessage);
            const placeholderText = message || transcriptPlaceholderDefault;
            transcriptOutput.title = placeholderText;
            if (!transcriptValue) {
              transcriptOutput.placeholder = placeholderText;
            }
            if (transcriptStatusText) {
              if (message) {
                transcriptStatusText.textContent = message;
                transcriptStatusText.style.display = 'inline-flex';
              } else {
                transcriptStatusText.textContent = '';
                transcriptStatusText.style.display = 'none';
              }
            }
          }

          function syncTranscriptOutput(value) {
            transcriptValue = value || '';
            transcriptOutput.value = transcriptValue;
            transcriptCopyButton.disabled = !transcriptValue;
            transcriptOutput.style.opacity = transcriptValue ? '1' : '0.7';
            if (transcriptValue) {
              transcriptOutput.placeholder = transcriptPlaceholderDefault;
            }
          }

          function setTranscriptButtonsLoading(loading) {
            transcriptLoading = loading;
            const targetOpacity = loading ? '0.5' : '';
            transcriptButton.disabled = loading;
            transcriptRefreshButton.disabled = loading;
            transcriptButton.style.opacity = targetOpacity || '';
            transcriptRefreshButton.style.opacity = targetOpacity || '';
          }

          function setTranscriptVisibility(visible, options) {
            const opts = Object.assign({ silent: false }, options || {});
            const nextVisible = Boolean(visible);
            transcriptVisible = nextVisible;
            transcriptContainer.style.display = nextVisible ? 'flex' : 'none';
            transcriptButton.title = nextVisible
              ? localizeText('Hide transcript', '隐藏字幕')
              : localizeText('Show transcript', '获取字幕');
            if (opts.silent || !videoId) return;
            if (nextVisible) {
              transcriptVisibilityState.set(videoId, true);
            } else {
              transcriptVisibilityState.delete(videoId);
            }
          }

          function triggerTranscriptFetch(options) {
            if (transcriptLoading) return;
            if (typeof fetchTranscriptForVideo !== 'function') {
              setTranscriptStatus(
                localizeText('Transcript module is not ready.', '字幕模块未初始化。'),
                styles.deleteButtonColor
              );
              return;
            }
            const force = options && options.force;
            setTranscriptButtonsLoading(true);
            setTranscriptStatus(localizeText('Refreshing…', '正在重新获取…'), styles.subtleText);
            fetchTranscriptForVideo(videoId, {
              force: Boolean(force),
              videoTitle: resolvedTitleInfo && resolvedTitleInfo.title,
              videoUrl: videoURL
            })
              .then(text => {
                syncTranscriptOutput(text);
                transcriptContainer.dataset.loaded = 'true';
                setTranscriptStatus(
                  localizeText('Transcript updated ({time})', '字幕已更新（{time}）', {
                    time: new Date().toLocaleTimeString()
                  }),
                  styles.tabActive
                );
              })
              .catch(err => {
                const message = err && err.message ? err.message : String(err);
                setTranscriptStatus(
                  localizeText('Transcript failed: {message}', '字幕获取失败：{message}', { message }),
                  styles.deleteButtonColor
                );
              })
              .finally(() => {
                setTranscriptButtonsLoading(false);
              });
          }

          setTranscriptVisibility(shouldRestoreTranscript, { silent: true });
          if (shouldRestoreTranscript && !transcriptContainer.dataset.loaded) {
            triggerTranscriptFetch();
          }

          transcriptButton.addEventListener('click', () => {
            const nextVisible = !transcriptVisible;
            setTranscriptVisibility(nextVisible);
            if (nextVisible) {
              if (!transcriptContainer.dataset.loaded) {
                triggerTranscriptFetch();
              }
            }
          });

          transcriptRefreshButton.addEventListener('click', () => {
            setTranscriptVisibility(true);
            triggerTranscriptFetch({ force: true });
          });

          transcriptCopyButton.addEventListener('click', async () => {
            const text = transcriptOutput.value.trim();
            if (!text) {
              setTranscriptStatus(
                localizeText('No transcript content to copy.', '暂无字幕内容可复制。'),
                styles.subtleText
              );
              return;
            }
            try {
              await navigator.clipboard.writeText(text);
              transcriptCopyButton.style.opacity = '0.6';
              setTimeout(() => { transcriptCopyButton.style.opacity = '1'; }, 250);
              setTranscriptStatus(localizeText('Transcript copied.', '字幕内容已复制。'), styles.tabActive);
            } catch (err) {
              const message = err && err.message ? err.message : String(err);
              setTranscriptStatus(
                localizeText('Copy failed: {message}', '复制失败：{message}', { message }),
                styles.deleteButtonColor
              );
            }
          });

          const noteContainer = document.createElement('div');
          noteContainer.classList.add('ysrp-note-container');
          Object.assign(noteContainer.style, {
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: styles.urlBackground,
            color: styles.color,
            borderRadius: '0.5rem',
            display: 'none',
            flexDirection: 'column',
            gap: '0.35rem'
          });

          const noteHeader = document.createElement('div');
          Object.assign(noteHeader.style, {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem'
          });

          const noteLabel = document.createElement('strong');
          noteLabel.textContent = localizeText('Notes', '笔记');
          Object.assign(noteLabel.style, {
            fontSize: '0.85rem',
            color: styles.subtleText
          });

          const noteEditButton = document.createElement('button');
          Object.assign(noteEditButton.style, {
            background: 'transparent',
            border: 'none',
            color: styles.editButtonColor,
            cursor: 'pointer',
            fontSize: '0.9rem',
            padding: '0.15rem',
            minWidth: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          });
          noteHeader.appendChild(noteLabel);
          noteHeader.appendChild(noteEditButton);

          const noteBody = document.createElement('div');
          noteBody.classList.add('ysrp-note-body');
          Object.assign(noteBody.style, {
            display: 'none',
            flexDirection: 'column',
            gap: '0.35rem'
          });

          const noteContent = document.createElement('div');
          noteContent.classList.add('ysrp-note-text');
          Object.assign(noteContent.style, {
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: '1.4',
            fontSize: '0.95rem'
          });

          function syncNotePreview(value) {
            const hasNote = Boolean(value);
            noteContent.textContent = hasNote ? value : getNoteEmptyPlaceholder();
            noteContent.style.color = hasNote ? styles.color : styles.subtleText;
            noteContent.style.fontStyle = hasNote ? 'normal' : 'italic';
            noteContent.style.opacity = hasNote ? '1' : '0.9';
          }

          syncNotePreview(currentNoteValue);
          noteBody.appendChild(noteContent);
          noteContainer.appendChild(noteHeader);
          noteContainer.appendChild(noteBody);
          videoEl.appendChild(noteContainer);

          function updateNoteEditButtonState() {
            noteEditButton.innerHTML = '';
            const iconName = isEditingNote ? 'save' : 'edit';
            const iconColor = isEditingNote ? styles.openButtonColor : styles.linkButtonColor;
            noteEditButton.appendChild(createIcon(iconName, iconColor));
            noteEditButton.title = isEditingNote
              ? localizeText('Save note', '保存笔记')
              : localizeText('Edit note', '编辑笔记');
          }

          function hasNoteContent() {
            return Boolean((currentNoteValue || '').trim());
          }

          function refreshNoteButtonState() {
            const notePresent = hasNoteContent();
            noteButton.disabled = false;
            noteButton.style.opacity = '1';
            noteButton.title = isEditingNote
              ? localizeText('Save & collapse note', '保存并折叠笔记')
              : notePresent
                ? (noteVisible
                  ? localizeText('Hide notes', '隐藏笔记')
                  : localizeText('Show notes', '显示笔记'))
                : localizeText('Add note', '添加笔记');
          }

          function setNoteVisibility(visible) {
            if (!visible && isEditingNote) return;
            noteVisible = Boolean(visible);
            noteContainer.style.display = noteVisible ? 'flex' : 'none';
            noteBody.style.display = noteVisible ? 'flex' : 'none';
            refreshNoteButtonState();
          }

          function ensureNoteVisible() {
            if (!noteVisible) {
              setNoteVisibility(true);
            }
          }

          updateNoteEditButtonState();
          refreshNoteButtonState();
          setNoteVisibility(false);

          urlButton.addEventListener('click', () => {
            if (urlDisplay.style.display === 'none') {
              urlDisplay.style.display = 'flex';
              urlDisplay.style.alignItems = 'center';
            } else {
              urlDisplay.style.display = 'none';
            }
          });

          copyButton.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(videoURL);
              copyIcon.style.color = styles.saveButtonColor;
              copyIcon.classList.remove(...FontAwesomeIcons['copy']);
              copyIcon.classList.add(...FontAwesomeIcons['check']);
              setTimeout(() => {
                copyIcon.classList.remove(...FontAwesomeIcons['check']);
                copyIcon.classList.add(...FontAwesomeIcons['copy']);
                copyIcon.style.color = styles.copyButtonColor;
              }, 1000);
              copySuccessTip.style.opacity = '1';
              setTimeout(() => { copySuccessTip.style.opacity = '0'; }, 2000);
            } catch (err) {
              console.error('Failed to copy text: ', err);
            }
          });

          openButton.addEventListener('click', () => {
            window.open(videoURL, '_blank');
          });

          deleteButton.addEventListener('click', () => {
            Storage.removeItem(key);
            if (videoId) {
              transcriptVisibilityState.delete(videoId);
            }
            videosList.removeChild(videoEl);
            renderSavedVideosTitle(videosList.children.length);
          });

          // Video notes

          function enterNoteEditing() {
            if (isEditingNote) return;
            isEditingNote = true;
            setNoteVisibility(true);
            noteTextarea = document.createElement('textarea');
            noteTextarea.value = currentNoteValue;
            Object.assign(noteTextarea.style, {
              width: '100%',
              minHeight: '3rem',
              border: `1px solid ${styles.inputBorder}`,
              background: styles.inputBg,
              borderRadius: '0.3rem',
              padding: '0.35rem',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              lineHeight: '1.4',
              color: styles.color,
              resize: 'vertical',
              boxSizing: 'border-box',
              outline: 'none'
            });
            applyFocusRing(noteTextarea);
            noteTextarea.addEventListener('input', () => {
              noteTextarea.style.height = 'auto';
              noteTextarea.style.height = `${noteTextarea.scrollHeight}px`;
            });
            noteTextarea.dispatchEvent(new Event('input'));
            noteBody.replaceChild(noteTextarea, noteContent);
            updateNoteEditButtonState();
            refreshNoteButtonState();
            requestAnimationFrame(() => {
              try {
                noteTextarea.focus();
                noteTextarea.setSelectionRange(noteTextarea.value.length, noteTextarea.value.length);
              } catch {}
            });
          }

          function persistNote(value) {
            try {
              const raw = Storage.getItem(key);
              const savedData = raw ? (JSON.parse(raw) || {}) : {};
              if (value) {
                savedData.videoNote = value;
              } else {
                delete savedData.videoNote;
              }
              Storage.setItem(key, JSON.stringify(savedData));
            } catch (err) {
              console.error('Failed to update video note in storage:', err);
            }
          }

          function commitNoteEditing() {
            if (!isEditingNote) return;
            const textarea = noteTextarea || noteBody.querySelector('textarea');
            const nextNote = textarea ? textarea.value.trim() : '';
            currentNoteValue = nextNote;
            syncNotePreview(currentNoteValue);
            if (textarea) {
              noteBody.replaceChild(noteContent, textarea);
            }
            isEditingNote = false;
            noteTextarea = null;
            persistNote(currentNoteValue);
            updateNoteEditButtonState();
            refreshNoteButtonState();
          }

          noteButton.addEventListener('click', () => {
            if (isEditingNote) {
              commitNoteEditing();
              setNoteVisibility(false);
              return;
            }
            if (!hasNoteContent()) {
              ensureNoteVisible();
              enterNoteEditing();
              return;
            }
            setNoteVisibility(!noteVisible);
          });

          noteEditButton.addEventListener('click', () => {
            if (!noteVisible) ensureNoteVisible();
            if (!isEditingNote) {
              enterNoteEditing();
            } else {
              commitNoteEditing();
            }
          });

          return { videoId, node: videoEl };
        } catch (e) {
          console.error('Failed to parse saved video data:', e);
          return null;
        }
      }

      for (const [key, value] of all) {
        const entry = createRecordEntry(key, value);
        if (!entry) continue;
        const bucket = currentVideoId && entry.videoId === currentVideoId ? currentRecords : otherRecords;
        bucket.push(entry.node);
      }

      currentRecords.forEach(node => videosList.appendChild(node));
      otherRecords.forEach(node => videosList.appendChild(node));

      listViewport.appendChild(videosList);
      recordsContainer.appendChild(listViewport);

      if (currentVideoStatusListener) {
        document.removeEventListener('ysrp-current-video-status', currentVideoStatusListener);
      }
      currentVideoStatusListener = event => {
        const nextVideoId = event && event.detail ? event.detail.videoId : undefined;
        if (typeof nextVideoId !== 'undefined' && nextVideoId !== lastRenderedVideoId) {
          rebuildRecords();
        }
      };
      document.addEventListener('ysrp-current-video-status', currentVideoStatusListener);
      if (recordUpdatedListener) {
        document.removeEventListener(RECORD_UPDATED_EVENT, recordUpdatedListener);
      }
      recordUpdatedListener = event => {
        const updatedVideoId = event && event.detail ? event.detail.videoId : undefined;
        if (!updatedVideoId) return;
        const existingNode = videosList.querySelector(`[data-video-id="${updatedVideoId}"]`);
        if (!existingNode) {
          rebuildRecords();
          return;
        }
        updateRecordProgressDisplay(updatedVideoId, event.detail ? event.detail.videoProgress : undefined);
      };
      document.addEventListener(RECORD_UPDATED_EVENT, recordUpdatedListener);
      if (dearrowTitleReadyListener) {
        document.removeEventListener('ysrp-dearrow-title-ready', dearrowTitleReadyListener);
      }
      dearrowTitleReadyListener = handleDearrowTitleEvent;
      document.addEventListener('ysrp-dearrow-title-ready', dearrowTitleReadyListener);
      } finally {
        setRefreshIndicatorActive(false);
        isRebuildingRecords = false;
      }
    }

    // Prefs container (storage + import/export)
    const prefsContainer = document.createElement('div');
    Object.assign(prefsContainer.style, {
      display: 'none',
      flexDirection: 'column',
      gap: '1rem',
      minHeight: 0,
      overflow: 'auto',
      paddingRight: '0.25rem',
      WebkitOverflowScrolling: 'touch'
    });

    // Transcript tab container
    const transcriptContainer = document.createElement('div');
    Object.assign(transcriptContainer.style, {
      display: 'none',
      flexDirection: 'column',
      gap: '1rem',
      minHeight: 0,
      overflow: 'auto',
      paddingRight: '0.25rem',
      WebkitOverflowScrolling: 'touch'
    });

    // Language/display tab container
    displayContainer = document.createElement('div');
    Object.assign(displayContainer.style, {
      display: 'none',
      flexDirection: 'column',
      gap: '1rem',
      minHeight: 0,
      overflow: 'auto',
      paddingRight: '0.25rem',
      WebkitOverflowScrolling: 'touch'
    });

    const isDarkTheme = typeof currentTheme === 'string' && currentTheme.toLowerCase() === 'dark';
    const storageAccentColor = isDarkTheme ? '#ffb347' : '#ff8c39';
    const storageAccentBg = isDarkTheme ? 'rgba(255, 179, 71, 0.2)' : 'rgba(255, 140, 57, 0.15)';
    const storageAccentBorder = isDarkTheme ? 'rgba(255, 179, 71, 0.65)' : 'rgba(255, 140, 57, 0.55)';
    const storageOptionShadowActive = `0 0 0 1px ${isDarkTheme ? 'rgba(255, 179, 71, 0.45)' : 'rgba(255, 140, 57, 0.35)'}`;
    const displayAccentColor = isDarkTheme ? '#ffc2ec' : '#ff4db8';
    const displayAccentBg = isDarkTheme ? 'rgba(255, 194, 236, 0.28)' : 'rgba(255, 77, 184, 0.16)';
    const displayAccentBorder = isDarkTheme ? 'rgba(255, 194, 236, 0.7)' : 'rgba(255, 77, 184, 0.55)';
    const displayAccentShadow = `0 0 0 1px ${isDarkTheme ? 'rgba(255, 194, 236, 0.45)' : 'rgba(255, 77, 184, 0.35)'}`;
    const displayBadgeBg = isDarkTheme ? 'rgba(255, 194, 236, 0.42)' : 'rgba(255, 77, 184, 0.22)';
    const displayBadgeText = isDarkTheme ? '#2f0f1f' : '#6d1a46';
    const displaySoftBg = isDarkTheme ? 'rgba(255, 194, 236, 0.16)' : 'rgba(255, 77, 184, 0.1)';
    const transcriptAccentColor = '#ff2f45';
    const settingsCardBaseStyles = {
      background: styles.recordBackground,
      borderRadius: '0.9rem',
      padding: '1.1rem 1.35rem 1.05rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.85rem',
      border: `1px solid ${styles.inputBorder}`,
      boxShadow: 'none',
      fontSize: '1.3125rem',
      lineHeight: '1.6'
    };
    const settingsActionHoverBg = isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : 'rgba(11, 87, 208, 0.12)';
    const settingsCardSubtleBg = isDarkTheme ? 'rgba(255, 255, 255, 0.04)' : 'rgba(11, 87, 208, 0.04)';

    function decorateSettingsActionButton(button, accentColor, options) {
      if (!button || button.dataset.ysrpDecorated === 'true') return;
      const accent = accentColor || styles.tabActive;
      const hoverBg = (options && options.hoverBg) || settingsActionHoverBg;
      Object.assign(button.style, {
        background: styles.buttonBackground,
        border: `1px solid ${accent}`,
        borderRadius: '0.65rem',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.45rem 0.95rem',
        color: accent,
        fontWeight: '600',
        fontSize: '1.3125rem',
        minHeight: '2.5rem',
        transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease'
      });
      button.dataset.ysrpDecorated = 'true';
      const onEnter = () => {
        button.style.background = hoverBg;
      };
      const onLeave = () => {
        button.style.background = styles.buttonBackground;
      };
      button.addEventListener('pointerenter', onEnter);
      button.addEventListener('pointerleave', onLeave);
      button.addEventListener('focus', () => {
        button.style.boxShadow = `0 0 0 3px ${hoverBg}`;
      });
      button.addEventListener('blur', () => {
        button.style.boxShadow = 'none';
      });
    }

    function applyFocusRing(inputEl, options) {
      if (!inputEl || inputEl.dataset.ysrpFocusDecorated === 'true') return;
      const focusColor = (options && options.color) || styles.tabActive || '#0b57d0';
      inputEl.style.outline = 'none';
      inputEl.style.boxShadow = '0 0 0 2px transparent';
      const handleFocus = () => { inputEl.style.boxShadow = `0 0 0 2px ${focusColor}`; };
      const handleBlur = () => { inputEl.style.boxShadow = '0 0 0 2px transparent'; };
      inputEl.addEventListener('focus', handleFocus);
      inputEl.addEventListener('blur', handleBlur);
      inputEl.dataset.ysrpFocusDecorated = 'true';
    }

    function updateActionStatus(statusEl, message, color) {
      if (!statusEl) return;
      const hasMessage = Boolean(message && String(message).trim());
      statusEl.textContent = hasMessage ? String(message).trim() : '';
      statusEl.style.display = hasMessage ? 'block' : 'none';
      if (hasMessage && color) {
        statusEl.style.color = color;
      } else if (!hasMessage) {
        statusEl.style.color = styles.subtleText;
      }
    }

    // Storage selection
    const storageCard = document.createElement('div');
    Object.assign(storageCard.style, settingsCardBaseStyles, {
      fontSize: '1.3125rem',
      lineHeight: '1.5'
    });

    const storageTitle = document.createElement('div');
    Object.assign(storageTitle.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem'
    });
    const storageIcon = createIcon('database', storageAccentColor);
    if (storageIcon) {
      storageIcon.style.fontSize = '1.5rem';
      storageIcon.style.color = storageAccentColor;
    }
    const storageTitleText = document.createElement('strong');
    storageTitleText.textContent = localizeText('Storage Backend', '存储后端');
    storageTitleText.style.fontSize = '1.5625rem';
    storageTitleText.style.fontWeight = '700';
    storageTitle.appendChild(storageIcon);
    storageTitle.appendChild(storageTitleText);

    const storageNote = document.createElement('div');
    storageNote.textContent = localizeText('Choose where to store your progress data.', '选择保存进度的存储方式。');
    storageNote.style.color = styles.subtleText;
    storageNote.style.fontSize = '1.3125rem';
    storageNote.style.marginTop = '-0.65rem';

    const storageOptions = document.createElement('div');
    Object.assign(storageOptions.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
      alignItems: 'stretch',
      width: '100%',
      margin: '0'
    });

    const storageOptionInstances = [];

    function makeRadio(id, label, detail, badgeText) {
      const wrap = document.createElement('label');
      Object.assign(wrap.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        borderRadius: '0.85rem',
        border: `1px solid ${styles.inputBorder}`,
        padding: '0.7rem 0.85rem',
        width: '100%',
        boxSizing: 'border-box',
        cursor: 'pointer',
        background: styles.buttonBackground,
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease'
      });
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'ysrp-storage-mode';
      input.value = id;
      input.style.display = 'none';

      const badge = document.createElement('span');
      badge.textContent = badgeText || id.toUpperCase();
      Object.assign(badge.style, {
        fontSize: '0.9rem',
        fontWeight: '600',
        padding: '0.2rem 0.55rem',
        borderRadius: '0.6rem',
        background: storageAccentBg,
        color: storageAccentColor,
        flexShrink: '0'
      });

      const textGroup = document.createElement('div');
      Object.assign(textGroup.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        minWidth: 0
      });

      const labelSpan = document.createElement('span');
      labelSpan.textContent = label;
      labelSpan.style.fontWeight = '600';
      labelSpan.style.fontSize = '1.25rem';
      labelSpan.style.color = styles.color;
      textGroup.appendChild(labelSpan);

      let detailSpan = null;
      if (detail) {
        detailSpan = document.createElement('span');
        detailSpan.textContent = detail;
        detailSpan.style.fontSize = '1.15rem';
        detailSpan.style.color = styles.subtleText;
        detailSpan.style.lineHeight = '1.35';
        detailSpan.style.opacity = '0.95';
        textGroup.appendChild(detailSpan);
      }

      wrap.appendChild(input);
      wrap.appendChild(badge);
      wrap.appendChild(textGroup);

      storageOptionInstances.push({ input, wrap, badge, labelSpan, detailSpan });
      return { wrap, input };
    }

    function refreshStorageChoiceStyles() {
      storageOptionInstances.forEach(({ input, wrap, badge, labelSpan, detailSpan }) => {
        const selected = Boolean(input.checked);
        wrap.style.borderColor = selected ? storageAccentBorder : styles.inputBorder;
        wrap.style.background = selected ? storageAccentBg : styles.buttonBackground;
        wrap.style.boxShadow = selected ? storageOptionShadowActive : 'none';
        badge.style.background = selected ? storageAccentColor : storageAccentBg;
        badge.style.color = selected ? styles.background : storageAccentColor;
        labelSpan.style.color = selected ? storageAccentColor : styles.color;
        if (detailSpan) {
          detailSpan.style.color = selected ? storageAccentColor : styles.subtleText;
        }
      });
    }

    const radioLocal = makeRadio(
      'local',
      localizeText('localStorage (default)', 'localStorage（默认）'),
      localizeText('Fast storage scoped to this browser profile.', '快速、本地浏览器可用的存储。'),
      localizeText('LOCAL', '本地')
    );
    const radioGM = makeRadio(
      'gm',
      localizeText('GM storage', 'GM 存储'),
      localizeText('Tampermonkey-backed storage that can sync across profiles.', '由 Tampermonkey 提供、可在配置间同步的存储。'),
      'GM'
    );
    const currentMode = Storage.getMode();
    radioLocal.input.checked = currentMode === 'local';
    radioGM.input.checked = currentMode === 'gm';
    storageOptions.appendChild(radioLocal.wrap);
    storageOptions.appendChild(radioGM.wrap);
    refreshStorageChoiceStyles();
    [radioLocal.input, radioGM.input].forEach(input => {
      input.addEventListener('change', refreshStorageChoiceStyles);
    });

    const storageActions = document.createElement('div');
    Object.assign(storageActions.style, {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '0.75rem'
    });

    const applyBtn = document.createElement('button');
    Object.assign(applyBtn.style, {
      background: styles.buttonBackground,
      border: `1.333px solid ${storageAccentColor}`,
      borderRadius: '0.7rem',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.4rem',
      padding: '0.5rem 1.1rem',
      color: storageAccentColor,
      fontWeight: '700',
      fontSize: '1.25rem',
      minHeight: '2.75rem',
      transition: 'background 0.2s ease, color 0.2s ease, opacity 0.2s ease'
    });
    applyBtn.title = localizeText('Switch storage backend and migrate data.', '切换存储方式并迁移数据。');
    const arrowsIcon = createIcon('arrows', storageAccentColor);
    const applySpan = document.createElement('span');
    applySpan.textContent = localizeText('Apply & Migrate', '应用并迁移');
    applyBtn.appendChild(arrowsIcon);
    applyBtn.appendChild(applySpan);
    applyBtn.addEventListener('pointerenter', () => {
      applyBtn.style.background = storageAccentBg;
    });
    applyBtn.addEventListener('pointerleave', () => {
      applyBtn.style.background = styles.buttonBackground;
    });

    const applyInfo = document.createElement('div');
    applyInfo.style.color = styles.subtleText;
    applyInfo.style.fontSize = '1.25rem';
    applyInfo.style.lineHeight = '1.4';
    applyInfo.style.flex = '1 1 220px';
    applyInfo.textContent = localizeText('Migrates all saved records to the selected backend (moves data).', '将所有记录迁移至所选存储后端（移动数据）。');

    storageActions.appendChild(applyBtn);
    storageActions.appendChild(applyInfo);

    storageCard.appendChild(storageTitle);
    storageCard.appendChild(storageNote);
    storageCard.appendChild(storageOptions);
    storageCard.appendChild(storageActions);

    // Export card
    const exportCard = document.createElement('div');
    Object.assign(exportCard.style, settingsCardBaseStyles, {
      gap: '0.9rem'
    });
    const exportTitle = document.createElement('div');
    Object.assign(exportTitle.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem'
    });
    const exportIcon = createIcon('download', styles.openButtonColor);
    if (exportIcon) exportIcon.style.fontSize = '1.5rem';
    const exportTitleSpan = document.createElement('strong');
    exportTitleSpan.textContent = localizeText('Export Data', '导出数据');
    exportTitleSpan.style.fontSize = '1.625rem';
    exportTitleSpan.style.fontWeight = '700';
    exportTitle.appendChild(exportIcon);
    exportTitle.appendChild(exportTitleSpan);

    const exportSubtitle = document.createElement('div');
    exportSubtitle.textContent = localizeText('Back up your saved progress as JSON.', '将保存的进度备份为 JSON。');
    exportSubtitle.style.color = styles.subtleText;
    exportSubtitle.style.fontSize = '1.3125rem';
    exportSubtitle.style.marginTop = '-0.65rem';

    const exportActions = document.createElement('div');
    Object.assign(exportActions.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.75rem',
      alignItems: 'stretch'
    });

    const btnCopyExport = document.createElement('button');
    btnCopyExport.title = localizeText('Copy export JSON to clipboard', '复制导出的 JSON 到剪贴板');
    btnCopyExport.appendChild(createIcon('copy', 'currentColor'));
    btnCopyExport.appendChild(document.createTextNode(localizeText('Copy JSON', '复制 JSON')));
    decorateSettingsActionButton(btnCopyExport, styles.openButtonColor);
    btnCopyExport.style.flex = '1 1 12rem';

    const btnDownloadExport = document.createElement('button');
    btnDownloadExport.title = localizeText('Download export JSON as file', '下载导出的 JSON 文件');
    btnDownloadExport.appendChild(createIcon('download', 'currentColor'));
    btnDownloadExport.appendChild(document.createTextNode(localizeText('Download JSON', '下载 JSON')));
    decorateSettingsActionButton(btnDownloadExport, styles.openButtonColor);
    btnDownloadExport.style.flex = '1 1 12rem';

    const exportHint = document.createElement('div');
    exportHint.style.color = styles.subtleText;
    exportHint.style.fontSize = '1.25rem';
    exportHint.textContent = localizeText('Exports all saved records from the currently selected backend.', '导出当前存储后端中的所有记录。');

    const exportStatus = document.createElement('div');
    Object.assign(exportStatus.style, {
      color: styles.subtleText,
      fontSize: '1.1875rem',
      display: 'none'
    });

    exportActions.appendChild(btnCopyExport);
    exportActions.appendChild(btnDownloadExport);
    exportCard.appendChild(exportTitle);
    exportCard.appendChild(exportTitle);
    exportCard.appendChild(exportSubtitle);
    exportCard.appendChild(exportActions);
    exportCard.appendChild(exportHint);
    exportCard.appendChild(exportStatus);

    // Import card
    const importCard = document.createElement('div');
    Object.assign(importCard.style, settingsCardBaseStyles, {
      gap: '0.9rem'
    });

    const importTitle = document.createElement('div');
    Object.assign(importTitle.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem'
    });
    const importIcon = createIcon('upload', styles.tabActive);
    if (importIcon) importIcon.style.fontSize = '1.5rem';
    const importTitleSpan = document.createElement('strong');
    importTitleSpan.textContent = localizeText('Import Data', '导入数据');
    importTitleSpan.style.fontSize = '1.625rem';
    importTitleSpan.style.fontWeight = '700';
    importTitle.appendChild(importIcon);
    importTitle.appendChild(importTitleSpan);

    const importSubtitle = document.createElement('div');
    importSubtitle.textContent = localizeText('Restore a previous export to merge or replace your saved records.', '导入之前的导出文件，用于合并或替换记录。');
    importSubtitle.style.color = styles.subtleText;
    importSubtitle.style.fontSize = '1.3125rem';
    importSubtitle.style.marginTop = '-0.65rem';

    const importTextarea = document.createElement('textarea');
    importTextarea.rows = 2;
    Object.assign(importTextarea.style, {
      width: '100%',
      maxWidth: LARGE_FORM_CONTROL_MAX_WIDTH,
      minHeight: '4rem',
      height: '4rem',
      background: styles.inputBg,
      color: styles.color,
      border: `1px solid ${styles.inputBorder}`,
      borderRadius: '0.7rem',
      padding: '0.75rem 1rem',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      fontSize: '1.3125rem',
      lineHeight: '1.6',
      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
      resize: 'vertical'
    });
    importTextarea.placeholder = localizeText('Paste exported JSON here...', '在此粘贴导出的 JSON...');
    applyFocusRing(importTextarea);

    const importActions = document.createElement('div');
    Object.assign(importActions.style, {
      display: 'flex',
      gap: '0.75rem',
      flexWrap: 'wrap',
      alignItems: 'stretch',
      width: '100%',
      marginTop: '0.35rem'
    });

    const btnImportText = document.createElement('button');
    btnImportText.title = localizeText('Import from pasted JSON', '从粘贴的 JSON 导入');
    btnImportText.appendChild(createIcon('upload', 'currentColor'));
    btnImportText.appendChild(document.createTextNode(localizeText('Import from Text', '从文本导入')));
    decorateSettingsActionButton(btnImportText, styles.tabActive);
    btnImportText.style.flex = '1 1 12rem';

    const fileInputWrapper = document.createElement('label');
    Object.assign(fileInputWrapper.style, {
      border: `1px dashed ${styles.inputBorder}`,
      borderRadius: '0.7rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      gap: '0.65rem',
      padding: '0.6rem 1rem',
      color: styles.color,
      flex: '1 1 14rem',
      minHeight: '3.25rem',
      boxSizing: 'border-box',
      background: settingsCardSubtleBg,
      transition: 'border-color 0.2s ease, color 0.2s ease, background 0.2s ease'
    });
    fileInputWrapper.tabIndex = 0;
    fileInputWrapper.title = localizeText('Select an export JSON file', '选择要导入的 JSON 文件');

    const fileInputIcon = createIcon('upload', styles.tabActive);
    if (fileInputIcon) fileInputIcon.style.fontSize = '1.5rem';
    const fileInputLabelText = document.createElement('span');
    fileInputLabelText.textContent = localizeText('Choose File', '选择文件');
    fileInputLabelText.style.fontSize = '1.3125rem';
    fileInputLabelText.style.fontWeight = '700';

    const fileInputDefaultLabel = localizeText('No file chosen', '未选择文件');
    const fileNameDisplay = document.createElement('span');
    fileNameDisplay.textContent = fileInputDefaultLabel;
    Object.assign(fileNameDisplay.style, {
      flex: '1',
      color: styles.subtleText,
      fontSize: '1.3125rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';
    Object.assign(fileInput.style, {
      display: 'none'
    });

    const toggleFileHover = hovered => {
      fileInputWrapper.style.borderColor = hovered ? styles.tabActive : styles.inputBorder;
      fileInputWrapper.style.color = hovered ? styles.tabActive : styles.color;
      fileInputWrapper.style.background = hovered ? settingsActionHoverBg : settingsCardSubtleBg;
    };
    fileInputWrapper.addEventListener('pointerenter', () => toggleFileHover(true));
    fileInputWrapper.addEventListener('pointerleave', () => toggleFileHover(false));
    fileInputWrapper.addEventListener('focusin', () => toggleFileHover(true));
    fileInputWrapper.addEventListener('focusout', () => toggleFileHover(false));

    fileInputWrapper.appendChild(fileInputIcon);
    fileInputWrapper.appendChild(fileInputLabelText);
    fileInputWrapper.appendChild(fileNameDisplay);
    fileInputWrapper.appendChild(fileInput);

    const overwriteRow = document.createElement('div');
    Object.assign(overwriteRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.65rem',
      fontSize: '1.3125rem',
      marginTop: '0.4rem',
      background: settingsCardSubtleBg,
      padding: '0.5rem 0.75rem',
      borderRadius: '0.65rem',
      flexWrap: 'wrap'
    });
    const overwriteLabelGroup = document.createElement('label');
    Object.assign(overwriteLabelGroup.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flex: '0 0 auto',
      cursor: 'pointer',
      position: 'relative'
    });
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    Object.assign(chk.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '1.25rem',
      height: '1.25rem',
      margin: '0',
      opacity: '0',
      pointerEvents: 'none'
    });
    const checkboxVisual = document.createElement('span');
    Object.assign(checkboxVisual.style, {
      width: '1.25rem',
      height: '1.25rem',
      borderRadius: '0.35rem',
      border: `2px solid ${styles.inputBorder}`,
      background: styles.inputBg,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
      boxShadow: isDarkTheme ? 'inset 0 0 0 1px rgba(255,255,255,0.05)' : 'none'
    });
    const checkboxTick = createIcon('check', styles.background);
    if (checkboxTick) {
      checkboxTick.style.fontSize = '1.0625rem';
      checkboxTick.style.opacity = '0';
    }
    checkboxVisual.appendChild(checkboxTick);
    const chkSpan = document.createElement('span');
    chkSpan.textContent = localizeText('Overwrite', '覆盖');
    chkSpan.style.fontSize = '1.5rem';
    chkSpan.style.fontWeight = '600';
    overwriteLabelGroup.appendChild(chk);
    overwriteLabelGroup.appendChild(checkboxVisual);
    overwriteLabelGroup.appendChild(chkSpan);
    const refreshCheckboxVisual = () => {
      const checked = chk.checked;
      checkboxVisual.style.background = checked ? styles.tabActive : styles.inputBg;
      checkboxVisual.style.borderColor = checked ? styles.tabActive : styles.inputBorder;
      if (checkboxTick) {
        checkboxTick.style.opacity = checked ? '1' : '0';
        checkboxTick.style.color = checked ? styles.background : styles.subtleText;
      }
    };
    chk.addEventListener('change', refreshCheckboxVisual);
    refreshCheckboxVisual();

    const overwriteHint = document.createElement('span');
    overwriteHint.textContent = localizeText('Imports records into the currently selected backend.', '将记录导入到当前选择的存储后端。');
    Object.assign(overwriteHint.style, {
      color: styles.subtleText,
      fontSize: '1.3125rem',
      flex: '1 1 auto',
      minWidth: '0',
      lineHeight: '1.4',
      textAlign: 'left',
      whiteSpace: 'normal'
    });
    overwriteRow.appendChild(overwriteLabelGroup);
    overwriteRow.appendChild(overwriteHint);

    const importStatus = document.createElement('div');
    Object.assign(importStatus.style, {
      color: styles.subtleText,
      fontSize: '1.1875rem',
      display: 'none'
    });

    importActions.appendChild(btnImportText);
    importActions.appendChild(fileInputWrapper);

    importCard.appendChild(importTitle);
    importCard.appendChild(importSubtitle);
    importCard.appendChild(overwriteRow);
    importCard.appendChild(importTextarea);
    importCard.appendChild(importActions);
    importCard.appendChild(importStatus);

    // Transcript card
    const transcriptCard = document.createElement('div');
    Object.assign(transcriptCard.style, settingsCardBaseStyles, {
      gap: '0.75rem'
    });

    const transcriptTitle = document.createElement('div');
    Object.assign(transcriptTitle.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem'
    });
    const transcriptIcon = createIcon('captions', transcriptAccentColor);
    if (transcriptIcon) transcriptIcon.style.fontSize = '1.5rem';
    const transcriptTitleSpan = document.createElement('strong');
    transcriptTitleSpan.textContent = localizeText('Subtitles · Transcript', '字幕与接口设置');
    transcriptTitleSpan.style.fontSize = '1.5625rem';
    transcriptTitleSpan.style.fontWeight = '700';
    transcriptTitleSpan.style.color = styles.color;
    transcriptTitle.appendChild(transcriptIcon);
    transcriptTitle.appendChild(transcriptTitleSpan);

    const transcriptDesc = document.createElement('div');
    transcriptDesc.textContent = localizeText(
      'Configure the OpenAI-compatible endpoint used for subtitles. Actual fetching now lives inside the Records tab.',
      '配置字幕接口（兼容 OpenAI）。字幕获取功能位于“记录”标签。'
    );
    transcriptDesc.style.color = styles.subtleText;
    transcriptDesc.style.fontSize = '1.3125rem';
    transcriptDesc.style.marginTop = '-0.65rem';

    const transcriptFields = document.createElement('div');
    Object.assign(transcriptFields.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      width: '100%'
    });

    const transcriptSettings = getTranscriptSettings();
    const timeoutMinMinutes = typeof TRANSCRIPT_TIMEOUT_MIN_MINUTES === 'number' ? TRANSCRIPT_TIMEOUT_MIN_MINUTES : 1;
    const timeoutMaxMinutes = typeof TRANSCRIPT_TIMEOUT_MAX_MINUTES === 'number' ? TRANSCRIPT_TIMEOUT_MAX_MINUTES : 60;
    const timeoutDefaultMinutes = typeof TRANSCRIPT_TIMEOUT_DEFAULT_MINUTES === 'number'
      ? TRANSCRIPT_TIMEOUT_DEFAULT_MINUTES
      : 10;

    function makeTranscriptInput(labelText, inputEl) {
      const wrapper = document.createElement('label');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '0.45rem';
      wrapper.style.width = '100%';
      wrapper.style.maxWidth = LARGE_FORM_CONTROL_MAX_WIDTH;
      const span = document.createElement('span');
      span.textContent = labelText;
      span.style.fontSize = '1.15rem';
      span.style.fontWeight = '600';
      span.style.color = styles.subtleText;
      wrapper.appendChild(span);
      wrapper.appendChild(inputEl);
      return wrapper;
    }

    function decorateTextInput(input) {
      Object.assign(input.style, {
        background: styles.inputBg,
        color: styles.color,
        border: `1px solid ${styles.inputBorder}`,
        borderRadius: '0.6rem',
        padding: '0.65rem 0.9rem',
        minHeight: '3rem',
        width: '100%',
        maxWidth: LARGE_FORM_CONTROL_MAX_WIDTH,
        boxSizing: 'border-box',
        fontFamily: 'inherit',
        fontSize: '1.2rem',
        lineHeight: '1.5'
      });
      input.autocomplete = 'off';
      input.spellcheck = false;
      applyFocusRing(input);
      return input;
    }

    const endpointInput = decorateTextInput(document.createElement('input'));
    endpointInput.type = 'text';
    endpointInput.placeholder = 'https://example.com/v1/chat/completions';
    endpointInput.value = transcriptSettings.endpoint || '';

    const modelInput = decorateTextInput(document.createElement('input'));
    modelInput.type = 'text';
    modelInput.placeholder = 'transcript';
    modelInput.value = transcriptSettings.model || '';

    const apiKeyInput = decorateTextInput(document.createElement('input'));
    apiKeyInput.type = 'password';
    apiKeyInput.placeholder = 'sk-***';
    apiKeyInput.value = transcriptSettings.apiKey || '';
    apiKeyInput.autocomplete = 'new-password';
    const apiKeyToggle = document.createElement('button');
    apiKeyToggle.type = 'button';
    apiKeyToggle.textContent = localizeText('Show', '显示');
    decorateSettingsActionButton(apiKeyToggle, transcriptAccentColor);
    apiKeyToggle.style.minHeight = '3rem';
    apiKeyToggle.style.padding = '0 1.1rem';
    apiKeyToggle.addEventListener('click', (event) => {
      event.preventDefault();
      const isHidden = apiKeyInput.type === 'password';
      apiKeyInput.type = isHidden ? 'text' : 'password';
      apiKeyToggle.textContent = isHidden
        ? localizeText('Hide', '隐藏')
        : localizeText('Show', '显示');
    });
    const apiKeyInputRow = document.createElement('div');
    Object.assign(apiKeyInputRow.style, {
      display: 'flex',
      alignItems: 'stretch',
      gap: '0.5rem',
      width: '100%'
    });
    apiKeyInput.style.flex = '1';
    apiKeyInputRow.appendChild(apiKeyInput);
    apiKeyInputRow.appendChild(apiKeyToggle);
    const apiKeyField = makeTranscriptInput(localizeText('API Key', 'API 密钥'), apiKeyInputRow);

    const timeoutInput = decorateTextInput(document.createElement('input'));
    timeoutInput.type = 'number';
    timeoutInput.min = String(timeoutMinMinutes);
    timeoutInput.max = String(timeoutMaxMinutes);
    timeoutInput.step = '1';
    timeoutInput.placeholder = `${timeoutDefaultMinutes}`;
    const timeoutDefaultMs = typeof TRANSCRIPT_DEFAULT_TIMEOUT_MS === 'number'
      ? TRANSCRIPT_DEFAULT_TIMEOUT_MS
      : timeoutDefaultMinutes * 60 * 1000;
    const currentTimeoutMinutes = typeof transcriptMsToMinutes === 'function'
      ? transcriptMsToMinutes((transcriptSettings.timeoutMs || timeoutDefaultMs))
      : Math.round((transcriptSettings.timeoutMs || timeoutDefaultMs) / 60000);
    timeoutInput.value = String(
      Math.min(
        timeoutMaxMinutes,
        Math.max(timeoutMinMinutes, currentTimeoutMinutes)
      )
    );

    transcriptFields.appendChild(makeTranscriptInput(localizeText('API Endpoint', 'API 接口路径'), endpointInput));
    transcriptFields.appendChild(makeTranscriptInput(localizeText('Model', '模型名称'), modelInput));
    transcriptFields.appendChild(apiKeyField);
    transcriptFields.appendChild(makeTranscriptInput(localizeText('Timeout (minutes)', '超时时长（分钟）'), timeoutInput));

    const transcriptVideoInfo = document.createElement('div');
    Object.assign(transcriptVideoInfo.style, {
      background: settingsCardSubtleBg,
      borderRadius: '0.7rem',
      padding: '0.7rem 0.95rem',
      color: styles.subtleText,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.45rem'
    });

    function makeInfoRow(labelText) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap'
      });
      const label = document.createElement('span');
      label.textContent = labelText;
      Object.assign(label.style, {
        fontWeight: '600',
        fontSize: '1.15rem',
        color: styles.subtleText,
        whiteSpace: 'nowrap'
      });
      const value = document.createElement('span');
      Object.assign(value.style, {
        fontSize: '1.25rem',
        color: styles.color,
        lineHeight: '1.45'
      });
      row.appendChild(label);
      row.appendChild(value);
      return { row, value };
    }

    const videoTitleRow = makeInfoRow(localizeText('Active video', '当前视频'));
    const videoIdRow = makeInfoRow(localizeText('Video ID', '视频 ID'));
    Object.assign(videoIdRow.value.style, {
      fontFamily: 'monospace',
      fontSize: '1.15rem',
      background: isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      padding: '0.15rem 0.4rem',
      borderRadius: '0.35rem'
    });
    transcriptVideoInfo.appendChild(videoTitleRow.row);
    transcriptVideoInfo.appendChild(videoIdRow.row);

    function setTranscriptVideoInfo(detail) {
      if (!detail) {
        videoTitleRow.value.textContent = localizeText('No active video detected', '未检测到可用的影片');
        videoIdRow.row.style.display = 'none';
        return;
      }
      const vid = detail.videoId || getVideoId();
      const title = detail.title || detail.value || getVideoName() || DEFAULT_VIDEO_NAME;
      videoTitleRow.value.textContent = title;
      if (vid) {
        videoIdRow.value.textContent = vid;
        videoIdRow.row.style.display = 'flex';
      } else {
        videoIdRow.row.style.display = 'none';
      }
    }
    setTranscriptVideoInfo(configData.cachedVideoTitle);
    const transcriptVideoEventName = (typeof CURRENT_VIDEO_STATUS_EVENT === 'string' && CURRENT_VIDEO_STATUS_EVENT) || 'ysrp-current-video-status';
    document.addEventListener(transcriptVideoEventName, evt => setTranscriptVideoInfo(evt.detail));

    let transcriptSaveTimer = null;
    function persistTranscriptInputs() {
      if (transcriptSaveTimer) clearTimeout(transcriptSaveTimer);
      transcriptSaveTimer = setTimeout(() => {
        const parsedTimeoutMinutes = parseFloat(timeoutInput.value);
        const timeoutMsValue = Number.isFinite(parsedTimeoutMinutes) && parsedTimeoutMinutes > 0
          ? (typeof clampTranscriptTimeoutMs === 'function'
              ? clampTranscriptTimeoutMs(parsedTimeoutMinutes * 60 * 1000)
              : Math.round(parsedTimeoutMinutes * 60 * 1000))
          : undefined;
        updateTranscriptSettings({
          endpoint: endpointInput.value,
          model: modelInput.value,
          apiKey: apiKeyInput.value,
          timeoutMs: timeoutMsValue
        });
      }, 250);
    }

    [endpointInput, modelInput, apiKeyInput, timeoutInput].forEach(input => {
      input.addEventListener('input', persistTranscriptInputs);
      input.addEventListener('change', persistTranscriptInputs);
    });

    transcriptCard.appendChild(transcriptTitle);
    transcriptCard.appendChild(transcriptDesc);
    transcriptCard.appendChild(transcriptFields);

    const transcriptInfoCard = document.createElement('div');
    Object.assign(transcriptInfoCard.style, settingsCardBaseStyles, {
      gap: '0.65rem'
    });
    const transcriptInfoTitle = document.createElement('div');
    Object.assign(transcriptInfoTitle.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem'
    });
    const transcriptInfoIcon = createIcon('note', styles.color);
    if (transcriptInfoIcon) transcriptInfoIcon.style.fontSize = '1.4rem';
    const transcriptInfoTitleSpan = document.createElement('strong');
    transcriptInfoTitleSpan.textContent = localizeText('Status & Tips', '状态与提示');
    transcriptInfoTitleSpan.style.fontSize = '1.4rem';
    transcriptInfoTitleSpan.style.fontWeight = '700';
    transcriptInfoTitle.appendChild(transcriptInfoIcon);
    transcriptInfoTitle.appendChild(transcriptInfoTitleSpan);
    const transcriptInfoHint = document.createElement('div');
    transcriptInfoHint.textContent = localizeText(
      'These settings apply instantly. Use the Records tab to fetch transcripts for specific videos.',
      '设置立即生效，具体字幕获取请在“记录”标签中触发。'
    );
    transcriptInfoHint.style.color = styles.subtleText;
    transcriptInfoHint.style.fontSize = '1.1875rem';
    transcriptInfoHint.style.lineHeight = '1.5';
    transcriptInfoCard.appendChild(transcriptInfoTitle);
    transcriptInfoCard.appendChild(transcriptInfoHint);
    transcriptInfoCard.appendChild(transcriptVideoInfo);

    const languageCard = document.createElement('div');
    Object.assign(languageCard.style, settingsCardBaseStyles, {
      gap: '0.75rem'
    });

    const languageTitleRow = document.createElement('div');
    Object.assign(languageTitleRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem'
    });
    const languageIcon = createIcon('globe', displayAccentColor);
    if (languageIcon) languageIcon.style.fontSize = '1.5rem';
    const languageTitleText = document.createElement('strong');
    languageTitleText.textContent = localizeText('Interface Language', '界面语言');
    languageTitleText.style.fontSize = '1.5625rem';
    languageTitleText.style.fontWeight = '700';
    languageTitleRow.appendChild(languageIcon);
    languageTitleRow.appendChild(languageTitleText);

    const languageDesc = document.createElement('div');
    languageDesc.textContent = localizeText(
      'Choose how the script UI should appear.',
      '为脚本界面选择显示语言。'
    );
    languageDesc.style.color = styles.subtleText;
    languageDesc.style.fontSize = '1.3125rem';
    languageDesc.style.marginTop = '-0.65rem';

    const languageOptionsWrapper = document.createElement('div');
    Object.assign(languageOptionsWrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
      width: '100%'
    });

    const languageStatus = document.createElement('div');
    Object.assign(languageStatus.style, {
      fontSize: '1.25rem',
      color: styles.subtleText,
      display: 'none'
    });

    const languageOptions = (typeof I18n !== 'undefined' && I18n && typeof I18n.getOptions === 'function')
      ? I18n.getOptions()
      : ['auto', 'zh', 'en'];
    let languageState = getLanguageStateSnapshot();
    const optionInputs = new Map();
    const languageOptionWidgets = new Map();

    function setLanguageStatus(message, color) {
      if (!message) {
        languageStatus.style.display = 'none';
        languageStatus.textContent = '';
        languageStatus.style.color = styles.subtleText;
        return;
      }
      languageStatus.textContent = message;
      languageStatus.style.display = 'block';
      languageStatus.style.color = color || styles.tabActive;
    }

    function refreshLanguageOptionStyles(selectedValue) {
      languageOptionWidgets.forEach(({ row, badge, labelLine, hintLine }, optionValue) => {
        const selected = optionValue === selectedValue;
        row.style.borderColor = selected ? displayAccentBorder : styles.inputBorder;
        row.style.background = selected ? displayAccentBg : styles.buttonBackground;
        row.style.boxShadow = selected ? displayAccentShadow : 'none';
        badge.style.background = selected ? displayAccentColor : displayBadgeBg;
        badge.style.color = selected ? styles.background : displayBadgeText;
        labelLine.style.color = selected ? displayAccentColor : styles.color;
        hintLine.style.color = selected ? displayAccentColor : styles.subtleText;
      });
    }

    function syncOptionSelection(value) {
      optionInputs.forEach((input, key) => {
        input.checked = key === value;
      });
      refreshLanguageOptionStyles(value);
    }

    const languageMetaBox = document.createElement('div');
    Object.assign(languageMetaBox.style, {
      background: settingsCardSubtleBg,
      borderRadius: '0.7rem',
      padding: '0.7rem 0.95rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.45rem'
    });
    const activeRow = makeInfoRow(localizeText('Active language', '当前语言'));
    const browserRow = makeInfoRow(localizeText('Browser language', '浏览器语言'));
    languageMetaBox.appendChild(activeRow.row);
    languageMetaBox.appendChild(browserRow.row);

    function updateLanguageMeta(state) {
      activeRow.value.textContent = getLanguageDisplayName(state.resolved);
      browserRow.value.textContent = getLanguageDisplayName(state.browser);
    }

    function handleLanguageOptionChange(value) {
      if (!value || !I18n || typeof I18n.setPreference !== 'function') return;
      if (value === (configData.language && configData.language.preference)) {
        setLanguageStatus(localizeText('Already using this language.', '当前已使用该语言。'), styles.subtleText);
        return;
      }
      I18n.setPreference(value);
      languageState = getLanguageStateSnapshot();
      updateLanguageMeta(languageState);
      syncOptionSelection(languageState.preference);
      setLanguageStatus(localizeText('Language preference updated.', '语言偏好已更新。'), styles.tabActive);
    }

    languageOptions.forEach(optionValue => {
      const optionRow = document.createElement('label');
      Object.assign(optionRow.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.7rem 0.85rem',
        borderRadius: '0.85rem',
        border: `1px solid ${styles.inputBorder}`,
        cursor: 'pointer',
        background: styles.buttonBackground
      });

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'ysrp-language-preference';
      input.value = optionValue;
      input.style.display = 'none';
      input.checked = optionValue === languageState.preference;
      optionInputs.set(optionValue, input);

      const badge = document.createElement('span');
      badge.textContent = getLanguageBadgeLabel(optionValue);
      Object.assign(badge.style, {
        fontSize: '0.85rem',
        fontWeight: '600',
        padding: '0.2rem 0.5rem',
        borderRadius: '0.6rem',
        background: displayBadgeBg,
        color: displayBadgeText,
        flexShrink: '0'
      });

      const textGroup = document.createElement('div');
      Object.assign(textGroup.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        minWidth: 0
      });
      const labelLine = document.createElement('span');
      labelLine.textContent = getLanguageOptionLabel(optionValue);
      Object.assign(labelLine.style, {
        fontWeight: '600',
        fontSize: '1.25rem',
        color: styles.color
      });
      const hintLine = document.createElement('span');
      hintLine.textContent = getLanguageOptionHint(optionValue);
      Object.assign(hintLine.style, {
        fontSize: '1.15rem',
        color: styles.subtleText
      });
      textGroup.appendChild(labelLine);
      textGroup.appendChild(hintLine);

      optionRow.appendChild(input);
      optionRow.appendChild(badge);
      optionRow.appendChild(textGroup);

      languageOptionWidgets.set(optionValue, {
        row: optionRow,
        badge,
        labelLine,
        hintLine
      });

      input.addEventListener('change', () => handleLanguageOptionChange(optionValue));
      optionRow.addEventListener('click', event => {
        event.preventDefault();
        if (!input.checked) {
          input.checked = true;
          handleLanguageOptionChange(optionValue);
        }
      });

      languageOptionsWrapper.appendChild(optionRow);
    });

    updateLanguageMeta(languageState);
    syncOptionSelection(languageState.preference);

    languageCard.appendChild(languageTitleRow);
    languageCard.appendChild(languageDesc);
    languageCard.appendChild(languageOptionsWrapper);
    languageCard.appendChild(languageMetaBox);
    languageCard.appendChild(languageStatus);

    prefsContainer.appendChild(storageCard);
    prefsContainer.appendChild(exportCard);
    prefsContainer.appendChild(importCard);
    transcriptContainer.appendChild(transcriptCard);
    transcriptContainer.appendChild(transcriptInfoCard);
    displayContainer.appendChild(languageCard);

    // Compose settings container (centered by default)
    settingsContainer.appendChild(settingsContainerHeader);
    settingsContainer.appendChild(tabsBar);
    settingsContainer.appendChild(settingsContainerBody);
    settingsContainerBody.appendChild(recordsContainer);
    settingsContainerBody.appendChild(prefsContainer);
    settingsContainerBody.appendChild(transcriptContainer);
    settingsContainerBody.appendChild(displayContainer);

    Object.assign(settingsContainer.style, {
      all: 'initial',
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      fontFamily: 'inherit',
      flexDirection: 'column',
      display: 'none',
      boxShadow: 'rgba(0, 0, 0, 0.24) 0px 3px 8px',
      border: styles.border,
      padding: '1rem',
      width: '50rem',
      maxWidth: '90vw',
      maxHeight: '80vh',
      borderRadius: '.5rem',
      background: styles.background,
      zIndex: '9999', // Above backdrop and player overlays
      color: styles.color,
      overflow: 'hidden'
    });

    hostRoot.appendChild(settingsContainer);

    // Tabs interactions
    function setActiveAndLock(tab) {
      setActiveTab(tab);
      injectSettingsScrollbarsCSS();
    }
    const availableTabs = [tabRecords, tabPrefs, tabTranscript, tabDisplay];
    const defaultTabButton = availableTabs.find(btn => btn.dataset.tabId === opts.defaultTab) || tabRecords;
    setActiveAndLock(defaultTabButton);
    tabRecords.addEventListener('click', () => setActiveAndLock(tabRecords));
    tabPrefs.addEventListener('click', () => setActiveAndLock(tabPrefs));
    tabTranscript.addEventListener('click', () => setActiveAndLock(tabTranscript));
    tabDisplay.addEventListener('click', () => setActiveAndLock(tabDisplay));

    // Build initial list
    rebuildRecords();

    // Storage apply & migrate
    applyBtn.addEventListener('click', () => {
      const selected = radioGM.input.checked ? 'gm' : 'local';
      const current = Storage.getMode();
      if (selected === current) return;
      const prevText = applySpan.textContent;
      applySpan.textContent = localizeText('Migrating...', '正在迁移...');
      applyBtn.style.opacity = '0.6';
      applyBtn.style.pointerEvents = 'none';
      try {
        Storage.setMode(selected, { migrate: true, clearSource: true });
        radioLocal.input.checked = selected === 'local';
        radioGM.input.checked = selected === 'gm';
        refreshStorageChoiceStyles();
        modeBadge.textContent = selected === 'gm'
          ? localizeText('GM Storage', 'GM 存储')
          : localizeText('localStorage', '浏览器本地存储');
        rebuildRecords();
      } catch (e) {
        console.error('Failed to switch storage:', e);
      } finally {
        setTimeout(() => {
          applySpan.textContent = prevText;
          applyBtn.style.opacity = '1';
          applyBtn.style.pointerEvents = 'auto';
        }, 500);
      }
    });

    // Export actions
    btnCopyExport.addEventListener('click', async () => {
      try {
        const payload = Storage.exportAll();
        const json = JSON.stringify(payload, null, 2);
        await navigator.clipboard.writeText(json);
        btnCopyExport.style.opacity = '0.7';
        setTimeout(() => { btnCopyExport.style.opacity = '1'; }, 300);
        updateActionStatus(
          exportStatus,
          localizeText('JSON copied to clipboard.', 'JSON 已复制到剪贴板。'),
          styles.copyButtonColor
        );
      } catch (e) {
        console.error('Copy export failed:', e);
        updateActionStatus(
          exportStatus,
          localizeText('Copy export failed: {message}', '复制导出失败：{message}', { message: (e && e.message) || e || '' }),
          styles.deleteButtonColor
        );
      }
    });

    btnDownloadExport.addEventListener('click', () => {
      try {
        const payload = Storage.exportAll();
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `ysrp-export-${Storage.getMode()}-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
        updateActionStatus(
          exportStatus,
          localizeText('Export download started.', '导出下载已开始。'),
          styles.openButtonColor
        );
      } catch (e) {
        console.error('Download export failed:', e);
        updateActionStatus(
          exportStatus,
          localizeText('Download failed: {message}', '下载失败：{message}', { message: (e && e.message) || e || '' }),
          styles.deleteButtonColor
        );
      }
    });

    // Import actions
    function doImport(jsonText) {
      try {
        const payload = JSON.parse(jsonText);
        const count = Storage.importPayload(payload, { clearExisting: !!chk.checked });
        updateActionStatus(
          importStatus,
          localizeText('Imported {count} record(s).', '已导入 {count} 条记录。', { count }),
          styles.openButtonColor
        );
        rebuildRecords();
      } catch (e) {
        updateActionStatus(
          importStatus,
          localizeText('Import failed: {message}', '导入失败：{message}', { message: e.message || e }),
          styles.deleteButtonColor
        );
        console.error('Import failed:', e);
      }
    }

    btnImportText.addEventListener('click', () => {
      const text = importTextarea.value.trim();
      if (!text) {
        updateActionStatus(importStatus, localizeText('Nothing to import.', '没有可导入的内容。'), styles.subtleText);
        return;
      }
      doImport(text);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      fileNameDisplay.textContent = file ? file.name : fileInputDefaultLabel;
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        importTextarea.value = text;
        doImport(text);
      };
      reader.readAsText(file);
      fileInput.value = '';
      fileNameDisplay.textContent = fileInputDefaultLabel;
    });
  }

  function createInfoUI() {
    if (document.querySelector(SELECTORS.infoContainer)) return;

    const infoElContainer = document.createElement('div');
    infoElContainer.classList.add(CLASS_NAMES.infoContainer);

    const infoEl = document.createElement('div');
    infoEl.classList.add('last-save-info');

    const infoElText = document.createElement('span');
    infoElText.textContent = localizeText('Loading...', '加载中...');
    infoElText.classList.add('last-save-info-text');

    const settingsButton = document.createElement('button');
    settingsButton.classList.add('ysrp-settings-button');
    settingsButton.style.background = styles.buttonBackground;
    settingsButton.style.border = 'none';
    settingsButton.style.marginLeft = '0.5rem';
    settingsButton.style.cursor = 'pointer';
    settingsButton.style.display = 'flex';
    settingsButton.style.alignItems = 'center';
    settingsButton.style.justifyContent = 'center';
    settingsButton.style.width = '2rem';
    settingsButton.style.height = '2rem';
    settingsButton.style.borderRadius = '0.5rem';
    settingsButton.title = localizeText('Open settings', '打开设置');

    const gearIcon = createIcon('gear', styles.color);
    settingsButton.appendChild(gearIcon);

    infoEl.appendChild(infoElText);
    infoEl.appendChild(settingsButton);

    Object.assign(infoEl.style, {
      textShadow: 'none',
      background: styles.background,
      color: styles.color,
      padding: '.5rem',
      borderRadius: '.5rem',
      display: 'flex',
      alignItems: 'center'
    });

    Object.assign(infoElContainer.style, {
      all: 'initial',
      fontFamily: 'inherit',
      fontSize: '1.3rem',
      marginLeft: '0.5rem',
      display: 'flex',
      alignItems: 'center'
    });

    infoElContainer.appendChild(infoEl);
    return infoElContainer;
  }

  async function onChaptersReadyToMount(callback) {
    await waitForElm('.ytp-chapter-container[style=""]');
    callback();
  }

  function recreateInfoContainer() {
    const existing = document.querySelector(SELECTORS.infoContainer);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    const infoEl = createInfoUI();
    insertInfoElement(infoEl);
    insertInfoElementInChaptersContainer(infoEl);
  }

  function refreshLanguageDependentUI() {
    const settingsContainer = document.querySelector(SELECTORS.settingsContainer);
    const wasOpen = settingsContainer && settingsContainer.style.display !== 'none';
    const activeTabId = settingsContainer && settingsContainer.dataset ? settingsContainer.dataset.activeTab : null;
    if (settingsContainer) {
      if (typeof settingsContainer._ysrpClose === 'function') {
        settingsContainer._ysrpClose();
      }
      settingsContainer.remove();
    }
    recreateInfoContainer();
    createSettingsUI({ defaultTab: activeTabId || SETTINGS_TABS.records });
    bindSettingsToggle();
    if (wasOpen) {
      const freshContainer = document.querySelector(SELECTORS.settingsContainer);
      if (freshContainer && typeof freshContainer._ysrpOpen === 'function') {
        freshContainer._ysrpOpen();
      }
      if (activeTabId) {
        const targetTab = freshContainer && freshContainer.querySelector(`[data-tab-id="${activeTabId}"]`);
        if (targetTab) targetTab.click();
      }
    }
  }

  if (LANGUAGE_EVENT_NAME) {
    let pendingLanguageRefresh = null;
    document.addEventListener(LANGUAGE_EVENT_NAME, () => {
      if (pendingLanguageRefresh) {
        clearTimeout(pendingLanguageRefresh);
      }
      pendingLanguageRefresh = setTimeout(() => {
        pendingLanguageRefresh = null;
        refreshLanguageDependentUI();
      }, 50);
    });
  }

/* -------------------------------------------------------------------------- *
 * Module 12 · External dependency loaders (fonts, scrollbars)
 * -------------------------------------------------------------------------- */

  // ========== Dependencies ==========
  function addFontawesomeIcons() {
    const head = document.getElementsByTagName('HEAD')[0];
    const iconsUi = document.createElement('link');
    Object.assign(iconsUi, {
      rel: 'stylesheet',
      type: 'text/css',
      href: configData.dependenciesURLs.fontAwesomeIcons
    });
    head.appendChild(iconsUi);
  }

  function initializeDependencies() {
    addFontawesomeIcons();
    injectSettingsScrollbarsCSS();
  }

  function initializeUI() {
    const infoEl = createInfoUI();
    insertInfoElement(infoEl);
    createSettingsUI();          // build settings UI ASAP
    initializeDependencies();

    // Bind toggle after both button and popup exist
    bindSettingsToggle();

    onChaptersReadyToMount(() => {
      insertInfoElementInChaptersContainer(infoEl);
      createSettingsUI();
      bindSettingsToggle();
    });

    observeDomForRebinds();
  }

/* -------------------------------------------------------------------------- *
 * Module 13 · Housekeeping observers and invalid entry cleanup
 * -------------------------------------------------------------------------- */

  // ========== Housekeeping ==========
  function cleanInvalidEntries() {
    const savedVideos = getSavedVideoList();
    savedVideos.forEach(([key, value]) => {
      try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid record');
        }

        let shouldRewrite = false;
        if (typeof parsed.videoName !== 'string') {
          parsed.videoName = DEFAULT_VIDEO_NAME;
          shouldRewrite = true;
        } else {
          const trimmed = parsed.videoName.trim();
          if (!trimmed) {
            parsed.videoName = DEFAULT_VIDEO_NAME;
            shouldRewrite = true;
          } else if (trimmed !== parsed.videoName) {
            parsed.videoName = trimmed;
            shouldRewrite = true;
          }
        }

        const normalizedVideo = typeof parsed.videoName === 'string' ? parsed.videoName.trim().toLowerCase() : '';
        const normalizedOriginal = typeof parsed.originalTitle === 'string' ? parsed.originalTitle.trim().toLowerCase() : '';
        if (normalizedVideo && normalizedOriginal && normalizedVideo === normalizedOriginal) {
          parsed.videoName = DEFAULT_VIDEO_NAME;
          shouldRewrite = true;
        }

        if (shouldRewrite) {
          Storage.setItem(key, JSON.stringify(parsed));
        }
      } catch {
        Storage.removeItem(key);
      }
    });
  }

  function observeDomForRebinds() {
    const observer = new MutationObserver(mutations => {
      let needBind = false;
      mutations.forEach(mutation => {
        mutation.removedNodes.forEach(removedNode => {
          if (removedNode.classList && removedNode.classList.contains(CLASS_NAMES.infoContainer)) {
            const infoEl = createInfoUI();
            insertInfoElement(infoEl);
            createSettingsUI();
            needBind = true;
          }
        });
        mutation.addedNodes.forEach(addedNode => {
          if (addedNode.id === 'movie_player' ||
              (addedNode.classList && addedNode.classList.contains('ytp-chapter-container'))) {
            const infoEl = createInfoUI();
            insertInfoElement(infoEl);
            insertInfoElementInChaptersContainer(infoEl);
            createSettingsUI();
            needBind = true;
          }
        });
      });
      if (needBind) {
        // Ensure host/backdrop exist and toggle is bound
        const hostRoot = getHostRoot();
        ensureBackdrop(hostRoot);
        bindSettingsToggle();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

/* -------------------------------------------------------------------------- *
 * Module 14 · Bootstrap sequence wiring everything together
 * -------------------------------------------------------------------------- */

  // ========== Bootstrap ==========
  function initialize() {
    configData.storageMode = Storage.getMode();

    cleanInvalidEntries();

    // Build UI as soon as the player exists
    onPlayerElementExist(() => {
      // Ensure host/backdrop first to avoid race on first click
      const hostRoot = getHostRoot();
      ensureBackdrop(hostRoot);

      initializeUI();

      const progressSetInterval = setInterval(() => {
        if (isReadyToSetSavedProgress()) {
          setSavedProgress();
          clearInterval(progressSetInterval);
        }
      }, 500);
    });

    setInterval(saveVideoProgress, configData.savingInterval);
  }

  initialize();
})();
