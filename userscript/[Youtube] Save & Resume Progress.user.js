// ==UserScript==
// @name         [Youtube] Save & Resume Progress [20251111] v1.0.3
// @namespace    0_V userscripts/Youtube Save & Resume Progress
// @description  Save & resume YouTube playback progress. Storage backend selection (localStorage or GM storage) with migration, import/export under a settings sub-tab. Fix: On YouTube new UI, the settings popup opens reliably on the page (not on the player), without causing player zoom/jitter, even right after page load.
// @version      [20251111] v1.0.3
// @update-log   [20251111] v1.0.3 · Notes button auto-opens blank notes and saves edits on toggle
// @license      MIT
//
// @match        *://*.youtube.com/*
//
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
//
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
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
    open: ['fa-solid', 'fa-arrow-up-right-from-square'],
    database: ['fa-solid', 'fa-database'],
    download: ['fa-solid', 'fa-file-arrow-down'],
    upload: ['fa-solid', 'fa-file-arrow-up'],
    arrows: ['fa-solid', 'fa-right-left'],
    refresh: ['fa-solid', 'fa-arrows-rotate']
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
 * Module 08 · "Last saved" info banner rendering and updates
 * -------------------------------------------------------------------------- */

  // ========== UI: Last save info ==========
  function updateLastSaved(videoProgress) {
    const lastSaveEl = document.querySelector('.last-save-info-text');
    if (lastSaveEl) lastSaveEl.textContent = fancyTimeFormat(videoProgress);
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
        // Toggle
        const hidden = (settingsContainer.style.display === 'none' || !settingsContainer.style.display);
        if (hidden) openPopup(); else closePopup();
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
      backdrop.addEventListener('click', () => closePopup());
    }

    // Expose for programmatic close
    settingsContainer._ysrpClose = closePopup;

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
  const NOTE_EMPTY_PLACEHOLDER = '暂无笔记';

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

  function createSettingsUI() {
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
    settingsContainerHeaderTitle.textContent = `Saved Videos - (${videosCount})`;
    settingsContainerHeaderTitle.style.color = styles.color;
    settingsContainerHeaderTitle.style.margin = '0';

    const modeBadge = document.createElement('span');
    modeBadge.textContent = Storage.getMode() === 'gm' ? 'GM Storage' : 'localStorage';
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
    refreshStatusIndicator.title = '正在更新列表…';
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

    function makeTab(label, iconName) {
      const btn = document.createElement('button');
      btn.style.background = 'transparent';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '0.4rem';
      btn.style.padding = '0.25rem 0.5rem';
      btn.style.color = styles.tabInactive;
      btn.style.fontWeight = '600';
      const ic = createIcon(iconName, styles.tabInactive);
      const span = document.createElement('span');
      span.textContent = label;
      btn.appendChild(ic);
      btn.appendChild(span);
      btn._icon = ic;
      return btn;
    }

    const tabRecords = makeTab('Records', 'database');
    const tabPrefs = makeTab('Settings', 'gear');

    tabsBar.appendChild(tabRecords);
    tabsBar.appendChild(tabPrefs);

    function setActiveTab(tab) {
      [tabRecords, tabPrefs].forEach(b => {
        const active = (b === tab);
        b.style.color = active ? styles.tabActive : styles.tabInactive;
        if (b._icon) b._icon.style.color = active ? styles.tabActive : styles.tabInactive;
      });
      recordsContainer.style.display = tab === tabRecords ? 'flex' : 'none';
      prefsContainer.style.display = tab === tabPrefs ? 'flex' : 'none';
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
        settingsContainerHeaderTitle.textContent = `Saved Videos - (${all.length})`;

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
          const loadingOriginalPlaceholder = '正在获取原标题…';
          const missingOriginalPlaceholder = '未找到原标题';
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
              dearrowToggleButton.title = '正在检测 DeArrow 标题…';
              return;
            }
            dearrowToggleButton.title = showingOriginalTitle ? '恢复DeArrow标题' : '显示原标题';
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
          urlButton.title = '显示/隐藏 URL';
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
          noteButton.title = '显示笔记';
          const noteIcon = createIcon('note', styles.editButtonColor);
          noteButton.appendChild(noteIcon);

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
          deleteButton.title = '删除保存记录';
          const trashIcon = createIcon('trash', styles.deleteButtonColor);
          deleteButton.appendChild(trashIcon);

          videoElTop.appendChild(progressEl);
          videoElTop.appendChild(videoElText);
          if (dearrowToggleButton) {
            videoElTop.appendChild(dearrowToggleButton);
          }
          videoElTop.appendChild(noteButton);
          videoElTop.appendChild(urlButton);
          videoElTop.appendChild(deleteButton);
          videoEl.appendChild(videoElTop);

          const urlDisplay = document.createElement('div');
          const videoURL = `https://www.youtube.com/watch?v=${videoId}`;
          urlDisplay.textContent = `URL: ${videoURL}`;
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
          copySuccessTip.textContent = '已复制';
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
          copyButton.title = '复制 URL';
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
          openButton.title = '在新标签页中打开 URL';
          const openIcon = createIcon('open', styles.openButtonColor);
          openButton.appendChild(openIcon);

          urlDisplay.appendChild(copyButton);
          urlDisplay.appendChild(openButton);
          videoEl.appendChild(urlDisplay);

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
          noteLabel.textContent = '笔记';
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
            noteContent.textContent = hasNote ? value : NOTE_EMPTY_PLACEHOLDER;
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
            noteEditButton.title = isEditingNote ? '保存笔记' : '编辑笔记';
          }

          function hasNoteContent() {
            return Boolean((currentNoteValue || '').trim());
          }

          function refreshNoteButtonState() {
            const notePresent = hasNoteContent();
            noteButton.disabled = false;
            noteButton.style.opacity = '1';
            noteButton.title = isEditingNote
              ? '保存并折叠笔记'
              : notePresent
                ? (noteVisible ? '隐藏笔记' : '显示笔记')
                : '添加笔记';
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
            videosList.removeChild(videoEl);
            settingsContainerHeaderTitle.textContent = `Saved Videos - (${videosList.children.length})`;
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
              boxSizing: 'border-box'
            });
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

    // Storage selection
    const storageCard = document.createElement('div');
    Object.assign(storageCard.style, {
      background: styles.recordBackground,
      borderRadius: '0.5rem',
      padding: '0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    });

    const storageTitle = document.createElement('div');
    storageTitle.style.display = 'flex';
    storageTitle.style.alignItems = 'center';
    storageTitle.style.gap = '0.5rem';
    const storageIcon = createIcon('database', styles.color);
    const storageTitleText = document.createElement('strong');
    storageTitleText.textContent = 'Storage Backend';
    storageTitle.appendChild(storageIcon);
    storageTitle.appendChild(storageTitleText);

    const storageNote = document.createElement('div');
    storageNote.textContent = 'Choose where to store your progress data.';
    storageNote.style.color = styles.subtleText;
    storageNote.style.fontSize = '0.9rem';

    const storageOptions = document.createElement('div');
    storageOptions.style.display = 'flex';
    storageOptions.style.gap = '1rem';
    storageOptions.style.alignItems = 'center';
    storageOptions.style.flexWrap = 'wrap';

    function makeRadio(id, label) {
      const wrap = document.createElement('label');
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '0.4rem';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'ysrp-storage-mode';
      input.value = id;
      const span = document.createElement('span');
      span.textContent = label;
      wrap.appendChild(input);
      wrap.appendChild(span);
      return { wrap, input };
    }

    const radioLocal = makeRadio('local', 'localStorage (default)');
    const radioGM = makeRadio('gm', 'GM storage');
    const currentMode = Storage.getMode();
    radioLocal.input.checked = currentMode === 'local';
    radioGM.input.checked = currentMode === 'gm';
    storageOptions.appendChild(radioLocal.wrap);
    storageOptions.appendChild(radioGM.wrap);

    const storageActions = document.createElement('div');
    storageActions.style.display = 'flex';
    storageActions.style.gap = '0.5rem';
    storageActions.style.flexWrap = 'wrap';

    const applyBtn = document.createElement('button');
    Object.assign(applyBtn.style, {
      background: styles.buttonBackground,
      border: styles.buttonBorder,
      borderRadius: '0.5rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      padding: '0.35rem 0.6rem',
      color: styles.color
    });
    applyBtn.title = 'Switch storage backend and migrate data';
    const arrowsIcon = createIcon('arrows', styles.color);
    const applySpan = document.createElement('span');
    applySpan.textContent = 'Apply & Migrate';
    applyBtn.appendChild(arrowsIcon);
    applyBtn.appendChild(applySpan);

    const applyInfo = document.createElement('div');
    applyInfo.style.color = styles.subtleText;
    applyInfo.style.fontSize = '0.85rem';
    applyInfo.textContent = 'Migrates all saved records to the selected backend (moves data).';

    storageActions.appendChild(applyBtn);
    storageCard.appendChild(storageTitle);
    storageCard.appendChild(storageNote);
    storageCard.appendChild(storageOptions);
    storageCard.appendChild(storageActions);
    storageCard.appendChild(applyInfo);

    // Export card
    const exportCard = document.createElement('div');
    Object.assign(exportCard.style, {
      background: styles.recordBackground,
      borderRadius: '0.5rem',
      padding: '0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    });
    const exportTitle = document.createElement('div');
    exportTitle.style.display = 'flex';
    exportTitle.style.alignItems = 'center';
    exportTitle.style.gap = '0.5rem';
    exportTitle.appendChild(createIcon('download', styles.color));
    const exportTitleSpan = document.createElement('strong');
    exportTitleSpan.textContent = 'Export Data';
    exportTitle.appendChild(exportTitleSpan);

    const exportActions = document.createElement('div');
    exportActions.style.display = 'flex';
    exportActions.style.gap = '0.5rem';
    exportActions.style.flexWrap = 'wrap';

    const btnCopyExport = document.createElement('button');
    Object.assign(btnCopyExport.style, {
      background: styles.buttonBackground,
      border: styles.buttonBorder,
      borderRadius: '0.5rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      padding: '0.35rem 0.6rem',
      color: styles.color
    });
    btnCopyExport.title = 'Copy export JSON to clipboard';
    btnCopyExport.appendChild(createIcon('copy', styles.copyButtonColor));
    btnCopyExport.appendChild(document.createTextNode('Copy JSON'));

    const btnDownloadExport = document.createElement('button');
    Object.assign(btnDownloadExport.style, {
      background: styles.buttonBackground,
      border: styles.buttonBorder,
      borderRadius: '0.5rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      padding: '0.35rem 0.6rem',
      color: styles.color
    });
    btnDownloadExport.title = 'Download export JSON as file';
    btnDownloadExport.appendChild(createIcon('download', styles.openButtonColor));
    btnDownloadExport.appendChild(document.createTextNode('Download JSON'));

    const exportHint = document.createElement('div');
    exportHint.style.color = styles.subtleText;
    exportHint.style.fontSize = '0.85rem';
    exportHint.textContent = 'Exports all saved records from the current backend';

    exportActions.appendChild(btnCopyExport);
    exportActions.appendChild(btnDownloadExport);
    exportCard.appendChild(exportTitle);
    exportCard.appendChild(exportActions);
    exportCard.appendChild(exportHint);

    // Import card
    const importCard = document.createElement('div');
    Object.assign(importCard.style, {
      background: styles.recordBackground,
      borderRadius: '0.5rem',
      padding: '0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem'
    });

    const importTitle = document.createElement('div');
    importTitle.style.display = 'flex';
    importTitle.style.alignItems = 'center';
    importTitle.style.gap = '0.5rem';
    importTitle.appendChild(createIcon('upload', styles.color));
    const importTitleSpan = document.createElement('strong');
    importTitleSpan.textContent = 'Import Data';
    importTitle.appendChild(importTitleSpan);

    const importTextarea = document.createElement('textarea');
    Object.assign(importTextarea.style, {
      width: '100%',
      minHeight: '6rem',
      background: styles.inputBg,
      color: styles.color,
      border: `1px solid ${styles.inputBorder}`,
      borderRadius: '0.4rem',
      padding: '0.5rem',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      fontSize: '0.95rem'
    });
    importTextarea.placeholder = 'Paste exported JSON here...';

    const importActions = document.createElement('div');
    importActions.style.display = 'flex';
    importActions.style.gap = '0.5rem';
    importActions.style.flexWrap = 'wrap';
    importActions.style.alignItems = 'center';

    const btnImportText = document.createElement('button');
    Object.assign(btnImportText.style, {
      background: styles.buttonBackground,
      border: styles.buttonBorder,
      borderRadius: '0.5rem',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.5rem',
      padding: '0.35rem 0.6rem',
      color: styles.color
    });
    btnImportText.title = 'Import from pasted JSON';
    btnImportText.appendChild(createIcon('upload', styles.openButtonColor));
    btnImportText.appendChild(document.createTextNode('Import from Text'));

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json';
    Object.assign(fileInput.style, {
      background: styles.buttonBackground,
      border: styles.buttonBorder,
      borderRadius: '0.5rem',
      color: styles.color,
      padding: '0.25rem'
    });

    const chkClear = document.createElement('label');
    chkClear.style.display = 'flex';
    chkClear.style.alignItems = 'center';
    chkClear.style.gap = '0.4rem';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    const chkSpan = document.createElement('span');
    chkSpan.textContent = 'Overwrite';
    chkClear.appendChild(chk);
    chkClear.appendChild(chkSpan);

    const importHint = document.createElement('div');
    importHint.style.color = styles.subtleText;
    importHint.style.fontSize = '0.85rem';
    importHint.textContent = 'Imports records into the currently selected backend';

    const importStatus = document.createElement('div');
    importStatus.style.color = styles.subtleText;
    importStatus.style.fontSize = '0.85rem';

    importActions.appendChild(btnImportText);
    importActions.appendChild(fileInput);
    importActions.appendChild(chkClear);

    importCard.appendChild(importTitle);
    importCard.appendChild(importTextarea);
    importCard.appendChild(importActions);
    importCard.appendChild(importHint);
    importCard.appendChild(importStatus);

    prefsContainer.appendChild(storageCard);
    prefsContainer.appendChild(exportCard);
    prefsContainer.appendChild(importCard);

    // Compose settings container (centered by default)
    settingsContainer.appendChild(settingsContainerHeader);
    settingsContainer.appendChild(tabsBar);
    settingsContainer.appendChild(settingsContainerBody);
    settingsContainerBody.appendChild(recordsContainer);
    settingsContainerBody.appendChild(prefsContainer);

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
    setActiveAndLock(tabRecords);
    tabRecords.addEventListener('click', () => setActiveAndLock(tabRecords));
    tabPrefs.addEventListener('click', () => setActiveAndLock(tabPrefs));

    // Build initial list
    rebuildRecords();

    // Storage apply & migrate
    applyBtn.addEventListener('click', () => {
      const selected = radioGM.input.checked ? 'gm' : 'local';
      const current = Storage.getMode();
      if (selected === current) return;
      const prevText = applySpan.textContent;
      applySpan.textContent = 'Migrating...';
      applyBtn.style.opacity = '0.6';
      applyBtn.style.pointerEvents = 'none';
      try {
        Storage.setMode(selected, { migrate: true, clearSource: true });
        modeBadge.textContent = selected === 'gm' ? 'GM Storage' : 'localStorage';
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
      } catch (e) {
        console.error('Copy export failed:', e);
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
      } catch (e) {
        console.error('Download export failed:', e);
      }
    });

    // Import actions
    function doImport(jsonText) {
      try {
        const payload = JSON.parse(jsonText);
        const count = Storage.importPayload(payload, { clearExisting: !!chk.checked });
        importStatus.textContent = `Imported ${count} record(s).`;
        rebuildRecords();
      } catch (e) {
        importStatus.textContent = `Import failed: ${e.message || e}`;
        console.error('Import failed:', e);
      }
    }

    btnImportText.addEventListener('click', () => {
      const text = importTextarea.value.trim();
      if (!text) {
        importStatus.textContent = 'Nothing to import.';
        return;
      }
      doImport(text);
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        importTextarea.value = text;
        doImport(text);
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  function createInfoUI() {
    if (document.querySelector(SELECTORS.infoContainer)) return;

    const infoElContainer = document.createElement('div');
    infoElContainer.classList.add(CLASS_NAMES.infoContainer);

    const infoEl = document.createElement('div');
    infoEl.classList.add('last-save-info');

    const infoElText = document.createElement('span');
    infoElText.textContent = "Loading...";
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
    settingsButton.title = '打开设置';

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
