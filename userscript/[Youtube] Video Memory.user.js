// ==UserScript==
// @name         [Youtube] Video Memory [20261010] v2.2.0
// @namespace    0_V userscripts/Youtube Save & Resume Progress
// @version      [20261010] v2.2.0
// @description  Save & resume YouTube playback progress reliably (waits for the player, skips ads, per-video sessions), timestamp-link choice dialog, records/storage/transcript settings, void++-style plugins, 💾 badge toggle and optional Google Drive sync.
// @update-log   [20261010] v2.2.0 · Clean-room rewrite: new progress engine (no lost progress), &t= choice dialog, void++-style plugin architecture and settings UI, 💾 badge toggle plugin, per-video Google Drive sync, page scrollbar kept while the dialog is open.
// @author       0_V
// @license      MIT
// @match        *://*.youtube.com/*
// @icon         https://github.com/0-V-linuxdo/Youtube-Memory/raw/refs/heads/main/main_icon/main_icon.svg
// @homepageURL  https://github.com/0-V-linuxdo/Youtube-Memory
// @supportURL   https://github.com/0-V-linuxdo/Youtube-Memory/issues
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      oauth2.googleapis.com
// @connect      www.googleapis.com
// ==/UserScript==

/*
 * Based on "Youtube Save/Resume Progress" by Costin Alexandru Sandu
 * (https://greasyfork.org/scripts/487305, v1.5.1). Thank you!
 *
 * Generated file — edit the TypeScript sources under src/ and run `bun run build`.
 * 本文件由 src/ 下的 TypeScript 源码经 `bun run build` 生成，请勿直接修改。
 * YouTube enforces Trusted Types: never assign innerHTML / outerHTML; build the UI with DOM APIs.
 * YouTube 启用了 Trusted Types：禁止给 innerHTML / outerHTML 赋值，只能用 DOM API 构建界面。
 */

'use strict';
(() => {
  // src/utils/constants.ts
  var VERSION = "[20261010] v2.2.0";
  var VERSION_SHORT = (VERSION.match(/v[\d.]+/) || [VERSION])[0];
  var RECORD_PREFIX = "Youtube_SaveResume_Progress-";
  var KEY_STORAGE_MODE = "YSRP_StorageMode";
  var KEY_TRANSCRIPT = "YSRP_TranscriptSettings";
  var KEY_LANGUAGE = "YSRP_LanguagePreference";
  var KEY_PLUGINS = "YSRP_Plugins";
  var KEY_DRIVE = "YSRP_DriveSettings";
  var KEY_DRIVE_FULL_SYNC = "YSRP_DriveFullSyncDone";
  var UNKNOWN_TITLE = "Unknown Title";
  var LEGACY_LOADING_TITLE = "正在获取标题…";
  var EVT_LANGUAGE = "ysrp-language-changed";
  var EVT_VIDEO_STATUS = "ysrp-current-video-status";
  var EVT_DEARROW_READY = "ysrp-dearrow-title-ready";
  var EVT_RECORD_UPDATED = "ysrp-record-updated";
  var EVT_DRIVE_STATUS = "ysrp-drive-sync-status";
  var CLS_BADGE_CONTAINER = "last-save-info-container";
  var CLS_BADGE_INNER = "last-save-info";
  var CLS_BADGE_TEXT = "last-save-info-text";
  var CLS_SETTINGS_BUTTON = "ysrp-settings-button";
  var CLS_MODAL = "ysrp-settings-container";
  var CLS_MODAL_BODY = "ysrp-settings-container-body";
  var CLS_BACKDROP = "ysrp-backdrop";
  var FONT_AWESOME_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
  var HOMEPAGE_URL = "https://github.com/0-V-linuxdo/Youtube-Memory";
  var OEMBED_URL = "https://www.youtube.com/oembed?format=json&url=";
  var DEARROW_URL = "https://sponsor.ajay.app/api/branding?videoID=";
  var watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

  // src/utils/storage.ts
  var gmAvailable = typeof GM_getValue === "function" && typeof GM_setValue === "function" && typeof GM_listValues === "function" && typeof GM_deleteValue === "function";
  function ls() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
  var localBackend = {
    mode: "local",
    get(key) {
      try {
        return ls()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      const s = ls();
      if (!s)
        throw new Error("localStorage is not available");
      s.setItem(key, value);
    },
    remove(key) {
      try {
        ls()?.removeItem(key);
      } catch {}
    },
    keys() {
      try {
        const s = ls();
        if (!s)
          return [];
        const out = [];
        for (let i = 0;i < s.length; i++) {
          const k = s.key(i);
          if (k !== null)
            out.push(k);
        }
        return out;
      } catch {
        return [];
      }
    }
  };
  var gmBackend = {
    mode: "gm",
    get(key) {
      if (!gmAvailable)
        return null;
      try {
        const v = GM_getValue(key);
        return v === undefined ? null : v;
      } catch {
        return null;
      }
    },
    set(key, value) {
      if (!gmAvailable)
        throw new Error("GM storage is not available");
      GM_setValue(key, value);
    },
    remove(key) {
      if (!gmAvailable)
        return;
      try {
        GM_deleteValue(key);
      } catch {}
    },
    keys() {
      if (!gmAvailable)
        return [];
      try {
        return GM_listValues() || [];
      } catch {
        return [];
      }
    }
  };
  function backendFor(mode) {
    return mode === "gm" ? gmBackend : localBackend;
  }
  function listPrefixed(backend, prefix = RECORD_PREFIX) {
    const out = [];
    for (const k of backend.keys()) {
      if (k.startsWith(prefix))
        out.push([k, backend.get(k)]);
    }
    return out;
  }
  function gmGetRaw(key) {
    if (typeof GM_getValue !== "function")
      return null;
    try {
      const v = GM_getValue(key);
      return v === undefined ? null : v;
    } catch {
      return null;
    }
  }
  function gmSetRaw(key, value) {
    if (typeof GM_setValue !== "function")
      return false;
    try {
      GM_setValue(key, value);
      return true;
    } catch {
      return false;
    }
  }
  function readSetting(key) {
    const local = localBackend.get(key);
    if (typeof local === "string" && local !== "")
      return local;
    const gm = gmGetRaw(key);
    if (gm === null || gm === undefined || gm === "")
      return null;
    return typeof gm === "string" ? gm : JSON.stringify(gm);
  }
  function writeSetting(key, value) {
    let ok = false;
    try {
      localBackend.set(key, value);
      ok = true;
    } catch {}
    if (gmSetRaw(key, value))
      ok = true;
    return ok;
  }
  function readSecretSetting(key) {
    const gm = gmGetRaw(key);
    if (gm !== null && gm !== undefined && gm !== "")
      return typeof gm === "string" ? gm : JSON.stringify(gm);
    const local = localBackend.get(key);
    return typeof local === "string" && local !== "" ? local : null;
  }
  function writeSecretSetting(key, value) {
    if (gmSetRaw(key, value)) {
      localBackend.remove(key);
      return;
    }
    localBackend.set(key, value);
  }
  var currentMode = null;
  function detectMode() {
    let stored = localBackend.get(KEY_STORAGE_MODE);
    if (gmAvailable && (stored === null || stored === ""))
      stored = gmBackend.get(KEY_STORAGE_MODE);
    return stored === "gm" && gmAvailable ? "gm" : "local";
  }
  function persistMode(mode) {
    try {
      localBackend.set(KEY_STORAGE_MODE, mode);
    } catch {}
    if (gmAvailable) {
      try {
        gmBackend.set(KEY_STORAGE_MODE, mode);
      } catch {}
    }
  }
  function getMode() {
    if (!currentMode) {
      currentMode = detectMode();
      persistMode(currentMode);
    }
    return currentMode;
  }
  function activeBackend() {
    return backendFor(getMode());
  }
  function switchMode(target, options = {}) {
    const migrate = options.migrate !== false;
    const clearSource = options.clearSource !== false;
    if (target !== "local" && target !== "gm")
      return { ok: false, moved: 0, error: "invalid mode" };
    const from = getMode();
    if (from === target)
      return { ok: true, moved: 0 };
    if (target === "gm" && !gmAvailable)
      return { ok: false, moved: 0, error: "GM storage is not available" };
    const src = backendFor(from);
    const dst = backendFor(target);
    let moved = 0;
    if (migrate) {
      const entries = listPrefixed(src);
      const failures = [];
      for (const [key, value] of entries) {
        const text = typeof value === "string" ? value : JSON.stringify(value);
        try {
          dst.set(key, text);
          const back = dst.get(key);
          if ((typeof back === "string" ? back : JSON.stringify(back)) !== text)
            failures.push(key);
        } catch (err) {
          failures.push(key);
        }
      }
      if (failures.length) {
        return { ok: false, moved: 0, error: `${failures.length} record(s) could not be written to the target backend` };
      }
      moved = entries.length;
      if (clearSource)
        for (const [key] of entries)
          src.remove(key);
    }
    currentMode = target;
    persistMode(target);
    return { ok: true, moved };
  }
  function exportData() {
    const entries = {};
    for (const [k, v] of listPrefixed(activeBackend()))
      entries[k] = v;
    return { version: "1", exportedAt: Date.now(), storageMode: getMode(), entries };
  }
  function importData(payload, options = {}) {
    if (!payload || typeof payload !== "object" || !("entries" in payload))
      throw new Error("Invalid import payload");
    const entries = payload.entries;
    if (!entries || typeof entries !== "object" || Array.isArray(entries))
      throw new Error("Invalid import payload");
    const pairs = Object.entries(entries).filter(([k]) => k.startsWith(RECORD_PREFIX));
    const backend = activeBackend();
    if (options.overwrite) {
      if (!pairs.length)
        throw new Error("No records to import; existing records were kept");
      for (const [k] of listPrefixed(backend))
        backend.remove(k);
    }
    let count = 0;
    for (const [key, value] of pairs) {
      if (value === null || value === undefined)
        continue;
      const text = typeof value === "string" ? value : JSON.stringify(value);
      try {
        backend.set(key, text);
        count++;
      } catch (err) {
        console.error("[Video Memory] Import write failed:", key, err);
      }
    }
    return count;
  }

  // src/api/events.ts
  class Emitter {
    handlers = new Set;
    on(fn) {
      this.handlers.add(fn);
      return () => {
        this.handlers.delete(fn);
      };
    }
    emit(value) {
      for (const fn of Array.from(this.handlers)) {
        try {
          fn(value);
        } catch (err) {
          console.error("[Video Memory] listener failed:", err);
        }
      }
    }
  }
  function dispatch(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {}
  }

  // src/api/records.ts
  var recordChanges = new Emitter;
  var recordKey = (videoId) => RECORD_PREFIX + videoId;
  function parseRecord(raw) {
    if (raw === null || raw === undefined)
      return null;
    if (typeof raw === "object")
      return Array.isArray(raw) ? null : { ...raw };
    if (typeof raw !== "string")
      return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed === null)
        return {};
      return typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  function readRecord(videoId) {
    if (!videoId)
      return null;
    return parseRecord(activeBackend().get(recordKey(videoId)));
  }
  function writeRecord(videoId, record, kind = "content") {
    if (!videoId)
      throw new Error("Missing video id");
    const next = { ...record };
    if (kind === "content")
      next.updatedAt = Date.now();
    activeBackend().set(recordKey(videoId), JSON.stringify(next));
    recordChanges.emit({ videoId, kind, record: next });
    return next;
  }
  function updateRecord(videoId, updater, kind = "content") {
    const current = readRecord(videoId);
    const next = updater(current ? { ...current } : null);
    if (!next)
      return null;
    return writeRecord(videoId, next, kind);
  }
  function removeRecord(videoId, kind = "delete") {
    if (!videoId)
      return;
    activeBackend().remove(recordKey(videoId));
    recordChanges.emit({ videoId, kind, record: null });
  }
  function listRecords() {
    return listPrefixed(activeBackend()).map(([key, raw]) => ({
      videoId: key.slice(RECORD_PREFIX.length),
      key,
      raw,
      record: parseRecord(raw)
    }));
  }
  function countRecords() {
    return listRecords().filter((e) => e.record !== null).length;
  }
  function cleanupRecords() {
    const backend = activeBackend();
    for (const entry of listRecords()) {
      try {
        const rec = entry.record;
        if (!rec || typeof rec !== "object") {
          backend.remove(entry.key);
          continue;
        }
        let dirty = typeof entry.raw !== "string";
        if (typeof rec.videoName !== "string" || !rec.videoName.trim()) {
          rec.videoName = UNKNOWN_TITLE;
          dirty = true;
        } else if (rec.videoName.trim() !== rec.videoName) {
          rec.videoName = rec.videoName.trim();
          dirty = true;
        }
        if (dirty) {
          try {
            backend.set(entry.key, JSON.stringify(rec));
          } catch {}
        }
      } catch {
        backend.remove(entry.key);
      }
    }
  }

  // src/utils/dom.ts
  var RESERVED = new Set(["class", "style", "text", "attrs", "dataset", "on"]);
  function appendChildren(el, children) {
    for (const child of children) {
      if (child === null || child === undefined || child === false)
        continue;
      if (Array.isArray(child))
        appendChildren(el, child);
      else if (child instanceof Node)
        el.appendChild(child);
      else
        el.appendChild(document.createTextNode(String(child)));
    }
  }
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      if (props.class)
        el.className = props.class;
      if (props.style)
        el.setAttribute("style", props.style);
      if (props.text !== undefined)
        el.textContent = props.text;
      if (props.attrs) {
        for (const [k, v] of Object.entries(props.attrs)) {
          if (v === null || v === undefined || v === false)
            continue;
          el.setAttribute(k, v === true ? "" : String(v));
        }
      }
      if (props.dataset)
        for (const [k, v] of Object.entries(props.dataset))
          el.dataset[k] = v;
      if (props.on)
        for (const [type, fn] of Object.entries(props.on))
          el.addEventListener(type, fn);
      for (const [k, v] of Object.entries(props)) {
        if (RESERVED.has(k) || v === undefined)
          continue;
        if (k === "innerHTML" || k === "outerHTML")
          throw new Error("innerHTML is not allowed (Trusted Types)");
        el[k] = v;
      }
    }
    appendChildren(el, children);
    return el;
  }
  function icon(name, extraClass = "") {
    const i = document.createElement("i");
    if (name)
      i.className = `fa-solid fa-${name}${extraClass ? ` ${extraClass}` : ""}`;
    i.setAttribute("aria-hidden", "true");
    return i;
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  var DEARROW_PATHS = [
    ["#1213BD", "M36 18.302c0 4.981-2.46 9.198-5.655 12.462s-7.323 5.152-12.199 5.152s-9.764-1.112-12.959-4.376S0 23.283 0 18.302s2.574-9.38 5.769-12.644S13.271 0 18.146 0s9.394 2.178 12.589 5.442C33.931 8.706 36 13.322 36 18.302z"],
    ["#88c9f9", "m 30.394282,18.410186 c 0,3.468849 -1.143025,6.865475 -3.416513,9.137917 -2.273489,2.272442 -5.670115,2.92874 -9.137918,2.92874 -3.467803,0 -6.373515,-1.147212 -8.6470033,-3.419654 -2.2734888,-2.272442 -3.5871299,-5.178154 -3.5871299,-8.647003 0,-3.46885 0.9420533,-6.746149 3.2144954,-9.0196379 2.2724418,-2.2734888 5.5507878,-3.9513905 9.0196378,-3.9513905 3.46885,0 6.492841,1.9322561 8.76633,4.204698 2.273489,2.2724424 3.788101,5.2974804 3.788101,8.7663304 z"],
    ["#0a62a5", "m 23.95823,17.818306 c 0,3.153748 -2.644888,5.808102 -5.798635,5.808102 -3.153748,0 -5.599825,-2.654354 -5.599825,-5.808102 0,-3.153747 2.446077,-5.721714 5.599825,-5.721714 3.153747,0 5.798635,2.567967 5.798635,5.721714 z"]
  ];
  function dearrowIcon(size = 20) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 36 36");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("role", "img");
    for (const [fill, d] of DEARROW_PATHS) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("fill", fill);
      path.setAttribute("d", d);
      svg.appendChild(path);
    }
    return svg;
  }
  function clear(el) {
    while (el.firstChild)
      el.removeChild(el.firstChild);
  }
  function addStyle(css, id) {
    const style = document.createElement("style");
    if (id)
      style.id = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
    return style;
  }
  function pageHost() {
    return document.querySelector("ytd-app #content") || document.getElementById("content") || document.getElementById("page-manager") || document.body;
  }
  function swallow(ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();
  }

  // src/api/hooks.ts
  var hooks = new Set;
  function addBeforeRestoreHook(fn) {
    hooks.add(fn);
    return () => {
      hooks.delete(fn);
    };
  }
  function runBeforeRestoreHooks(videoId, timeoutMs, onWaiting) {
    const pending = [];
    for (const fn of hooks) {
      try {
        const out = fn(videoId);
        if (out && typeof out.then === "function") {
          pending.push(out.catch((err) => console.warn("[Video Memory] before-restore hook failed:", err)));
        }
      } catch (err) {
        console.warn("[Video Memory] before-restore hook failed:", err);
      }
    }
    if (!pending.length)
      return Promise.resolve();
    onWaiting();
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, timeoutMs);
      Promise.allSettled(pending).then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  // src/api/pluginSettings.ts
  var cache = null;
  function load() {
    if (cache)
      return cache;
    let parsed = null;
    try {
      const raw = readSetting(KEY_PLUGINS);
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const plugins = parsed && typeof parsed === "object" && parsed.plugins;
    cache = { plugins: plugins && typeof plugins === "object" ? { ...plugins } : {} };
    return cache;
  }
  function save() {
    writeSetting(KEY_PLUGINS, JSON.stringify(load()));
  }
  function storedValue(plugin, key) {
    return load().plugins[plugin]?.[key];
  }
  function setStoredValue(plugin, key, value) {
    const data = load();
    data.plugins[plugin] = { ...data.plugins[plugin] || {}, [key]: value };
    save();
  }

  // src/api/rows.ts
  var contributions = new Map;
  var rowsChanged = new Emitter;
  function registerRowButton(def) {
    contributions.set(def.id, def);
    rowsChanged.emit();
    return () => {
      if (contributions.get(def.id) === def) {
        contributions.delete(def.id);
        rowsChanged.emit();
      }
    };
  }
  function listRowButtons() {
    return Array.from(contributions.values()).sort((a, b) => a.order - b.order);
  }

  // src/api/tabs.ts
  var tabs = new Map;
  var tabsChanged = new Emitter;
  function registerTab(def) {
    tabs.set(def.id, def);
    tabsChanged.emit();
    return () => {
      if (tabs.get(def.id) === def) {
        tabs.delete(def.id);
        tabsChanged.emit();
      }
    };
  }
  function getTab(id) {
    return tabs.get(id);
  }
  function listTabs() {
    const groupRank = { main: 0, plugins: 1 };
    return Array.from(tabs.values()).sort((a, b) => groupRank[a.group] - groupRank[b.group] || a.order - b.order);
  }
  var controller = null;
  function setModalController(c) {
    controller = c;
  }
  function openSettings(tabId) {
    controller?.open(tabId);
  }
  function isSettingsOpen() {
    return Boolean(controller?.isOpen());
  }
  function refreshSettingsHeader() {
    controller?.refreshHeader();
  }

  // src/api/plugins.ts
  function definePlugin(def) {
    return def;
  }

  class PluginContext {
    plugin;
    disposers = [];
    settingListeners = new Set;
    constructor(plugin) {
      this.plugin = plugin;
    }
    onDispose(fn) {
      this.disposers.push(fn);
    }
    listen(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      this.onDispose(() => target.removeEventListener(type, fn, opts));
    }
    interval(fn, ms) {
      const id = window.setInterval(fn, ms);
      this.onDispose(() => clearInterval(id));
      return id;
    }
    timeout(fn, ms) {
      const id = window.setTimeout(fn, ms);
      this.onDispose(() => clearTimeout(id));
      return id;
    }
    observe(target, options, fn) {
      const obs = new MutationObserver(fn);
      obs.observe(target, options);
      this.onDispose(() => obs.disconnect());
      return obs;
    }
    addStyle(css) {
      const style = addStyle(css);
      style.dataset.ysrpPlugin = this.plugin.name;
      this.onDispose(() => style.remove());
      return style;
    }
    addTab(def) {
      this.onDispose(registerTab(def));
    }
    addRowButton(def) {
      this.onDispose(registerRowButton(def));
    }
    beforeRestore(fn) {
      this.onDispose(addBeforeRestoreHook(fn));
    }
    own(el) {
      this.onDispose(() => el.remove());
      return el;
    }
    settings = {
      get: (key) => getSetting(this.plugin, key),
      set: (key, value) => {
        setStoredValue(this.plugin.name, key, value);
        this.notify(key, value);
        settingsChanged.emit({ plugin: this.plugin.name, key });
      },
      reset: () => {
        for (const [key, def] of Object.entries(this.plugin.settings || {}))
          setStoredValue(this.plugin.name, key, def.default);
        for (const key of Object.keys(this.plugin.settings || {}))
          this.notify(key, getSetting(this.plugin, key));
        settingsChanged.emit({ plugin: this.plugin.name, key: "*" });
      },
      onChange: (fn) => {
        this.settingListeners.add(fn);
        this.onDispose(() => this.settingListeners.delete(fn));
      }
    };
    notify(key, value) {
      for (const fn of Array.from(this.settingListeners)) {
        try {
          fn(key, value);
        } catch (err) {
          console.error(`[Video Memory] ${this.plugin.name} setting listener failed:`, err);
        }
      }
    }
    dispose() {
      const list = this.disposers.splice(0).reverse();
      for (const fn of list) {
        try {
          fn();
        } catch (err) {
          console.error(`[Video Memory] ${this.plugin.name} cleanup failed:`, err);
        }
      }
    }
  }
  function getSetting(plugin, key) {
    const def = plugin.settings?.[key];
    const stored = storedValue(plugin.name, key);
    if (stored === undefined || stored === null)
      return def ? def.default : undefined;
    if (def && typeof def.default === "boolean")
      return Boolean(stored);
    if (def && typeof def.default === "number") {
      const n = Number(stored);
      return Number.isFinite(n) ? n : def.default;
    }
    return stored;
  }
  var pluginsChanged = new Emitter;
  var settingsChanged = new Emitter;
  var registry = [];
  var running = new Map;
  var contexts = new Map;
  function listPlugins() {
    return registry.slice();
  }
  function findPlugin(name) {
    return registry.find((p) => p.name === name);
  }
  function isEnabled(plugin) {
    if (plugin.required)
      return true;
    const stored = storedValue(plugin.name, "enabled");
    return typeof stored === "boolean" ? stored : plugin.enabledByDefault !== false;
  }
  function settingsContext(plugin) {
    return running.get(plugin.name) || contexts.get(plugin.name) || (() => {
      const ctx = new PluginContext(plugin);
      contexts.set(plugin.name, ctx);
      return ctx;
    })();
  }
  function startPlugin(plugin) {
    if (running.has(plugin.name))
      return;
    const ctx = new PluginContext(plugin);
    running.set(plugin.name, ctx);
    try {
      plugin.start(ctx);
    } catch (err) {
      console.error(`[Video Memory] Plugin ${plugin.name} failed to start:`, err);
    }
  }
  function stopPlugin(plugin) {
    const ctx = running.get(plugin.name);
    if (!ctx)
      return;
    running.delete(plugin.name);
    try {
      plugin.stop?.(ctx);
    } catch (err) {
      console.error(`[Video Memory] Plugin ${plugin.name} failed to stop:`, err);
    }
    ctx.dispose();
  }
  function startPlugins(plugins) {
    registry.push(...plugins);
    const ordered = [...plugins.filter((p) => p.required), ...plugins.filter((p) => !p.required)];
    for (const plugin of ordered) {
      if (isEnabled(plugin))
        startPlugin(plugin);
    }
    pluginsChanged.emit();
  }
  function setPluginEnabled(name, enabled) {
    const plugin = findPlugin(name);
    if (!plugin || plugin.required)
      return;
    setStoredValue(name, "enabled", enabled);
    if (enabled)
      startPlugin(plugin);
    else
      stopPlugin(plugin);
    pluginsChanged.emit();
  }

  // src/api/theme.css
  var theme_default = `/* N-5.3.1 monochrome palette, follows the system light/dark scheme live (fixes C-Q4/U-Q6). */
:root {
  --ysrp-bg: #ffffff;
  --ysrp-nav-bg: #f7f7f7;
  --ysrp-card: #fafafa;
  --ysrp-layer: #f0f0f0;
  --ysrp-border: rgba(0, 0, 0, .08);
  --ysrp-border-strong: rgba(0, 0, 0, .16);
  --ysrp-text: #0d0d0d;
  --ysrp-text-2: #5e5e5e;
  --ysrp-text-3: #8f8f8f;
  --ysrp-hover: rgba(0, 0, 0, .05);
  --ysrp-error: #d93025;
  --ysrp-success: #188038;
  --ysrp-backdrop: rgba(0, 0, 0, .4);
  --ysrp-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ysrp-bg: #1a1a1a;
    --ysrp-nav-bg: #161616;
    --ysrp-card: #212121;
    --ysrp-layer: #2a2a2a;
    --ysrp-border: rgba(255, 255, 255, .08);
    --ysrp-border-strong: rgba(255, 255, 255, .16);
    --ysrp-text: #fafafa;
    --ysrp-text-2: #a3a3a3;
    --ysrp-text-3: #737373;
    --ysrp-hover: rgba(255, 255, 255, .06);
    --ysrp-error: #f28b82;
    --ysrp-success: #81c995;
    --ysrp-backdrop: rgba(0, 0, 0, .6);
  }
}
`;

  // src/utils/i18n.ts
  var LANGUAGE_OPTIONS = ["auto", "zh", "en"];
  function normalizePreference(value) {
    const s = String(value ?? "").trim().toLowerCase();
    if (s === "auto")
      return "auto";
    if (s.startsWith("zh"))
      return "zh";
    if (s.startsWith("en"))
      return "en";
    return "auto";
  }
  function detectBrowserLanguage() {
    const candidates = [];
    try {
      const nav = navigator;
      if (Array.isArray(nav.languages))
        candidates.push(...nav.languages);
      if (nav.language)
        candidates.push(nav.language);
      if (nav.userLanguage)
        candidates.push(nav.userLanguage);
    } catch {}
    for (const c of candidates) {
      const s = String(c || "").trim().toLowerCase();
      if (!s)
        continue;
      if (s.startsWith("zh"))
        return "zh";
      if (s.startsWith("en"))
        return "en";
    }
    return "en";
  }
  var preference = normalizePreference(readSetting(KEY_LANGUAGE));
  function getPreference() {
    return preference;
  }
  function getLanguage() {
    return preference === "auto" ? detectBrowserLanguage() : preference;
  }
  function setPreference(value) {
    const next = normalizePreference(value);
    if (next === preference)
      return false;
    preference = next;
    writeSetting(KEY_LANGUAGE, next);
    try {
      document.dispatchEvent(new CustomEvent(EVT_LANGUAGE, { detail: { preference: next, resolved: getLanguage() } }));
    } catch {}
    return true;
  }
  function interpolate(text, params) {
    if (!params)
      return text;
    return text.replace(/\{([^{}]*)\}/g, (_m, name) => {
      const key = name.trim();
      if (!key || !(key in params))
        return "";
      const v = params[key];
      return v === null || v === undefined ? "" : String(v);
    });
  }
  function resolveValue(v, params) {
    let out = v;
    if (typeof out === "function") {
      try {
        out = out(params || {});
      } catch {
        out = "";
      }
    }
    return typeof out === "string" ? out : null;
  }
  function pick(obj, params) {
    if (!obj || typeof obj !== "object")
      return "";
    const lang = getLanguage();
    const order = lang === "zh" ? ["zh", "en"] : ["en", "zh"];
    for (const l of order) {
      const s = resolveValue(obj[l], params);
      if (s)
        return interpolate(s, params);
    }
    return "";
  }
  function tr(en, zh, params) {
    return pick({ en, zh }, params);
  }
  var tables = { en: {}, zh: {} };
  function deepMerge(target, source) {
    for (const [k, v] of Object.entries(source)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== "object")
          target[k] = {};
        deepMerge(target[k], v);
      } else {
        target[k] = v;
      }
    }
  }
  function extend(bundle) {
    for (const [lang, table] of Object.entries(bundle)) {
      deepMerge(tables[lang.toLowerCase().startsWith("zh") ? "zh" : "en"], table);
    }
  }
  function lookup(table, path) {
    let cur = table;
    for (const part of path.split(".")) {
      if (!cur || typeof cur !== "object")
        return null;
      cur = cur[part];
    }
    return typeof cur === "string" && cur !== "" ? cur : null;
  }
  function t(path, fallback, params) {
    if (!path)
      return fallback !== undefined ? interpolate(fallback, params) : path;
    const lang = getLanguage();
    const hit = lookup(tables[lang], path) ?? lookup(tables.en, path) ?? lookup(tables.zh, path);
    if (hit !== null)
      return interpolate(hit, params);
    if (fallback !== undefined)
      return interpolate(fallback, params);
    return path;
  }
  extend({
    en: {
      language: {
        tabLabel: "Display",
        heading: "Language",
        description: "Choose how the script UI should appear.",
        options: { auto: "Auto", zh: "Chinese", en: "English" },
        optionHints: { auto: "Match the browser language automatically.", zh: "Always use Simplified Chinese.", en: "Always use English." },
        badges: { auto: "Auto", zh: "ZH", en: "EN" }
      }
    },
    zh: {
      language: {
        tabLabel: "界面",
        heading: "界面语言",
        description: "为脚本 UI 选择显示语言。",
        options: { auto: "自动", zh: "中文", en: "英文" },
        optionHints: { auto: "自动跟随浏览器语言。", zh: "始终使用简体中文。", en: "始终使用英文。" },
        badges: { auto: "自动", zh: "中文", en: "英文" }
      }
    }
  });
  function languageName(code) {
    return code === "zh" ? tr("Chinese", "中文") : tr("English", "英文");
  }

  // src/utils/text.ts
  function formatTime(value) {
    let seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0)
      seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }
  function normalizeTitle(value) {
    if (value === null || value === undefined)
      return "";
    return String(value).replace(/\s+/g, " ").trim();
  }
  function sameTitle(a, b) {
    const x = normalizeTitle(a).toLowerCase();
    const y = normalizeTitle(b).toLowerCase();
    return Boolean(x) && Boolean(y) && x === y;
  }
  function isPlaceholderTitle(value) {
    const s = normalizeTitle(value).toLowerCase();
    return !s || s === UNKNOWN_TITLE.toLowerCase() || s === LEGACY_LOADING_TITLE;
  }
  function errorMessage(err) {
    if (err && typeof err === "object" && "message" in err && err.message)
      return String(err.message);
    return err === undefined || err === null ? "" : String(err);
  }
  function parseTimeParam(raw) {
    if (raw === null || raw === undefined)
      return null;
    const s = String(raw).trim().toLowerCase();
    if (!s)
      return null;
    if (/^\d+(\.\d+)?s?$/.test(s))
      return parseFloat(s);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(s);
    if (!m || !m[1] && !m[2] && !m[3])
      return null;
    return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  }

  // src/api/badge.ts
  var state = { kind: "loading" };
  var flashUntil = 0;
  var flashTimer = 0;
  var pendingTime = null;
  var badgeChanged = new Emitter;
  var badgeMounted = new Emitter;
  function badgeText() {
    switch (state.kind) {
      case "loading":
        return tr("Loading...", "加载中...");
      case "time":
        return formatTime(state.seconds);
      default:
        return tr(state.en, state.zh, state.params);
    }
  }
  function badgeTooltip() {
    return state.kind === "status" && state.tooltip ? state.tooltip : "";
  }
  function set(next) {
    state = next;
    badgeChanged.emit();
  }
  function showSavedTime(seconds) {
    if (Date.now() < flashUntil) {
      pendingTime = seconds;
      return;
    }
    set({ kind: "time", seconds });
  }
  function showStatus(en, zh, params, extra = {}) {
    flashUntil = 0;
    set({ kind: "status", en, zh, params, ...extra });
  }
  function flashStatus(en, zh, params, ms) {
    flashUntil = Date.now() + ms;
    pendingTime = null;
    set({ kind: "status", en, zh, params });
    if (flashTimer)
      clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => {
      flashUntil = 0;
      if (pendingTime !== null) {
        set({ kind: "time", seconds: pendingTime });
        pendingTime = null;
      }
    }, ms);
  }
  function resetBadge() {
    flashUntil = 0;
    pendingTime = null;
    set({ kind: "loading" });
  }
  var currentContainer = null;
  function setBadgeContainer(el) {
    currentContainer = el;
    if (el)
      badgeMounted.emit(el);
  }
  function badgeContainer() {
    return currentContainer && currentContainer.isConnected ? currentContainer : null;
  }

  // src/api/player.ts
  function urlVideoId() {
    try {
      return new URLSearchParams(location.search).get("v") || "";
    } catch {
      return "";
    }
  }
  function linkStartTime() {
    try {
      const params = new URLSearchParams(location.search);
      const fromQuery = parseTimeParam(params.get("t")) ?? parseTimeParam(params.get("start"));
      if (fromQuery !== null)
        return fromQuery;
      const hash = location.hash.replace(/^#/, "");
      if (hash)
        return parseTimeParam(new URLSearchParams(hash).get("t"));
    } catch {}
    return null;
  }
  function getPlayer() {
    const el = document.getElementById("movie_player");
    if (!el)
      return null;
    if (typeof el.getCurrentTime !== "function" || typeof el.getDuration !== "function" || typeof el.seekTo !== "function")
      return null;
    return el;
  }
  function videoData(player) {
    if (!player || typeof player.getVideoData !== "function")
      return null;
    try {
      return player.getVideoData() || null;
    } catch {
      return null;
    }
  }
  function isAdShowing(player) {
    return player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
  }
  function num(fn) {
    try {
      const v = Number(fn());
      return Number.isFinite(v) ? v : 0;
    } catch {
      return 0;
    }
  }
  function playerDuration(player) {
    return player ? num(() => player.getDuration()) : 0;
  }
  function playerTime(player) {
    return player ? num(() => player.getCurrentTime()) : 0;
  }
  function currentDuration() {
    return playerDuration(getPlayer());
  }
  function readyPlayer(sessionId) {
    const player = getPlayer();
    if (!player)
      return null;
    const data = videoData(player);
    if (data && data.video_id && data.video_id !== sessionId)
      return null;
    if (playerDuration(player) <= 0)
      return null;
    if (isAdShowing(player))
      return null;
    return player;
  }
  function isPlaying(player) {
    if (typeof player.getPlayerState === "function") {
      try {
        return player.getPlayerState() === 1;
      } catch {}
    }
    const video = player.querySelector("video");
    return Boolean(video && !video.paused);
  }

  // src/api/resumePrompt.ts
  var impl = null;
  function setResumePromptImpl(fn) {
    impl = fn;
  }
  function askResume(opts) {
    if (impl)
      return impl(opts);
    return { result: Promise.resolve("link"), cancel() {} };
  }

  // src/api/titles.ts
  var DEARROW_TTL = 6 * 60 * 60 * 1000;
  var DEARROW_NEGATIVE_TTL = 30 * 60 * 1000;
  var ORIGINAL_RETRY_MS = 5 * 60 * 1000;
  var sources = new Map;
  var dearrowCache = new Map;
  var dearrowInflight = new Map;
  var originalCache = new Map;
  var originalInflight = new Map;
  function entry(videoId) {
    let s = sources.get(videoId);
    if (!s) {
      s = { original: "", dearrow: "" };
      sources.set(videoId, s);
    }
    return s;
  }
  function getSources(videoId) {
    return entry(videoId);
  }
  function setOriginalTitle(videoId, title) {
    if (!videoId)
      return false;
    const s = entry(videoId);
    s.original = normalizeTitle(title);
    if (s.dearrow && sameTitle(s.dearrow, s.original))
      s.dearrow = "";
    refreshCurrent();
    return Boolean(s.original);
  }
  function setDearrowTitle(videoId, title) {
    if (!videoId)
      return false;
    const s = entry(videoId);
    const norm = normalizeTitle(title);
    if (!norm || sameTitle(norm, s.original)) {
      s.dearrow = "";
      refreshCurrent();
      return false;
    }
    s.dearrow = norm;
    refreshCurrent();
    return true;
  }
  function resolveTitle(videoId, fallback) {
    const fb = normalizeTitle(fallback) || UNKNOWN_TITLE;
    if (!videoId)
      return { title: fb, source: "fallback" };
    const s = sources.get(videoId);
    if (s?.dearrow)
      return { title: s.dearrow, source: "dearrow" };
    if (s?.original)
      return { title: s.original, source: "original" };
    return { title: fb, source: "fallback" };
  }
  function persistOriginal(videoId, title) {
    try {
      const rec = readRecord(videoId);
      if (!rec || rec.originalTitle === title)
        return;
      updateRecord(videoId, (cur) => cur ? { ...cur, originalTitle: title } : null, "meta");
    } catch (err) {
      console.warn("[Video Memory] Failed to persist original title:", err);
    }
  }
  function knownOriginalTitle(videoId, title) {
    const norm = normalizeTitle(title);
    if (!videoId || !norm)
      return;
    originalCache.set(videoId, { title: norm, at: Date.now() });
    setOriginalTitle(videoId, norm);
    persistOriginal(videoId, norm);
  }
  function cachedOriginalTitle(videoId) {
    return originalCache.get(videoId)?.title ?? null;
  }
  function fetchOriginalTitle(videoId) {
    if (!videoId)
      return Promise.resolve(null);
    const cached = originalCache.get(videoId);
    if (cached && (cached.title || Date.now() - cached.at < ORIGINAL_RETRY_MS))
      return Promise.resolve(cached.title);
    const running = originalInflight.get(videoId);
    if (running)
      return running;
    const url = OEMBED_URL + encodeURIComponent(`https://youtu.be/${videoId}`);
    const task = fetch(url, { credentials: "omit", cache: "no-store" }).then(async (res) => {
      if (!res.ok)
        throw new Error(`oEmbed HTTP ${res.status}`);
      const data = await res.json();
      const title = data && typeof data.title === "string" ? data.title.trim() : "";
      return title || null;
    }).then((title) => {
      originalCache.set(videoId, { title, at: Date.now() });
      if (title) {
        setOriginalTitle(videoId, title);
        persistOriginal(videoId, title);
      }
      return title;
    }).catch((err) => {
      console.warn("[Video Memory] Failed to fetch original title:", err);
      originalCache.set(videoId, { title: null, at: Date.now() });
      return null;
    }).finally(() => {
      originalInflight.delete(videoId);
    });
    originalInflight.set(videoId, task);
    return task;
  }
  function pickDearrowTitle(data) {
    const titles = data && typeof data === "object" ? data.titles : null;
    if (!Array.isArray(titles) || !titles.length)
      return null;
    for (const item of titles) {
      if (!item || typeof item !== "object")
        continue;
      const { title, original, locked, votes } = item;
      if (typeof title !== "string" || original === true)
        continue;
      const v = typeof votes === "number" && Number.isFinite(votes) ? votes : 0;
      if (locked || v >= 0)
        return title;
    }
    return null;
  }
  function cachedDearrow(videoId) {
    const c = dearrowCache.get(videoId);
    if (!c)
      return;
    const ttl = c.title ? DEARROW_TTL : DEARROW_NEGATIVE_TTL;
    if (Date.now() - c.at > ttl)
      return;
    return c.title;
  }
  function fetchDearrowTitle(videoId, options = {}) {
    if (!videoId)
      return Promise.resolve(null);
    if (!options.force) {
      const cached = cachedDearrow(videoId);
      if (cached !== undefined) {
        if (cached)
          setDearrowTitle(videoId, cached);
        return Promise.resolve(cached);
      }
    }
    const running = dearrowInflight.get(videoId);
    if (running)
      return running;
    const task = fetch(DEARROW_URL + encodeURIComponent(videoId), { credentials: "omit", cache: "no-store" }).then(async (res) => res.ok ? pickDearrowTitle(await res.json()) : null).catch((err) => {
      console.warn("[Video Memory] Failed to fetch DeArrow title:", err);
      return null;
    }).then((raw) => {
      const accepted = raw ? setDearrowTitle(videoId, raw) : false;
      const title = accepted ? getSources(videoId).dearrow : null;
      dearrowCache.set(videoId, { title, at: Date.now() });
      if (title)
        dispatch(EVT_DEARROW_READY, { videoId, title });
      return title;
    }).finally(() => {
      dearrowInflight.delete(videoId);
    });
    dearrowInflight.set(videoId, task);
    return task;
  }
  var current = { videoId: null, title: UNKNOWN_TITLE, isLoading: true, source: "idle", updatedAt: Date.now() };
  function currentStatus() {
    return { ...current };
  }
  function refreshCurrent() {
    const id = current.videoId;
    if (!id)
      return;
    const rec = readRecord(id);
    const stored = rec && typeof rec.videoName === "string" && !isPlaceholderTitle(rec.videoName) ? rec.videoName : "";
    const { title, source } = resolveTitle(id, stored);
    const isLoading = source === "fallback" && !stored;
    const label = source === "fallback" ? stored ? "record" : "loading" : source;
    if (title === current.title && isLoading === current.isLoading && label === current.source)
      return;
    current = { videoId: id, title, isLoading, source: label, updatedAt: Date.now() };
    dispatch(EVT_VIDEO_STATUS, { ...current });
  }
  function setCurrentVideo(videoId) {
    if ((videoId || null) === current.videoId)
      return;
    if (!videoId) {
      current = { videoId: null, title: UNKNOWN_TITLE, isLoading: false, source: "idle", updatedAt: Date.now() };
      dispatch(EVT_VIDEO_STATUS, { ...current });
      return;
    }
    current = { videoId, title: UNKNOWN_TITLE, isLoading: true, source: "loading", updatedAt: Date.now() };
    refreshCurrent();
    dispatch(EVT_VIDEO_STATUS, { ...current });
    fetchDearrowTitle(videoId);
    fetchOriginalTitle(videoId);
  }
  function titleForRecord(videoId, existing) {
    const keep = typeof existing === "string" && !isPlaceholderTitle(existing) ? existing : "";
    return resolveTitle(videoId, keep).title;
  }

  // src/plugins/_core/engine/index.ts
  var TICK_MS = 250;
  var SAVE_EVERY_MS = 1500;
  var MIN_DELTA_S = 0.5;
  var CONFIRM_EVERY_MS = 500;
  var CONFIRM_TOLERANCE_S = 3;
  var CONFIRMATIONS = 2;
  var MAX_SEEKS = 8;
  var RESTORE_WINDOW_MS = 15000;
  var HOOK_TIMEOUT_MS = 4000;
  var MIN_RESUMABLE_S = 1;
  var FINISHED_MARGIN_S = 5;

  class Engine {
    ctx;
    session = null;
    constructor(ctx) {
      this.ctx = ctx;
    }
    start() {
      const ctx = this.ctx;
      ctx.interval(() => this.tick(), TICK_MS);
      ctx.listen(window, "yt-navigate-start", () => this.flush(), true);
      for (const type of ["yt-navigate-finish", "yt-page-data-updated", "yt-page-data-fetched", "yt-history-popstate"]) {
        ctx.listen(window, type, () => this.tick(), true);
      }
      ctx.listen(window, "popstate", () => this.tick());
      ctx.listen(document, "visibilitychange", () => {
        if (document.visibilityState === "hidden")
          this.flush();
      });
      ctx.listen(window, "pagehide", () => this.flush());
      const onMedia = (ev) => {
        const target = ev.target;
        if (target && target.tagName === "VIDEO" && target.closest("#movie_player"))
          this.flush();
      };
      ctx.listen(document, "pause", onMedia, true);
      ctx.listen(document, "seeked", onMedia, true);
      ctx.onDispose(() => {
        if (this.session)
          this.endSession(this.session);
      });
      ctx.timeout(() => this.tick(), 0);
    }
    flush() {
      if (this.session)
        this.save(this.session, true);
    }
    tick() {
      const id = urlVideoId();
      if (id !== (this.session ? this.session.id : ""))
        this.switchTo(id);
      const s = this.session;
      if (!s || s.phase === "sync" || s.phase === "choosing" || s.phase === "live")
        return;
      const raw = getPlayer();
      const data = videoData(raw);
      if (raw && data && data.video_id === s.id && data.isLive) {
        s.phase = "live";
        return;
      }
      const player = readyPlayer(s.id);
      if (player) {
        s.lastReadyTime = playerTime(player);
        s.lastDuration = playerDuration(player);
      }
      switch (s.phase) {
        case "waiting":
          if (player)
            this.decide(s, player);
          break;
        case "restoring":
          if (player)
            this.continueRestore(s, player);
          break;
        case "tracking":
          if (Date.now() - s.lastSaveAt >= SAVE_EVERY_MS)
            this.save(s, false);
          break;
      }
    }
    switchTo(id) {
      if (this.session)
        this.endSession(this.session);
      this.session = null;
      setCurrentVideo(id || null);
      resetBadge();
      if (!id)
        return;
      const s = {
        id,
        phase: "sync",
        lastReadyTime: null,
        lastDuration: 0,
        lastWritten: null,
        lastSaveAt: 0,
        restore: null,
        prompt: null,
        ended: false
      };
      this.session = s;
      runBeforeRestoreHooks(id, HOOK_TIMEOUT_MS, () => {
        if (this.session === s)
          showStatus("Syncing…", "正在同步…");
      }).then(() => {
        if (this.session !== s || s.phase !== "sync")
          return;
        s.phase = "waiting";
        resetBadge();
        this.tick();
      });
    }
    endSession(s) {
      if (s.phase === "tracking")
        this.save(s, true);
      if (s.prompt)
        s.prompt.cancel();
      s.prompt = null;
      s.ended = true;
    }
    decide(s, player) {
      const data = videoData(player);
      if (data && data.title)
        knownOriginalTitle(s.id, data.title);
      const rec = readRecord(s.id);
      const saved = Number(rec ? rec.videoProgress : NaN);
      const resumable = Number.isFinite(saved) && saved > MIN_RESUMABLE_S;
      const duration = playerDuration(player);
      const finished = resumable && duration - saved < FINISHED_MARGIN_S;
      const link = linkStartTime();
      if (!resumable) {
        this.startTracking(s);
      } else if (finished) {
        if (link === null) {
          try {
            player.seekTo(0, true);
          } catch {}
        }
        this.startTracking(s);
      } else if (link !== null) {
        if (Math.abs(link - saved) > CONFIRM_TOLERANCE_S)
          this.choose(s, player, saved, link);
        else
          this.startTracking(s);
      } else {
        this.beginRestore(s, player, saved);
      }
    }
    choose(s, player, saved, link) {
      s.phase = "choosing";
      const wasPlaying = isPlaying(player);
      try {
        player.pauseVideo?.();
      } catch {}
      showStatus("Choose a position…", "请选择播放位置…");
      const handle = askResume({ videoId: s.id, saved, link });
      s.prompt = handle;
      handle.result.then((choice) => {
        if (this.session !== s || s.ended)
          return;
        s.prompt = null;
        const p = getPlayer();
        resetBadge();
        if (choice === "saved" && p) {
          s.phase = "restoring";
          s.restore = { target: saved, seeks: 0, firstSeekAt: 0, lastCheckAt: 0, confirms: 0 };
          this.seek(s.restore, p);
          if (wasPlaying) {
            try {
              p.playVideo?.();
            } catch {}
          }
        } else {
          if (wasPlaying && p) {
            try {
              p.playVideo?.();
            } catch {}
          }
          this.startTracking(s);
        }
      });
    }
    beginRestore(s, player, target) {
      s.phase = "restoring";
      s.restore = { target, seeks: 0, firstSeekAt: 0, lastCheckAt: 0, confirms: 0 };
      this.continueRestore(s, player);
    }
    seek(r, player) {
      const now = Date.now();
      try {
        player.seekTo(r.target, true);
      } catch {}
      r.seeks++;
      r.lastCheckAt = now;
      if (!r.firstSeekAt)
        r.firstSeekAt = now;
    }
    continueRestore(s, player) {
      const r = s.restore;
      if (!r)
        return this.startTracking(s);
      if (r.seeks === 0) {
        this.seek(r, player);
        return;
      }
      const now = Date.now();
      if (now - r.lastCheckAt < CONFIRM_EVERY_MS)
        return;
      r.lastCheckAt = now;
      if (Math.abs(playerTime(player) - r.target) <= CONFIRM_TOLERANCE_S) {
        r.confirms++;
        if (r.confirms >= CONFIRMATIONS)
          this.finishRestore(s, true);
        return;
      }
      r.confirms = 0;
      if (r.seeks < MAX_SEEKS && now - r.firstSeekAt < RESTORE_WINDOW_MS)
        this.seek(r, player);
      else
        this.finishRestore(s, false);
    }
    finishRestore(s, ok) {
      const target = s.restore ? s.restore.target : 0;
      s.restore = null;
      this.startTracking(s);
      if (ok)
        flashStatus("Resumed {t}", "已恢复 {t}", { t: formatTime(target) }, 2500);
    }
    startTracking(s) {
      s.phase = "tracking";
      s.lastWritten = null;
      this.save(s, false);
    }
    save(s, useLastReading) {
      if (s.phase !== "tracking")
        return;
      s.lastSaveAt = Date.now();
      let time = null;
      let duration = s.lastDuration;
      const player = s.ended ? null : readyPlayer(s.id);
      if (player) {
        time = playerTime(player);
        duration = playerDuration(player);
        s.lastReadyTime = time;
        s.lastDuration = duration;
      } else if (useLastReading) {
        time = s.lastReadyTime;
      }
      if (time === null)
        return;
      if (s.lastWritten !== null && Math.abs(time - s.lastWritten) < MIN_DELTA_S)
        return;
      this.write(s, time, duration);
    }
    write(s, time, duration) {
      const id = s.id;
      try {
        updateRecord(id, (cur) => {
          const base = cur || {};
          const original = cachedOriginalTitle(id) || getSources(id).original || null;
          return {
            ...base,
            videoProgress: time,
            saveDate: Date.now(),
            videoDuration: duration > 0 ? duration : base.videoDuration,
            videoName: titleForRecord(id, base.videoName),
            originalTitle: original || base.originalTitle || null
          };
        }, "content");
        s.lastWritten = time;
        if (this.session === s)
          showSavedTime(time);
        dispatch(EVT_RECORD_UPDATED, { videoId: id, videoProgress: time });
      } catch (err) {
        console.error("[Video Memory] Failed to save video progress:", err);
        if (this.session === s)
          showStatus("⚠ Save failed", "⚠ 保存失败", undefined, { tooltip: errorMessage(err), error: true });
      }
    }
  }
  var engine_default = definePlugin({
    name: "Engine",
    displayName: { en: "Progress engine", zh: "进度引擎" },
    description: {
      en: "Saves and restores the playback position of every video; waits for the player, skips ads and handles timestamp links.",
      zh: "保存并恢复每个视频的播放进度；等待播放器就绪、避开广告并处理时间戳链接。"
    },
    authors: ["0_V"],
    icon: "gauge-high",
    required: true,
    start(ctx) {
      new Engine(ctx).start();
    }
  });

  // src/plugins/_core/playerBadge/resumeDialog.ts
  var STOP_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "keypress", "touchstart", "touchend", "wheel", "contextmenu"];
  function createResumePrompt(opts) {
    let settle = () => {};
    let done = false;
    const result = new Promise((resolve) => {
      settle = resolve;
    });
    const savedBtn = h("button", { class: "ysrp-resume-btn ysrp-resume-saved", type: "button" }, tr("Saved progress {t}", "上次进度 {t}", { t: formatTime(opts.saved) }));
    const linkBtn = h("button", { class: "ysrp-resume-btn ysrp-resume-link", type: "button" }, tr("Link time {t}", "链接时间 {t}", { t: formatTime(opts.link) }));
    const root = h("div", { class: "ysrp-resume", attrs: { role: "dialog", "aria-modal": "true" } }, h("div", { class: "ysrp-resume-title", text: tr("Where to continue?", "从哪里继续播放？") }), h("div", { class: "ysrp-resume-text", text: tr("This link starts at a different time than your saved progress.", "这个链接指定的时间与你上次的进度不同。") }), h("div", { class: "ysrp-resume-actions" }, savedBtn, linkBtn));
    const onDocKey = (ev) => {
      if (ev.key !== "Escape")
        return;
      ev.preventDefault();
      ev.stopPropagation();
      finish("link");
    };
    const finish = (choice) => {
      if (done)
        return;
      done = true;
      document.removeEventListener("keydown", onDocKey, true);
      root.remove();
      if (choice)
        settle(choice);
    };
    document.addEventListener("keydown", onDocKey, true);
    for (const type of STOP_EVENTS)
      root.addEventListener(type, (ev) => ev.stopPropagation());
    const bind = (btn, choice) => {
      btn.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        finish(choice);
      });
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        finish(choice);
      });
    };
    bind(savedBtn, "saved");
    bind(linkBtn, "link");
    const player = document.getElementById("movie_player");
    if (!player) {
      finish("link");
      return { result, cancel() {} };
    }
    const width = Math.max(200, Math.min(360, player.clientWidth - 32 || 360));
    root.style.width = `${width}px`;
    player.appendChild(root);
    try {
      savedBtn.focus({ preventScroll: true });
    } catch {}
    return { result, cancel: () => finish(null) };
  }

  // src/plugins/_core/playerBadge/style.css
  var style_default = `/* Player badge (L-57, sizes converted to px) and resume dialog (N-3.2). */
.last-save-info-container {
  all: initial;
  font-family: var(--ysrp-font);
  font-size: 13px;
  margin-left: 5px;
  display: flex;
  align-items: center;
}
.last-save-info-container .last-save-info {
  text-shadow: none;
  background: var(--ysrp-bg);
  color: var(--ysrp-text);
  padding: 5px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  line-height: 1.2;
}
.last-save-info-container .last-save-info-text.is-error {
  color: var(--ysrp-error);
}
.last-save-info-container .ysrp-settings-button {
  background: var(--ysrp-layer);
  color: var(--ysrp-text);
  border: none;
  margin: 0 0 0 5px;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  font-size: 12px;
}

.ysrp-resume {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 70;
  box-sizing: border-box;
  padding: 20px;
  border-radius: 16px;
  background: var(--ysrp-bg);
  color: var(--ysrp-text);
  border: 1px solid var(--ysrp-border);
  box-shadow: 0 16px 48px rgba(0, 0, 0, .28);
  font-family: var(--ysrp-font);
  font-size: 14px;
  line-height: 1.5;
  text-align: left;
  text-shadow: none;
}
.ysrp-resume-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 6px;
}
.ysrp-resume-text {
  color: var(--ysrp-text-2);
  margin: 0 0 16px;
}
.ysrp-resume-actions {
  display: flex;
  gap: 8px;
}
.ysrp-resume-btn {
  flex: 1 1 0;
  height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--ysrp-border-strong);
  background: transparent;
  color: var(--ysrp-text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.ysrp-resume-btn:hover { background: var(--ysrp-hover); }
.ysrp-resume-btn:focus-visible { outline: 2px solid var(--ysrp-border-strong); outline-offset: 2px; }
.ysrp-resume-saved {
  background: var(--ysrp-text);
  border-color: var(--ysrp-text);
  color: var(--ysrp-bg);
}
.ysrp-resume-saved:hover { background: var(--ysrp-text); opacity: .88; }
`;

  // src/plugins/_core/playerBadge/index.ts
  function ensureFontAwesome() {
    if (document.querySelector(`link[href="${FONT_AWESOME_URL}"]`))
      return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = FONT_AWESOME_URL;
    (document.head || document.documentElement).appendChild(link);
  }
  function createBadge() {
    const text = h("span", { class: CLS_BADGE_TEXT, text: badgeText() });
    const tooltip = badgeTooltip();
    if (tooltip)
      text.title = tooltip;
    const gear = h("button", { class: CLS_SETTINGS_BUTTON, type: "button", title: tr("Open settings", "打开设置") }, icon("gear"));
    gear.addEventListener("pointerdown", (ev) => {
      swallow(ev);
      openSettings();
    }, true);
    gear.addEventListener("click", swallow, true);
    gear.addEventListener("touchstart", swallow, { capture: true, passive: false });
    return h("div", { class: CLS_BADGE_CONTAINER }, h("div", { class: CLS_BADGE_INNER }, text, gear));
  }
  function renderBadge() {
    const container = document.querySelector(`.${CLS_BADGE_CONTAINER}`);
    if (!container)
      return;
    const text = container.querySelector(`.${CLS_BADGE_TEXT}`);
    if (text) {
      text.textContent = badgeText();
      const tooltip = badgeTooltip();
      if (tooltip)
        text.title = tooltip;
      else
        text.removeAttribute("title");
      text.classList.toggle("is-error", Boolean(tooltip));
    }
    const gear = container.querySelector(`.${CLS_SETTINGS_BUTTON}`);
    if (gear)
      gear.title = tr("Open settings", "打开设置");
  }
  function ensureBadge(ctx) {
    if (document.querySelector(`.${CLS_BADGE_CONTAINER}`))
      return;
    const left = document.querySelector("#movie_player .ytp-left-controls") || document.querySelector(".ytp-left-controls");
    const chapter = document.querySelector(".ytp-chapter-container");
    const parent = left || chapter;
    if (!parent)
      return;
    const badge = createBadge();
    if (!left && chapter)
      chapter.style.display = "flex";
    parent.appendChild(badge);
    ctx.onDispose(() => badge.remove());
    setBadgeContainer(badge);
  }
  var playerBadge_default = definePlugin({
    name: "PlayerBadge",
    displayName: { en: "Player badge", zh: "播放器徽标" },
    description: {
      en: "Shows the last saved time and a settings button in the player controls, plus the dialog for conflicting timestamp links.",
      zh: "在播放器控制栏显示上次保存时间和设置按钮，并在时间戳链接与存档冲突时弹出选择框。"
    },
    authors: ["0_V"],
    icon: "tag",
    required: true,
    start(ctx) {
      ensureFontAwesome();
      ctx.addStyle(style_default);
      let scheduled = false;
      const schedule = () => {
        if (scheduled)
          return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          ensureBadge(ctx);
        });
      };
      ensureBadge(ctx);
      ctx.observe(document.documentElement, { childList: true, subtree: true }, schedule);
      ctx.onDispose(badgeChanged.on(renderBadge));
      ctx.listen(document, EVT_LANGUAGE, () => renderBadge());
      setResumePromptImpl(createResumePrompt);
      ctx.onDispose(() => setResumePromptImpl(null));
    }
  });

  // src/plugins/_core/settings/ui.ts
  function card(opts, ...children) {
    return h("div", { class: `ysrp-card${opts.cls ? ` ${opts.cls}` : ""}` }, h("div", { class: "ysrp-card-head" }, h("span", { class: "ysrp-card-icon" }, icon(opts.icon)), h("span", { class: "ysrp-card-title", text: opts.title })), opts.desc ? h("div", { class: "ysrp-card-desc", text: opts.desc }) : null, ...children);
  }
  function button(label, opts = {}) {
    const btn = h("button", {
      class: `ysrp-btn${opts.small ? " is-small" : ""}${opts.cls ? ` ${opts.cls}` : ""}`,
      type: "button",
      title: opts.title
    }, opts.icon ? icon(opts.icon) : null, h("span", { class: "ysrp-btn-label", text: label }));
    if (opts.onClick)
      btn.addEventListener("click", opts.onClick);
    return btn;
  }
  function setButtonLabel(btn, label) {
    const span = btn.querySelector(".ysrp-btn-label");
    if (span)
      span.textContent = label;
  }
  function iconButton(iconName, title, cls, onClick) {
    const btn = h("button", { class: `ysrp-ibtn ${cls}`.trim(), type: "button", title, attrs: { "aria-label": title } }, icon(iconName));
    if (onClick)
      btn.addEventListener("click", onClick);
    return btn;
  }
  function setIcon(btn, iconName) {
    const i = btn.querySelector("i");
    if (i)
      i.className = `fa-solid fa-${iconName}`;
  }
  function switchControl(checked, onChange, opts = {}) {
    const el = h("button", {
      class: "ysrp-switch",
      type: "button",
      disabled: Boolean(opts.disabled),
      dataset: opts.dataset,
      attrs: { role: "switch", "aria-checked": String(checked), "aria-label": opts.label }
    }, h("span", { class: "ysrp-switch-knob" }));
    const set = (on) => {
      el.setAttribute("aria-checked", String(on));
      el.classList.toggle("is-on", on);
    };
    set(checked);
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (el.disabled)
        return;
      const next = el.getAttribute("aria-checked") !== "true";
      set(next);
      onChange(next);
    });
    return { el, set };
  }
  function choiceGroup(name, options, selected, onSelect, cls = "") {
    let current = selected;
    const items = options.map((opt) => {
      const radio = h("input", { type: "radio", name, value: opt.value, checked: opt.value === selected, disabled: Boolean(opt.disabled), class: "ysrp-choice-radio" });
      const label = h("label", { class: `ysrp-choice${opt.disabled ? " is-disabled" : ""}`, dataset: { value: opt.value } }, radio, h("span", { class: "ysrp-choice-tag", text: opt.tag }), h("span", { class: "ysrp-choice-text" }, h("span", { class: "ysrp-choice-label", text: opt.label }), opt.hint ? h("span", { class: "ysrp-choice-hint", text: opt.hint }) : null));
      label.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (opt.disabled || current === opt.value)
          return;
        set(opt.value);
        onSelect(opt.value);
      });
      return { opt, radio, label };
    });
    const set = (value) => {
      current = value;
      for (const item of items) {
        const on = item.opt.value === value;
        item.radio.checked = on;
        item.label.classList.toggle("is-selected", on);
      }
    };
    set(selected);
    return { el: h("div", { class: `ysrp-choices${cls ? ` ${cls}` : ""}`, attrs: { role: "radiogroup" } }, items.map((i) => i.label)), value: () => current, set };
  }
  function messageLine() {
    const el = h("div", { class: "ysrp-msg", attrs: { role: "status", "aria-live": "polite" } });
    return {
      el,
      set(text, tone = "neutral") {
        const value = (text || "").trim();
        el.textContent = value;
        el.classList.toggle("is-visible", Boolean(value));
        el.classList.toggle("is-success", Boolean(value) && tone === "success");
        el.classList.toggle("is-error", Boolean(value) && tone === "error");
      }
    };
  }
  function field(label, control, hint) {
    return h("label", { class: "ysrp-field" }, h("span", { class: "ysrp-field-label", text: label }), control, hint ? h("span", { class: "ysrp-field-hint", text: hint }) : null);
  }
  function infoRow(label, value) {
    return h("div", { class: "ysrp-info-row" }, h("span", { class: "ysrp-info-label", text: label }), value);
  }
  function secretInput(input, labels) {
    input.type = "password";
    const toggle = button(labels.show, { small: true, cls: "ysrp-secret-toggle" });
    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      setButtonLabel(toggle, reveal ? labels.hide : labels.show);
    });
    return h("div", { class: "ysrp-secret" }, input, toggle);
  }

  // src/plugins/_core/settings/displayTab.ts
  function createDisplayTab() {
    return {
      id: "display",
      group: "main",
      order: 30,
      icon: "globe",
      label: () => t("language.tabLabel", tr("Display", "界面")),
      render(pane) {
        const status = messageLine();
        const active = h("span", { class: "ysrp-info-value" });
        const browser = h("span", { class: "ysrp-info-value" });
        const refreshInfo = () => {
          active.textContent = languageName(getLanguage());
          browser.textContent = languageName(detectBrowserLanguage());
        };
        const group = choiceGroup("ysrp-language-preference", LANGUAGE_OPTIONS.map((code) => ({
          value: code,
          tag: t(`language.badges.${code}`),
          label: t(`language.options.${code}`),
          hint: t(`language.optionHints.${code}`)
        })), getPreference(), (value) => {
          if (value === getPreference()) {
            status.set(tr("Already using this language.", "当前已使用该语言。"));
            return;
          }
          setPreference(value);
          refreshInfo();
          status.set(tr("Language preference updated.", "语言偏好已更新。"), "success");
        }, "ysrp-language-options");
        refreshInfo();
        pane.appendChild(card({ icon: "globe", title: tr("Interface Language", "界面语言"), desc: t("language.description") }, group.el, h("div", { class: "ysrp-info" }, infoRow(tr("Active language", "当前语言"), active), infoRow(tr("Browser language", "浏览器语言"), browser)), status.el));
      }
    };
  }

  // src/plugins/_core/settings/pluginsTab.ts
  function visibleSettings(plugin) {
    return Object.entries(plugin.settings || {}).filter(([, def]) => !def.hidden);
  }
  function settingControl(plugin, key, def) {
    const ctx = settingsContext(plugin);
    const value = getSetting(plugin, key);
    switch (def.type) {
      case "switch":
        return switchControl(Boolean(value), (on) => ctx.settings.set(key, on), { dataset: { setting: key }, label: pick(def.label) }).el;
      case "select": {
        const select = h("select", { class: "ysrp-select", dataset: { setting: key } }, (def.options || []).map((o) => h("option", { value: o.value, text: pick(o.label), selected: String(value) === o.value })));
        select.addEventListener("change", () => ctx.settings.set(key, select.value));
        return select;
      }
      case "number": {
        const input = h("input", { class: "ysrp-input", type: "number", value: String(value ?? ""), min: def.min, max: def.max, step: def.step, placeholder: def.placeholder, dataset: { setting: key } });
        input.addEventListener("change", () => {
          const n = Number(input.value);
          if (input.value.trim() !== "" && Number.isFinite(n))
            ctx.settings.set(key, n);
        });
        return input;
      }
      default: {
        const input = h("input", { class: "ysrp-input", type: "text", value: String(value ?? ""), placeholder: def.placeholder, dataset: { setting: key } });
        input.addEventListener("input", () => ctx.settings.set(key, input.value));
        return input;
      }
    }
  }
  function openPluginDialog(plugin, openDialog) {
    const list = h("div", { class: "ysrp-setting-list" });
    const settings = visibleSettings(plugin);
    const renderList = () => {
      clear(list);
      for (const [key, def] of settings) {
        const stacked = def.type === "text" || def.type === "number";
        list.appendChild(h("div", { class: `ysrp-setting-row${stacked ? " is-stacked" : ""}` }, h("div", { class: "ysrp-setting-text" }, h("div", { class: "ysrp-setting-label", text: pick(def.label) }), def.description ? h("div", { class: "ysrp-setting-desc", text: pick(def.description) }) : null), settingControl(plugin, key, def)));
      }
    };
    renderList();
    let resetArmed = false;
    let resetTimer = 0;
    const resetLabel = tr("Reset", "重置");
    const reset = button(resetLabel, { small: true });
    reset.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (!resetArmed) {
        resetArmed = true;
        reset.classList.add("is-danger");
        setButtonLabel(reset, tr("Click again to reset", "再点一次确认重置"));
        resetTimer = window.setTimeout(() => {
          resetArmed = false;
          reset.classList.remove("is-danger");
          setButtonLabel(reset, resetLabel);
        }, 3000);
        return;
      }
      clearTimeout(resetTimer);
      resetArmed = false;
      reset.classList.remove("is-danger");
      setButtonLabel(reset, resetLabel);
      settingsContext(plugin).settings.reset();
      renderList();
    });
    const closeBtn = h("button", { class: "ysrp-close ysrp-dialog-close", type: "button", title: tr("Close", "关闭"), attrs: { "aria-label": tr("Close", "关闭") } }, icon("xmark"));
    const dialog = h("div", { class: "ysrp-dialog", attrs: { role: "dialog", "aria-modal": "true" } }, closeBtn, h("div", { class: "ysrp-dialog-title", text: pick(plugin.displayName) }), h("div", { class: "ysrp-dialog-desc", text: pick(plugin.description) }), h("hr", { class: "ysrp-sep" }), h("div", { class: "ysrp-dialog-subtitle", text: tr("Authors", "作者") }), h("div", { class: "ysrp-dialog-authors", text: plugin.authors.join(", ") }), h("div", { class: "ysrp-dialog-subtitle", text: tr("Settings", "设置") }), settings.length ? list : h("div", { class: "ysrp-empty", text: tr("No configurable settings.", "没有可配置的设置项。") }), settings.length ? h("div", { class: "ysrp-dialog-footer" }, reset) : null);
    const close = openDialog(dialog, () => clearTimeout(resetTimer));
    closeBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      close();
    });
  }
  function createPluginsTab(openDialog) {
    return {
      id: "plugins",
      group: "plugins",
      order: 10,
      icon: "puzzle-piece",
      label: () => tr("Plugins", "插件"),
      render(pane) {
        const plugins = listPlugins();
        const search = h("input", { class: "ysrp-input ysrp-search", type: "search", placeholder: tr("Search {n} plugins...", "搜索 {n} 个插件...", { n: plugins.length }) });
        const filter = h("select", { class: "ysrp-select ysrp-filter" }, h("option", { value: "all", text: tr("All", "全部") }), h("option", { value: "enabled", text: tr("Enabled", "已开启") }), h("option", { value: "disabled", text: tr("Disabled", "已关闭") }));
        const normalGrid = h("div", { class: "ysrp-plugin-grid" });
        const divider = h("hr", { class: "ysrp-sep ysrp-core-sep" });
        const coreGrid = h("div", { class: "ysrp-plugin-grid is-core" });
        const empty = h("div", { class: "ysrp-empty", text: tr("No plugins match your search.", "没有符合条件的插件。") });
        const container = h("div", { class: "ysrp-plugins" }, normalGrid, divider, coreGrid, empty);
        const cards = new Map;
        const build = () => {
          clear(normalGrid);
          clear(coreGrid);
          cards.clear();
          const byName = (a, b) => a.name.localeCompare(b.name);
          const ordered = [...plugins.filter((p) => !p.required).sort(byName), ...plugins.filter((p) => p.required).sort(byName)];
          for (const plugin of ordered) {
            const enabled = isEnabled(plugin);
            const toggle = switchControl(enabled, (on) => setPluginEnabled(plugin.name, on), {
              disabled: plugin.required,
              dataset: { plugin: plugin.name },
              label: pick(plugin.displayName)
            });
            const config = visibleSettings(plugin).length ? h("button", { class: "ysrp-ibtn ysrp-plugin-config", type: "button", title: tr("Configure", "配置"), attrs: { "aria-label": tr("Configure", "配置") } }, icon("sliders")) : null;
            config?.addEventListener("click", (ev) => {
              ev.preventDefault();
              openPluginDialog(plugin, openDialog);
            });
            const name = h("span", { class: "ysrp-plugin-name", text: pick(plugin.displayName), title: pick(plugin.displayName) });
            const cardEl = h("div", { class: `ysrp-plugin${plugin.required ? " is-core" : ""}`, dataset: { plugin: plugin.name } }, h("div", { class: "ysrp-plugin-head" }, h("span", { class: "ysrp-card-icon" }, icon(plugin.icon)), name, plugin.required ? h("span", { class: "ysrp-core-mark", title: tr("Core plugin, always on", "核心插件，始终开启") }, icon("circle-exclamation")) : null, h("span", { class: "ysrp-plugin-tools" }, config, toggle.el)), h("div", { class: "ysrp-plugin-desc", text: pick(plugin.description) }), h("hr", { class: "ysrp-sep" }), h("div", { class: "ysrp-plugin-authors", text: plugin.authors.join(", ") }));
            cards.set(plugin.name, cardEl);
            (plugin.required ? coreGrid : normalGrid).appendChild(cardEl);
          }
          applyFilter();
        };
        const applyFilter = () => {
          const q = search.value.trim().toLowerCase();
          const mode = filter.value;
          let normalShown = 0;
          let coreShown = 0;
          for (const plugin of plugins) {
            const el = cards.get(plugin.name);
            if (!el)
              continue;
            const haystack = [plugin.name, pick(plugin.displayName), pick(plugin.description), ...plugin.authors].join(`
`).toLowerCase();
            const enabled = isEnabled(plugin);
            const ok = (!q || haystack.includes(q)) && (mode === "all" || (mode === "enabled" ? enabled : !enabled));
            el.style.display = ok ? "" : "none";
            if (ok) {
              if (plugin.required)
                coreShown++;
              else
                normalShown++;
            }
          }
          normalGrid.style.display = normalShown ? "" : "none";
          coreGrid.style.display = coreShown ? "" : "none";
          divider.style.display = normalShown && coreShown ? "" : "none";
          empty.style.display = normalShown || coreShown ? "none" : "";
        };
        search.addEventListener("input", applyFilter);
        filter.addEventListener("change", applyFilter);
        const off = pluginsChanged.on(build);
        build();
        pane.append(h("div", { class: "ysrp-tab-intro", text: tr("Turn features on or off. Changes apply immediately. Click the sliders icon to configure.", "开启或关闭各项功能，立即生效。点滑杆图标进行配置。") }), h("div", { class: "ysrp-searchbar" }, search, filter), container);
        return off;
      }
    };
  }

  // src/plugins/_core/settings/recordsTab.ts
  var uiStates = new Map;
  var availability = new Map;
  function uiFor(videoId) {
    let s = uiStates.get(videoId);
    if (!s) {
      s = {};
      uiStates.set(videoId, s);
    }
    return s;
  }
  function forgetRowUi(videoId) {
    uiStates.delete(videoId);
  }
  var rowCount = 0;
  function recordsHeading() {
    return tr("Saved Videos - ({count})", "已保存视频 - ({count})", { count: rowCount });
  }
  function progressText(videoId, record, liveProgress) {
    if (!record)
      return "0%";
    const progress = Number(liveProgress ?? record.videoProgress);
    const seconds = Number.isFinite(progress) && progress > 0 ? progress : 0;
    let duration = Number(record.videoDuration);
    if (!(duration > 0) && videoId === urlVideoId())
      duration = currentDuration();
    if (duration > 0)
      return `${Math.min(100, Math.max(0, seconds / duration * 100)).toFixed(1)}%`;
    return formatTime(seconds);
  }
  async function persistDearrow(videoId, title) {
    try {
      const rec = readRecord(videoId);
      if (!rec)
        return;
      if (typeof rec.originalTitle !== "string" || !rec.originalTitle.trim())
        await fetchOriginalTitle(videoId);
      updateRecord(videoId, (cur) => {
        if (!cur)
          return null;
        if (typeof cur.originalTitle === "string" && sameTitle(cur.originalTitle, title))
          return null;
        if (cur.videoName === title)
          return null;
        return { ...cur, videoName: title };
      }, "content");
    } catch (err) {
      console.warn("[Video Memory] Failed to persist DeArrow title to storage:", err);
    }
  }
  var LOADING_ORIGINAL = () => tr("Loading original title…", "正在获取原标题…");
  var ORIGINAL_UNAVAILABLE = () => tr("Original title unavailable", "未找到原标题");

  class RecordRow {
    entry;
    onDeleted;
    li;
    titleEl;
    pctEl;
    daBtn = null;
    dearrow = null;
    original = null;
    originalDone = false;
    loadingOriginal = false;
    disposers = [];
    ui;
    constructor(entry, isCurrent, onDeleted) {
      this.entry = entry;
      this.onDeleted = onDeleted;
      const { videoId, record } = entry;
      this.ui = uiFor(videoId);
      this.pctEl = h("span", { class: "ysrp-pct ysrp-record-progress", text: progressText(videoId, record) });
      this.titleEl = h("span", { class: "ysrp-title ysrp-record-title" });
      const top = h("div", { class: "ysrp-row-top" }, this.pctEl, this.titleEl);
      this.li = h("li", { class: `ysrp-row${isCurrent ? " is-current" : ""}`, dataset: { videoId } }, top);
      this.initTitles();
      const ctx = {
        videoId,
        record,
        url: watchUrl(videoId),
        isCurrent,
        ui: this.ui,
        title: () => this.titleEl.textContent || UNKNOWN_TITLE
      };
      const panels = [];
      for (const contribution of listRowButtons()) {
        try {
          const parts = contribution.create(ctx);
          if (!parts)
            continue;
          top.appendChild(parts.button);
          if (parts.panel)
            panels.push({ order: contribution.panelOrder ?? contribution.order, el: parts.panel });
          if (parts.dispose)
            this.disposers.push(parts.dispose);
        } catch (err) {
          console.error(`[Video Memory] Row button ${contribution.id} failed:`, err);
        }
      }
      top.appendChild(iconButton("trash-can", tr("Delete record", "删除保存记录"), "is-delete", (ev) => {
        ev.preventDefault();
        this.delete();
      }));
      panels.sort((a, b) => a.order - b.order);
      for (const p of panels)
        this.li.appendChild(p.el);
    }
    get videoId() {
      return this.entry.videoId;
    }
    updateProgress(liveProgress) {
      this.pctEl.textContent = progressText(this.videoId, readRecord(this.videoId), liveProgress);
    }
    destroy() {
      for (const fn of this.disposers.splice(0)) {
        try {
          fn();
        } catch {}
      }
    }
    delete() {
      removeRecord(this.videoId, "delete");
      forgetRowUi(this.videoId);
      this.destroy();
      this.li.remove();
      this.onDeleted(this);
    }
    initTitles() {
      const { videoId, record } = this.entry;
      const storedOriginal = typeof record.originalTitle === "string" ? normalizeTitle(record.originalTitle) : "";
      this.original = storedOriginal || cachedOriginalTitle(videoId) || getSources(videoId).original || null;
      this.originalDone = Boolean(this.original);
      const avail = availability.get(videoId);
      if (avail && avail.state === "missing") {
        this.dearrow = null;
      } else {
        const fromName = normalizeTitle(record.videoName);
        const candidates = [
          getSources(videoId).dearrow,
          resolveTitle(videoId).source === "dearrow" ? resolveTitle(videoId).title : "",
          avail && avail.state === "available" ? avail.title : "",
          cachedDearrow(videoId) || "",
          !isPlaceholderTitle(fromName) && !sameTitle(fromName, this.original) ? fromName : ""
        ];
        this.dearrow = candidates.find((c) => c && !sameTitle(c, this.original)) || null;
        if (this.dearrow)
          availability.set(videoId, { state: "available", title: this.dearrow });
      }
      if (!(avail && avail.state === "missing")) {
        this.daBtn = h("button", { class: "ysrp-ibtn ysrp-da", type: "button" }, dearrowIcon(20));
        this.daBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          this.toggleDearrow();
        });
        this.titleEl.after(this.daBtn);
      }
      this.renderTitle();
      if (this.daBtn && !this.dearrow) {
        fetchDearrowTitle(videoId).then((title) => {
          const clean = title ? normalizeTitle(title) : "";
          if (clean && !sameTitle(clean, this.original))
            this.applyDearrow(clean);
          else
            this.markMissing();
        }).catch((err) => console.warn("[Video Memory] Failed to load DeArrow title for records list:", err));
      }
      if (!this.original) {
        fetchOriginalTitle(videoId).then((title) => {
          this.originalDone = true;
          if (title)
            this.original = normalizeTitle(title);
          if (this.dearrow && this.original && sameTitle(this.dearrow, this.original)) {
            this.dearrow = null;
            this.markMissing();
            return;
          }
          this.renderTitle();
        });
      }
    }
    applyDearrow(title) {
      const clean = normalizeTitle(title);
      if (!clean || isPlaceholderTitle(clean) || sameTitle(clean, this.original))
        return;
      availability.set(this.videoId, { state: "available", title: clean });
      persistDearrow(this.videoId, clean);
      this.dearrow = clean;
      if (!this.daBtn) {
        this.daBtn = h("button", { class: "ysrp-ibtn ysrp-da", type: "button" }, dearrowIcon(20));
        this.daBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          this.toggleDearrow();
        });
        this.titleEl.after(this.daBtn);
      }
      this.renderTitle();
    }
    markMissing() {
      if (this.dearrow)
        return;
      availability.set(this.videoId, { state: "missing" });
      this.daBtn?.remove();
      this.daBtn = null;
      this.ui.showOriginal = false;
      this.renderTitle();
    }
    showingOriginal() {
      return !this.dearrow || this.ui.showOriginal === true;
    }
    renderTitle() {
      let text;
      if (!this.showingOriginal() && this.dearrow)
        text = this.dearrow;
      else if (this.loadingOriginal)
        text = LOADING_ORIGINAL();
      else if (this.original)
        text = this.original;
      else if (this.originalDone)
        text = ORIGINAL_UNAVAILABLE();
      else
        text = LOADING_ORIGINAL();
      this.titleEl.textContent = text;
      this.titleEl.title = text;
      const btn = this.daBtn;
      if (!btn)
        return;
      const ready = Boolean(this.dearrow);
      btn.dataset.state = ready ? "ready" : "pending";
      btn.disabled = !ready;
      btn.dataset.loading = this.loadingOriginal ? "true" : "false";
      btn.classList.toggle("is-off", ready && this.showingOriginal());
      const tip = !ready ? tr("Checking DeArrow title…", "正在检测 DeArrow 标题…") : this.showingOriginal() ? tr("Show DeArrow title", "恢复 DeArrow 标题") : tr("Show original title", "显示原标题");
      btn.title = tip;
      btn.setAttribute("aria-label", tip);
    }
    toggleDearrow() {
      if (!this.dearrow || this.loadingOriginal)
        return;
      if (this.showingOriginal()) {
        this.ui.showOriginal = false;
        this.renderTitle();
        return;
      }
      this.ui.showOriginal = true;
      if (this.original || this.originalDone) {
        this.renderTitle();
        return;
      }
      this.loadingOriginal = true;
      this.renderTitle();
      fetchOriginalTitle(this.videoId).then((title) => {
        this.originalDone = true;
        if (title)
          this.original = normalizeTitle(title);
      }).finally(() => {
        this.loadingOriginal = false;
        this.renderTitle();
      });
    }
  }

  class RecordsList {
    setBusy;
    list;
    rows = new Map;
    renderedCurrent = null;
    building = false;
    disposers = [];
    constructor(pane, setBusy) {
      this.setBusy = setBusy;
      this.list = h("ul", { class: "ysrp-records" });
      pane.appendChild(this.list);
      const on = (type, fn) => {
        const wrapped = (ev) => {
          if (isSettingsOpen() && this.list.isConnected)
            fn(ev);
        };
        document.addEventListener(type, wrapped);
        this.disposers.push(() => document.removeEventListener(type, wrapped));
      };
      on(EVT_RECORD_UPDATED, (ev) => {
        const id = ev.detail && ev.detail.videoId;
        if (!id)
          return;
        const row = this.rows.get(id);
        if (!row)
          return this.rebuild();
        const live = typeof ev.detail.videoProgress === "number" ? ev.detail.videoProgress : undefined;
        row.updateProgress(live);
      });
      on(EVT_VIDEO_STATUS, (ev) => {
        const id = ev.detail ? ev.detail.videoId : undefined;
        if (id !== undefined && (id || null) !== this.renderedCurrent)
          this.rebuild();
      });
      on(EVT_DEARROW_READY, (ev) => {
        const { videoId, title } = ev.detail || {};
        if (!videoId || !title)
          return;
        this.rows.get(videoId)?.applyDearrow(title);
      });
      this.disposers.push(rowsChanged.on(() => {
        if (isSettingsOpen())
          this.rebuild();
      }));
      this.disposers.push(recordChanges.on((change) => {
        if (change.kind === "bulk" && isSettingsOpen())
          this.rebuild();
      }));
    }
    destroy() {
      for (const fn of this.disposers.splice(0))
        fn();
      for (const row of this.rows.values())
        row.destroy();
      this.rows.clear();
    }
    rebuild() {
      if (this.building)
        return;
      this.building = true;
      this.setBusy(true);
      try {
        for (const row of this.rows.values())
          row.destroy();
        this.rows.clear();
        clear(this.list);
        const current = urlVideoId() || null;
        this.renderedCurrent = current;
        const entries = listRecords().filter((e) => {
          if (!e.record)
            console.warn("[Video Memory] Failed to parse saved video data:", e.key);
          return Boolean(e.record);
        });
        entries.sort((a, b) => {
          if (a.videoId === current)
            return -1;
          if (b.videoId === current)
            return 1;
          return (Number(b.record.saveDate) || 0) - (Number(a.record.saveDate) || 0);
        });
        for (const entry of entries) {
          try {
            const row = new RecordRow(entry, entry.videoId === current, (r) => this.onDeleted(r));
            this.rows.set(entry.videoId, row);
            this.list.appendChild(row.li);
          } catch (err) {
            console.error("[Video Memory] Failed to render saved video:", err);
          }
        }
        rowCount = this.rows.size;
        if (!rowCount) {
          this.list.appendChild(h("li", { class: "ysrp-empty-row", text: tr("No saved videos yet.", "还没有保存的视频。") }));
        }
        refreshSettingsHeader();
      } finally {
        this.building = false;
        this.setBusy(false);
      }
    }
    onDeleted(row) {
      this.rows.delete(row.videoId);
      rowCount = this.rows.size;
      if (!rowCount)
        this.list.appendChild(h("li", { class: "ysrp-empty-row", text: tr("No saved videos yet.", "还没有保存的视频。") }));
      refreshSettingsHeader();
    }
  }
  function createRecordsTab(setBusy) {
    let list = null;
    return {
      id: "records",
      group: "main",
      order: 10,
      icon: "database",
      label: () => tr("Records", "记录"),
      heading: () => recordsHeading(),
      storageBadge: true,
      render(pane) {
        rowCount = countRecords();
        list = new RecordsList(pane, setBusy);
        return () => {
          list?.destroy();
          list = null;
        };
      },
      onShow() {
        list?.rebuild();
      }
    };
  }

  // src/plugins/_core/settings/rowParts.ts
  function showPanel(panel, open) {
    panel.style.display = open ? "flex" : "none";
  }
  async function copyText(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (err) {
      if (!legacyCopy(text))
        throw err;
      return;
    }
    if (!legacyCopy(text))
      throw new Error(tr("Clipboard is not available", "剪贴板不可用"));
  }
  function legacyCopy(text) {
    try {
      const area = h("textarea", { value: text, style: "position:fixed;top:-1000px;left:-1000px;opacity:0" });
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
  var noteContribution = {
    id: "note",
    order: 20,
    panelOrder: 30,
    create(ctx) {
      const ui = ctx.ui;
      let note = typeof ctx.record.videoNote === "string" ? ctx.record.videoNote : "";
      let editor = null;
      const topBtn = iconButton("pen-to-square", "", "is-note");
      const editBtn = iconButton("pencil", "", "is-note-edit");
      const preview = h("div", { class: "ysrp-note-text" });
      const body = h("div", { class: "ysrp-note-body" }, preview);
      const panel = h("div", { class: "ysrp-panel ysrp-note-container" }, h("div", { class: "ysrp-panel-head" }, h("span", { class: "ysrp-panel-label", text: tr("Notes", "笔记") }), editBtn), body);
      const hasNote = () => note.trim().length > 0;
      const isOpen = () => ui.noteOpen === true;
      const editing = () => editor !== null;
      const renderPreview = () => {
        preview.textContent = hasNote() ? note : tr("No notes yet", "暂无笔记");
        preview.classList.toggle("is-empty", !hasNote());
      };
      const refreshButtons = () => {
        const topTip = editing() ? tr("Save & collapse note", "保存并折叠笔记") : hasNote() ? isOpen() ? tr("Hide notes", "隐藏笔记") : tr("Show notes", "显示笔记") : tr("Add note", "添加笔记");
        topBtn.title = topTip;
        topBtn.setAttribute("aria-label", topTip);
        topBtn.classList.toggle("has-content", hasNote());
        setIcon(editBtn, editing() ? "floppy-disk" : "pencil");
        const editTip = editing() ? tr("Save note", "保存笔记") : tr("Edit note", "编辑笔记");
        editBtn.title = editTip;
        editBtn.setAttribute("aria-label", editTip);
      };
      const setOpen = (open) => {
        if (!open && editing())
          return;
        ui.noteOpen = open;
        showPanel(panel, open);
        refreshButtons();
      };
      const autosize = () => {
        if (!editor)
          return;
        editor.style.height = "auto";
        editor.style.height = `${editor.scrollHeight}px`;
      };
      const startEdit = (draft) => {
        if (editing())
          return;
        ui.noteOpen = true;
        showPanel(panel, true);
        const area = h("textarea", { class: "ysrp-textarea ysrp-note-input", value: draft ?? note, rows: 3 });
        area.addEventListener("input", () => {
          ui.noteDraft = area.value;
          autosize();
        });
        editor = area;
        ui.editing = true;
        ui.noteDraft = area.value;
        preview.replaceWith(area);
        autosize();
        requestAnimationFrame(() => {
          if (!area.isConnected)
            return;
          area.focus();
          area.setSelectionRange(area.value.length, area.value.length);
        });
        refreshButtons();
      };
      const save = () => {
        if (!editor)
          return;
        const next = editor.value.trim();
        editor.replaceWith(preview);
        editor = null;
        ui.editing = false;
        delete ui.noteDraft;
        note = next;
        renderPreview();
        try {
          updateRecord(ctx.videoId, (cur) => {
            if (!cur)
              return null;
            const out = { ...cur };
            if (next)
              out.videoNote = next;
            else
              delete out.videoNote;
            return out;
          }, "content");
        } catch (err) {
          console.error("[Video Memory] Failed to update video note in storage:", err);
        }
        refreshButtons();
      };
      topBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (editing()) {
          save();
          setOpen(false);
        } else if (!hasNote()) {
          startEdit();
        } else {
          setOpen(!isOpen());
        }
      });
      editBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (editing())
          save();
        else
          startEdit();
      });
      renderPreview();
      showPanel(panel, isOpen());
      if (ui.editing === true)
        startEdit(typeof ui.noteDraft === "string" ? ui.noteDraft : undefined);
      refreshButtons();
      return { button: topBtn, panel };
    }
  };
  var linkContribution = {
    id: "link",
    order: 30,
    panelOrder: 10,
    create(ctx) {
      const ui = ctx.ui;
      const tip = h("span", { class: "ysrp-copied", text: tr("Copied", "已复制") });
      let tipTimer = 0;
      let iconTimer = 0;
      const copyBtn = iconButton("copy", tr("Copy URL", "复制 URL"), "is-link is-copy");
      const openBtn = iconButton("arrow-up-right-from-square", tr("Open in new tab", "在新标签页中打开 URL"), "is-open");
      const panel = h("div", { class: "ysrp-panel ysrp-url" }, h("span", { class: "ysrp-url-text", title: ctx.url }, tr("URL: {url}", "链接：{url}", { url: ctx.url })), tip, copyBtn, openBtn);
      const flashTip = (text, error = false) => {
        tip.textContent = text;
        tip.classList.toggle("is-error", error);
        tip.classList.add("is-visible");
        if (tipTimer)
          clearTimeout(tipTimer);
        tipTimer = window.setTimeout(() => tip.classList.remove("is-visible"), 2000);
      };
      copyBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        copyText(ctx.url).then(() => {
          setIcon(copyBtn, "check");
          copyBtn.classList.add("is-success");
          if (iconTimer)
            clearTimeout(iconTimer);
          iconTimer = window.setTimeout(() => {
            setIcon(copyBtn, "copy");
            copyBtn.classList.remove("is-success");
          }, 1000);
          flashTip(tr("Copied", "已复制"));
        }).catch((err) => {
          console.warn("[Video Memory] Failed to copy text: ", err);
          flashTip(tr("Copy failed", "复制失败"), true);
        });
      });
      openBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        window.open(ctx.url, "_blank", "noopener");
      });
      const button = iconButton("link", tr("Show / hide URL", "显示/隐藏 URL"), "is-link");
      button.addEventListener("click", (ev) => {
        ev.preventDefault();
        ui.linkOpen = ui.linkOpen !== true;
        showPanel(panel, ui.linkOpen === true);
      });
      showPanel(panel, ui.linkOpen === true);
      return {
        button,
        panel,
        dispose() {
          clearTimeout(tipTimer);
          clearTimeout(iconTimer);
        }
      };
    }
  };

  // src/plugins/_core/settings/scrollLock.ts
  var SCROLL_KEYS = new Set([" ", "Spacebar", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  function isEditable(el) {
    if (!el)
      return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "SELECT")
      return true;
    if (tag === "INPUT") {
      const type = el.type;
      return !["button", "checkbox", "radio", "submit", "reset", "file", "range", "color", "image"].includes(type);
    }
    return el.isContentEditable === true;
  }
  function canScroll(el, dx, dy) {
    const style = getComputedStyle(el);
    if (dy !== 0) {
      const scrollableY = /(auto|scroll)/.test(style.overflowY) || el.tagName === "TEXTAREA";
      if (scrollableY && el.scrollHeight > el.clientHeight + 1) {
        if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)
          return true;
        if (dy < 0 && el.scrollTop > 0)
          return true;
      }
    }
    if (dx !== 0) {
      const scrollableX = /(auto|scroll)/.test(style.overflowX);
      if (scrollableX && el.scrollWidth > el.clientWidth + 1) {
        if (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
          return true;
        if (dx < 0 && el.scrollLeft > 0)
          return true;
      }
    }
    return false;
  }
  function scrollerFor(target, root, dx, dy) {
    let el = target instanceof Element ? target : null;
    if (!el || !root.contains(el))
      return null;
    while (el) {
      if (canScroll(el, dx, dy))
        return el;
      if (el === root)
        break;
      el = el.parentElement;
    }
    return null;
  }
  function createScrollLock(getRoot, getKeyTarget) {
    let locked = false;
    let touchX = 0;
    let touchY = 0;
    const onWheel = (ev) => {
      const root = getRoot();
      if (!root)
        return;
      if (!scrollerFor(ev.target, root, ev.deltaX, ev.deltaY))
        ev.preventDefault();
    };
    const onTouchStart = (ev) => {
      const t = ev.touches[0];
      if (t) {
        touchX = t.clientX;
        touchY = t.clientY;
      }
    };
    const onTouchMove = (ev) => {
      const root = getRoot();
      const t = ev.touches[0];
      if (!root || !t)
        return;
      const dx = touchX - t.clientX;
      const dy = touchY - t.clientY;
      touchX = t.clientX;
      touchY = t.clientY;
      if (!scrollerFor(ev.target, root, dx, dy))
        ev.preventDefault();
    };
    const onKey = (ev) => {
      if (!SCROLL_KEYS.has(ev.key) || ev.defaultPrevented)
        return;
      const target = ev.target;
      if (isEditable(target))
        return;
      if ((ev.key === " " || ev.key === "Spacebar") && target && target.closest('button, a, label, [role="button"], [role="switch"]'))
        return;
      ev.preventDefault();
      const pane = getKeyTarget();
      const root = getRoot();
      if (!pane || !root)
        return;
      const page = Math.max(40, pane.clientHeight * 0.9);
      switch (ev.key) {
        case "ArrowDown":
          pane.scrollTop += 40;
          break;
        case "ArrowUp":
          pane.scrollTop -= 40;
          break;
        case "PageDown":
        case " ":
        case "Spacebar":
          pane.scrollTop += ev.shiftKey ? -page : page;
          break;
        case "PageUp":
          pane.scrollTop -= page;
          break;
        case "Home":
          pane.scrollTop = 0;
          break;
        case "End":
          pane.scrollTop = pane.scrollHeight;
          break;
        default:
          break;
      }
    };
    return {
      lock() {
        if (locked)
          return;
        locked = true;
        window.addEventListener("wheel", onWheel, { capture: true, passive: false });
        window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
        window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
        window.addEventListener("keydown", onKey, true);
      },
      unlock() {
        if (!locked)
          return;
        locked = false;
        window.removeEventListener("wheel", onWheel, { capture: true });
        window.removeEventListener("touchstart", onTouchStart, { capture: true });
        window.removeEventListener("touchmove", onTouchMove, { capture: true });
        window.removeEventListener("keydown", onKey, true);
      }
    };
  }

  // src/plugins/_core/settings/shell.ts
  var modalOpened = new Emitter;
  function storageModeLabel() {
    return getMode() === "gm" ? tr("GM Storage", "GM 存储") : tr("Browser storage", "浏览器本地存储");
  }

  class SettingsModal {
    backdrop = null;
    root = null;
    navGroups = null;
    headingEl = null;
    badgeEl = null;
    spinnerEl = null;
    panesEl = null;
    panes = new Map;
    active = "records";
    opened = false;
    dialogs = [];
    spinUntil = 0;
    spinTimer = 0;
    disposers = [];
    languageTimer = 0;
    scrollLock = createScrollLock(() => this.root, () => this.activePane());
    start() {
      this.disposers.push(tabsChanged.on(() => this.onTabsChanged()));
      const onLanguage = () => {
        if (this.languageTimer)
          clearTimeout(this.languageTimer);
        this.languageTimer = window.setTimeout(() => this.rebuild(), 50);
      };
      document.addEventListener(EVT_LANGUAGE, onLanguage);
      this.disposers.push(() => document.removeEventListener(EVT_LANGUAGE, onLanguage));
      const onKey = (ev) => {
        if (!this.opened || ev.key !== "Escape")
          return;
        ev.preventDefault();
        ev.stopPropagation();
        if (this.dialogs.length)
          this.dialogs[this.dialogs.length - 1]();
        else
          this.close();
      };
      document.addEventListener("keydown", onKey, true);
      this.disposers.push(() => document.removeEventListener("keydown", onKey, true));
    }
    destroy() {
      this.close();
      for (const fn of this.disposers.splice(0))
        fn();
      this.teardown();
    }
    isOpen() {
      return this.opened;
    }
    activeTab() {
      return this.active;
    }
    activePane() {
      return this.panes.get(this.active)?.el || null;
    }
    open(tabId) {
      this.ensureBuilt();
      if (!this.root || !this.backdrop)
        return;
      const host = pageHost();
      if (this.backdrop.parentElement !== host)
        host.appendChild(this.backdrop);
      if (this.root.parentElement !== host)
        host.appendChild(this.root);
      const wasOpen = this.opened;
      this.opened = true;
      this.backdrop.classList.add("is-open");
      this.root.classList.add("is-open");
      this.scrollLock.lock();
      this.activate(tabId && getTab(tabId) ? tabId : getTab(this.active) ? this.active : "records", !wasOpen);
      if (!wasOpen)
        modalOpened.emit();
    }
    close() {
      if (!this.opened)
        return;
      while (this.dialogs.length)
        this.dialogs[this.dialogs.length - 1]();
      this.opened = false;
      this.backdrop?.classList.remove("is-open");
      this.root?.classList.remove("is-open");
      this.scrollLock.unlock();
    }
    openDialog(content, onClose) {
      if (!this.root)
        return () => {};
      const overlay = h("div", { class: "ysrp-dialog-overlay" }, content);
      let closed = false;
      const close = () => {
        if (closed)
          return;
        closed = true;
        overlay.remove();
        this.dialogs = this.dialogs.filter((fn) => fn !== close);
        onClose?.();
      };
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay)
          close();
      });
      this.root.appendChild(overlay);
      this.dialogs.push(close);
      return close;
    }
    setBusy(busy) {
      if (!this.spinnerEl)
        return;
      const el = this.spinnerEl;
      if (busy) {
        this.spinUntil = Date.now() + 300;
        el.classList.add("is-active");
        return;
      }
      const wait = Math.max(0, this.spinUntil - Date.now());
      if (this.spinTimer)
        clearTimeout(this.spinTimer);
      this.spinTimer = window.setTimeout(() => el.classList.remove("is-active"), wait);
    }
    refreshHeader() {
      if (!this.headingEl || !this.badgeEl)
        return;
      const tab = getTab(this.active);
      this.headingEl.textContent = tab ? tab.heading ? tab.heading() : tab.label() : "";
      this.badgeEl.textContent = storageModeLabel();
      this.badgeEl.style.display = tab && tab.storageBadge ? "" : "none";
    }
    rebuild() {
      if (!this.root)
        return;
      const wasOpen = this.opened;
      const tab = this.active;
      this.close();
      this.teardown();
      this.active = tab;
      if (wasOpen)
        this.open(tab);
    }
    teardown() {
      for (const entry of this.panes.values()) {
        try {
          entry.cleanup?.();
        } catch (err) {
          console.error("[Video Memory] tab cleanup failed:", err);
        }
      }
      this.panes.clear();
      this.root?.remove();
      this.backdrop?.remove();
      this.root = null;
      this.backdrop = null;
      this.navGroups = null;
    }
    ensureBuilt() {
      if (this.root && this.backdrop)
        return;
      const existing = document.querySelector(`.${CLS_BACKDROP}`);
      const backdrop = existing || h("div", { class: CLS_BACKDROP });
      backdrop.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.target === backdrop)
          this.close();
      });
      this.backdrop = backdrop;
      this.navGroups = h("div", { class: "ysrp-nav-groups" });
      const footer = h("div", { class: "ysrp-nav-footer" }, h("a", { href: HOMEPAGE_URL, target: "_blank", rel: "noopener noreferrer", text: "Video Memory" }), h("span", { text: ` • ${VERSION_SHORT}` }));
      const nav = h("nav", { class: "ysrp-nav", attrs: { "aria-label": tr("Settings sections", "设置分区") } }, this.navGroups, footer);
      this.headingEl = h("h3", { class: "ysrp-heading" });
      this.badgeEl = h("span", { class: "ysrp-badge" });
      this.spinnerEl = h("span", { class: "ysrp-refresh", title: tr("Refreshing…", "正在更新列表…") }, icon("arrows-rotate", "fa-spin"));
      const closeBtn = h("button", { class: "ysrp-close", type: "button", title: tr("Close", "关闭"), attrs: { "aria-label": tr("Close", "关闭") } }, icon("xmark"));
      closeBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.close();
      });
      const header = h("div", { class: "ysrp-header" }, h("div", { class: "ysrp-header-left" }, this.headingEl, this.badgeEl, this.spinnerEl), closeBtn);
      this.panesEl = h("div", { class: `ysrp-panes ${CLS_MODAL_BODY}` });
      const main = h("div", { class: "ysrp-main" }, header, this.panesEl);
      const root = h("div", { class: CLS_MODAL, attrs: { role: "dialog", "aria-modal": "true" } }, nav, main);
      root.addEventListener("keydown", (ev) => ev.stopPropagation());
      root.addEventListener("keyup", (ev) => ev.stopPropagation());
      root.addEventListener("keypress", (ev) => ev.stopPropagation());
      this.root = root;
      this.renderNav();
    }
    renderNav() {
      if (!this.navGroups)
        return;
      clear(this.navGroups);
      const groups = [
        { id: "main", title: tr("Video Memory", "视频记忆") },
        { id: "plugins", title: tr("Plugins", "插件") }
      ];
      const tabs = listTabs();
      for (const group of groups) {
        const items = tabs.filter((t) => t.group === group.id);
        if (!items.length)
          continue;
        const box = h("div", { class: "ysrp-nav-group" }, h("div", { class: "ysrp-nav-title", text: group.title }));
        for (const tab of items) {
          const btn = h("button", { class: `ysrp-tab${tab.id === this.active ? " is-active" : ""}`, type: "button", dataset: { tabId: tab.id } }, h("span", { class: "ysrp-tab-icon" }, icon(tab.icon)), h("span", { class: "ysrp-tab-label", text: tab.label() }));
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            this.activate(tab.id);
          });
          box.appendChild(btn);
        }
        this.navGroups.appendChild(box);
      }
    }
    onTabsChanged() {
      for (const [id, entry] of Array.from(this.panes)) {
        if (getTab(id) !== entry.tab) {
          try {
            entry.cleanup?.();
          } catch {}
          entry.el.remove();
          this.panes.delete(id);
        }
      }
      if (!this.root)
        return;
      this.renderNav();
      if (!getTab(this.active))
        this.activate(getTab("plugins") ? "plugins" : "records");
    }
    activate(id, forceShow = false) {
      const tab = getTab(id);
      if (!tab || !this.root || !this.panesEl)
        return;
      const changed = this.active !== id;
      this.active = id;
      this.root.dataset.activeTab = id;
      for (const btn of Array.from(this.root.querySelectorAll(".ysrp-tab"))) {
        btn.classList.toggle("is-active", btn.dataset.tabId === id);
      }
      let entry = this.panes.get(id);
      if (!entry) {
        const el = h("div", { class: "ysrp-pane", dataset: { pane: id } });
        this.panesEl.appendChild(el);
        entry = { tab, el, cleanup: null };
        this.panes.set(id, entry);
        try {
          const cleanup = tab.render(el);
          entry.cleanup = typeof cleanup === "function" ? cleanup : null;
        } catch (err) {
          console.error(`[Video Memory] Failed to render tab ${id}:`, err);
        }
      }
      for (const [pid, p] of this.panes)
        p.el.classList.toggle("is-active", pid === id);
      if (changed || forceShow || !entry.el.dataset.shown) {
        entry.el.dataset.shown = "1";
        try {
          tab.onShow?.(entry.el);
        } catch (err) {
          console.error(`[Video Memory] Failed to show tab ${id}:`, err);
        }
      }
      this.refreshHeader();
    }
  }

  // src/plugins/_core/settings/storageTab.ts
  function isIOS() {
    if (typeof navigator === "undefined")
      return false;
    const ua = String(navigator.userAgent || navigator.vendor || "").toLowerCase();
    if (/\b(ipad|iphone|ipod)\b/.test(ua))
      return true;
    return ua.includes("mac") && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  }
  var canShareFiles = (() => {
    try {
      if (!isIOS() || typeof File !== "function" || typeof navigator.share !== "function")
        return false;
      if (typeof navigator.canShare === "function") {
        const probe = new File(["{}"], "probe.json", { type: "application/json" });
        return navigator.canShare({ files: [probe] });
      }
      return true;
    } catch {
      return false;
    }
  })();
  function exportFileName(date = new Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `[Youtube] Video Memory「${date.getFullYear()} ${p(date.getMonth() + 1)} ${p(date.getDate())}」「${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}」.json`;
  }
  function downloadFile(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = h("a", { href: url, download: name, style: "display:none" });
    document.body.appendChild(a);
    a.click();
    requestAnimationFrame(() => {
      a.remove();
      URL.revokeObjectURL(url);
    });
  }
  function modeName(mode) {
    return mode === "gm" ? tr("GM storage", "GM 存储") : tr("localStorage", "localStorage");
  }
  function createStorageTab() {
    return {
      id: "storage",
      group: "main",
      order: 20,
      icon: "gear",
      label: () => tr("Storage", "存储"),
      storageBadge: true,
      render(pane) {
        const backendMsg = messageLine();
        const choices = choiceGroup("ysrp-storage-mode", [
          { value: "local", tag: tr("LOCAL", "本地"), label: tr("localStorage (default)", "localStorage（默认）"), hint: tr("Fast storage scoped to this browser profile.", "快速、本地浏览器可用的存储。") },
          {
            value: "gm",
            tag: "GM",
            label: tr("GM storage", "GM 存储"),
            hint: gmAvailable ? tr("Tampermonkey-backed storage that can sync across profiles.", "由 Tampermonkey 提供、可在配置间同步的存储。") : tr("Not available in this userscript manager.", "当前脚本管理器不提供 GM 存储。"),
            disabled: !gmAvailable
          }
        ], getMode(), () => backendMsg.set(""));
        const applyLabel = tr("Apply & Migrate", "应用并迁移");
        const applyBtn = button(applyLabel, { icon: "right-left", title: tr("Switch storage backend and migrate data.", "切换存储方式并迁移数据。") });
        applyBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          const target = choices.value() === "gm" ? "gm" : "local";
          const from = getMode();
          if (target === from) {
            backendMsg.set(tr("Already using {mode}.", "当前已在使用{mode}。", { mode: modeName(from) }));
            return;
          }
          applyBtn.disabled = true;
          setButtonLabel(applyBtn, tr("Migrating...", "正在迁移..."));
          try {
            const result = switchMode(target, { migrate: true, clearSource: true });
            if (result.ok) {
              backendMsg.set(tr("Moved {count} record(s) to {mode}.", "已将 {count} 条记录迁移到{mode}。", { count: result.moved, mode: modeName(target) }), "success");
            } else {
              choices.set(getMode());
              backendMsg.set(tr("Migration failed: {message}", "迁移失败：{message}", { message: result.error || "" }), "error");
            }
          } catch (err) {
            console.error("[Video Memory] Failed to switch storage:", err);
            choices.set(getMode());
            backendMsg.set(tr("Migration failed: {message}", "迁移失败：{message}", { message: errorMessage(err) }), "error");
          }
          refreshSettingsHeader();
          window.setTimeout(() => {
            applyBtn.disabled = false;
            setButtonLabel(applyBtn, applyLabel);
          }, 500);
        });
        const backendCard = card({ icon: "database", title: tr("Storage Backend", "存储后端"), desc: tr("Choose where to store your progress data.", "选择保存进度的存储方式。") }, choices.el, h("div", { class: "ysrp-actions" }, applyBtn, h("span", { class: "ysrp-hint", text: tr("Migrates all saved records to the selected backend (moves data).", "将所有记录迁移至所选存储后端（移动数据）。") })), backendMsg.el);
        const exportMsg = messageLine();
        const exportJson = () => JSON.stringify(exportData(), null, 2);
        const copyBtn = button(tr("Copy JSON", "复制 JSON"), { icon: "copy", title: tr("Copy export JSON to clipboard", "复制导出的 JSON 到剪贴板") });
        copyBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          let text;
          try {
            text = exportJson();
          } catch (err) {
            exportMsg.set(tr("Copy export failed: {message}", "复制导出失败：{message}", { message: errorMessage(err) }), "error");
            return;
          }
          copyText(text).then(() => {
            exportMsg.set(tr("JSON copied to clipboard.", "JSON 已复制到剪贴板。"), "success");
          }).catch((err) => {
            console.warn("[Video Memory] Copy export failed:", err);
            exportMsg.set(tr("Copy export failed: {message}", "复制导出失败：{message}", { message: errorMessage(err) }), "error");
          });
        });
        const downloadBtn = button(tr("Download JSON", "下载 JSON"), { icon: "file-arrow-down", title: tr("Download export JSON as file", "下载导出的 JSON 文件") });
        downloadBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          try {
            const text = exportJson();
            const name = exportFileName();
            if (canShareFiles) {
              try {
                const file = new File([text], name, { type: "application/json" });
                if (typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] })) {
                  await navigator.share({
                    files: [file],
                    title: tr("Video Memory Export", "视频记忆导出"),
                    text: tr("Choose “Save to Files” to store your backup.", "请选择“存储到文件”以保存备份。")
                  });
                  exportMsg.set(tr("Shared. If you chose “Save to Files”, the backup is stored.", "已分享。如选择了“存储到文件”，备份已保存。"), "success");
                  return;
                }
              } catch (err) {
                const name2 = err?.name;
                if (name2 === "AbortError" || name2 === "NotAllowedError") {
                  exportMsg.set(tr("Share cancelled.", "已取消分享。"));
                  return;
                }
                console.warn("[Video Memory] Share failed, falling back to download:", err);
              }
            }
            downloadFile(name, text);
            exportMsg.set(tr("Export download started.", "导出下载已开始。"), "success");
          } catch (err) {
            console.warn("[Video Memory] Download export failed:", err);
            exportMsg.set(tr("Download failed: {message}", "下载失败：{message}", { message: errorMessage(err) }), "error");
          }
        });
        const exportCard = card({ icon: "file-arrow-down", title: tr("Export Data", "导出数据"), desc: tr("Back up your saved progress as JSON.", "将保存的进度备份为 JSON。") }, h("div", { class: "ysrp-actions" }, copyBtn, downloadBtn), h("div", { class: "ysrp-hint", text: tr("Exports all saved records from the currently selected backend.", "导出当前存储后端中的所有记录。") }), exportMsg.el);
        const importMsg = messageLine();
        const overwrite = h("input", { type: "checkbox", class: "ysrp-overwrite", id: "ysrp-overwrite" });
        const overwriteRow = h("div", { class: "ysrp-check-row" }, h("label", { class: "ysrp-check" }, overwrite, h("span", { text: tr("Overwrite", "覆盖") })), h("span", { class: "ysrp-hint", text: tr("Deletes all records of the current backend before importing.", "导入前先删除当前存储后端中的全部记录。") }));
        const textarea = h("textarea", { class: "ysrp-textarea", rows: 4, placeholder: tr("Paste exported JSON here...", "在此粘贴导出的 JSON...") });
        const runImport = (text) => {
          let payload;
          try {
            payload = JSON.parse(text);
            const count = importData(payload, { overwrite: overwrite.checked });
            importMsg.set(tr("Imported {count} record(s).", "已导入 {count} 条记录。", { count }), "success");
            refreshSettingsHeader();
          } catch (err) {
            console.warn("[Video Memory] Import failed:", err);
            importMsg.set(tr("Import failed: {message}", "导入失败：{message}", { message: errorMessage(err) }), "error");
          }
        };
        const importBtn = button(tr("Import from Text", "从文本导入"), { icon: "file-arrow-up", title: tr("Import from pasted JSON", "从粘贴的 JSON 导入") });
        importBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          const text = textarea.value.trim();
          if (!text) {
            importMsg.set(tr("Nothing to import.", "没有可导入的内容。"));
            return;
          }
          runImport(text);
        });
        const noFile = tr("No file chosen", "未选择文件");
        const fileName = h("span", { class: "ysrp-file-name", text: noFile });
        const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "ysrp-file-input" });
        const fileBox = h("label", { class: "ysrp-file", tabIndex: 0, title: tr("Select an export JSON file", "选择要导入的 JSON 文件") }, h("span", { class: "ysrp-file-label", text: tr("Choose File", "选择文件") }), fileName, fileInput);
        fileBox.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Spacebar")
            return;
          ev.preventDefault();
          try {
            const picker = fileInput;
            if (typeof picker.showPicker === "function")
              picker.showPicker();
            else
              fileInput.click();
          } catch {
            fileInput.click();
          }
        });
        fileInput.addEventListener("change", () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) {
            fileName.textContent = noFile;
            return;
          }
          fileName.textContent = file.name;
          file.text().then((text) => {
            textarea.value = text || "";
            runImport(text || "");
          }).catch((err) => {
            importMsg.set(tr("Could not read the file: {message}", "无法读取文件：{message}", { message: errorMessage(err) }), "error");
          }).finally(() => {
            fileInput.value = "";
            fileName.textContent = noFile;
          });
        });
        const importCard = card({ icon: "file-arrow-up", title: tr("Import Data", "导入数据"), desc: tr("Restore a previous export to merge or replace your saved records.", "导入之前的导出文件，用于合并或替换记录。") }, overwriteRow, textarea, h("div", { class: "ysrp-actions" }, importBtn, fileBox), h("div", { class: "ysrp-hint", text: tr("Imports records into the currently selected backend.", "将记录导入到当前选择的存储后端。") }), importMsg.el);
        pane.append(backendCard, exportCard, importCard);
      },
      onShow() {
        refreshSettingsHeader();
      }
    };
  }

  // src/plugins/_core/settings/style.css
  var style_default2 = `/* Settings modal (N-5). All sizes in px: YouTube sets html { font-size: 10px }. */

.ysrp-backdrop {
  position: fixed;
  inset: 0;
  background: var(--ysrp-backdrop);
  z-index: 9998;
  display: none;
}
.ysrp-backdrop.is-open { display: block; }

.ysrp-settings-container {
  all: initial;
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  z-index: 9999;
  box-sizing: border-box;
  width: min(896px, 92vw);
  height: min(640px, 85vh);
  display: none;
  flex-direction: row;
  overflow: hidden;
  background: var(--ysrp-bg);
  color: var(--ysrp-text);
  border: 1px solid var(--ysrp-border);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, .28);
  font-family: var(--ysrp-font);
  font-size: 14px;
  line-height: 1.5;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
.ysrp-settings-container.is-open { display: flex; }
.ysrp-settings-container *,
.ysrp-settings-container *::before,
.ysrp-settings-container *::after { box-sizing: border-box; }
.ysrp-settings-container,
.ysrp-settings-container * {
  scrollbar-width: thin;
  scrollbar-color: rgba(128, 128, 128, .45) transparent;
}
.ysrp-settings-container ::-webkit-scrollbar { width: 8px; height: 8px; }
.ysrp-settings-container ::-webkit-scrollbar-track { background: transparent; }
.ysrp-settings-container ::-webkit-scrollbar-thumb { background: rgba(128, 128, 128, .45); border-radius: 8px; }
.ysrp-settings-container ::-webkit-scrollbar-corner { background: transparent; }

/* ---------------------------------------------------------------- navigation */
.ysrp-nav {
  flex: 0 0 208px;
  width: 208px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 12px 12px;
  background: var(--ysrp-nav-bg);
  border-right: 1px solid var(--ysrp-border);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.ysrp-nav-groups { display: flex; flex-direction: column; gap: 16px; }
.ysrp-nav-group { display: flex; flex-direction: column; gap: 2px; }
.ysrp-nav-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--ysrp-text-3);
  padding: 0 10px 4px;
}
.ysrp-tab {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px;
  border-radius: 10px;
  font-family: var(--ysrp-font);
  font-size: 14px;
  font-weight: 500;
  color: var(--ysrp-text-2);
  cursor: pointer;
  white-space: nowrap;
}
.ysrp-tab:hover { background: var(--ysrp-hover); color: var(--ysrp-text); }
.ysrp-tab.is-active { background: var(--ysrp-layer); color: var(--ysrp-text); }
.ysrp-tab:focus-visible { outline: 2px solid var(--ysrp-border-strong); outline-offset: -2px; }
.ysrp-tab-icon { flex: 0 0 16px; width: 16px; text-align: center; font-size: 13px; }
.ysrp-tab-label { overflow: hidden; text-overflow: ellipsis; }
.ysrp-nav-footer {
  margin-top: auto;
  font-size: 11px;
  opacity: .3;
  overflow-wrap: anywhere;
  padding: 0 10px;
}
.ysrp-nav-footer a { color: inherit; text-decoration: none; }
.ysrp-nav-footer a:hover { text-decoration: underline; }

/* ---------------------------------------------------------------- right column */
.ysrp-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 24px 16px;
}
.ysrp-header {
  flex: 0 0 32px;
  height: 32px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ysrp-header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ysrp-heading {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ysrp-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ysrp-badge {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 18px;
  color: var(--ysrp-text-2);
  border: 1px solid var(--ysrp-border-strong);
  border-radius: 999px;
  padding: 0 8px;
  white-space: nowrap;
}
.ysrp-refresh { display: none; color: var(--ysrp-text-2); font-size: 13px; }
.ysrp-refresh.is-active { display: inline-flex; }
.ysrp-close {
  all: unset;
  box-sizing: border-box;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ysrp-text-2);
  cursor: pointer;
  font-size: 16px;
}
.ysrp-close:hover { background: var(--ysrp-hover); color: var(--ysrp-text); }
.ysrp-panes {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-right: -24px;
}
.ysrp-pane {
  display: none;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 24px;
  padding-bottom: 4px;
}
.ysrp-pane.is-active { display: flex; }
.ysrp-pane > * { flex-shrink: 0; }
.ysrp-tab-intro { color: var(--ysrp-text-2); }

/* ---------------------------------------------------------------- controls */
.ysrp-btn {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid var(--ysrp-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--ysrp-text);
  font-family: var(--ysrp-font);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.ysrp-btn.is-small { height: 30px; padding: 0 12px; font-size: 13px; }
.ysrp-btn:hover { background: var(--ysrp-hover); }
.ysrp-btn:focus-visible { box-shadow: 0 0 0 2px var(--ysrp-border-strong); }
.ysrp-btn:disabled { opacity: .5; cursor: default; }
.ysrp-btn.is-danger { color: var(--ysrp-error); border-color: var(--ysrp-error); }

.ysrp-ibtn {
  all: unset;
  box-sizing: border-box;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ysrp-text-2);
  font-size: 14px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.ysrp-ibtn:hover { background: var(--ysrp-hover); color: var(--ysrp-text); }
.ysrp-ibtn:focus-visible { box-shadow: 0 0 0 2px var(--ysrp-border-strong); }
.ysrp-ibtn:disabled { opacity: .5; cursor: default; }
.ysrp-ibtn.is-delete:hover { color: var(--ysrp-error); }
.ysrp-ibtn.is-success, .ysrp-ibtn.is-success:hover { color: var(--ysrp-success); }
.ysrp-ibtn.has-content { color: var(--ysrp-text); }
.ysrp-da[data-state="pending"] { filter: grayscale(1); opacity: .4; }
.ysrp-da.is-off { filter: grayscale(1); opacity: .6; }

.ysrp-input,
.ysrp-select,
.ysrp-textarea {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--ysrp-border);
  border-radius: 10px;
  background: var(--ysrp-bg);
  color: var(--ysrp-text);
  font-family: var(--ysrp-font);
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.ysrp-select { width: auto; padding-right: 8px; cursor: pointer; }
.ysrp-textarea {
  height: auto;
  min-height: 72px;
  padding: 8px 12px;
  resize: vertical;
  display: block;
}
.ysrp-input::placeholder, .ysrp-textarea::placeholder { color: var(--ysrp-text-3); }
.ysrp-input:focus, .ysrp-select:focus, .ysrp-textarea:focus {
  border-color: var(--ysrp-border-strong);
  box-shadow: 0 0 0 2px var(--ysrp-hover);
}

.ysrp-switch {
  all: unset;
  box-sizing: border-box;
  position: relative;
  flex: 0 0 36px;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--ysrp-border-strong);
  cursor: pointer;
  transition: background .15s ease;
}
.ysrp-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .3);
  transition: left .15s ease, background .15s ease;
}
.ysrp-switch.is-on { background: var(--ysrp-text); }
.ysrp-switch.is-on .ysrp-switch-knob { left: 18px; background: var(--ysrp-bg); }
.ysrp-switch:disabled { opacity: .5; cursor: not-allowed; }
.ysrp-switch:focus-visible { box-shadow: 0 0 0 2px var(--ysrp-border-strong); }

.ysrp-sep { border: none; border-top: 1px solid var(--ysrp-border); margin: 0; width: 100%; height: 0; }
.ysrp-empty { color: var(--ysrp-text-3); text-align: center; padding: 16px; }
.ysrp-hint { color: var(--ysrp-text-2); font-size: 13px; }

/* ---------------------------------------------------------------- cards */
.ysrp-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--ysrp-border);
  border-radius: 16px;
  background: var(--ysrp-card);
}
.ysrp-card-head { display: flex; align-items: center; gap: 10px; }
.ysrp-card-icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--ysrp-layer);
  color: var(--ysrp-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}
.ysrp-card-title { font-size: 15px; font-weight: 600; }
.ysrp-card-desc { color: var(--ysrp-text-2); margin-top: -6px; }
.ysrp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

.ysrp-choices { display: flex; flex-direction: column; gap: 8px; }
.ysrp-choice {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--ysrp-border);
  border-radius: 12px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
}
.ysrp-choice:hover { background: var(--ysrp-hover); }
.ysrp-choice.is-selected { border-color: var(--ysrp-text); box-shadow: 0 0 0 1px var(--ysrp-text); }
.ysrp-choice.is-disabled { opacity: .5; cursor: not-allowed; }
.ysrp-choice-radio { display: none; }
.ysrp-choice-tag {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--ysrp-layer);
  color: var(--ysrp-text);
}
.ysrp-choice.is-selected .ysrp-choice-tag { background: var(--ysrp-text); color: var(--ysrp-bg); }
.ysrp-choice-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ysrp-choice-label { font-weight: 600; }
.ysrp-choice-hint { font-size: 13px; color: var(--ysrp-text-2); }

.ysrp-msg { display: none; font-size: 13px; color: var(--ysrp-text-2); }
.ysrp-msg.is-visible { display: block; }
.ysrp-msg.is-success { color: var(--ysrp-success); }
.ysrp-msg.is-error { color: var(--ysrp-error); }

.ysrp-check-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--ysrp-layer);
}
.ysrp-check { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; cursor: pointer; }
.ysrp-overwrite { width: 16px; height: 16px; margin: 0; accent-color: var(--ysrp-text); cursor: pointer; }

.ysrp-file {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 220px;
  min-width: 0;
  height: 36px;
  padding: 0 14px;
  border: 1px dashed var(--ysrp-border-strong);
  border-radius: 999px;
  cursor: pointer;
}
.ysrp-file:hover, .ysrp-file:focus-within { background: var(--ysrp-hover); }
.ysrp-file-label { font-weight: 600; white-space: nowrap; }
.ysrp-file-name { flex: 1 1 auto; min-width: 0; color: var(--ysrp-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ysrp-file { position: relative; }
.ysrp-file:focus-visible { outline: 2px solid var(--ysrp-border-strong); outline-offset: 2px; }
/* Visually hidden but still activatable through the label (works on iOS Safari too). */
.ysrp-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; left: 0; top: 0; }

.ysrp-field { display: flex; flex-direction: column; gap: 6px; max-width: 560px; }
.ysrp-field-label { font-size: 13px; font-weight: 500; color: var(--ysrp-text-2); }
.ysrp-field-hint { font-size: 12px; color: var(--ysrp-text-3); }
.ysrp-fields { display: flex; flex-direction: column; gap: 12px; }
.ysrp-secret { display: flex; gap: 8px; align-items: center; }
.ysrp-secret .ysrp-input { flex: 1 1 auto; min-width: 0; }
.ysrp-secret .ysrp-btn { height: 36px; }

.ysrp-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--ysrp-layer);
}
.ysrp-info-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.ysrp-info-label { flex: 0 0 140px; font-size: 12px; font-weight: 600; color: var(--ysrp-text-2); }
.ysrp-info-value { min-width: 0; overflow-wrap: anywhere; }
.ysrp-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--ysrp-hover);
}
.ysrp-steps { margin: 0; padding-left: 20px; color: var(--ysrp-text-2); display: flex; flex-direction: column; gap: 4px; }
.ysrp-steps a { color: var(--ysrp-text); }

/* ---------------------------------------------------------------- records */
.ysrp-records {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.ysrp-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 8px 14px;
  border: 1px solid var(--ysrp-border);
  border-radius: 14px;
  background: var(--ysrp-card);
}
.ysrp-row.is-current { border-color: var(--ysrp-border-strong); }
.ysrp-row.is-current::before {
  content: "";
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--ysrp-text);
}
.ysrp-row-top { display: flex; align-items: center; gap: 2px; min-height: 30px; }
.ysrp-pct {
  flex: 0 0 auto;
  min-width: 52px;
  margin-right: 8px;
  text-align: right;
  font-size: 13px;
  color: var(--ysrp-text-2);
  font-variant-numeric: tabular-nums;
}
.ysrp-title { flex: 1 1 auto; min-width: 0; word-break: break-word; font-weight: 500; margin-right: 4px; }
.ysrp-empty-row { color: var(--ysrp-text-3); text-align: center; padding: 24px; }
.ysrp-panel {
  display: none;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--ysrp-border);
  border-radius: 12px;
  background: var(--ysrp-bg);
}
.ysrp-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.ysrp-panel-label { font-size: 12px; font-weight: 600; color: var(--ysrp-text-2); }
.ysrp-panel-tools { display: inline-flex; align-items: center; gap: 2px; }
.ysrp-panel-status { font-size: 12px; color: var(--ysrp-text-2); }
.ysrp-panel-status.is-error { color: var(--ysrp-error); }
.ysrp-panel-status.is-success { color: var(--ysrp-success); }
.ysrp-url { position: relative; flex-direction: row; align-items: center; gap: 2px; padding: 4px 4px 4px 12px; }
.ysrp-url-text {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: var(--ysrp-text-2);
}
.ysrp-copied {
  position: absolute;
  right: 72px;
  top: 50%;
  transform: translateY(-50%);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  background: var(--ysrp-text);
  color: var(--ysrp-bg);
  opacity: 0;
  transition: opacity .3s ease;
  pointer-events: none;
}
.ysrp-copied.is-visible { opacity: 1; }
.ysrp-copied.is-error { background: var(--ysrp-error); }
.ysrp-note-text { white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
.ysrp-note-text.is-empty { color: var(--ysrp-text-3); font-style: italic; }
.ysrp-note-input { min-height: 60px; overflow: hidden; }
.ysrp-transcript-text { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; min-height: 96px; }

/* ---------------------------------------------------------------- plugins tab */
.ysrp-searchbar { display: flex; gap: 8px; }
.ysrp-searchbar .ysrp-search { flex: 1 1 auto; min-width: 0; }
.ysrp-plugins { display: flex; flex-direction: column; gap: 12px; }
.ysrp-plugin-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ysrp-plugin {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--ysrp-border);
  border-radius: 16px;
  background: var(--ysrp-card);
  transition: border-color .15s ease, opacity .15s ease;
}
.ysrp-plugin:hover { border-color: var(--ysrp-border-strong); }
.ysrp-plugin.is-core { opacity: .4; }
.ysrp-plugin.is-core:hover { opacity: .7; }
.ysrp-plugin-head { display: flex; align-items: center; gap: 10px; min-height: 30px; }
.ysrp-plugin-name { flex: 0 1 auto; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ysrp-core-mark { color: var(--ysrp-text-3); font-size: 12px; }
.ysrp-plugin-tools { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.ysrp-plugin-desc {
  font-size: 13px;
  line-height: 1.4;
  color: var(--ysrp-text-2);
  height: 36px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.ysrp-plugin-authors { font-size: 12px; color: var(--ysrp-text-3); }

/* ---------------------------------------------------------------- sub dialog */
.ysrp-dialog-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--ysrp-backdrop);
}
.ysrp-dialog {
  position: relative;
  width: min(512px, 100%);
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--ysrp-border);
  border-radius: 16px;
  background: var(--ysrp-bg);
  box-shadow: 0 16px 48px rgba(0, 0, 0, .28);
}
.ysrp-dialog > * { flex-shrink: 0; }
.ysrp-dialog-close { position: absolute; top: 16px; right: 16px; }
.ysrp-dialog-title { font-size: 18px; font-weight: 600; padding-right: 40px; }
.ysrp-dialog-desc { color: var(--ysrp-text-2); }
.ysrp-dialog-subtitle { font-size: 12px; font-weight: 600; color: var(--ysrp-text-3); margin-top: 4px; }
.ysrp-setting-list { display: flex; flex-direction: column; border: 1px solid var(--ysrp-border); border-radius: 14px; }
.ysrp-setting-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; }
.ysrp-setting-row + .ysrp-setting-row { border-top: 1px solid var(--ysrp-border); }
.ysrp-setting-row.is-stacked { flex-direction: column; align-items: stretch; }
.ysrp-setting-label { font-weight: 500; }
.ysrp-setting-desc { font-size: 12px; color: var(--ysrp-text-2); }
.ysrp-dialog-footer { display: flex; justify-content: flex-end; }

/* ---------------------------------------------------------------- narrow screens (N-5.2.3) */
@media (max-width: 640px) {
  .ysrp-settings-container { width: 94vw; height: 88vh; flex-direction: column; }
  .ysrp-nav {
    flex: 0 0 auto;
    width: auto;
    flex-direction: row;
    padding: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: none;
    border-bottom: 1px solid var(--ysrp-border);
  }
  .ysrp-nav-groups, .ysrp-nav-group { flex-direction: row; gap: 2px; }
  .ysrp-nav-title, .ysrp-nav-footer { display: none; }
  .ysrp-tab { flex: 0 0 auto; }
  .ysrp-main { padding: 16px; }
  .ysrp-panes { margin-right: -16px; }
  .ysrp-pane { padding-right: 16px; }
  .ysrp-plugin-grid { grid-template-columns: minmax(0, 1fr); }
  .ysrp-info-label { flex-basis: auto; }
}
`;

  // src/plugins/_core/settings/index.ts
  var settings_default = definePlugin({
    name: "Settings",
    displayName: { en: "Settings", zh: "设置弹窗" },
    description: {
      en: "The settings dialog shell with the Records, Storage, Plugins and Display tabs.",
      zh: "设置弹窗外壳，以及记录、存储、插件、界面标签。"
    },
    authors: ["0_V"],
    icon: "gear",
    required: true,
    start(ctx) {
      ctx.addStyle(style_default2);
      const modal = new SettingsModal;
      modal.start();
      ctx.onDispose(() => modal.destroy());
      setModalController({
        open: (tab) => modal.open(tab),
        close: () => modal.close(),
        isOpen: () => modal.isOpen(),
        refreshHeader: () => modal.refreshHeader()
      });
      ctx.onDispose(() => setModalController(null));
      ctx.addTab(createRecordsTab((busy) => modal.setBusy(busy)));
      ctx.addTab(createStorageTab());
      ctx.addTab(createDisplayTab());
      ctx.addTab(createPluginsTab((content, onClose) => modal.openDialog(content, onClose)));
      ctx.addRowButton(noteContribution);
      ctx.addRowButton(linkContribution);
    }
  });

  // src/plugins/badgeToggle/style.css
  var style_default3 = `/* N-6.1: transparent \uD83D\uDCBE button before the badge (1.5rem -> 15px, .5rem -> 5px). */
.ysrp-badge-toggle {
  all: initial;
  background: transparent;
  border: none;
  font-size: 15px;
  line-height: 1;
  margin: 0 5px 0 0;
  padding: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  align-self: center;
}
.last-save-info-container.ysrp-badge-hidden {
  opacity: 0 !important;
  pointer-events: none !important;
}
`;

  // src/plugins/badgeToggle/index.ts
  var HIDDEN_CLASS = "ysrp-badge-hidden";
  var badgeToggle_default = definePlugin({
    name: "BadgeToggle",
    displayName: { en: "Badge toggle", zh: "徽标开关" },
    description: {
      en: "Adds a \uD83D\uDCBE button in front of the badge to show or hide it with one click.",
      zh: "在徽标前添加 \uD83D\uDCBE 按钮，一键显示或隐藏徽标。"
    },
    authors: ["0_V"],
    icon: "floppy-disk",
    enabledByDefault: true,
    settings: {
      startHidden: {
        type: "switch",
        default: true,
        label: { en: "Hide the badge when a page opens", zh: "打开页面时先隐藏徽标" }
      }
    },
    start(ctx) {
      ctx.addStyle(style_default3);
      let hidden = ctx.settings.get("startHidden") !== false;
      const button = h("button", { class: "ysrp-badge-toggle", type: "button", text: "\uD83D\uDCBE" });
      const refreshTitle = () => {
        const tip = hidden ? tr("Show the badge", "显示徽标") : tr("Hide the badge", "隐藏徽标");
        button.title = tip;
        button.setAttribute("aria-label", tip);
        button.setAttribute("aria-pressed", String(!hidden));
      };
      button.addEventListener("pointerdown", (ev) => {
        swallow(ev);
        hidden = !hidden;
        apply();
      }, true);
      button.addEventListener("click", swallow, true);
      button.addEventListener("touchstart", swallow, { capture: true, passive: false });
      const container = () => badgeContainer() || document.querySelector(`.${CLS_BADGE_CONTAINER}`);
      const apply = () => {
        const badge = container();
        if (!badge)
          return;
        if (button.nextElementSibling !== badge)
          badge.before(button);
        badge.classList.toggle(HIDDEN_CLASS, hidden);
        refreshTitle();
      };
      ctx.onDispose(badgeMounted.on(() => apply()));
      ctx.observe(document.documentElement, { childList: true, subtree: true }, () => {
        const badge = container();
        if (badge && (button.nextElementSibling !== badge || badge.classList.contains(HIDDEN_CLASS) !== hidden))
          apply();
      });
      ctx.listen(document, EVT_LANGUAGE, refreshTitle);
      ctx.onDispose(() => {
        button.remove();
        for (const el of Array.from(document.querySelectorAll(`.${HIDDEN_CLASS}`)))
          el.classList.remove(HIDDEN_CLASS);
      });
      apply();
    }
  });

  // src/utils/net.ts
  function wrap(status, text) {
    return {
      status,
      ok: status >= 200 && status < 300,
      text,
      json() {
        return JSON.parse(text);
      }
    };
  }
  function httpRequest(req) {
    const method = req.method || "GET";
    if (!req.preferFetch && typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        try {
          GM_xmlhttpRequest({
            method,
            url: req.url,
            headers: req.headers,
            data: req.body,
            timeout: req.timeoutMs,
            onload: (res) => resolve(wrap(res.status, res.responseText || "")),
            onerror: (err) => reject(new Error(`Network error: ${String(err?.error || "request failed")}`)),
            ontimeout: () => reject(new Error("Request timed out")),
            onabort: () => reject(new Error("Request aborted"))
          });
        } catch (err) {
          reject(err);
        }
      });
    }
    const controller = typeof AbortController === "function" ? new AbortController : null;
    let timer = 0;
    if (controller && req.timeoutMs)
      timer = window.setTimeout(() => controller.abort(), req.timeoutMs);
    return fetch(req.url, {
      method,
      headers: req.headers,
      body: req.body,
      credentials: "omit",
      cache: "no-store",
      signal: controller ? controller.signal : undefined
    }).then(async (res) => {
      const text = await res.text();
      return wrap(res.status, text);
    }).finally(() => {
      if (timer)
        clearTimeout(timer);
    });
  }

  // src/plugins/driveSync/drive.ts
  var FOLDER_NAME = "[Youtube] Video Memory";
  var FOLDER_MIME = "application/vnd.google-apps.folder";
  var LEGACY_FILE_NAME = "[Youtube] Video Memory Sync.json";
  var TOKEN_URL = "https://oauth2.googleapis.com/token";
  var API = "https://www.googleapis.com/drive/v3/files";
  var UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  function readCredentials() {
    const empty = { clientId: "", clientSecret: "", refreshToken: "" };
    const raw = readSecretSetting(KEY_DRIVE);
    if (!raw)
      return empty;
    try {
      let parsed = JSON.parse(raw);
      if (typeof parsed === "string")
        parsed = JSON.parse(parsed);
      if (!parsed || typeof parsed !== "object")
        return empty;
      const p = parsed;
      return {
        clientId: typeof p.clientId === "string" ? p.clientId.trim() : "",
        clientSecret: typeof p.clientSecret === "string" ? p.clientSecret.trim() : "",
        refreshToken: typeof p.refreshToken === "string" ? p.refreshToken.trim() : ""
      };
    } catch {
      return empty;
    }
  }
  function saveCredentials(creds) {
    writeSecretSetting(KEY_DRIVE, JSON.stringify({
      clientId: creds.clientId.trim(),
      clientSecret: creds.clientSecret.trim(),
      refreshToken: creds.refreshToken.trim()
    }));
  }
  function hasCredentials(creds) {
    return Boolean(creds.clientId && creds.clientSecret && creds.refreshToken);
  }
  function fileNameFor(title, videoId) {
    let clean = typeof title === "string" ? title : "";
    clean = clean.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/:*?"<>|]/g, "-").trim();
    if (clean.length > 120)
      clean = clean.slice(0, 120).trim();
    if (!clean)
      clean = UNKNOWN_TITLE;
    return `${clean}｜${videoId}.json`;
  }
  function videoIdFromName(name) {
    const m = /｜([^｜]+)\.json$/.exec(name) || /\[([^\]]+)\]\.json$/.exec(name);
    return m ? m[1] : null;
  }
  var quote = (value) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  function errorFrom(res) {
    let message = `HTTP ${res.status}`;
    try {
      const data = res.json();
      if (data && typeof data.error === "object" && data.error.message)
        message = data.error.message;
      else if (data && data.error_description)
        message = data.error_description;
      else if (data && typeof data.error === "string")
        message = data.error;
    } catch {}
    const err = new Error(message);
    err.status = res.status;
    return err;
  }

  class DriveClient {
    creds;
    token = null;
    folder = null;
    folderTask = null;
    constructor(creds) {
      this.creds = creds;
    }
    reset() {
      this.token = null;
      this.folder = null;
      this.folderTask = null;
    }
    async accessToken(force = false) {
      if (!force && this.token && Date.now() < this.token.expiresAt)
        return this.token.value;
      const c = this.creds();
      if (!hasCredentials(c))
        throw new Error("Missing Google Drive credentials");
      const body = new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        refresh_token: c.refreshToken,
        grant_type: "refresh_token"
      }).toString();
      const res = await httpRequest({ method: "POST", url: TOKEN_URL, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, timeoutMs: 30000 });
      if (!res.ok)
        throw errorFrom(res);
      const data = res.json();
      if (!data.access_token)
        throw new Error("No access token in response");
      const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 3600000;
      this.token = { value: data.access_token, expiresAt: Date.now() + ttl - 60000 };
      return data.access_token;
    }
    async call(method, url, body, headers = {}) {
      for (let attempt = 0;attempt < 2; attempt++) {
        const token = await this.accessToken(attempt > 0);
        const res = await httpRequest({ method, url, body, headers: { ...headers, Authorization: `Bearer ${token}` }, timeoutMs: 60000 });
        if (res.status === 401 && attempt === 0) {
          this.token = null;
          continue;
        }
        if (!res.ok)
          throw errorFrom(res);
        return res;
      }
      throw new Error("Unauthorized");
    }
    async list(q) {
      const params = new URLSearchParams({
        q,
        orderBy: "modifiedTime desc",
        fields: "files(id,name,modifiedTime)",
        pageSize: "100",
        spaces: "drive"
      });
      const res = await this.call("GET", `${API}?${params.toString()}`);
      const data = res.json();
      return Array.isArray(data.files) ? data.files : [];
    }
    folderId() {
      if (this.folder)
        return Promise.resolve(this.folder);
      if (!this.folderTask) {
        this.folderTask = (async () => {
          const found = await this.list(`name = '${quote(FOLDER_NAME)}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
          if (found.length)
            return found[0].id;
          const res = await this.call("POST", `${API}?fields=id`, JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }), { "Content-Type": "application/json" });
          const id = res.json().id;
          if (!id)
            throw new Error("Folder creation returned no id");
          return id;
        })().then((id) => {
          this.folder = id;
          return id;
        }).finally(() => {
          this.folderTask = null;
        });
      }
      return this.folderTask;
    }
    async filesFor(videoId) {
      const folder = await this.folderId();
      const files = await this.list(`name contains '${quote(videoId)}' and mimeType = 'application/json' and '${quote(folder)}' in parents and trashed = false`);
      return files.filter((f) => videoIdFromName(f.name) === videoId);
    }
    async findByName(name) {
      return this.list(`name = '${quote(name)}' and trashed = false`);
    }
    async download(fileId) {
      const res = await this.call("GET", `${API}/${encodeURIComponent(fileId)}?alt=media`);
      return res.text;
    }
    multipart(metadata, content) {
      const boundary = `ysrp${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        "Content-Type: application/json",
        "",
        content,
        `--${boundary}--`,
        ""
      ].join(`\r
`);
      return { body, type: `multipart/related; boundary=${boundary}` };
    }
    async create(name, content) {
      const folder = await this.folderId();
      const { body, type } = this.multipart({ name, parents: [folder], mimeType: "application/json" }, content);
      const res = await this.call("POST", `${UPLOAD}?uploadType=multipart&fields=id,name,modifiedTime`, body, { "Content-Type": type });
      return res.json();
    }
    async update(fileId, name, content) {
      const { body, type } = this.multipart({ name }, content);
      const res = await this.call("PATCH", `${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime`, body, { "Content-Type": type });
      return res.json();
    }
    async remove(fileId) {
      await this.call("DELETE", `${API}/${encodeURIComponent(fileId)}`);
    }
  }

  // src/plugins/driveSync/sync.ts
  var FIRST_DELAY_MS = 1500;
  var MIN_INTERVAL_MS = 15000;

  class DriveSync {
    client;
    creds = readCredentials();
    pending = new Map;
    lastUpload = new Map;
    deletes = [];
    fullRequested = false;
    working = false;
    timer = 0;
    stopped = false;
    status = { state: "idle", done: 0, total: 0, message: "", at: Date.now() };
    onStatus = null;
    constructor() {
      this.client = new DriveClient(() => this.creds);
    }
    configured() {
      return hasCredentials(this.creds);
    }
    reloadCredentials() {
      this.creds = readCredentials();
      this.client.reset();
    }
    start() {
      this.stopped = false;
      if (!this.configured()) {
        this.setStatus("idle", 0, 0, "");
        return;
      }
      if (readSetting(KEY_DRIVE_FULL_SYNC) !== "1")
        this.requestFullSync();
    }
    stop() {
      this.stopped = true;
      if (this.timer)
        clearTimeout(this.timer);
      this.timer = 0;
      this.pending.clear();
      this.deletes = [];
    }
    setStatus(state, done, total, message) {
      this.status = { state, done, total, message, at: Date.now() };
      dispatch(EVT_DRIVE_STATUS, { state, done, total, message });
      this.onStatus?.(this.status);
    }
    handleChange(change) {
      if (this.stopped || !this.configured())
        return;
      if (change.kind === "content")
        this.queueUpload(change.videoId, false);
      else if (change.kind === "delete") {
        this.pending.delete(change.videoId);
        this.deletes.push(change.videoId);
        this.kick();
      }
    }
    queueUpload(videoId, force) {
      if (this.stopped || !this.configured())
        return;
      if (this.pending.has(videoId))
        return;
      const rec = readRecord(videoId);
      if (!rec)
        return;
      const uploadedAt = rec.driveSync?.lastUploadAt || 0;
      if (!force && (Number(rec.updatedAt) || 0) <= uploadedAt)
        return;
      const now = Date.now();
      const earliest = (this.lastUpload.get(videoId) || 0) + MIN_INTERVAL_MS;
      const due = Math.max(now + FIRST_DELAY_MS, earliest);
      this.pending.set(videoId, due);
      if (earliest > now + FIRST_DELAY_MS)
        this.setStatus("deferred", 0, 0, "");
      this.schedule();
    }
    requestFullSync() {
      if (!this.configured())
        return;
      this.fullRequested = true;
      this.kick();
    }
    uploadAll() {
      if (!this.configured())
        return;
      this.fullRequested = true;
      this.kick();
    }
    schedule() {
      if (this.timer)
        clearTimeout(this.timer);
      this.timer = 0;
      if (this.stopped || this.working || !this.pending.size)
        return;
      const next = Math.min(...this.pending.values());
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        this.kick();
      }, Math.max(0, next - Date.now()));
    }
    nextTask() {
      if (this.deletes.length)
        return { kind: "delete", videoId: this.deletes.shift() };
      if (this.fullRequested) {
        this.fullRequested = false;
        return { kind: "full" };
      }
      const now = Date.now();
      for (const [videoId, due] of this.pending) {
        if (due <= now) {
          this.pending.delete(videoId);
          return { kind: "upload", videoId };
        }
      }
      return null;
    }
    async kick() {
      if (this.working || this.stopped)
        return;
      this.working = true;
      try {
        for (let task = this.nextTask();task && !this.stopped; task = this.nextTask()) {
          try {
            if (task.kind === "upload") {
              this.setStatus("start", 0, 1, "");
              await this.upload(task.videoId);
              this.setStatus("done", 1, 1, "");
            } else if (task.kind === "delete") {
              await this.deleteRemote(task.videoId);
            } else {
              await this.fullSync();
            }
          } catch (err) {
            console.warn("[Video Memory] Drive sync failed:", err);
            this.setStatus("error", 0, 0, errorMessage(err));
          }
        }
      } finally {
        this.working = false;
        this.schedule();
      }
    }
    payload(videoId, record) {
      const copy = { ...record };
      delete copy.driveSync;
      return JSON.stringify({ version: "2", videoId, videoUrl: watchUrl(videoId), exportedAt: Date.now(), record: copy });
    }
    async upload(videoId) {
      const rec = readRecord(videoId);
      if (!rec)
        return;
      const snapshotAt = Date.now();
      this.lastUpload.set(videoId, snapshotAt);
      const name = fileNameFor(rec.videoName, videoId);
      const content = this.payload(videoId, rec);
      const files = await this.client.filesFor(videoId);
      let file;
      if (files.length) {
        file = await this.client.update(files[0].id, name, content);
        for (const extra of files.slice(1)) {
          try {
            await this.client.remove(extra.id);
          } catch (err) {
            console.warn("[Video Memory] Drive cleanup failed:", err);
          }
        }
      } else {
        file = await this.client.create(name, content);
      }
      const remoteModifiedAt = Date.parse(file && file.modifiedTime) || Date.now();
      const uploadedAt = Math.max(Number(rec.updatedAt) || 0, 1);
      updateRecord(videoId, (cur) => cur ? { ...cur, driveSync: { ...cur.driveSync || {}, lastUploadAt: uploadedAt, remoteModifiedAt } } : null, "sync");
    }
    async deleteRemote(videoId) {
      const files = await this.client.filesFor(videoId);
      for (const f of files)
        await this.client.remove(f.id);
    }
    async pull(videoId) {
      if (!this.configured() || this.stopped)
        return;
      try {
        const files = await this.client.filesFor(videoId);
        const local = readRecord(videoId);
        if (!files.length) {
          if (local)
            this.queueUpload(videoId, true);
          return;
        }
        const remoteMs = Date.parse(files[0].modifiedTime) || 0;
        const meta = local && local.driveSync || {};
        const localUpdated = Number(local && local.updatedAt) || 0;
        if (!(remoteMs > localUpdated && remoteMs > (meta.lastDownloadAt || 0) && remoteMs !== meta.remoteModifiedAt))
          return;
        const parsed = JSON.parse(await this.client.download(files[0].id));
        const remote = parsed && typeof parsed === "object" ? parsed.record : null;
        if (!remote || typeof remote !== "object" || Array.isArray(remote))
          return;
        const now = Date.now();
        const incoming = { ...remote };
        delete incoming.driveSync;
        const current = readRecord(videoId) || {};
        writeRecord(videoId, {
          ...current,
          ...incoming,
          driveSync: { ...current.driveSync || {}, lastDownloadAt: now, lastUploadAt: now, remoteModifiedAt: remoteMs }
        }, "sync");
        this.setStatus("done", 1, 1, "");
      } catch (err) {
        console.warn("[Video Memory] Drive pull failed:", err);
        this.setStatus("error", 0, 0, errorMessage(err));
      }
    }
    async fullSync() {
      this.setStatus("start", 0, 0, "");
      await this.importLegacy();
      const entries = listRecords().filter((e) => e.record);
      const total = entries.length;
      let done = 0;
      this.setStatus("progress", done, total, "");
      for (const entry of entries) {
        if (this.stopped)
          return;
        this.pending.delete(entry.videoId);
        await this.upload(entry.videoId);
        done++;
        this.setStatus("progress", done, total, "");
      }
      writeSetting(KEY_DRIVE_FULL_SYNC, "1");
      this.setStatus("done", done, total, "");
    }
    async importLegacy() {
      let files;
      try {
        files = await this.client.findByName(LEGACY_FILE_NAME);
      } catch (err) {
        console.warn("[Video Memory] Legacy Drive file lookup failed:", err);
        return;
      }
      if (!files.length)
        return;
      const parsed = JSON.parse(await this.client.download(files[0].id));
      const entries = parsed && typeof parsed === "object" ? parsed.entries && typeof parsed.entries === "object" ? parsed.entries : parsed : null;
      if (!entries || typeof entries !== "object")
        return;
      for (const [key, value] of Object.entries(entries)) {
        if (!key.startsWith(RECORD_PREFIX))
          continue;
        const videoId = key.slice(RECORD_PREFIX.length);
        let remote = null;
        try {
          remote = typeof value === "string" ? JSON.parse(value) : value;
        } catch {
          remote = null;
        }
        if (!remote || typeof remote !== "object")
          continue;
        const local = readRecord(videoId);
        if (!local || (Number(remote.saveDate) || 0) > (Number(local.saveDate) || 0)) {
          writeRecord(videoId, { ...local || {}, ...remote }, "bulk");
        }
      }
    }
  }

  // src/plugins/driveSync/index.ts
  function statusText(sync, s) {
    if (!sync.configured())
      return { text: tr("Not configured: fill in the three fields below.", "未配置：请填写下面三项凭据。"), tone: "neutral" };
    switch (s.state) {
      case "start":
      case "progress":
        return { text: s.total ? tr("Syncing ({done} / {total})", "同步中（已完成 {done} / 共 {total}）", { done: s.done, total: s.total }) : tr("Syncing…", "同步中…"), tone: "neutral" };
      case "done":
        return { text: tr("Synced ({time})", "已同步（{time}）", { time: new Date(s.at).toLocaleTimeString() }), tone: "success" };
      case "deferred":
        return { text: tr("Deferred: the next upload waits a few seconds.", "已推迟：下一次上传稍后进行。"), tone: "neutral" };
      case "error":
        return { text: tr("Error: {message}", "出错：{message}", { message: s.message }), tone: "error" };
      default:
        return { text: tr("Ready.", "已就绪。"), tone: "neutral" };
    }
  }
  var driveSync_default = definePlugin({
    name: "DriveSync",
    displayName: { en: "Drive sync", zh: "云同步" },
    description: {
      en: "Syncs every video record to a folder in your own Google Drive. Does nothing until credentials are set.",
      zh: "把每个视频的记录同步到你自己的 Google Drive 文件夹；未填写凭据时不做任何事。"
    },
    authors: ["0_V"],
    icon: "cloud",
    enabledByDefault: true,
    start(ctx) {
      const sync = new DriveSync;
      ctx.onDispose(() => sync.stop());
      ctx.onDispose(recordChanges.on((change) => sync.handleChange(change)));
      ctx.beforeRestore((videoId) => sync.configured() ? sync.pull(videoId) : undefined);
      const statusListeners = new Set;
      sync.onStatus = (s) => statusListeners.forEach((fn) => fn(s));
      ctx.onDispose(() => {
        sync.onStatus = null;
        statusListeners.clear();
      });
      ctx.addTab({
        id: "drive",
        group: "plugins",
        order: 30,
        icon: "cloud",
        label: () => tr("Drive sync", "云同步"),
        render(pane) {
          const creds = readCredentials();
          const clientId = h("input", { class: "ysrp-input", type: "text", value: creds.clientId, placeholder: "xxxx.apps.googleusercontent.com", autocomplete: "off", spellcheck: false });
          const clientSecret = h("input", { class: "ysrp-input", type: "password", value: creds.clientSecret, autocomplete: "new-password", spellcheck: false });
          const refreshToken = h("input", { class: "ysrp-input", type: "password", value: creds.refreshToken, autocomplete: "new-password", spellcheck: false });
          const labels = { show: tr("Show", "显示"), hide: tr("Hide", "隐藏") };
          const status = messageLine();
          const result = messageLine();
          const renderStatus = (s) => {
            const { text, tone } = statusText(sync, s);
            status.set(text, tone);
          };
          statusListeners.add(renderStatus);
          renderStatus(sync.status);
          const saveBtn = button(tr("Save & verify", "保存并验证"), { icon: "check" });
          saveBtn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            saveCredentials({ clientId: clientId.value, clientSecret: clientSecret.value, refreshToken: refreshToken.value });
            sync.reloadCredentials();
            renderStatus(sync.status);
            if (!sync.configured()) {
              result.set(tr("Please fill in all three fields.", "请填写全部三项。"), "error");
              return;
            }
            saveBtn.disabled = true;
            result.set(tr("Verifying…", "正在验证…"));
            try {
              await sync.client.accessToken(true);
              result.set(tr("Credentials verified.", "凭据验证成功。"), "success");
              if (readSetting(KEY_DRIVE_FULL_SYNC) !== "1")
                sync.requestFullSync();
            } catch (err) {
              result.set(tr("Verification failed: {message}", "验证失败：{message}", { message: errorMessage(err) }), "error");
            } finally {
              saveBtn.disabled = false;
            }
          });
          const uploadAll = button(tr("Upload all", "全部上传"), { icon: "cloud-arrow-up" });
          uploadAll.addEventListener("click", (ev) => {
            ev.preventDefault();
            if (!sync.configured()) {
              result.set(tr("Please save valid credentials first.", "请先保存有效的凭据。"), "error");
              return;
            }
            result.set("");
            sync.uploadAll();
          });
          pane.append(card({ icon: "cloud", title: tr("Google Drive sync", "Google Drive 同步"), desc: tr('Each video is stored as "<title>｜<id>.json" in the "[Youtube] Video Memory" folder of your Drive.', "每个视频以“<标题>｜<id>.json”保存在你的云端硬盘“[Youtube] Video Memory”文件夹中。") }, status.el, h("div", { class: "ysrp-fields" }, field(tr("Client ID", "客户端 ID"), clientId), field(tr("Client secret", "客户端密钥"), secretInput(clientSecret, labels)), field(tr("Refresh token", "Refresh token"), secretInput(refreshToken, labels))), h("div", { class: "ysrp-actions" }, saveBtn, uploadAll), result.el), card({ icon: "circle-question", title: tr("How to get credentials", "如何获取凭据") }, h("ol", { class: "ysrp-steps" }, h("li", { text: tr('In Google Cloud Console create a project and an OAuth client (type "Web application"); add https://developers.google.com/oauthplayground as a redirect URI.', "在 Google Cloud Console 新建项目和 OAuth 客户端（类型“Web 应用”），把 https://developers.google.com/oauthplayground 加为重定向 URI。") }), h("li", { text: tr("Enable the Google Drive API for the project.", "为该项目启用 Google Drive API。") }), h("li", { text: tr('Open the OAuth 2.0 Playground, tick "Use your own OAuth credentials", authorise the https://www.googleapis.com/auth/drive scope and exchange the code for a refresh token.', "打开 OAuth 2.0 Playground，勾选“Use your own OAuth credentials”，授权 https://www.googleapis.com/auth/drive 范围，然后用授权码换取 refresh token。") }), h("li", {}, tr("Paste the three values above and click “Save & verify”. More: ", "把三项填到上面并点“保存并验证”。更多说明："), h("a", { href: HOMEPAGE_URL, target: "_blank", rel: "noopener noreferrer", text: HOMEPAGE_URL })))));
          return () => statusListeners.delete(renderStatus);
        }
      });
      sync.start();
    }
  });

  // src/plugins/transcript/service.ts
  var ENDPOINT_SUFFIX = "/v1/chat/completions";
  var DEFAULT_ENDPOINT_RAW = "https://0-v-YouTube-Transcript-Generator-api.hf.space/v1/chat/completions";
  var DEFAULT_MODEL = "transcript";
  var DEFAULT_API_KEY = "sk-asdlfjalalfja";
  var DEFAULT_TIMEOUT_MS = 600000;
  var MIN_TIMEOUT_MS = 60000;
  var MAX_TIMEOUT_MS = 3600000;
  var CACHE_TTL_MS = 30 * 60 * 1000;
  function normalizeTimeoutMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0)
      return DEFAULT_TIMEOUT_MS;
    return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(n)));
  }
  function timeoutMinutes(ms) {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0)
      return 10;
    return Math.round(n / 60000);
  }
  function normalizeEndpoint(value) {
    if (typeof value !== "string")
      return "";
    let s = value.trim();
    if (!s)
      return "";
    if (!/^https?:\/\//i.test(s))
      s = `https://${s}`;
    try {
      const url = new URL(s);
      let path = url.pathname.replace(/\/+$/, "");
      if (path.toLowerCase().includes(ENDPOINT_SUFFIX)) {
        if (!path.startsWith("/"))
          path = `/${path}`;
      } else if (!path) {
        path = ENDPOINT_SUFFIX;
      }
      url.pathname = path;
      return url.toString().replace(/\/+$/, "");
    } catch {
      const trimmed = s.replace(/\/+$/, "");
      return trimmed.toLowerCase().includes(ENDPOINT_SUFFIX) ? trimmed : trimmed + ENDPOINT_SUFFIX;
    }
  }
  var DEFAULTS = {
    endpoint: normalizeEndpoint(DEFAULT_ENDPOINT_RAW),
    model: DEFAULT_MODEL,
    apiKey: DEFAULT_API_KEY,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
  function readStored() {
    const raw = readSetting(KEY_TRANSCRIPT);
    if (!raw)
      return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function getSettings() {
    const stored = readStored();
    const endpoint = normalizeEndpoint(stored.endpoint) || DEFAULTS.endpoint;
    const model = typeof stored.model === "string" && stored.model.trim() ? stored.model.trim() : DEFAULTS.model;
    const apiKey = typeof stored.apiKey === "string" ? stored.apiKey.trim() : DEFAULTS.apiKey;
    const timeoutMs = stored.timeoutMs ? normalizeTimeoutMs(stored.timeoutMs) : DEFAULTS.timeoutMs;
    return { endpoint, model, apiKey, timeoutMs };
  }
  function updateSettings(input) {
    const stored = readStored();
    const next = { ...DEFAULTS, ...stored };
    if (input.endpoint !== undefined)
      next.endpoint = normalizeEndpoint(input.endpoint) || DEFAULTS.endpoint;
    if (input.model !== undefined)
      next.model = input.model.trim() || DEFAULTS.model;
    if (input.apiKey !== undefined)
      next.apiKey = input.apiKey.trim();
    if (input.timeoutMinutes !== undefined && Number.isFinite(input.timeoutMinutes) && input.timeoutMinutes > 0) {
      next.timeoutMs = normalizeTimeoutMs(input.timeoutMinutes * 60000);
    }
    writeSetting(KEY_TRANSCRIPT, JSON.stringify(next));
    return getSettings();
  }
  function extractText(payload) {
    if (!payload)
      return "";
    if (typeof payload === "string")
      return payload.trim();
    if (Array.isArray(payload))
      return payload.map(extractText).filter(Boolean).join(`
`).trim();
    if (typeof payload !== "object")
      return "";
    const p = payload;
    if (p.error && typeof p.error === "object" && p.error.message)
      throw new Error(String(p.error.message));
    if (typeof p.transcript === "string")
      return p.transcript.trim();
    if (Array.isArray(p.transcript))
      return p.transcript.join(`
`).trim();
    if (p.output_text) {
      if (Array.isArray(p.output_text))
        return p.output_text.join(`
`).trim();
      if (typeof p.output_text === "string")
        return p.output_text.trim();
    }
    if (Array.isArray(p.output)) {
      const parts = [];
      for (const item of p.output) {
        if (item && Array.isArray(item.content)) {
          for (const c of item.content)
            if (c && typeof c.text === "string")
              parts.push(c.text);
        }
      }
      const joined = parts.join(`
`).trim();
      if (joined)
        return joined;
    }
    if (Array.isArray(p.choices)) {
      const parts = p.choices.map((choice) => {
        const content = choice && choice.message ? choice.message.content : undefined;
        if (typeof content === "string")
          return content;
        if (Array.isArray(content))
          return content.map((part) => part && typeof part.text === "string" ? part.text : "").join(`
`);
        if (choice && typeof choice.text === "string")
          return choice.text;
        return "";
      }).filter((s) => s && s.trim());
      const joined = parts.join(`
`).trim();
      if (joined)
        return joined;
    }
    if (typeof p.text === "string")
      return p.text.trim();
    if (typeof p.data === "string" && p.data)
      return p.data.trim();
    return "";
  }
  var cache2 = new Map;
  var inflight = new Map;
  var tokenSeq = 0;
  function forgetTranscript(videoId) {
    cache2.delete(videoId);
  }
  function persist(videoId, text) {
    try {
      updateRecord(videoId, (cur) => {
        const out = { ...cur || {} };
        if (text.trim()) {
          out.videoTranscript = text.trim();
          out.videoTranscriptUpdatedAt = Date.now();
        } else {
          delete out.videoTranscript;
          delete out.videoTranscriptUpdatedAt;
        }
        return out;
      }, "content");
    } catch (err) {
      console.error("[Video Memory] Failed to persist transcript to storage:", err);
    }
  }
  function cachedTranscript(videoId) {
    if (!videoId)
      return null;
    const hit = cache2.get(videoId);
    if (hit && Date.now() - hit.at <= CACHE_TTL_MS)
      return hit.text;
    const rec = readRecord(videoId);
    const stored = rec && typeof rec.videoTranscript === "string" ? rec.videoTranscript.trim() : "";
    if (!stored)
      return null;
    cache2.set(videoId, { text: stored, at: Date.now() });
    return stored;
  }

  class TranscriptTimeoutError extends Error {
    constructor(minutes) {
      super(tr("The transcript service did not respond within {n} minute(s); the request was cancelled.", "字幕接口在 {n} 分钟内无响应，已自动取消请求。", { n: minutes }));
      this.name = "TranscriptTimeoutError";
    }
  }
  function fetchTranscript(videoId, options = {}) {
    if (!videoId)
      return Promise.reject(new Error(tr("Cannot detect the current video ID.", "无法识别当前视频 ID。")));
    if (!options.force) {
      const cached = cachedTranscript(videoId);
      if (cached)
        return Promise.resolve(cached);
      const running = inflight.get(videoId);
      if (running)
        return running.promise;
    }
    const settings = getSettings();
    if (!settings.endpoint.trim())
      return Promise.reject(new Error(tr("Please configure the transcript endpoint first.", "请先配置字幕接口路径。")));
    const token = ++tokenSeq;
    const promise = (async () => {
      const headers = { "Content-Type": "application/json" };
      if (settings.apiKey.trim())
        headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
      const body = JSON.stringify({
        model: settings.model || DEFAULT_MODEL,
        messages: [{ role: "user", content: (options.videoUrl || "").trim() || watchUrl(videoId) }]
      });
      const controller = typeof AbortController === "function" ? new AbortController : null;
      let timedOut = false;
      const timer = window.setTimeout(() => {
        timedOut = true;
        controller?.abort();
      }, settings.timeoutMs);
      try {
        let text;
        let status;
        try {
          const res = await fetch(settings.endpoint, { method: "POST", headers, body, signal: controller?.signal, credentials: "omit", cache: "no-store" });
          status = res.status;
          text = await res.text();
        } catch (err) {
          if (timedOut)
            throw new TranscriptTimeoutError(timeoutMinutes(settings.timeoutMs));
          throw err;
        }
        let payload = null;
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            payload = text;
          }
        }
        if (status < 200 || status >= 300) {
          const p = payload;
          const message = p && typeof p === "object" && (p.error && p.error.message || p.message) || text || `HTTP ${status}`;
          throw new Error(String(message));
        }
        const result = extractText(payload).trim();
        if (!result)
          throw new Error(tr("The transcript service returned no usable content.", "字幕接口未返回有效内容。"));
        cache2.set(videoId, { text: result, at: Date.now() });
        persist(videoId, result);
        return result;
      } finally {
        clearTimeout(timer);
        if (inflight.get(videoId)?.token === token)
          inflight.delete(videoId);
      }
    })();
    inflight.set(videoId, { promise, token });
    return promise;
  }

  // src/plugins/transcript/index.ts
  function renderTab(pane) {
    const settings = getSettings();
    const endpoint = h("input", { class: "ysrp-input", type: "text", value: settings.endpoint, placeholder: "https://example.com/v1/chat/completions", autocomplete: "off", spellcheck: false });
    const model = h("input", { class: "ysrp-input", type: "text", value: settings.model, placeholder: "transcript", autocomplete: "off", spellcheck: false });
    const apiKey = h("input", { class: "ysrp-input", type: "password", value: settings.apiKey, placeholder: "sk-***", autocomplete: "new-password", spellcheck: false });
    const minutes = Math.min(60, Math.max(1, timeoutMinutes(settings.timeoutMs)));
    const timeout = h("input", { class: "ysrp-input", type: "number", min: "1", max: "60", step: "1", value: String(minutes), placeholder: "10" });
    let timer = 0;
    const save = () => {
      const mins = parseFloat(timeout.value);
      updateSettings({
        endpoint: endpoint.value,
        model: model.value,
        apiKey: apiKey.value,
        timeoutMinutes: Number.isFinite(mins) && mins > 0 ? mins : undefined
      });
    };
    const schedule = () => {
      if (timer)
        clearTimeout(timer);
      timer = window.setTimeout(save, 250);
    };
    for (const el of [endpoint, model, apiKey, timeout]) {
      el.addEventListener("input", schedule);
      el.addEventListener("change", schedule);
    }
    const settingsCard = card({
      icon: "closed-captioning",
      title: tr("Subtitles · Transcript", "字幕与接口设置"),
      desc: tr("Configure the OpenAI-compatible endpoint used for subtitles. Fetching lives in the Records tab.", "配置字幕接口（兼容 OpenAI）。字幕获取功能位于“记录”标签。")
    }, h("div", { class: "ysrp-fields" }, field(tr("API Endpoint", "API 接口路径"), endpoint), field(tr("Model", "模型名称"), model), field(tr("API Key", "API 密钥"), secretInput(apiKey, { show: tr("Show", "显示"), hide: tr("Hide", "隐藏") }), tr("Leave empty to send no key.", "留空则不发送密钥。")), field(tr("Timeout (minutes)", "超时时长（分钟）"), timeout)));
    const titleValue = h("span", { class: "ysrp-info-value" });
    const idValue = h("span", { class: "ysrp-info-value ysrp-mono" });
    const idRow = infoRow(tr("Video ID", "视频 ID"), idValue);
    const titleLabel = h("span", { class: "ysrp-info-label", text: tr("Active video", "当前视频") });
    const update = (status) => {
      const id = status && status.videoId || urlVideoId();
      if (!id) {
        titleValue.textContent = tr("No active video detected", "未检测到可用的影片");
        idRow.style.display = "none";
        return;
      }
      titleValue.textContent = status && status.videoId === id && !status.isLoading ? status.title : status && status.videoId === id ? tr("Loading title…", "正在获取标题…") : UNKNOWN_TITLE;
      idValue.textContent = id;
      idRow.style.display = "";
    };
    update(currentStatus());
    const onStatus = (ev) => update(ev.detail || null);
    document.addEventListener(EVT_VIDEO_STATUS, onStatus);
    const statusCard = card({ icon: "pen-to-square", title: tr("Status & Tips", "状态与提示") }, h("div", { class: "ysrp-hint", text: tr("These settings apply instantly. Use the Records tab to fetch transcripts for specific videos.", "设置立即生效，具体字幕获取请在“记录”标签中触发。") }), h("div", { class: "ysrp-info" }, h("div", { class: "ysrp-info-row" }, titleLabel, titleValue), idRow));
    pane.append(settingsCard, statusCard);
    return () => {
      document.removeEventListener(EVT_VIDEO_STATUS, onStatus);
      if (timer) {
        clearTimeout(timer);
        save();
      }
    };
  }
  function createRowParts(ctx) {
    const ui = ctx.ui;
    const status = h("span", { class: "ysrp-panel-status" });
    const refreshBtn = iconButton("arrows-rotate", tr("Refresh transcript", "刷新字幕"), "is-refresh");
    const copyBtn = iconButton("copy", tr("Copy transcript", "复制字幕"), "is-copy");
    copyBtn.disabled = true;
    const area = h("textarea", { class: "ysrp-textarea ysrp-transcript-text", readOnly: true, rows: 5, placeholder: tr("Transcript will appear here…", "字幕内容加载后会显示在这里…") });
    const panel = h("div", { class: "ysrp-panel ysrp-transcript-container" }, h("div", { class: "ysrp-panel-head" }, h("span", { class: "ysrp-panel-label" }, tr("Transcript", "字幕"), " ", status), h("span", { class: "ysrp-panel-tools" }, refreshBtn, copyBtn)), area);
    const button = iconButton("closed-captioning", "", "is-transcript");
    let loaded = false;
    let busy = false;
    const setStatus = (text, tone = "neutral") => {
      status.textContent = text;
      status.classList.toggle("is-error", tone === "error");
      status.classList.toggle("is-success", tone === "success");
      area.title = text || area.placeholder;
    };
    const setOpen = (open) => {
      ui.transcriptOpen = open;
      panel.style.display = open ? "flex" : "none";
      const tip = open ? tr("Hide transcript", "隐藏字幕") : tr("Show transcript", "显示字幕");
      button.title = tip;
      button.setAttribute("aria-label", tip);
    };
    const setBusy = (on) => {
      busy = on;
      button.disabled = false;
      refreshBtn.disabled = on;
      refreshBtn.querySelector("i")?.classList.toggle("fa-spin", on);
    };
    const show = (text) => {
      area.value = text;
      copyBtn.disabled = !text.trim();
      area.style.opacity = text.trim() ? "1" : "0.7";
    };
    const load = (force) => {
      if (busy)
        return;
      setBusy(true);
      setStatus(loaded ? tr("Refreshing…", "正在重新获取…") : tr("Loading…", "正在获取…"));
      fetchTranscript(ctx.videoId, { force, videoUrl: ctx.url }).then((text) => {
        show(text);
        loaded = true;
        setStatus(tr("Updated ({time})", "已更新（{time}）", { time: new Date().toLocaleTimeString() }), "success");
      }).catch((err) => {
        setStatus(tr("Failed: {message}", "获取失败：{message}", { message: errorMessage(err) }), "error");
      }).finally(() => setBusy(false));
    };
    button.addEventListener("click", (ev) => {
      ev.preventDefault();
      const open = ui.transcriptOpen !== true;
      setOpen(open);
      if (open && !loaded)
        load(false);
    });
    refreshBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      setOpen(true);
      load(true);
    });
    copyBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      const text = area.value.trim();
      if (!text) {
        setStatus(tr("No transcript content to copy.", "暂无字幕内容可复制。"));
        return;
      }
      copyText(text).then(() => {
        setIcon(copyBtn, "check");
        copyBtn.classList.add("is-success");
        window.setTimeout(() => {
          setIcon(copyBtn, "copy");
          copyBtn.classList.remove("is-success");
        }, 1000);
        setStatus(tr("Copied.", "已复制。"), "success");
      }).catch((err) => setStatus(tr("Copy failed: {message}", "复制失败：{message}", { message: errorMessage(err) }), "error"));
    });
    const cached = cachedTranscript(ctx.videoId);
    if (cached) {
      show(cached);
      loaded = true;
      setStatus(tr("Loaded from cache.", "来自缓存。"));
    }
    setOpen(ui.transcriptOpen === true);
    if (ui.transcriptOpen === true && !loaded)
      load(false);
    return { button, panel };
  }
  var transcript_default = definePlugin({
    name: "Transcript",
    displayName: { en: "Transcript", zh: "字幕" },
    description: {
      en: "Transcript endpoint settings plus fetching and copying transcripts from the records list.",
      zh: "字幕接口设置，以及在记录列表中获取、复制字幕。"
    },
    authors: ["0_V"],
    icon: "closed-captioning",
    enabledByDefault: true,
    start(ctx) {
      ctx.addTab({
        id: "transcript",
        group: "plugins",
        order: 20,
        icon: "closed-captioning",
        label: () => tr("Transcript", "字幕"),
        render: renderTab
      });
      ctx.addRowButton({ id: "transcript", order: 10, panelOrder: 20, create: createRowParts });
      ctx.onDispose(recordChanges.on((change) => {
        if (change.kind === "delete")
          forgetTranscript(change.videoId);
      }));
    }
  });

  // src/generated/plugins.ts
  var plugins = [engine_default, playerBadge_default, settings_default, badgeToggle_default, driveSync_default, transcript_default];

  // src/index.ts
  function bootstrap() {
    const root = document.documentElement;
    if (root.dataset.ysrpVideoMemory)
      return;
    root.dataset.ysrpVideoMemory = VERSION;
    getMode();
    try {
      cleanupRecords();
    } catch (err) {
      console.error("[Video Memory] Startup cleanup failed:", err);
    }
    addStyle(theme_default, "ysrp-theme");
    startPlugins(plugins);
  }
  bootstrap();
})();
