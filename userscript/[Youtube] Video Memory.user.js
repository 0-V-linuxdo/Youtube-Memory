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
  var COMMIT = "860ad2f";
  var IS_DEV_BUILD = false;
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
  function icon(name, extraClass = "", variant = "solid") {
    const i = document.createElement("i");
    if (name)
      i.className = `fa-${variant} fa-${name}${extraClass ? ` ${extraClass}` : ""}`;
    i.setAttribute("aria-hidden", "true");
    return i;
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
  var nameList = (value) => Array.isArray(value) ? Array.from(new Set(value.filter((v) => typeof v === "string" && v.length > 0))) : [];
  function load() {
    if (cache)
      return cache;
    let parsed = null;
    try {
      const raw = readSetting(KEY_PLUGINS);
      const value = raw ? JSON.parse(raw) : null;
      parsed = value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      parsed = null;
    }
    const plugins = parsed && parsed.plugins;
    cache = {
      ...parsed || {},
      plugins: plugins && typeof plugins === "object" ? { ...plugins } : {},
      starred: nameList(parsed && parsed.starred),
      pinned: nameList(parsed && parsed.pinned)
    };
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
  function starredPlugins() {
    return load().starred.slice();
  }
  function pinnedPlugins() {
    return load().pinned.slice();
  }
  function setListed(list, name, on) {
    const data = load();
    const next = data[list].filter((n) => n !== name);
    if (on)
      next.push(name);
    data[list] = next;
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
  var failed = new Set;
  function hasFailed(name) {
    return failed.has(name);
  }
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
    failed.delete(plugin.name);
    try {
      plugin.start(ctx);
    } catch (err) {
      console.error(`[Video Memory] Plugin ${plugin.name} failed to start:`, err);
      failed.add(plugin.name);
    }
  }
  function stopPlugin(plugin) {
    const ctx = running.get(plugin.name);
    if (!ctx)
      return;
    running.delete(plugin.name);
    failed.delete(plugin.name);
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
  var theme_default = `/* N-5.1 colour tokens: follow the system light/dark scheme live. */
:root {
  --ysrp-surface-base: #ffffff;
  --ysrp-surface-l1: #f4f4f5;
  --ysrp-surface-l2: #e8e8eb;
  --ysrp-border-l1: rgba(0, 0, 0, .08);
  --ysrp-border-l2: #c4c4cc;
  --ysrp-fg-primary: #0d0d0d;
  --ysrp-fg-secondary: #6b6b75;
  --ysrp-fg-tertiary: #8a8a94;
  --ysrp-fg-danger: #dc2626;
  --ysrp-fg-success: #16a34a;
  --ysrp-overlay: rgba(0, 0, 0, .4);
  --ysrp-icon-block: rgba(13, 13, 13, .1);
  --ysrp-danger-border: rgba(220, 38, 38, .45);
  --ysrp-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ysrp-surface-base: #0e0e10;
    --ysrp-surface-l1: #141416;
    --ysrp-surface-l2: #1f1f23;
    --ysrp-border-l1: rgba(255, 255, 255, .08);
    --ysrp-border-l2: #4a4a52;
    --ysrp-fg-primary: #fafafa;
    --ysrp-fg-secondary: #a1a1aa;
    --ysrp-fg-tertiary: #9a9aa3;
    --ysrp-fg-danger: #f87171;
    --ysrp-fg-success: #4ade80;
    --ysrp-overlay: rgba(0, 0, 0, .6);
    --ysrp-icon-block: rgba(250, 250, 250, .1);
    --ysrp-danger-border: rgba(248, 113, 113, .45);
  }
}
`;

  // src/api/ui.css
  var ui_default = `/* N-5.2 parts shared by every tab and by the nested dialogs. All sizes in px (YouTube root font is 10px). */

.ysrp-ui,
.ysrp-ui *,
.ysrp-ui *::before,
.ysrp-ui *::after { box-sizing: border-box; }
.ysrp-ui {
  font-family: var(--ysrp-font);
  font-size: 14px;
  line-height: 20px;
  color: var(--ysrp-fg-primary);
  text-align: left;
  text-shadow: none;
  -webkit-font-smoothing: antialiased;
}
.ysrp-ui,
.ysrp-ui * {
  scrollbar-width: thin;
  scrollbar-color: var(--ysrp-border-l2) transparent;
}
.ysrp-ui ::-webkit-scrollbar { width: 6px; height: 6px; }
.ysrp-ui ::-webkit-scrollbar-track { background: transparent; }
.ysrp-ui ::-webkit-scrollbar-thumb { background: var(--ysrp-border-l2); border-radius: 6px; }
.ysrp-ui ::-webkit-scrollbar-corner { background: transparent; }
.ysrp-ui p { margin: 0; }
.ysrp-ui a { color: inherit; }
.ysrp-ui i[class*="fa-"] { color: inherit; }

/* ---------------------------------------------------------------- N-5.2.4 buttons */
.ysrp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  margin: 0;
  border-radius: 8px;
  border: 1px solid transparent;
  font-family: var(--ysrp-font);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  color: var(--ysrp-fg-primary);
  transition: background-color 150ms, color 150ms, opacity 150ms;
}
.ysrp-btn.is-small { height: 28px; }
.ysrp-btn i { font-size: 13px; }
.ysrp-btn.is-primary { background: var(--ysrp-fg-primary); color: var(--ysrp-surface-base); }
.ysrp-btn.is-primary:hover { opacity: .88; }
.ysrp-btn.is-secondary { background: var(--ysrp-surface-l1); border-color: var(--ysrp-border-l1); color: var(--ysrp-fg-primary); }
.ysrp-btn.is-secondary:hover { background: var(--ysrp-surface-l2); }
.ysrp-btn.is-tertiary { background: transparent; color: var(--ysrp-fg-secondary); }
.ysrp-btn.is-tertiary:hover { background: var(--ysrp-surface-l2); color: var(--ysrp-fg-primary); }
.ysrp-btn.is-danger { background: var(--ysrp-fg-danger); color: #ffffff; }
.ysrp-btn.is-danger:hover { opacity: .88; }
.ysrp-btn:disabled { opacity: .5; cursor: default; pointer-events: none; }
.ysrp-btn:focus-visible,
.ysrp-ibtn:focus-visible,
.ysrp-switch:focus-visible { outline: 2px solid var(--ysrp-border-l2); outline-offset: 1px; }
.ysrp-btn.is-square { width: 28px; padding: 0; }

/* ---------------------------------------------------------------- N-5.2.3 icon buttons */
.ysrp-ibtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ysrp-fg-tertiary);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: background-color 150ms, color 150ms, opacity 150ms;
}
.ysrp-ibtn i { font-size: 14px; }
.ysrp-ibtn:hover { background: var(--ysrp-surface-l2); color: var(--ysrp-fg-primary); }
.ysrp-ibtn.is-active { color: var(--ysrp-fg-primary); }
.ysrp-ibtn:disabled { opacity: .5; cursor: default; }
.ysrp-ibtn:disabled:hover { background: transparent; color: var(--ysrp-fg-tertiary); }
.ysrp-ibtn.is-off { opacity: .4; }

/* ---------------------------------------------------------------- N-5.2.5 switch */
.ysrp-switch {
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 999px;
  background: var(--ysrp-surface-l2);
  cursor: pointer;
  transition: background-color 150ms;
}
.ysrp-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ysrp-fg-tertiary);
  transition: transform 150ms, background-color 150ms;
}
.ysrp-switch.is-on { background: var(--ysrp-fg-primary); }
.ysrp-switch.is-on .ysrp-switch-knob { transform: translateX(16px); background: var(--ysrp-surface-base); }
.ysrp-switch:disabled { opacity: .5; cursor: default; }

/* ---------------------------------------------------------------- N-5.2.6 inputs */
.ysrp-input,
.ysrp-select,
.ysrp-textarea {
  display: block;
  height: 36px;
  width: 100%;
  margin: 0;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--ysrp-border-l1);
  background: var(--ysrp-surface-l1);
  color: var(--ysrp-fg-primary);
  font-family: var(--ysrp-font);
  font-size: 14px;
  line-height: 20px;
  outline: none;
  box-shadow: none;
  transition: border-color 150ms;
}
.ysrp-input::placeholder,
.ysrp-textarea::placeholder { color: var(--ysrp-fg-tertiary); opacity: 1; }
.ysrp-input:focus,
.ysrp-select:focus,
.ysrp-textarea:focus { border-color: var(--ysrp-border-l2); }
.ysrp-input.is-number { width: 96px; }
.ysrp-textarea {
  height: auto;
  min-height: 96px;
  padding: 8px 12px;
  resize: vertical;
}
.ysrp-select-wrap {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  min-width: 0;
}
.ysrp-select {
  appearance: none;
  -webkit-appearance: none;
  width: auto;
  padding-right: 32px;
  cursor: pointer;
}
.ysrp-select option { background: var(--ysrp-surface-l1); color: var(--ysrp-fg-primary); }
.ysrp-select-arrow {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: var(--ysrp-fg-tertiary);
  pointer-events: none;
}
.ysrp-secret { display: flex; align-items: center; gap: 8px; }
.ysrp-secret .ysrp-input { flex: 1 1 auto; min-width: 0; }

/* ---------------------------------------------------------------- N-5.2.1 card, N-5.2.2 grid */
.ysrp-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.ysrp-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 120px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--ysrp-border-l1);
  background: var(--ysrp-surface-l1);
  transition: opacity 150ms;
}
.ysrp-card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 10px 12px;
}
.ysrp-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.ysrp-card-lead {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
}
.ysrp-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--ysrp-icon-block);
  color: var(--ysrp-fg-primary);
  font-size: 14px;
}
.ysrp-card-icon i { font-size: 14px; }
.ysrp-card-title {
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ysrp-card-marks { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.ysrp-card-mark {
  display: inline-flex;
  align-items: center;
  color: var(--ysrp-fg-tertiary);
  font-size: 14px;
  cursor: default;
}
.ysrp-card-mark.is-danger { color: var(--ysrp-fg-danger); }
.ysrp-card-controls { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.ysrp-card-desc {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ysrp-fg-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.ysrp-card-sep { height: 1px; flex: 0 0 1px; background: var(--ysrp-border-l1); }
.ysrp-card-footer {
  padding: 6px 12px;
  font-size: 11px;
  line-height: 16px;
  color: var(--ysrp-fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------------------------------------------------------------- N-5.2.7 settings row, N-5.2.8 group */
.ysrp-group { display: flex; flex-direction: column; gap: 16px; }
.ysrp-group + .ysrp-group { border-top: 1px solid var(--ysrp-border-l1); margin-top: 16px; padding-top: 16px; }
.ysrp-group-title { font-size: 12px; font-weight: 500; line-height: 16px; color: var(--ysrp-fg-tertiary); }
.ysrp-srow { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ysrp-srow-main { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.ysrp-srow-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.ysrp-srow-title { font-size: 14px; font-weight: 500; line-height: 20px; color: var(--ysrp-fg-primary); }
.ysrp-srow-desc { font-size: 12px; line-height: 16px; color: var(--ysrp-fg-secondary); overflow-wrap: anywhere; }
.ysrp-srow-control { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.ysrp-srow-below { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ysrp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ysrp-note { font-size: 12px; line-height: 16px; color: var(--ysrp-fg-secondary); overflow-wrap: anywhere; }
.ysrp-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

/* N-5.7.5 result messages */
.ysrp-msg { display: none; font-size: 12px; line-height: 16px; color: var(--ysrp-fg-secondary); overflow-wrap: anywhere; }
.ysrp-msg.is-visible { display: block; }
.ysrp-msg.is-success { color: var(--ysrp-fg-success); }
.ysrp-msg.is-error { color: var(--ysrp-fg-danger); }

/* ---------------------------------------------------------------- N-5.2.9 search bar, N-5.2.10 categories */
.ysrp-searchbar { display: flex; align-items: center; gap: 12px; }
.ysrp-searchbar .ysrp-search { flex: 1 1 auto; min-width: 0; width: auto; }
.ysrp-searchbar .ysrp-select-wrap { flex: 0 0 120px; width: 120px; }
.ysrp-searchbar .ysrp-select { width: 120px; }
.ysrp-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  border-bottom: 1px solid var(--ysrp-border-l1);
}
.ysrp-cat { position: relative; margin-bottom: -1px; }
.ysrp-cat.is-active { color: var(--ysrp-fg-primary); }
.ysrp-cat.is-active::after {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--ysrp-fg-primary);
}

/* ---------------------------------------------------------------- N-5.2.14 info hint, N-5.2.15 empty state */
.ysrp-info-hint {
  display: inline-flex;
  align-items: center;
  color: var(--ysrp-fg-tertiary);
  font-size: 14px;
  cursor: help;
}
.ysrp-info-hint i { font-size: 14px; }
.ysrp-empty {
  padding: 32px 0;
  text-align: center;
  color: var(--ysrp-fg-secondary);
}
.ysrp-sep { height: 1px; margin: 0; border: none; background: var(--ysrp-border-l1); flex: 0 0 1px; }

/* ---------------------------------------------------------------- N-5.2.11 nested dialog, N-5.2.13 confirm */
.ysrp-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}
.ysrp-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 512px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--ysrp-border-l1);
  background: var(--ysrp-surface-l1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, .28);
}
.ysrp-dialog.is-sm { width: 448px; }
.ysrp-dialog.is-lg { width: 600px; min-height: 420px; }
.ysrp-dialog-close { position: absolute; top: 16px; right: 16px; }
.ysrp-dialog-head { display: flex; flex-direction: column; gap: 4px; padding-right: 40px; }
.ysrp-dialog-title { font-size: 16px; font-weight: 600; line-height: 24px; }
.ysrp-dialog-desc { font-size: 13px; line-height: 1.5; color: var(--ysrp-fg-secondary); overflow-wrap: anywhere; }
.ysrp-dialog-body { display: flex; flex-direction: column; gap: 16px; flex: 1 1 auto; min-height: 0; }
.ysrp-dialog-footer { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: auto; }
.ysrp-field { display: flex; flex-direction: column; gap: 4px; min-height: 0; }
.ysrp-field-label { font-size: 13px; font-weight: 500; line-height: 20px; }
.ysrp-field-value { color: var(--ysrp-fg-secondary); }

@media (max-width: 640px) {
  .ysrp-grid { grid-template-columns: 1fr; }
}
`;

  // src/utils/i18n.ts
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
    const savedBtn = h("button", { class: "ysrp-btn is-primary ysrp-resume-btn ysrp-resume-saved", type: "button" }, tr("Saved progress {t}", "上次进度 {t}", { t: formatTime(opts.saved) }));
    const linkBtn = h("button", { class: "ysrp-btn is-secondary ysrp-resume-btn ysrp-resume-link", type: "button" }, tr("Link time {t}", "链接时间 {t}", { t: formatTime(opts.link) }));
    const root = h("div", { class: "ysrp-ui ysrp-resume", attrs: { role: "dialog", "aria-modal": "true" } }, h("div", { class: "ysrp-resume-head" }, h("div", { class: "ysrp-resume-title", text: tr("Where to continue?", "从哪里继续播放？") }), h("div", { class: "ysrp-resume-text", text: tr("This link starts at a different time than your saved progress.", "这个链接指定的时间与你上次的进度不同。") })), h("div", { class: "ysrp-resume-actions" }, linkBtn, savedBtn));
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
    const width = Math.max(200, Math.min(448, (player.clientWidth || 480) - 32));
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
  background: var(--ysrp-surface-base);
  color: var(--ysrp-fg-primary);
  padding: 5px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  line-height: 1.2;
}
.last-save-info-container .last-save-info-text.is-error {
  color: var(--ysrp-fg-danger);
}
.last-save-info-container .ysrp-settings-button {
  background: var(--ysrp-surface-l2);
  color: var(--ysrp-fg-primary);
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

/* N-5.8: small nested-dialog look (N-5.2.11); buttons are the shared .ysrp-btn parts. */
.ysrp-resume {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 70;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100% - 32px);
  overflow: auto;
  padding: 24px;
  border-radius: 16px;
  background: var(--ysrp-surface-l1);
  color: var(--ysrp-fg-primary);
  border: 1px solid var(--ysrp-border-l1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, .28);
}
.ysrp-resume-head { display: flex; flex-direction: column; gap: 4px; }
.ysrp-resume-title { font-size: 16px; font-weight: 600; line-height: 24px; }
.ysrp-resume-text { font-size: 13px; line-height: 1.5; color: var(--ysrp-fg-secondary); }
.ysrp-resume-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
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

  // src/api/ui.ts
  function button(label, opts = {}) {
    const btn = h("button", {
      class: `ysrp-btn is-${opts.variant || "secondary"}${opts.small ? " is-small" : ""}${opts.cls ? ` ${opts.cls}` : ""}`,
      type: "button",
      title: opts.title
    }, opts.icon ? icon(opts.icon) : null, h("span", { class: "ysrp-btn-label", text: label }));
    if (opts.onClick)
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        opts.onClick?.(ev);
      });
    return btn;
  }
  function setButtonLabel(btn, label) {
    const span = btn.querySelector(".ysrp-btn-label");
    if (span)
      span.textContent = label;
  }
  function iconButton(iconName, label, cls = "", onClick) {
    const btn = h("button", { class: `ysrp-ibtn${cls ? ` ${cls}` : ""}`, type: "button" }, icon(iconName));
    setIconButtonLabel(btn, label);
    if (onClick)
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        onClick(ev);
      });
    return btn;
  }
  function setIconButtonLabel(btn, label) {
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }
  function setIcon(btn, iconName, variant = "solid") {
    const i = btn.querySelector("i");
    if (i)
      i.className = `fa-${variant} fa-${iconName}`;
  }
  function switchControl(checked, onChange, opts = {}) {
    const el = h("button", {
      class: `ysrp-switch${opts.cls ? ` ${opts.cls}` : ""}`,
      type: "button",
      disabled: Boolean(opts.disabled),
      dataset: opts.dataset,
      attrs: { role: "switch", "aria-label": opts.label }
    }, h("span", { class: "ysrp-switch-knob" }));
    let on = checked;
    const set = (next) => {
      on = next;
      el.setAttribute("aria-checked", String(next));
      el.classList.toggle("is-on", next);
    };
    set(checked);
    el.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (el.disabled)
        return;
      set(!on);
      onChange(on);
    });
    return { el, set, value: () => on };
  }
  function textInput(opts = {}) {
    return h("input", {
      class: `ysrp-input${opts.cls ? ` ${opts.cls}` : ""}`,
      type: opts.type || "text",
      value: opts.value ?? "",
      placeholder: opts.placeholder,
      autocomplete: opts.type === "password" ? "new-password" : "off",
      spellcheck: false,
      dataset: opts.field ? { field: opts.field } : undefined
    });
  }
  function textArea(opts = {}) {
    return h("textarea", {
      class: `ysrp-textarea${opts.cls ? ` ${opts.cls}` : ""}`,
      value: opts.value ?? "",
      placeholder: opts.placeholder,
      readOnly: Boolean(opts.readOnly),
      spellcheck: false
    });
  }
  function selectControl(options, value, onChange, opts = {}) {
    const select = h("select", {
      class: `ysrp-select${opts.cls ? ` ${opts.cls}` : ""}`,
      dataset: opts.dataset,
      attrs: { "aria-label": opts.label }
    }, options.map((o) => h("option", { value: o.value, text: o.label, disabled: Boolean(o.disabled), selected: o.value === value })));
    select.value = value;
    select.addEventListener("change", () => onChange(select.value));
    const el = h("span", { class: "ysrp-select-wrap" }, select, h("span", { class: "ysrp-select-arrow" }, icon("chevron-down")));
    return { el, select, value: () => select.value, set: (v) => {
      select.value = v;
    } };
  }
  function secretInput(input) {
    input.type = "password";
    const toggle = button(tr("Show", "显示"), { variant: "tertiary", small: true, cls: "ysrp-secret-toggle" });
    toggle.addEventListener("click", (ev) => {
      ev.preventDefault();
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      setButtonLabel(toggle, reveal ? tr("Hide", "隐藏") : tr("Show", "显示"));
    });
    return h("div", { class: "ysrp-secret" }, input, toggle);
  }
  var NBSP = " ";
  function card(opts) {
    const iconEl = h("span", { class: "ysrp-card-icon" }, icon(opts.icon));
    const titleEl = h("span", { class: "ysrp-card-title" });
    const marksEl = h("span", { class: "ysrp-card-marks" }, opts.marks || []);
    const controlsEl = h("span", { class: "ysrp-card-controls" }, opts.controls || []);
    const descEl = h("div", { class: "ysrp-card-desc" });
    const footerEl = h("div", { class: "ysrp-card-footer" });
    const el = h("div", { class: `ysrp-card${opts.cls ? ` ${opts.cls}` : ""}`, dataset: opts.dataset }, h("div", { class: "ysrp-card-body" }, h("div", { class: "ysrp-card-top" }, h("div", { class: "ysrp-card-lead" }, iconEl, titleEl, marksEl), controlsEl), descEl), h("div", { class: "ysrp-card-sep" }), footerEl);
    const handle = {
      el,
      iconEl,
      titleEl,
      marksEl,
      controlsEl,
      descEl,
      footerEl,
      setIcon(name) {
        iconEl.replaceChildren(icon(name));
      },
      setTitle(text, tip) {
        titleEl.textContent = text;
        titleEl.title = tip ?? text;
      },
      setDesc(text) {
        descEl.textContent = text;
        descEl.title = text;
      },
      setFooter(text) {
        footerEl.textContent = text || NBSP;
      }
    };
    handle.setTitle(opts.title, opts.titleTip);
    handle.setDesc(opts.desc || "");
    handle.setFooter(opts.footer || "");
    return handle;
  }
  function cardMark(iconName, tip, cls = "") {
    return h("span", { class: `ysrp-card-mark${cls ? ` ${cls}` : ""}`, title: tip, attrs: { "aria-label": tip, role: "img" } }, icon(iconName));
  }
  function grid(cls = "", ...children) {
    return h("div", { class: `ysrp-grid${cls ? ` ${cls}` : ""}` }, children);
  }
  function settingsRow(opts) {
    const descEl = h("div", { class: "ysrp-srow-desc", text: opts.desc || "" });
    if (!opts.desc)
      descEl.style.display = "none";
    const below = h("div", { class: "ysrp-srow-below" }, opts.below || []);
    if (!opts.below || !opts.below.length)
      below.style.display = "none";
    const el = h("div", { class: `ysrp-srow${opts.cls ? ` ${opts.cls}` : ""}`, dataset: opts.dataset }, h("div", { class: "ysrp-srow-main" }, h("div", { class: "ysrp-srow-text" }, h("div", { class: "ysrp-srow-title", text: opts.title }), descEl), opts.control ? h("div", { class: "ysrp-srow-control" }, opts.control) : null), below);
    return { el, descEl, below };
  }
  function setRowDesc(row, text) {
    row.descEl.textContent = text;
    row.descEl.style.display = text ? "" : "none";
  }
  function group(title, ...children) {
    return h("section", { class: "ysrp-group" }, h("div", { class: "ysrp-group-title", text: title }), children);
  }
  function actions(...children) {
    return h("div", { class: "ysrp-actions" }, children);
  }
  function searchBar(placeholder, filters, onChange) {
    const input = h("input", { class: "ysrp-input ysrp-search", type: "search", placeholder, spellcheck: false, autocomplete: "off" });
    input.addEventListener("input", onChange);
    const filter = selectControl(filters, filters[0]?.value || "all", onChange, { cls: "ysrp-filter", label: tr("Filter", "筛选") });
    return {
      el: h("div", { class: "ysrp-searchbar" }, input, filter.el),
      input,
      filter,
      query: () => input.value.trim().toLowerCase(),
      setPlaceholder: (text) => {
        input.placeholder = text;
      }
    };
  }
  function categoryStrip(cats, active, onSelect) {
    let current = active;
    const buttons = cats.map((c) => {
      const btn = button(c.label, { variant: "tertiary", small: true, cls: "ysrp-cat" });
      btn.dataset.cat = c.id;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (current === c.id)
          return;
        set(c.id);
        onSelect(c.id);
      });
      return btn;
    });
    const set = (id) => {
      current = id;
      for (const b of buttons) {
        const on = b.dataset.cat === id;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      }
    };
    set(active);
    return { el: h("div", { class: "ysrp-cats", attrs: { role: "tablist" } }, buttons), value: () => current, set };
  }
  function infoHint(text) {
    return h("span", { class: "ysrp-info-hint", title: text, attrs: { "aria-label": text, role: "img", tabindex: "0" } }, icon("circle-info"));
  }
  function emptyState(text, cls = "") {
    return h("p", { class: `ysrp-empty${cls ? ` ${cls}` : ""}`, text });
  }
  function field(label, ...content) {
    return h("div", { class: "ysrp-field" }, h("div", { class: "ysrp-field-label", text: label }), content);
  }
  function messageLine(cls = "") {
    const el = h("div", { class: `ysrp-msg${cls ? ` ${cls}` : ""}`, attrs: { role: "status", "aria-live": "polite" } });
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

  // src/plugins/_core/settings/displayTab.ts
  function optionLabel(code) {
    if (code === "zh")
      return "中文";
    if (code === "en")
      return "English";
    return tr("Auto", "自动");
  }
  function createDisplayTab() {
    return {
      id: "display",
      group: "main",
      order: 30,
      icon: "palette",
      label: () => t("language.tabLabel", tr("Display", "界面")),
      info: () => t("language.description"),
      render(pane) {
        const status = messageLine("ysrp-language-msg");
        const describe = () => tr("Current: {active}; browser: {browser}", "当前：{active}；浏览器：{browser}", {
          active: languageName(getLanguage()),
          browser: languageName(detectBrowserLanguage())
        });
        const options = ["auto", "zh", "en"];
        const select = selectControl(options.map((code) => ({ value: code, label: optionLabel(code) })), getPreference(), (value) => {
          if (value === getPreference()) {
            status.set(tr("Already using this language.", "当前已使用该语言。"));
            return;
          }
          setPreference(value);
          row.descEl.textContent = describe();
          status.set(tr("Language preference updated.", "语言偏好已更新。"), "success");
        }, { cls: "ysrp-language-select", label: tr("Interface language", "界面语言") });
        const row = settingsRow({ title: tr("Interface language", "界面语言"), desc: describe(), control: select.el, below: [status.el] });
        pane.appendChild(h("div", { class: "ysrp-groups" }, group(tr("Language", "语言"), row.el)));
      }
    };
  }

  // src/api/dialogs.ts
  var stack = [];
  var dialogsChanged = new Emitter;
  var STOP_KEYS = ["keydown", "keyup", "keypress"];
  function onEscape(ev) {
    if (ev.key !== "Escape" || !stack.length)
      return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    ev.stopPropagation();
    stack[stack.length - 1].close();
  }
  function openDialog(opts) {
    const body = h("div", { class: "ysrp-dialog-body" }, opts.content || []);
    const footer = h("div", { class: "ysrp-dialog-footer" }, opts.footer || []);
    if (!opts.footer || !opts.footer.length)
      footer.style.display = "none";
    const closeBtn = iconButton("xmark", tr("Close", "关闭"), "ysrp-dialog-close");
    const el = h("div", {
      class: `ysrp-dialog is-${opts.size || "md"}${opts.cls ? ` ${opts.cls}` : ""}`,
      attrs: { role: "dialog", "aria-modal": "true", "aria-label": opts.title }
    }, closeBtn, h("div", { class: "ysrp-dialog-head" }, h("div", { class: "ysrp-dialog-title", text: opts.title }), opts.desc ? h("div", { class: "ysrp-dialog-desc", text: opts.desc }) : null), body, footer);
    const layer = h("div", { class: "ysrp-ui ysrp-dialog-layer" }, el);
    let open = true;
    const handle = {
      layer,
      el,
      body,
      footer,
      isOpen: () => open,
      close() {
        if (!open)
          return;
        open = false;
        layer.remove();
        const idx = stack.indexOf(handle);
        if (idx >= 0)
          stack.splice(idx, 1);
        if (!stack.length)
          window.removeEventListener("keydown", onEscape, true);
        try {
          opts.onClose?.();
        } catch (err) {
          console.error("[Video Memory] dialog onClose failed:", err);
        }
        dialogsChanged.emit();
      }
    };
    closeBtn.addEventListener("click", () => handle.close());
    layer.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (ev.target === layer)
        handle.close();
    });
    layer.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    for (const type of STOP_KEYS)
      layer.addEventListener(type, (ev) => ev.stopPropagation());
    if (!stack.length)
      window.addEventListener("keydown", onEscape, true);
    stack.push(handle);
    pageHost().appendChild(layer);
    dialogsChanged.emit();
    return handle;
  }
  function confirmDialog(opts) {
    return new Promise((resolve) => {
      let answer = false;
      const cancel = button(tr("Cancel", "取消"), { variant: "secondary", cls: "ysrp-confirm-cancel" });
      const ok = button(opts.confirmLabel, { variant: opts.danger ? "danger" : "primary", cls: "ysrp-confirm-ok" });
      const dlg = openDialog({
        title: opts.title,
        desc: opts.desc,
        size: "sm",
        cls: "is-confirm",
        footer: [cancel, ok],
        onClose: () => resolve(answer)
      });
      cancel.addEventListener("click", () => dlg.close());
      ok.addEventListener("click", () => {
        answer = true;
        dlg.close();
      });
      requestAnimationFrame(() => {
        if (dlg.isOpen())
          ok.focus({ preventScroll: true });
      });
    });
  }
  function hasDialogs() {
    return stack.length > 0;
  }
  function closeAllDialogs() {
    while (stack.length)
      stack[stack.length - 1].close();
  }
  function dialogLayers() {
    return stack.map((d) => d.layer);
  }

  // src/plugins/_core/settings/pluginsTab.ts
  function visibleSettings(plugin) {
    return Object.entries(plugin.settings || {}).filter(([, def]) => !def.hidden);
  }
  function settingRow(plugin, key, def) {
    const ctx = settingsContext(plugin);
    const value = getSetting(plugin, key);
    const title = pick(def.label);
    const desc = def.description ? pick(def.description) : "";
    switch (def.type) {
      case "switch":
        return settingsRow({ title, desc, control: switchControl(Boolean(value), (on) => ctx.settings.set(key, on), { dataset: { setting: key }, label: title }).el }).el;
      case "select":
        return settingsRow({
          title,
          desc,
          control: selectControl((def.options || []).map((o) => ({ value: o.value, label: pick(o.label) })), String(value), (v) => ctx.settings.set(key, v), { dataset: { setting: key }, label: title }).el
        }).el;
      case "number": {
        const input = textInput({ type: "number", value: String(value ?? ""), placeholder: def.placeholder, cls: "is-number" });
        input.dataset.setting = key;
        if (def.min !== undefined)
          input.min = String(def.min);
        if (def.max !== undefined)
          input.max = String(def.max);
        if (def.step !== undefined)
          input.step = String(def.step);
        input.addEventListener("change", () => {
          const n = Number(input.value);
          if (input.value.trim() !== "" && Number.isFinite(n))
            ctx.settings.set(key, n);
        });
        return settingsRow({ title, desc, below: [input] }).el;
      }
      default: {
        const input = textInput({ value: String(value ?? ""), placeholder: def.placeholder });
        input.dataset.setting = key;
        input.addEventListener("input", () => ctx.settings.set(key, input.value));
        return settingsRow({ title, desc, below: [input] }).el;
      }
    }
  }
  function openPluginDialog(plugin) {
    const settings = visibleSettings(plugin);
    const list = h("div", { class: "ysrp-plugin-settings" });
    const renderList = () => list.replaceChildren(...settings.map(([key, def]) => settingRow(plugin, key, def)));
    renderList();
    const reset = button(tr("Reset", "重置"), { variant: "secondary", cls: "ysrp-plugin-reset" });
    reset.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const ok = await confirmDialog({
        title: tr("Reset settings", "重置设置"),
        desc: tr("Reset this plugin's settings to defaults? This cannot be undone.", "把这个插件的设置恢复为默认值？此操作无法撤销。"),
        confirmLabel: tr("Reset", "重置"),
        danger: true
      });
      if (!ok)
        return;
      settingsContext(plugin).settings.reset();
      renderList();
    });
    openDialog({
      title: pick(plugin.displayName),
      desc: pick(plugin.description),
      size: "md",
      cls: "ysrp-plugin-dialog",
      content: [
        h("hr", { class: "ysrp-sep" }),
        field(tr("Authors", "作者"), h("p", { class: "ysrp-field-value ysrp-plugin-authors", text: plugin.authors.join(", ") })),
        field(tr("Settings", "设置"), settings.length ? list : h("p", { class: "ysrp-field-value", text: tr("No configurable settings.", "没有可配置的设置项。") }))
      ],
      footer: settings.length ? [reset] : []
    });
  }
  var lastCategory = "favorites";
  function createPluginsTab() {
    return {
      id: "plugins",
      group: "plugins",
      order: 10,
      icon: "plug",
      label: () => tr("Plugins", "插件"),
      info: () => tr("Toggle features. Changes apply immediately. Click the sliders icon to configure.", "开启或关闭功能，立即生效。点击滑杆图标进行配置。"),
      render(pane) {
        const plugins = listPlugins();
        const cats = categoryStrip([
          { id: "favorites", label: tr("Favorites", "收藏") },
          { id: "all", label: tr("All", "全部") }
        ], lastCategory, (id) => {
          lastCategory = id;
          build();
        });
        const bar = searchBar("", [
          { value: "all", label: tr("All", "全部") },
          { value: "enabled", label: tr("Enabled", "已开启") },
          { value: "disabled", label: tr("Disabled", "已关闭") }
        ], () => applyFilter());
        const mainGrid = grid("ysrp-plugin-grid");
        const divider = h("hr", { class: "ysrp-sep ysrp-core-sep" });
        const coreGrid = grid("ysrp-plugin-grid is-core");
        const empty = emptyState("", "ysrp-plugins-empty");
        const container = h("div", { class: "ysrp-pane-stack ysrp-plugins" }, mainGrid, divider, coreGrid, empty);
        const cards = new Map;
        const makeCard = (plugin, starred, pinned) => {
          const name = pick(plugin.displayName);
          const marks = [];
          if (plugin.required)
            marks.push(cardMark("circle-exclamation", tr("Core plugin, always on", "核心插件，始终开启"), "is-core-mark"));
          const failed = isEnabled(plugin) && hasFailed(plugin.name);
          if (failed)
            marks.push(cardMark("triangle-exclamation", tr("This plugin failed to start", "插件启动失败"), "is-danger"));
          const star = iconButton("star", "", `is-star${starred ? " is-active" : ""}`, () => {
            setListed("starred", plugin.name, !starred);
            build();
          });
          setIcon(star, "star", starred ? "solid" : "regular");
          setIconButtonLabel(star, starred ? tr("Remove from favorites", "取消收藏") : tr("Add to favorites", "收藏"));
          const controls = [star];
          if (!plugin.required) {
            const pin = iconButton("thumbtack", pinned ? tr("Unpin", "取消置顶") : tr("Pin to top", "置顶"), `is-pin${pinned ? " is-active" : ""}`, () => {
              setListed("pinned", plugin.name, !pinned);
              build();
            });
            controls.push(pin);
          }
          if (visibleSettings(plugin).length)
            controls.push(iconButton("sliders", tr("Settings", "设置"), "ysrp-plugin-config", () => openPluginDialog(plugin)));
          controls.push(switchControl(isEnabled(plugin), (on) => setPluginEnabled(plugin.name, on), {
            disabled: plugin.required,
            dataset: { plugin: plugin.name },
            label: name
          }).el);
          return card({
            icon: plugin.icon,
            title: name,
            marks,
            controls,
            desc: pick(plugin.description),
            footer: plugin.authors.join(", "),
            cls: `ysrp-plugin${plugin.required ? " is-core" : ""}${failed ? " is-failed" : ""}${starred ? " is-starred" : ""}${pinned ? " is-pinned" : ""}`,
            dataset: { plugin: plugin.name }
          }).el;
        };
        const build = () => {
          mainGrid.replaceChildren();
          coreGrid.replaceChildren();
          cards.clear();
          const starred = starredPlugins();
          const pinned = pinnedPlugins();
          const byName = (a, b) => a.name.localeCompare(b.name);
          const pinRank = (p) => {
            const i = pinned.indexOf(p.name);
            return i < 0 ? Infinity : i;
          };
          const pinnedFirst = (a, b) => {
            const ra = pinRank(a);
            const rb = pinRank(b);
            if (ra !== rb)
              return ra === Infinity ? 1 : rb === Infinity ? -1 : ra - rb;
            return byName(a, b);
          };
          const favorites = lastCategory === "favorites";
          const inCategory = favorites ? plugins.filter((p) => starred.includes(p.name)) : plugins;
          bar.setPlaceholder(tr("Search {n} plugins...", "搜索 {n} 个插件...", { n: inCategory.length }));
          if (favorites) {
            for (const p of inCategory.slice().sort(pinnedFirst)) {
              const el = makeCard(p, true, pinned.includes(p.name));
              cards.set(p.name, el);
              mainGrid.appendChild(el);
            }
          } else {
            for (const p of plugins.filter((x) => !x.required).sort(pinnedFirst)) {
              const el = makeCard(p, starred.includes(p.name), pinned.includes(p.name));
              cards.set(p.name, el);
              mainGrid.appendChild(el);
            }
            for (const p of plugins.filter((x) => x.required).sort(byName)) {
              const el = makeCard(p, starred.includes(p.name), false);
              cards.set(p.name, el);
              coreGrid.appendChild(el);
            }
          }
          applyFilter();
        };
        const applyFilter = () => {
          const q = bar.query();
          const mode = bar.filter.value();
          let mainShown = 0;
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
              if (el.parentElement === coreGrid)
                coreShown++;
              else
                mainShown++;
            }
          }
          mainGrid.style.display = mainShown ? "" : "none";
          coreGrid.style.display = coreShown ? "" : "none";
          divider.style.display = mainShown && coreShown ? "" : "none";
          const none = !mainShown && !coreShown;
          empty.textContent = lastCategory === "favorites" && !cards.size ? tr("No favorites yet. Star a plugin to see it here.", "还没有收藏。点星标收藏插件。") : tr("No plugins match your search.", "没有符合条件的插件。");
          empty.style.display = none ? "" : "none";
        };
        const off = pluginsChanged.on(build);
        build();
        pane.appendChild(h("div", { class: "ysrp-pane-stack" }, cats.el, bar.el, container));
        return off;
      }
    };
  }

  // src/plugins/_core/settings/recordsTab.ts
  var showOriginal = new Map;
  var availability = new Map;
  var FINISHED_MARGIN_S2 = 5;
  var rowCount = 0;
  function recordsHeading() {
    return tr("Saved Videos - ({count})", "已保存视频 - ({count})", { count: rowCount });
  }
  function progressOf(videoId, record, liveProgress) {
    const raw = Number(liveProgress ?? (record ? record.videoProgress : 0));
    const seconds = Number.isFinite(raw) && raw > 0 ? raw : 0;
    let duration = Number(record ? record.videoDuration : 0);
    if (!(duration > 0) && videoId === urlVideoId())
      duration = currentDuration();
    return { seconds, duration: duration > 0 ? duration : 0 };
  }
  function progressText(videoId, record, liveProgress) {
    const { seconds, duration } = progressOf(videoId, record, liveProgress);
    if (duration > 0) {
      const pct = Math.min(100, Math.max(0, seconds / duration * 100)).toFixed(1);
      return tr("Watched {pct}% · {pos} / {dur}", "已看 {pct}% · {pos} / {dur}", { pct, pos: formatTime(Math.min(seconds, duration)), dur: formatTime(duration) });
    }
    return tr("Watched to {pos}", "已看到 {pos}", { pos: formatTime(seconds) });
  }
  function isFinished(videoId, record) {
    const { seconds, duration } = progressOf(videoId, record);
    if (!(duration > 0))
      return false;
    return duration - seconds < FINISHED_MARGIN_S2 || seconds / duration * 100 >= 99;
  }
  function savedText(record) {
    const ms = Number(record ? record.saveDate : NaN);
    if (!Number.isFinite(ms) || ms <= 0)
      return "";
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return tr("Saved {time}", "保存于 {time}", { time: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` });
  }
  function noteOf(record) {
    return record && typeof record.videoNote === "string" ? record.videoNote.trim() : "";
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

  class RecordCard {
    isCurrent;
    onDeleted;
    card;
    daBtn = null;
    dearrow = null;
    original = null;
    originalDone = false;
    loadingOriginal = false;
    disposers = [];
    record;
    constructor(entry, isCurrent, onDeleted) {
      this.isCurrent = isCurrent;
      this.onDeleted = onDeleted;
      this.videoId = entry.videoId;
      this.record = entry.record;
      this.card = card({
        icon: isCurrent ? "play" : "clock-rotate-left",
        title: "",
        cls: `ysrp-record${isCurrent ? " is-current" : ""}`,
        dataset: { videoId: entry.videoId }
      });
      this.card.titleEl.classList.add("ysrp-record-title");
      this.card.descEl.classList.add("ysrp-record-progress");
      this.initTitles();
      const ctx = {
        videoId: this.videoId,
        record: entry.record,
        url: watchUrl(this.videoId),
        isCurrent,
        title: () => this.currentTitle(),
        refresh: () => this.refresh()
      };
      for (const contribution of listRowButtons()) {
        try {
          const parts = contribution.create(ctx);
          if (!parts)
            continue;
          this.card.controlsEl.appendChild(parts.button);
          if (parts.dispose)
            this.disposers.push(parts.dispose);
        } catch (err) {
          console.error(`[Video Memory] Record control ${contribution.id} failed:`, err);
        }
      }
      this.card.controlsEl.appendChild(iconButton("trash-can", tr("Delete record", "删除记录"), "is-delete", () => {
        this.confirmDelete();
      }));
      this.refresh();
    }
    videoId;
    get el() {
      return this.card.el;
    }
    currentTitle() {
      return this.card.titleEl.textContent || UNKNOWN_TITLE;
    }
    refresh(liveProgress) {
      const rec = readRecord(this.videoId);
      if (rec)
        this.record = rec;
      this.updateProgress(liveProgress);
      const marks = [];
      if (this.isCurrent)
        marks.push(cardMark("circle-dot", tr("Now playing", "正在播放"), "is-now"));
      const note = noteOf(this.record);
      if (note)
        marks.push(cardMark("note-sticky", note.length > 80 ? `${note.slice(0, 80)}…` : note, "is-note-mark"));
      this.card.marksEl.replaceChildren(...marks);
    }
    updateProgress(liveProgress) {
      const rec = readRecord(this.videoId) || this.record;
      this.card.setDesc(progressText(this.videoId, rec, liveProgress));
      this.card.setFooter(savedText(rec));
    }
    matches(query, filter) {
      const rec = readRecord(this.videoId) || this.record;
      if (filter === "notes" && !noteOf(rec))
        return false;
      if (filter === "finished" && !isFinished(this.videoId, rec))
        return false;
      if (filter === "progress" && isFinished(this.videoId, rec))
        return false;
      if (!query)
        return true;
      const hay = [this.currentTitle(), this.original || "", this.dearrow || "", String(rec.videoName || ""), String(rec.originalTitle || ""), this.videoId, noteOf(rec)].join(`
`).toLowerCase();
      return hay.includes(query);
    }
    destroy() {
      for (const fn of this.disposers.splice(0)) {
        try {
          fn();
        } catch {}
      }
    }
    async confirmDelete() {
      const ok = await confirmDialog({
        title: tr("Delete record", "删除记录"),
        desc: tr("Delete saved progress for “{title}”? This cannot be undone.", "删除“{title}”的保存进度？此操作无法撤销。", { title: this.currentTitle() }),
        confirmLabel: tr("Delete", "删除"),
        danger: true
      });
      if (!ok)
        return;
      removeRecord(this.videoId, "delete");
      showOriginal.delete(this.videoId);
      this.destroy();
      this.card.el.remove();
      this.onDeleted(this);
    }
    initTitles() {
      const { videoId, record } = this;
      const storedOriginal = typeof record.originalTitle === "string" ? normalizeTitle(record.originalTitle) : "";
      this.original = storedOriginal || cachedOriginalTitle(videoId) || getSources(videoId).original || null;
      this.originalDone = Boolean(this.original);
      const avail = availability.get(videoId);
      if (avail && avail.state === "missing") {
        this.dearrow = null;
      } else {
        const fromName = normalizeTitle(record.videoName);
        const resolved = resolveTitle(videoId);
        const candidates = [
          getSources(videoId).dearrow,
          resolved.source === "dearrow" ? resolved.title : "",
          avail && avail.state === "available" ? avail.title : "",
          cachedDearrow(videoId) || "",
          !isPlaceholderTitle(fromName) && !sameTitle(fromName, this.original) ? fromName : ""
        ];
        this.dearrow = candidates.find((c) => c && !sameTitle(c, this.original)) || null;
        if (this.dearrow)
          availability.set(videoId, { state: "available", title: this.dearrow });
      }
      if (!(avail && avail.state === "missing"))
        this.ensureDearrowButton();
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
    ensureDearrowButton() {
      if (this.daBtn)
        return;
      this.daBtn = iconButton("wand-magic-sparkles", "", "is-dearrow ysrp-da", () => this.toggleDearrow());
      this.card.controlsEl.prepend(this.daBtn);
    }
    applyDearrow(title) {
      const clean = normalizeTitle(title);
      if (!clean || isPlaceholderTitle(clean) || sameTitle(clean, this.original))
        return;
      availability.set(this.videoId, { state: "available", title: clean });
      persistDearrow(this.videoId, clean);
      this.dearrow = clean;
      this.ensureDearrowButton();
      this.renderTitle();
    }
    markMissing() {
      if (this.dearrow)
        return;
      availability.set(this.videoId, { state: "missing" });
      this.daBtn?.remove();
      this.daBtn = null;
      showOriginal.delete(this.videoId);
      this.renderTitle();
    }
    showingOriginal() {
      return !this.dearrow || showOriginal.get(this.videoId) === true;
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
      this.card.setTitle(text);
      const btn = this.daBtn;
      if (!btn)
        return;
      const ready = Boolean(this.dearrow);
      btn.dataset.state = ready ? "ready" : "pending";
      btn.disabled = !ready;
      btn.dataset.loading = this.loadingOriginal ? "true" : "false";
      btn.classList.toggle("is-off", ready && this.showingOriginal());
      setIconButtonLabel(btn, !ready ? tr("Checking DeArrow title…", "正在检测 DeArrow 标题…") : this.showingOriginal() ? tr("Show DeArrow title", "恢复 DeArrow 标题") : tr("Show original title", "显示原标题"));
    }
    toggleDearrow() {
      if (!this.dearrow || this.loadingOriginal)
        return;
      if (this.showingOriginal()) {
        showOriginal.set(this.videoId, false);
        this.renderTitle();
        return;
      }
      showOriginal.set(this.videoId, true);
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
    grid;
    empty;
    search;
    cards = new Map;
    renderedCurrent = null;
    building = false;
    disposers = [];
    constructor(pane, setBusy) {
      this.setBusy = setBusy;
      this.search = searchBar("", [
        { value: "all", label: tr("All", "全部") },
        { value: "progress", label: tr("In progress", "未看完") },
        { value: "finished", label: tr("Finished", "已看完") },
        { value: "notes", label: tr("With notes", "有笔记") }
      ], () => this.applyFilter());
      this.search.input.classList.add("ysrp-records-search");
      this.search.filter.select.classList.add("ysrp-records-filter");
      this.grid = grid("ysrp-records");
      this.empty = emptyState("", "ysrp-records-empty");
      pane.appendChild(h("div", { class: "ysrp-pane-stack" }, this.search.el, this.grid, this.empty));
      const on = (type, fn) => {
        const wrapped = (ev) => {
          if (isSettingsOpen() && this.grid.isConnected)
            fn(ev);
        };
        document.addEventListener(type, wrapped);
        this.disposers.push(() => document.removeEventListener(type, wrapped));
      };
      on(EVT_RECORD_UPDATED, (ev) => {
        const id = ev.detail && ev.detail.videoId;
        if (!id)
          return;
        const c = this.cards.get(id);
        if (!c)
          return this.rebuild();
        const live = typeof ev.detail.videoProgress === "number" ? ev.detail.videoProgress : undefined;
        c.updateProgress(live);
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
        this.cards.get(videoId)?.applyDearrow(title);
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
      for (const c of this.cards.values())
        c.destroy();
      this.cards.clear();
    }
    rebuild() {
      if (this.building)
        return;
      this.building = true;
      this.setBusy(true);
      try {
        for (const c of this.cards.values())
          c.destroy();
        this.cards.clear();
        this.grid.replaceChildren();
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
            const c = new RecordCard(entry, entry.videoId === current, (removed) => this.onDeleted(removed));
            this.cards.set(entry.videoId, c);
            this.grid.appendChild(c.el);
          } catch (err) {
            console.error("[Video Memory] Failed to render saved video:", err);
          }
        }
        this.countChanged();
      } finally {
        this.building = false;
        this.setBusy(false);
      }
    }
    countChanged() {
      rowCount = this.cards.size;
      this.search.setPlaceholder(tr("Search {n} records...", "搜索 {n} 条记录...", { n: rowCount }));
      this.applyFilter();
      refreshSettingsHeader();
    }
    applyFilter() {
      const q = this.search.query();
      const filter = this.search.filter.value();
      let shown = 0;
      for (const c of this.cards.values()) {
        const ok = c.matches(q, filter);
        c.el.style.display = ok ? "" : "none";
        if (ok)
          shown++;
      }
      this.grid.style.display = shown ? "" : "none";
      this.empty.textContent = this.cards.size ? tr("No records match your search.", "没有符合条件的记录。") : tr("No saved videos yet.", "还没有保存的视频。");
      this.empty.style.display = shown ? "none" : "";
    }
    onDeleted(removed) {
      this.cards.delete(removed.videoId);
      this.countChanged();
    }
  }
  function createRecordsTab(setBusy) {
    let list = null;
    return {
      id: "records",
      group: "main",
      order: 10,
      icon: "clock-rotate-left",
      label: () => tr("Records", "记录"),
      heading: () => recordsHeading(),
      info: () => tr("Your saved videos: the one playing now comes first, then the most recently saved. Use the buttons on a card for the link, notes or deletion.", "已保存的视频：正在播放的排在最前，其余按保存时间从新到旧。用卡片上的按钮查看链接、编辑笔记或删除。"),
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
  function storedNote(videoId) {
    const rec = readRecord(videoId);
    return rec && typeof rec.videoNote === "string" ? rec.videoNote : "";
  }
  function openNoteDialog(ctx) {
    const area = textArea({ value: storedNote(ctx.videoId), placeholder: tr("Write a note…", "写点笔记…"), cls: "ysrp-note-input" });
    const cancel = button(tr("Cancel", "取消"), { variant: "secondary", cls: "ysrp-note-cancel" });
    const save = button(tr("Save", "保存"), { variant: "primary", cls: "ysrp-note-save" });
    const dlg = openDialog({
      title: tr("Notes", "笔记"),
      desc: ctx.title(),
      size: "md",
      cls: "ysrp-note-dialog",
      content: [area],
      footer: [cancel, save]
    });
    const doSave = () => {
      const next = area.value.trim();
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
      dlg.close();
      ctx.refresh();
    };
    cancel.addEventListener("click", () => dlg.close());
    save.addEventListener("click", doSave);
    area.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        doSave();
      }
    });
    requestAnimationFrame(() => {
      if (!area.isConnected)
        return;
      area.focus({ preventScroll: true });
      area.setSelectionRange(area.value.length, area.value.length);
    });
  }
  var noteContribution = {
    id: "note",
    order: 20,
    create(ctx) {
      const label = () => storedNote(ctx.videoId).trim() ? tr("Edit note", "编辑笔记") : tr("Add note", "添加笔记");
      const btn = iconButton("pen-to-square", label(), "is-note", () => openNoteDialog(ctx));
      btn.addEventListener("mouseenter", () => setIconButtonLabel(btn, label()));
      return { button: btn };
    }
  };
  function openLinkDialog(ctx) {
    const input = textInput({ value: ctx.url, cls: "ysrp-link-input" });
    input.readOnly = true;
    input.addEventListener("focus", () => input.select());
    const copyLabel = tr("Copy", "复制");
    const copy = button(copyLabel, { variant: "secondary", cls: "ysrp-link-copy" });
    const open = button(tr("Open in new tab", "在新标签打开"), { variant: "primary", cls: "ysrp-link-open" });
    let timer = 0;
    openDialog({
      title: tr("Video link", "视频链接"),
      desc: ctx.title(),
      size: "sm",
      cls: "ysrp-link-dialog",
      content: [input],
      footer: [copy, open],
      onClose: () => clearTimeout(timer)
    });
    copy.addEventListener("click", () => {
      copyText(ctx.url).then(() => {
        setButtonLabel(copy, tr("Copied", "已复制"));
      }).catch((err) => {
        console.warn("[Video Memory] Failed to copy text: ", err);
        setButtonLabel(copy, tr("Copy failed", "复制失败"));
      }).finally(() => {
        clearTimeout(timer);
        timer = window.setTimeout(() => setButtonLabel(copy, copyLabel), 1500);
      });
    });
    open.addEventListener("click", () => {
      window.open(ctx.url, "_blank", "noopener");
    });
  }
  var linkContribution = {
    id: "link",
    order: 30,
    create(ctx) {
      return { button: iconButton("link", tr("Video link", "视频链接"), "is-link", () => openLinkDialog(ctx)) };
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
  function scrollerFor(target, roots, dx, dy) {
    let el = target instanceof Element ? target : null;
    const root = el ? roots.find((r) => r.contains(el)) : undefined;
    if (!el || !root)
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
  function createScrollLock(getRoots, getKeyTarget) {
    let locked = false;
    let touchX = 0;
    let touchY = 0;
    const onWheel = (ev) => {
      if (!scrollerFor(ev.target, getRoots(), ev.deltaX, ev.deltaY))
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
      const t = ev.touches[0];
      if (!t)
        return;
      const dx = touchX - t.clientX;
      const dy = touchY - t.clientY;
      touchX = t.clientX;
      touchY = t.clientY;
      if (!scrollerFor(ev.target, getRoots(), dx, dy))
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
      if (!pane)
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
  function versionFooter() {
    const link = (href, text) => h("a", { class: "ysrp-version-link", href, target: "_blank", rel: "noopener noreferrer", text });
    const hash = COMMIT && COMMIT !== "dev" ? link(`${HOMEPAGE_URL}/commit/${COMMIT}`, `(${COMMIT})`) : h("span", { text: `(${COMMIT || "dev"})` });
    return h("div", { class: "ysrp-nav-footer" }, h("div", { class: "ysrp-version-line" }, link(HOMEPAGE_URL, "Video Memory"), ` • ${VERSION_SHORT} • `, hash), h("div", { class: "ysrp-version-line", text: `${IS_DEV_BUILD ? "Development" : "Production"} • Userscript` }));
  }

  class SettingsModal {
    backdrop = null;
    root = null;
    navGroups = null;
    headingEl = null;
    infoEl = null;
    badgeEl = null;
    spinnerEl = null;
    panesEl = null;
    panes = new Map;
    active = "records";
    opened = false;
    spinUntil = 0;
    spinTimer = 0;
    disposers = [];
    languageTimer = 0;
    scrollLock = createScrollLock(() => [this.root, ...dialogLayers()].filter((el) => Boolean(el)), () => {
      const layers = dialogLayers();
      const top = layers.length ? layers[layers.length - 1].querySelector(".ysrp-dialog") : null;
      return top || this.activePane();
    });
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
        if (!this.opened || ev.key !== "Escape" || hasDialogs())
          return;
        ev.preventDefault();
        ev.stopPropagation();
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
      closeAllDialogs();
      this.opened = false;
      this.backdrop?.classList.remove("is-open");
      this.root?.classList.remove("is-open");
      this.scrollLock.unlock();
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
      if (!this.headingEl || !this.badgeEl || !this.infoEl)
        return;
      const tab = getTab(this.active);
      const title = tab ? tab.heading ? tab.heading() : tab.label() : "";
      this.headingEl.textContent = title;
      this.headingEl.title = title;
      const info = tab && tab.info ? tab.info() : "";
      this.infoEl.replaceChildren(info ? infoHint(info) : "");
      this.infoEl.style.display = info ? "" : "none";
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
      const nav = h("nav", { class: "ysrp-nav", attrs: { "aria-label": tr("Settings sections", "设置分区") } }, this.navGroups, versionFooter());
      this.headingEl = h("h3", { class: "ysrp-heading" });
      this.infoEl = h("span", { class: "ysrp-header-info" });
      this.badgeEl = h("span", { class: "ysrp-badge" });
      this.spinnerEl = h("span", { class: "ysrp-refresh", title: tr("Refreshing…", "正在更新列表…") }, icon("arrows-rotate", "fa-spin"));
      const closeBtn = button("", { variant: "tertiary", cls: "is-square ysrp-close", title: tr("Close", "关闭") });
      closeBtn.replaceChildren(icon("xmark"));
      closeBtn.setAttribute("aria-label", tr("Close", "关闭"));
      closeBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.close();
      });
      const header = h("div", { class: "ysrp-header" }, h("div", { class: "ysrp-header-left" }, this.headingEl, this.infoEl, this.badgeEl, this.spinnerEl), closeBtn);
      this.panesEl = h("div", { class: `ysrp-panes ${CLS_MODAL_BODY}` });
      const main = h("div", { class: "ysrp-main" }, header, this.panesEl);
      const root = h("div", { class: `ysrp-ui ${CLS_MODAL}`, attrs: { role: "dialog", "aria-modal": "true" } }, nav, main);
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
    return mode === "gm" ? tr("GM storage", "GM 存储") : tr("Browser storage", "浏览器本地存储");
  }
  function modeHint(mode) {
    if (mode === "gm") {
      return gmAvailable ? tr("Tampermonkey-backed storage that can sync across profiles.", "由 Tampermonkey 提供、可在配置间同步的存储。") : tr("GM storage is not available in this userscript manager.", "当前脚本管理器不提供 GM 存储。");
    }
    return tr("Fast storage scoped to this browser profile.", "快速、仅在本浏览器配置中可用的存储。");
  }
  function createStorageTab() {
    return {
      id: "storage",
      group: "main",
      order: 20,
      icon: "database",
      label: () => tr("Storage", "存储"),
      info: () => tr("Choose where progress is stored, and back it up or restore it as JSON.", "选择进度的存储位置，并以 JSON 备份或恢复记录。"),
      storageBadge: true,
      render(pane) {
        const backendMsg = messageLine("ysrp-backend-msg");
        const mode = selectControl([
          { value: "local", label: tr("Browser storage", "浏览器本地存储") },
          { value: "gm", label: tr("GM storage", "GM 存储"), disabled: !gmAvailable }
        ], getMode(), (value) => {
          backendMsg.set("");
          const desc = modeHint(value === "gm" ? "gm" : "local");
          setRowDesc(locationRow, gmAvailable ? desc : `${desc} ${modeHint("gm")}`.trim());
        }, { cls: "ysrp-storage-mode", label: tr("Storage location", "存储位置") });
        const locationRow = settingsRow({ title: tr("Storage location", "存储位置"), desc: modeHint(getMode()), control: mode.el });
        if (!gmAvailable)
          setRowDesc(locationRow, `${modeHint(getMode())} ${modeHint("gm")}`);
        const applyLabel = tr("Apply & migrate", "应用并迁移");
        const applyBtn = button(applyLabel, { variant: "primary", cls: "ysrp-apply-migrate", title: tr("Switch storage backend and migrate data.", "切换存储方式并迁移数据。") });
        applyBtn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          const target = mode.value() === "gm" ? "gm" : "local";
          const from = getMode();
          if (target === from) {
            backendMsg.set(tr("Already using {mode}.", "当前已在使用{mode}。", { mode: modeName(from) }));
            return;
          }
          const count = countRecords();
          const ok = await confirmDialog({
            title: tr("Migrate records", "迁移记录"),
            desc: tr("Move {count} record(s) from {from} to {to}? They are removed from {from} after every record has been copied and verified.", "将把 {count} 条记录从{from}移动到{to}。全部复制并校验成功后，才会从{from}中删除。", { count, from: modeName(from), to: modeName(target) }),
            confirmLabel: tr("Migrate", "迁移")
          });
          if (!ok)
            return;
          applyBtn.disabled = true;
          setButtonLabel(applyBtn, tr("Migrating...", "正在迁移..."));
          try {
            const result = switchMode(target, { migrate: true, clearSource: true });
            if (result.ok) {
              backendMsg.set(tr("Moved {count} record(s) to {mode}.", "已将 {count} 条记录迁移到{mode}。", { count: result.moved, mode: modeName(target) }), "success");
            } else {
              mode.set(getMode());
              backendMsg.set(tr("Migration failed: {message}", "迁移失败：{message}", { message: result.error || "" }), "error");
            }
          } catch (err) {
            console.error("[Video Memory] Failed to switch storage:", err);
            mode.set(getMode());
            backendMsg.set(tr("Migration failed: {message}", "迁移失败：{message}", { message: errorMessage(err) }), "error");
          }
          setRowDesc(locationRow, modeHint(getMode()));
          refreshSettingsHeader();
          window.setTimeout(() => {
            applyBtn.disabled = false;
            setButtonLabel(applyBtn, applyLabel);
          }, 500);
        });
        locationRow.below.style.display = "";
        locationRow.below.append(h("div", { class: "ysrp-note", text: tr("Applying moves every saved record to the selected backend; the old copy is deleted only after all records were verified.", "应用后会把全部记录移动到所选后端；所有记录校验成功后才删除原来的副本。") }), actions(applyBtn), backendMsg.el);
        const exportMsg = messageLine("ysrp-export-msg");
        const exportJson = () => JSON.stringify(exportData(), null, 2);
        const copyBtn = button(tr("Copy JSON", "复制 JSON"), { variant: "secondary", cls: "ysrp-copy-json" });
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
        const downloadBtn = button(tr("Download JSON", "下载 JSON"), { variant: "primary", cls: "ysrp-download-json" });
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
                const errName = err?.name;
                if (errName === "AbortError" || errName === "NotAllowedError") {
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
        const exportRow = settingsRow({
          title: tr("Export data", "导出数据"),
          desc: tr("Exports all saved records from the current backend as JSON.", "把当前存储后端中的所有记录导出为 JSON。"),
          below: [actions(copyBtn, downloadBtn), exportMsg.el]
        });
        const importMsg = messageLine("ysrp-import-msg");
        const overwrite = switchControl(false, () => importMsg.set(""), { cls: "ysrp-overwrite", label: tr("Overwrite existing records", "覆盖现有记录") });
        const textarea = textArea({ placeholder: tr("Paste exported JSON here...", "在此粘贴导出的 JSON..."), cls: "ysrp-import-text" });
        const runImport = async (text) => {
          let payload;
          try {
            payload = JSON.parse(text);
          } catch (err) {
            importMsg.set(tr("Import failed: {message}", "导入失败：{message}", { message: errorMessage(err) }), "error");
            return;
          }
          if (overwrite.value()) {
            const ok = await confirmDialog({
              title: tr("Overwrite records", "覆盖导入"),
              desc: tr("All {count} record(s) in {mode} are deleted before importing. This cannot be undone.", "导入前会先清空{mode}中的全部 {count} 条记录。此操作无法撤销。", { count: countRecords(), mode: modeName(getMode()) }),
              confirmLabel: tr("Overwrite", "覆盖导入"),
              danger: true
            });
            if (!ok)
              return;
          }
          try {
            const count = importData(payload, { overwrite: overwrite.value() });
            importMsg.set(tr("Imported {count} record(s).", "已导入 {count} 条记录。", { count }), "success");
            refreshSettingsHeader();
          } catch (err) {
            console.warn("[Video Memory] Import failed:", err);
            importMsg.set(tr("Import failed: {message}", "导入失败：{message}", { message: errorMessage(err) }), "error");
          }
        };
        const importBtn = button(tr("Import from text", "从文本导入"), { variant: "primary", cls: "ysrp-import-btn" });
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
        const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "ysrp-file-input", tabIndex: -1 });
        const chooseBtn = button(tr("Choose file", "选择文件"), { variant: "secondary", cls: "ysrp-choose-file", title: tr("Select an export JSON file", "选择要导入的 JSON 文件") });
        chooseBtn.addEventListener("click", (ev) => {
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
          file.text().then(async (text) => {
            textarea.value = text || "";
            await runImport(text || "");
          }).catch((err) => {
            importMsg.set(tr("Could not read the file: {message}", "无法读取文件：{message}", { message: errorMessage(err) }), "error");
          }).finally(() => {
            fileInput.value = "";
            fileName.textContent = noFile;
          });
        });
        const overwriteRow = settingsRow({
          title: tr("Overwrite existing records", "覆盖现有记录"),
          desc: tr("Deletes every record of the current backend before importing.", "导入前先删除当前存储后端中的全部记录。"),
          control: overwrite.el
        });
        const importRow = settingsRow({
          title: tr("Import data", "导入数据"),
          desc: tr("Imports records into the current backend.", "把记录导入到当前存储后端。"),
          below: [textarea, actions(importBtn, chooseBtn, fileName, fileInput), importMsg.el]
        });
        pane.appendChild(h("div", { class: "ysrp-groups" }, group(tr("Storage backend", "存储后端"), locationRow.el), group(tr("Export", "导出"), exportRow.el), group(tr("Import", "导入"), overwriteRow.el, importRow.el)));
      },
      onShow() {
        refreshSettingsHeader();
      }
    };
  }

  // src/plugins/_core/settings/style.css
  var style_default2 = `/* Settings modal shell (N-5.3) and tab layouts. Parts (cards, rows, dialogs…) are in src/api/ui.css.
   All sizes in px: YouTube sets html { font-size: 10px }. */

.ysrp-backdrop {
  position: fixed;
  inset: 0;
  background: var(--ysrp-overlay);
  z-index: 9998;
  display: none;
}
.ysrp-backdrop.is-open { display: block; }

.ysrp-settings-container {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 0;
  z-index: 9999;
  width: min(896px, calc(100vw - 32px));
  height: min(640px, calc(100vh - 32px));
  display: none;
  flex-direction: row;
  overflow: hidden;
  background: var(--ysrp-surface-base);
  color: var(--ysrp-fg-primary);
  border: 1px solid var(--ysrp-border-l1);
  border-radius: 16px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, .28);
}
.ysrp-settings-container.is-open { display: flex; }

/* ---------------------------------------------------------------- N-5.3.5 navigation */
.ysrp-nav {
  position: relative;
  flex: 0 0 224px;
  width: 224px;
  display: flex;
  flex-direction: column;
  padding: 12px 12px 56px;
  background: var(--ysrp-surface-base);
  border-right: 1px solid var(--ysrp-border-l1);
  overflow-y: auto;
}
.ysrp-nav-groups { display: flex; flex-direction: column; gap: 8px; }
.ysrp-nav-group { display: flex; flex-direction: column; gap: 2px; }
.ysrp-nav-title {
  padding: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  color: var(--ysrp-fg-tertiary);
}
.ysrp-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  margin: 0;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ysrp-fg-secondary);
  font-family: var(--ysrp-font);
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms, color 150ms;
}
.ysrp-tab:hover { background: var(--ysrp-surface-l2); }
.ysrp-tab.is-active { background: var(--ysrp-surface-l2); color: var(--ysrp-fg-primary); font-weight: 500; }
.ysrp-tab-icon { display: inline-flex; justify-content: center; flex: 0 0 16px; width: 16px; font-size: 16px; }
.ysrp-tab-icon i { font-size: 16px; }
.ysrp-tab-label { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ysrp-tab:focus-visible { outline: 2px solid var(--ysrp-border-l2); outline-offset: -2px; }
.ysrp-nav-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 12px;
  opacity: .3;
  font-size: 10px;
  line-height: 16px;
  color: var(--ysrp-fg-secondary);
  user-select: text;
  -webkit-user-select: text;
}
.ysrp-version-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ysrp-version-link { color: inherit; text-decoration: none; }
.ysrp-version-link:hover { text-decoration: underline; }

/* ---------------------------------------------------------------- N-5.3.6 right column */
.ysrp-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 20px 20px 16px;
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
  font-family: var(--ysrp-font);
  font-size: 18px;
  font-weight: 600;
  line-height: 28px;
  color: var(--ysrp-fg-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ysrp-header-info { display: inline-flex; align-items: center; }
.ysrp-badge {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 16px;
  color: var(--ysrp-fg-secondary);
  border: 1px solid var(--ysrp-border-l1);
  border-radius: 6px;
  padding: 2px 6px;
  white-space: nowrap;
}
.ysrp-refresh { display: none; font-size: 14px; color: var(--ysrp-fg-tertiary); }
.ysrp-refresh.is-active { display: inline-flex; }
.ysrp-close { flex: 0 0 auto; width: 32px; height: 32px; }
.ysrp-close i { font-size: 16px; }

/* N-5.2.16 scroll area: extends 20px to each side with the same padding, scrollbar at the edge */
.ysrp-panes { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ysrp-pane {
  display: none;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0 -20px;
  padding: 0 20px 4px;
}
.ysrp-pane.is-active { display: block; }
.ysrp-pane-stack { display: flex; flex-direction: column; gap: 16px; }

/* ---------------------------------------------------------------- records tab (N-5.4) */
.ysrp-record .ysrp-card-desc { -webkit-line-clamp: 2; }
.ysrp-record-title { cursor: default; }
.ysrp-link-input { cursor: text; }
.ysrp-transcript-dialog .ysrp-dialog-body { min-height: 0; }
.ysrp-transcript-text { flex: 1 1 auto; min-height: 200px; }
.ysrp-transcript-status { font-size: 13px; line-height: 20px; color: var(--ysrp-fg-secondary); }
.ysrp-transcript-status.is-error { color: var(--ysrp-fg-danger); }
.ysrp-transcript-status.is-success { color: var(--ysrp-fg-success); }

/* ---------------------------------------------------------------- plugins tab (N-5.5) */
.ysrp-plugin.is-core { opacity: .4; }
.ysrp-plugin.is-core:hover { opacity: .7; }
.ysrp-plugin.is-failed { opacity: .5; border-color: var(--ysrp-danger-border); }
.ysrp-core-sep { margin: 4px 0; }
.ysrp-plugin-settings { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; min-height: 0; }

/* ---------------------------------------------------------------- storage tab (N-5.7.1) */
.ysrp-file-name { font-size: 12px; color: var(--ysrp-fg-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
.ysrp-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.ysrp-steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; line-height: 1.5; color: var(--ysrp-fg-secondary); }
.ysrp-steps a { color: var(--ysrp-fg-primary); }
.ysrp-info-lines { display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 16px; color: var(--ysrp-fg-secondary); }

/* ---------------------------------------------------------------- N-5.3.7 narrow screens */
@media (max-width: 640px) {
  .ysrp-settings-container.is-open { flex-direction: column; }
  .ysrp-nav {
    flex: 0 0 auto;
    width: auto;
    padding: 8px 12px;
    border-right: none;
    border-bottom: 1px solid var(--ysrp-border-l1);
    overflow-x: auto;
    overflow-y: hidden;
  }
  .ysrp-nav-groups, .ysrp-nav-group { flex-direction: row; }
  .ysrp-nav-title, .ysrp-nav-footer { display: none; }
  .ysrp-tab { width: auto; flex: 0 0 auto; }
  .ysrp-main { padding: 16px 16px 12px; }
  .ysrp-pane { margin: 0 -16px; padding: 0 16px 4px; }
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
      ctx.addTab(createPluginsTab());
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
        info: () => tr("Sync every video record to a folder in your own Google Drive.", "把每个视频的记录同步到你自己的 Google Drive 文件夹。"),
        render(pane) {
          const creds = readCredentials();
          const clientId = textInput({ value: creds.clientId, placeholder: "xxxx.apps.googleusercontent.com", field: "clientId" });
          const clientSecret = textInput({ type: "password", value: creds.clientSecret, field: "clientSecret" });
          const refreshToken = textInput({ type: "password", value: creds.refreshToken, field: "refreshToken" });
          const status = messageLine("ysrp-drive-status");
          const result = messageLine("ysrp-drive-result");
          status.el.classList.add("is-visible");
          const renderStatus = (s) => {
            const { text, tone } = statusText(sync, s);
            status.set(text, tone);
            status.el.classList.add("is-visible");
          };
          statusListeners.add(renderStatus);
          renderStatus(sync.status);
          const saveBtn = button(tr("Save & verify", "保存并验证"), { variant: "primary", cls: "ysrp-drive-save" });
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
          const uploadAll = button(tr("Upload all", "全部上传"), { variant: "secondary", cls: "ysrp-drive-upload-all" });
          uploadAll.addEventListener("click", (ev) => {
            ev.preventDefault();
            if (!sync.configured()) {
              result.set(tr("Please save valid credentials first.", "请先保存有效的凭据。"), "error");
              return;
            }
            result.set("");
            sync.uploadAll();
          });
          pane.appendChild(h("div", { class: "ysrp-groups" }, group("Google Drive", h("div", { class: "ysrp-note", text: tr('Each video is stored as "<title>｜<id>.json" in the "[Youtube] Video Memory" folder of your Drive.', "每个视频以“<标题>｜<id>.json”保存在你的云端硬盘“[Youtube] Video Memory”文件夹中。") }), settingsRow({ title: tr("Client ID", "客户端 ID"), below: [clientId] }).el, settingsRow({ title: tr("Client secret", "客户端密钥"), below: [secretInput(clientSecret)] }).el, settingsRow({ title: "Refresh token", below: [secretInput(refreshToken)] }).el, actions(saveBtn, uploadAll), status.el, result.el), group(tr("Getting credentials", "如何获取凭据"), h("ol", { class: "ysrp-steps" }, h("li", { text: tr('In Google Cloud Console create a project and an OAuth client (type "Web application"); add https://developers.google.com/oauthplayground as a redirect URI.', "在 Google Cloud Console 新建项目和 OAuth 客户端（类型“Web 应用”），把 https://developers.google.com/oauthplayground 加为重定向 URI。") }), h("li", { text: tr("Enable the Google Drive API for the project.", "为该项目启用 Google Drive API。") }), h("li", { text: tr('Open the OAuth 2.0 Playground, tick "Use your own OAuth credentials", authorise the https://www.googleapis.com/auth/drive scope and exchange the code for a refresh token.', "打开 OAuth 2.0 Playground，勾选“Use your own OAuth credentials”，授权 https://www.googleapis.com/auth/drive 范围，然后用授权码换取 refresh token。") }), h("li", {}, tr("Paste the three values above and click “Save & verify”. More: ", "把三项填到上面并点“保存并验证”。更多说明："), h("a", { href: HOMEPAGE_URL, target: "_blank", rel: "noopener noreferrer", text: HOMEPAGE_URL }))))));
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
    const endpoint = textInput({ value: settings.endpoint, placeholder: "https://example.com/v1/chat/completions", field: "endpoint" });
    const model = textInput({ value: settings.model, placeholder: "transcript", field: "model" });
    const apiKey = textInput({ type: "password", value: settings.apiKey, placeholder: "sk-***", field: "apiKey" });
    const minutes = Math.min(60, Math.max(1, timeoutMinutes(settings.timeoutMs)));
    const timeout = textInput({ type: "number", value: String(minutes), placeholder: "10", cls: "is-number", field: "timeout" });
    timeout.min = "1";
    timeout.max = "60";
    timeout.step = "1";
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
    const titleValue = h("span", { class: "ysrp-transcript-video-title" });
    const idValue = h("span", { class: "ysrp-mono" });
    const idLine = h("div", {}, tr("Video ID: ", "视频 ID："), idValue);
    const update = (status) => {
      const id = status && status.videoId || urlVideoId();
      if (!id) {
        titleValue.textContent = tr("No active video detected", "未检测到可用的影片");
        idLine.style.display = "none";
        return;
      }
      titleValue.textContent = status && status.videoId === id && !status.isLoading ? status.title : status && status.videoId === id ? tr("Loading title…", "正在获取标题…") : UNKNOWN_TITLE;
      idValue.textContent = id;
      idLine.style.display = "";
    };
    update(currentStatus());
    const onStatus = (ev) => update(ev.detail || null);
    document.addEventListener(EVT_VIDEO_STATUS, onStatus);
    pane.appendChild(h("div", { class: "ysrp-groups" }, group(tr("Endpoint", "接口"), settingsRow({ title: tr("API endpoint", "接口地址"), desc: tr("OpenAI-compatible chat/completions URL; a bare host gets the path added.", "兼容 OpenAI 的 chat/completions 地址；只填域名时自动补全路径。"), below: [endpoint] }).el, settingsRow({ title: tr("Model", "模型"), below: [model] }).el, settingsRow({ title: tr("API key", "API 密钥"), desc: tr("Leave empty to send no key.", "留空则不发送密钥。"), below: [secretInput(apiKey)] }).el, settingsRow({ title: tr("Timeout (minutes)", "超时（分钟）"), desc: tr("1–60 minutes.", "1–60 分钟。"), control: timeout }).el), group(tr("Current video", "当前视频"), h("div", { class: "ysrp-info-lines" }, h("div", {}, tr("Title: ", "标题："), titleValue), idLine), h("div", { class: "ysrp-note", text: tr("Fetch transcripts from the cards in the Records tab.", "在“记录”标签的卡片上获取字幕。") }))));
    return () => {
      document.removeEventListener(EVT_VIDEO_STATUS, onStatus);
      if (timer) {
        clearTimeout(timer);
        save();
      }
    };
  }
  function openTranscriptDialog(ctx) {
    const status = h("div", { class: "ysrp-transcript-status", attrs: { role: "status", "aria-live": "polite" } });
    const area = textArea({ readOnly: true, placeholder: tr("Transcript will appear here…", "字幕内容加载后会显示在这里…"), cls: "ysrp-transcript-text" });
    const refresh = button(tr("Refresh", "刷新"), { variant: "secondary", cls: "ysrp-transcript-refresh" });
    const copy = button(tr("Copy", "复制"), { variant: "primary", cls: "ysrp-transcript-copy" });
    copy.disabled = true;
    let loaded = false;
    let busy = false;
    const dlg = openDialog({
      title: tr("Transcript", "字幕"),
      desc: ctx.title(),
      size: "lg",
      cls: "ysrp-transcript-dialog",
      content: [status, area],
      footer: [refresh, copy]
    });
    const setStatus = (text, tone = "neutral") => {
      status.textContent = text;
      status.classList.toggle("is-error", tone === "error");
      status.classList.toggle("is-success", tone === "success");
    };
    const show = (text) => {
      area.value = text;
      copy.disabled = !text.trim();
      area.style.opacity = text.trim() ? "1" : "0.7";
    };
    const load = (force) => {
      if (busy)
        return;
      busy = true;
      refresh.disabled = true;
      setStatus(loaded ? tr("Refreshing…", "正在重新获取…") : tr("Loading…", "正在获取…"));
      fetchTranscript(ctx.videoId, { force, videoUrl: ctx.url }).then((text) => {
        if (!dlg.isOpen())
          return;
        show(text);
        loaded = true;
        setStatus(tr("Updated ({time})", "已更新（{time}）", { time: new Date().toLocaleTimeString() }), "success");
      }).catch((err) => {
        if (dlg.isOpen())
          setStatus(tr("Failed: {message}", "获取失败：{message}", { message: errorMessage(err) }), "error");
      }).finally(() => {
        busy = false;
        refresh.disabled = false;
      });
    };
    refresh.addEventListener("click", () => load(true));
    copy.addEventListener("click", () => {
      const text = area.value.trim();
      if (!text) {
        setStatus(tr("No transcript content to copy.", "暂无字幕内容可复制。"));
        return;
      }
      copyText(text).then(() => setStatus(tr("Copied.", "已复制。"), "success")).catch((err) => setStatus(tr("Copy failed: {message}", "复制失败：{message}", { message: errorMessage(err) }), "error"));
    });
    const cached = cachedTranscript(ctx.videoId);
    if (cached) {
      show(cached);
      loaded = true;
      setStatus(tr("Loaded from cache.", "来自缓存。"));
    } else {
      show("");
      load(false);
    }
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
        info: () => tr("Configure the OpenAI-compatible endpoint used for transcripts. Fetching lives on the record cards.", "配置字幕接口（兼容 OpenAI）。字幕获取在记录卡片上。"),
        render: renderTab
      });
      ctx.addRowButton({
        id: "transcript",
        order: 10,
        create: (rowCtx) => ({ button: iconButton("closed-captioning", tr("Transcript", "字幕"), "is-transcript", () => openTranscriptDialog(rowCtx)) })
      });
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
    addStyle(ui_default, "ysrp-ui");
    startPlugins(plugins);
  }
  bootstrap();
})();
