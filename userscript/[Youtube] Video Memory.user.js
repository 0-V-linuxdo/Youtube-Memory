// ==UserScript==
// @name         [Youtube] Video Memory [20261010] v2.1.0
// @namespace    0_V userscripts/Youtube Save & Resume Progress
// @description  Save & resume YouTube playback progress: per-video sessions that survive in-site navigation, ads, slow loads and multiple tabs. Records list with DeArrow titles, notes and transcripts; localStorage / GM storage with import & export; plugins for a badge toggle and Google Drive sync; Chinese / English UI.
// @version      [20261010] v2.1.0
// @update-log   [20261010] v2.1.0 · Rebuilt on a plugin architecture (after void++): TypeScript sources, a Plugins tab, the 💾 badge toggle built in, and Google Drive sync back as a plugin.
// @author       0_V
// @license      MIT
// @homepageURL  https://github.com/0-V-linuxdo/Youtube-Memory
// @supportURL   https://github.com/0-V-linuxdo/Youtube-Memory/issues
// @match        *://*.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      oauth2.googleapis.com
// @connect      www.googleapis.com
// @icon         https://github.com/0-V-linuxdo/Youtube-Memory/raw/refs/heads/main/main_icon/main_icon.svg
// ==/UserScript==

/**
 * [Youtube] Video Memory [20261010] v2.1.0
 * (c) 2025 0-V-linuxdo · MIT License
 * Source: https://github.com/0-V-linuxdo/Youtube-Memory (src/, built with `bun run build`)
 * Behaviour spec: docs/functional-spec.md
 */
(() => {
  // src/api/RecordActions.ts
  var actions = new Map;
  var listeners = new Set;
  var version = 0;
  function addRecordAction(action) {
    actions.set(action.id, action);
    version++;
    for (const listener of listeners)
      listener();
  }
  function removeRecordAction(id) {
    if (!actions.delete(id))
      return;
    version++;
    for (const listener of listeners)
      listener();
  }
  function getRecordActions() {
    return [...actions.values()].sort((a, b) => a.order - b.order);
  }
  function onRecordActionsChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  // src/utils/Logger.ts
  class Logger {
    name;
    constructor(name) {
      this.name = name;
    }
    prefix() {
      return `[Video Memory] ${this.name}:`;
    }
    info(...args) {
      console.info(this.prefix(), ...args);
    }
    warn(...args) {
      console.warn(this.prefix(), ...args);
    }
    error(...args) {
      console.error(this.prefix(), ...args);
    }
  }

  // src/api/RestoreHooks.ts
  var logger = new Logger("RestoreHooks");
  var hooks = new Map;
  function addRestoreHook(owner, hook) {
    hooks.set(owner, hook);
  }
  function removeRestoreHook(owner) {
    hooks.delete(owner);
  }
  function runRestoreHooks(videoId) {
    const pending = [];
    for (const [owner, hook] of hooks) {
      try {
        const result = hook(videoId);
        if (result)
          pending.push(result.catch((err) => logger.warn(`${owner} failed`, err)));
      } catch (err) {
        logger.warn(`${owner} failed`, err);
      }
    }
    return pending;
  }

  // src/utils/constants.ts
  var RECORD_PREFIX = "Youtube_SaveResume_Progress-";
  var KEY_STORAGE_MODE = "YSRP_StorageMode";
  var KEY_TRANSCRIPT = "YSRP_TranscriptSettings";
  var KEY_LANGUAGE = "YSRP_LanguagePreference";
  var KEY_PLUGINS = "YSRP_Plugins";
  var KEY_DRIVE = "YSRP_DriveSettings";
  var KEY_DRIVE_FULL_SYNC = "YSRP_DriveFullSyncDone";
  var UNKNOWN_TITLE = "Unknown Title";
  var PLACEHOLDER_TITLES = new Set(["unknown title", "正在获取标题…"]);
  var EVT_RECORD = "ysrp-record-updated";
  var EVT_VIDEO = "ysrp-current-video-status";
  var EVT_TITLE = "ysrp-dearrow-title-ready";
  var EVT_LANG = "ysrp-language-changed";
  var EVT_DRIVE_STATUS = "ysrp-drive-sync-status";
  var TICK_MS = 500;
  var SAVE_THROTTLE_MS = 1500;
  var MIN_SAVE_DELTA = 0.5;
  var MIN_RESTORE_POSITION = 1;
  var END_GUARD_SECONDS = 5;
  var RESTORE_TOLERANCE = 3;
  var RESTORE_MAX_ATTEMPTS = 8;
  var RESTORE_TIMEOUT_MS = 15000;
  var RESTORE_RETRY_MS = 1200;
  var RESUMED_NOTICE_MS = 3000;
  var BEFORE_RESTORE_TIMEOUT_MS = 4000;
  var FONT_AWESOME_CSS = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
  var DEARROW_API = "https://sponsor.ajay.app/api/branding?videoID=";
  var OEMBED_API = "https://www.youtube.com/oembed?format=json&url=";
  var DEARROW_TTL_MS = 6 * 60 * 60 * 1000;
  var Devs = {
    V: "0_V"
  };

  // src/utils/storage.ts
  var hasGM = typeof GM_getValue === "function" && typeof GM_setValue === "function" && typeof GM_deleteValue === "function" && typeof GM_listValues === "function";
  function readSetting(key) {
    let value = null;
    try {
      value = window.localStorage.getItem(key);
    } catch {}
    if ((value === null || value === "") && hasGM) {
      try {
        value = GM_getValue(key, null);
      } catch {}
    }
    if (value === undefined || value === null)
      return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  function writeSetting(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
    if (hasGM) {
      try {
        GM_setValue(key, value);
      } catch {}
    }
  }
  function readJsonSetting(key) {
    const raw = readSetting(key);
    if (!raw)
      return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  function readSecret(key) {
    if (hasGM) {
      try {
        const value = GM_getValue(key, null);
        if (value !== null && value !== undefined && value !== "")
          return typeof value === "string" ? value : JSON.stringify(value);
      } catch {}
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function writeSecret(key, value) {
    if (hasGM) {
      try {
        GM_setValue(key, value);
        return;
      } catch {}
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  }

  // src/utils/types.ts
  function definePlugin(p) {
    return p;
  }

  // src/api/Settings.ts
  function load() {
    const stored = readJsonSetting(KEY_PLUGINS);
    const plugins = stored?.plugins && typeof stored.plugins === "object" ? stored.plugins : {};
    return { plugins };
  }
  var data = load();
  var listeners2 = new Set;
  function save() {
    writeSetting(KEY_PLUGINS, JSON.stringify(data));
  }
  function getPluginSettings(name) {
    return data.plugins[name];
  }
  function setPluginSetting(name, key, value) {
    const bag = data.plugins[name] ??= {};
    if (bag[key] === value)
      return;
    bag[key] = value;
    save();
    for (const listener of listeners2)
      listener(name, key);
  }
  function onPluginSettingChange(listener) {
    listeners2.add(listener);
    return () => listeners2.delete(listener);
  }
  function defaultValue(def) {
    if (def.type === 3 /* SELECT */)
      return (def.options.find((o) => o.default) ?? def.options[0])?.value;
    if ("default" in def && def.default !== undefined)
      return def.default;
    return def.type === 2 /* BOOLEAN */ ? false : def.type === 1 /* NUMBER */ ? 0 : "";
  }
  function definePluginSettings(def) {
    const settings = {
      def,
      pluginName: "",
      store: new Proxy({}, {
        get(_, key) {
          const stored = data.plugins[settings.pluginName]?.[key];
          return stored !== undefined ? stored : def[key] ? defaultValue(def[key]) : undefined;
        },
        set(_, key, value) {
          setPluginSetting(settings.pluginName, key, value);
          return true;
        }
      })
    };
    return settings;
  }

  // src/api/SettingsTabs.ts
  var tabs = new Map;
  var listeners3 = new Set;
  function addSettingsTab(tab) {
    tabs.set(tab.id, tab);
    for (const listener of listeners3)
      listener();
  }
  function removeSettingsTab(id) {
    if (!tabs.delete(id))
      return;
    for (const listener of listeners3)
      listener();
  }
  function getSettingsTabs() {
    return [...tabs.values()].sort((a, b) => a.order - b.order);
  }
  function onSettingsTabsChange(listener) {
    listeners3.add(listener);
    return () => listeners3.delete(listener);
  }

  // src/utils/misc.ts
  function emit(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch {}
  }
  function on(name, handler) {
    const listener = (event) => handler(event.detail);
    document.addEventListener(name, listener);
    return () => document.removeEventListener(name, listener);
  }
  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const ss = String(total % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  }
  var normTitle = (text) => String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  var sameTitle = (a, b) => Boolean(a) && Boolean(b) && normTitle(a).toLowerCase() === normTitle(b).toLowerCase();
  var isPlaceholderTitle = (text) => !normTitle(text) || PLACEHOLDER_TITLES.has(normTitle(text).toLowerCase());
  var errorMessage = (err) => err instanceof Error ? err.message : String(err);
  var runtime = (() => {
    const ua = String(navigator.userAgent || "").toLowerCase();
    const isIOS = /\b(ipad|iphone|ipod)\b/.test(ua) || ua.includes("mac") && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
    let canShareFile = false;
    if (isIOS && typeof File === "function" && typeof navigator.share === "function") {
      canShareFile = true;
      if (typeof navigator.canShare === "function") {
        try {
          canShareFile = navigator.canShare({ files: [new File(["{}"], "probe.json", { type: "application/json" })] });
        } catch {
          canShareFile = false;
        }
      }
    }
    return { isIOS, canShareFile };
  })();

  // src/utils/i18n.ts
  function detectBrowserLanguage() {
    const candidates = [].concat(navigator.languages || [], navigator.language || []).filter(Boolean);
    return candidates.length && String(candidates[0]).toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  function normalizeLanguagePreference(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.startsWith("zh"))
      return "zh";
    if (raw.startsWith("en"))
      return "en";
    return "auto";
  }
  var preference = normalizeLanguagePreference(readSetting(KEY_LANGUAGE));
  var languagePreference = () => preference;
  var resolvedLanguage = () => preference === "auto" ? detectBrowserLanguage() : preference;
  function t(en, zh, params) {
    let text = resolvedLanguage() === "zh" ? zh : en;
    if (params) {
      text = text.replace(/\{(\w+)\}/g, (_, key) => Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : "");
    }
    return text;
  }
  function setLanguagePreference(value) {
    const next = normalizeLanguagePreference(value);
    if (next === preference)
      return false;
    preference = next;
    writeSetting(KEY_LANGUAGE, next);
    emit(EVT_LANG, { preference: next, resolved: resolvedLanguage() });
    return true;
  }

  // src/api/Store.ts
  var logger2 = new Logger("Store");
  var backends = {
    local: {
      available: true,
      get(key) {
        try {
          return window.localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      set(key, value) {
        window.localStorage.setItem(key, value);
      },
      remove(key) {
        try {
          window.localStorage.removeItem(key);
        } catch {}
      },
      keys() {
        try {
          const out = [];
          for (let i = 0;i < window.localStorage.length; i++)
            out.push(window.localStorage.key(i));
          return out;
        } catch {
          return [];
        }
      }
    },
    gm: {
      available: hasGM,
      get(key) {
        if (!hasGM)
          return null;
        try {
          const value = GM_getValue(key, null);
          if (value === null || value === undefined)
            return null;
          return typeof value === "string" ? value : JSON.stringify(value);
        } catch {
          return null;
        }
      },
      set(key, value) {
        if (!hasGM)
          throw new Error("GM storage is not available");
        GM_setValue(key, value);
      },
      remove(key) {
        if (hasGM) {
          try {
            GM_deleteValue(key);
          } catch {}
        }
      },
      keys() {
        if (!hasGM)
          return [];
        try {
          return GM_listValues() || [];
        } catch {
          return [];
        }
      }
    }
  };
  var mode = null;
  var listeners4 = new Set;
  function notify(change) {
    for (const listener of listeners4) {
      try {
        listener(change);
      } catch (err) {
        logger2.error("change listener failed", err);
      }
    }
  }
  function getMode() {
    if (!mode)
      mode = readSetting(KEY_STORAGE_MODE) === "gm" && hasGM ? "gm" : "local";
    return mode;
  }
  var backend = () => backends[getMode()];
  var keyOf = (id) => RECORD_PREFIX + id;
  function parse(raw) {
    if (raw === null || raw === undefined)
      return null;
    try {
      const obj = JSON.parse(raw);
      return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
    } catch {
      return null;
    }
  }
  function rawEntries(be) {
    return be.keys().filter((k) => typeof k === "string" && k.startsWith(RECORD_PREFIX)).map((k) => [k, be.get(k)]).filter((entry) => entry[1] !== null && entry[1] !== undefined);
  }
  function onRecordChange(listener) {
    listeners4.add(listener);
    return () => listeners4.delete(listener);
  }
  function get(id) {
    return id ? parse(backend().get(keyOf(id))) : null;
  }
  function update(id, mutate, options = {}) {
    const key = keyOf(id);
    const current = parse(backend().get(key)) || {};
    const next = mutate({ ...current }) || current;
    if (options.touch !== false)
      next.updatedAt = Date.now();
    backend().set(key, JSON.stringify(next));
    notify({ id, type: "set", source: options.source ?? "local" });
    return next;
  }
  function updateIfExists(id, mutate, options) {
    if (!get(id))
      return null;
    try {
      return update(id, mutate, options);
    } catch (err) {
      logger2.error("update failed", err);
      return null;
    }
  }
  function remove(id) {
    backend().remove(keyOf(id));
    notify({ id, type: "remove", source: "local" });
  }
  function list() {
    const out = [];
    for (const [key, raw] of rawEntries(backend())) {
      const rec = parse(raw);
      if (rec)
        out.push({ id: key.slice(RECORD_PREFIX.length), rec });
    }
    return out;
  }
  function setMode(next) {
    if (!backends[next]?.available)
      throw new Error(`Storage "${next}" is not available`);
    const current = getMode();
    if (current === next)
      return 0;
    const src = backends[current];
    const dst = backends[next];
    const items = rawEntries(src);
    for (const [k, v] of items)
      dst.set(k, v);
    for (const [k] of items)
      src.remove(k);
    mode = next;
    writeSetting(KEY_STORAGE_MODE, next);
    notify({ id: null, type: "bulk", source: "local" });
    return items.length;
  }
  function exportAll() {
    const entries = {};
    for (const [k, v] of rawEntries(backend()))
      entries[k] = v;
    return { version: "1", exportedAt: Date.now(), storageMode: getMode(), entries };
  }
  function importPayload(payload, options = {}) {
    const entries = payload?.entries;
    if (!payload || typeof payload !== "object" || !entries || typeof entries !== "object") {
      throw new Error(t("Invalid import payload", "导入内容格式无效"));
    }
    const be = backend();
    if (options.overwrite)
      for (const [k] of rawEntries(be))
        be.remove(k);
    let count = 0;
    for (const [k, v] of Object.entries(entries)) {
      if (!k.startsWith(RECORD_PREFIX) || v === null || v === undefined)
        continue;
      const text = typeof v === "string" ? v : JSON.stringify(v);
      if (options.accept) {
        const incoming = parse(text);
        if (!incoming || !options.accept(k.slice(RECORD_PREFIX.length), incoming, parse(be.get(k))))
          continue;
      }
      be.set(k, text);
      count++;
    }
    notify({ id: null, type: "bulk", source: options.source ?? "local" });
    return count;
  }
  function cleanup() {
    const be = backend();
    for (const [key, raw] of rawEntries(be)) {
      const rec = parse(raw);
      if (!rec) {
        be.remove(key);
        continue;
      }
      const name = typeof rec.videoName === "string" && rec.videoName.trim() ? rec.videoName.trim() : UNKNOWN_TITLE;
      if (name !== rec.videoName) {
        rec.videoName = name;
        try {
          be.set(key, JSON.stringify(rec));
        } catch {}
      }
    }
  }

  // src/utils/css.ts
  var active = new Map;
  function root() {
    return document.head || document.documentElement;
  }
  function registerStyle(name, css) {
    const existing = active.get(name);
    if (existing?.isConnected) {
      if (existing.textContent !== css)
        existing.textContent = css;
      return;
    }
    const el = document.createElement("style");
    el.dataset.ysrp = name;
    el.textContent = css;
    root().appendChild(el);
    active.set(name, el);
  }
  function unregisterStyle(name) {
    active.get(name)?.remove();
    active.delete(name);
  }
  function ensureFontAwesome() {
    if (document.getElementById("ysrp-fontawesome"))
      return;
    const link = document.createElement("link");
    link.id = "ysrp-fontawesome";
    link.rel = "stylesheet";
    link.href = FONT_AWESOME_CSS;
    root().appendChild(link);
  }

  // src/utils/dom.ts
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value === null || value === undefined || value === false)
          continue;
        if (key === "class")
          node.className = String(value);
        else if (key === "style")
          Object.assign(node.style, value);
        else if (key === "text")
          node.textContent = String(value);
        else if (key === "dataset")
          Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function")
          node.addEventListener(key.slice(2), value);
        else if (typeof value === "boolean")
          node[key] = value;
        else
          node.setAttribute(key, String(value));
      }
    }
    for (const child of children.flat(Infinity)) {
      if (child !== null && child !== undefined && child !== false)
        node.append(child);
    }
    return node;
  }
  var icon = (name) => h("i", { class: `fa-solid fa-${name} ysrp-icon`, "aria-hidden": "true" });
  function setIcon(button, name) {
    const el = button.firstElementChild;
    if (el)
      el.className = `fa-solid fa-${name} ysrp-icon`;
  }
  function iconButton(name, title, onClick, extraClass = "") {
    return h("button", { type: "button", class: `ysrp-ibtn ${extraClass}`, title, "aria-label": title, onclick: onClick }, icon(name));
  }
  function textButton(name, label, onClick, extraClass = "") {
    return h("button", { type: "button", class: `ysrp-btn ${extraClass}`, title: label, onclick: onClick }, icon(name), h("span", { text: label }));
  }
  function deArrowIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 36 36");
    svg.setAttribute("width", "22");
    svg.setAttribute("height", "22");
    svg.setAttribute("aria-hidden", "true");
    for (const [r, fill] of [[18, "#1213BD"], [13, "#88C9F9"], [6, "#0A62A5"]]) {
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", "18");
      circle.setAttribute("cy", "18");
      circle.setAttribute("r", String(r));
      circle.setAttribute("fill", fill);
      svg.appendChild(circle);
    }
    return svg;
  }
  function shieldFromPlayer(button, onActivate) {
    const swallow = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    button.addEventListener("pointerdown", (event) => {
      swallow(event);
      onActivate();
    }, { capture: true });
    button.addEventListener("mousedown", swallow, { capture: true });
    button.addEventListener("click", swallow, { capture: true });
    button.addEventListener("touchstart", swallow, { capture: true, passive: false });
  }
  function setMessage(el, text, kind) {
    el.textContent = text || "";
    el.className = `ysrp-msg${kind ? ` is-${kind}` : ""}`;
    el.style.display = text ? "" : "none";
  }
  function card(iconName, accentVar, titleText, subtitle, ...children) {
    const ic = icon(iconName);
    ic.style.color = `var(${accentVar})`;
    return h("div", { class: "ysrp-card" }, h("div", { class: "ysrp-card-title" }, ic, h("span", { text: titleText })), subtitle ? h("div", { class: "ysrp-card-sub", text: subtitle }) : null, ...children);
  }
  function field(label, control) {
    return h("label", { class: "ysrp-field" }, h("span", { text: label }), control);
  }
  function ChoiceGroup(name, accentVar, options, selected, onPick) {
    const items = new Map;
    const node = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    for (const option of options) {
      const input = h("input", { type: "radio", name, value: option.value });
      const row = h("label", { class: `ysrp-choice${option.disabled ? " is-disabled" : ""}`, dataset: { value: option.value } }, input, h("span", { class: "ysrp-choice-badge", text: option.badge }), h("span", { class: "ysrp-choice-text" }, h("span", { class: "ysrp-choice-label", text: option.label }), option.hint ? h("span", { class: "ysrp-choice-hint", text: option.hint }) : null));
      row.style.setProperty("--ysrp-choice-accent", `var(${accentVar})`);
      row.addEventListener("click", (event) => {
        event.preventDefault();
        if (option.disabled)
          return;
        select(option.value);
        onPick?.(option.value);
      });
      items.set(option.value, { row, input });
      node.appendChild(row);
    }
    function select(value) {
      for (const [key, item] of items) {
        item.input.checked = key === value;
        item.row.classList.toggle("is-selected", key === value);
      }
    }
    select(selected);
    return { node, select, value: () => [...items].find(([, item]) => item.input.checked)?.[0] };
  }
  function secretInput(placeholder, showLabel, hideLabel, accentVar) {
    const input = h("input", { class: "ysrp-input", type: "password", placeholder, autocomplete: "new-password", spellcheck: "false" });
    const toggle = h("button", { type: "button", class: "ysrp-btn", text: showLabel() });
    toggle.style.setProperty("--ysrp-btn-accent", `var(${accentVar})`);
    toggle.addEventListener("click", () => {
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      toggle.textContent = hidden ? hideLabel() : showLabel();
    });
    return { input, node: h("div", { class: "ysrp-inline" }, input, toggle) };
  }

  // src/api/Modal.ts
  var ui = null;
  var activeTab = "records";
  var keyListener = null;
  var unsubscribeTabs = null;
  function hostRoot() {
    return document.querySelector("ytd-app #content") || document.querySelector("#content") || document.querySelector("#page-manager") || document.body;
  }
  function lockScroll() {
    if (!document.body.hasAttribute("data-ysrp-body-overflow")) {
      document.body.setAttribute("data-ysrp-body-overflow", document.body.style.overflow || "");
    }
    document.body.style.overflow = "hidden";
  }
  function unlockScroll() {
    const previous = document.body.getAttribute("data-ysrp-body-overflow");
    document.body.style.overflow = previous || "";
    document.body.removeAttribute("data-ysrp-body-overflow");
  }
  function isOpen() {
    return Boolean(ui && ui.container.style.display !== "none" && ui.container.isConnected);
  }
  function open(tab) {
    if (!keyListener)
      return;
    ensureFontAwesome();
    if (!ui)
      ui = build();
    const root = hostRoot();
    if (!ui.backdrop.isConnected)
      root.appendChild(ui.backdrop);
    if (!ui.container.isConnected)
      root.appendChild(ui.container);
    ui.backdrop.style.display = "block";
    ui.container.style.display = "flex";
    ui.setTab(tab || activeTab);
    ui.refresh();
    lockScroll();
  }
  function close() {
    if (!ui)
      return;
    ui.container.style.display = "none";
    ui.backdrop.style.display = "none";
    unlockScroll();
  }
  function rebuild() {
    const wasOpen = isOpen();
    if (ui) {
      ui.destroy();
      ui = null;
    }
    if (wasOpen)
      open(activeTab);
    else
      unlockScroll();
  }
  function mount() {
    if (keyListener)
      return;
    keyListener = (event) => {
      if (event.key === "Escape" && isOpen()) {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", keyListener, true);
    unsubscribeTabs = onSettingsTabsChange(() => {
      if (ui)
        rebuild();
    });
  }
  function unmount() {
    if (isOpen())
      close();
    ui?.destroy();
    ui = null;
    if (keyListener)
      document.removeEventListener("keydown", keyListener, true);
    keyListener = null;
    unsubscribeTabs?.();
    unsubscribeTabs = null;
  }
  function build() {
    const cleanups = [];
    const listen = (target, name, fn) => {
      target.addEventListener(name, fn);
      cleanups.push(() => target.removeEventListener(name, fn));
    };
    const backdrop = h("div", { class: "ysrp-backdrop ysrp-theme", style: { display: "none" } });
    backdrop.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    const title = h("h3");
    const modeBadge = h("span", { class: "ysrp-badge" });
    const spinner = h("span", { class: "ysrp-spinner", title: t("Refreshing…", "正在更新列表…") }, h("i", { class: "fa-solid fa-arrows-rotate fa-spin" }));
    const setCount = (n) => {
      title.textContent = t("Saved Videos - ({count})", "已保存视频 - ({count})", { count: n });
    };
    const renderModeBadge = () => {
      modeBadge.textContent = getMode() === "gm" ? t("GM Storage", "GM 存储") : t("localStorage", "浏览器本地存储");
    };
    setCount(list().length);
    renderModeBadge();
    const header = h("div", { class: "ysrp-header" }, h("div", { class: "ysrp-header-left" }, title, modeBadge), h("div", { class: "ysrp-header-left" }, spinner, h("button", { type: "button", class: "ysrp-close", title: t("Close", "关闭"), "aria-label": t("Close", "关闭"), text: "✖", onclick: close })));
    const ctx = {
      setCount,
      spin: (on) => spinner.classList.toggle("is-active", on),
      renderModeBadge,
      listen
    };
    const tabs = getSettingsTabs();
    const panes = new Map;
    const tabButtons = new Map;
    const tabsBar = h("div", { class: "ysrp-tabs", role: "tablist" });
    const body = h("div", { class: "ysrp-body ysrp-settings-container-body" });
    for (const tab of tabs) {
      const pane = tab.render(ctx);
      pane.node.classList.add("ysrp-pane");
      pane.node.dataset.pane = tab.id;
      panes.set(tab.id, pane);
      const button = h("button", { type: "button", class: "ysrp-tab", role: "tab", dataset: { tabId: tab.id }, onclick: () => setTab(tab.id) }, icon(tab.icon), h("span", { text: tab.label() }));
      tabButtons.set(tab.id, button);
      tabsBar.appendChild(button);
      body.appendChild(pane.node);
    }
    const container = h("div", { class: "ysrp-settings-container ysrp-theme", role: "dialog", "aria-modal": "true", style: { display: "none" } }, header, tabsBar, body);
    for (const name of ["keydown", "keyup", "keypress"]) {
      container.addEventListener(name, (event) => {
        if (event.key !== "Escape")
          event.stopPropagation();
      });
    }
    function setTab(id) {
      activeTab = panes.has(id) ? id : tabs[0]?.id ?? "records";
      container.dataset.activeTab = activeTab;
      for (const [key, button] of tabButtons) {
        const on = key === activeTab;
        button.classList.toggle("is-active", on);
        button.setAttribute("aria-selected", String(on));
        panes.get(key)?.node.classList.toggle("is-active", on);
      }
    }
    return {
      backdrop,
      container,
      setTab,
      refresh() {
        renderModeBadge();
        for (const pane of panes.values())
          pane.refresh?.();
      },
      destroy() {
        for (const fn of cleanups)
          fn();
        for (const pane of panes.values())
          pane.destroy?.();
        container.remove();
        backdrop.remove();
      }
    };
  }

  // src/api/Badge.ts
  var node = null;
  var textNode = null;
  var state = { kind: "loading" };
  var pending = null;
  var resumedTimer = null;
  var mountListeners = new Set;
  function render() {
    if (!textNode)
      return;
    textNode.classList.remove("is-error", "is-resumed");
    textNode.removeAttribute("title");
    switch (state.kind) {
      case "saved":
        textNode.textContent = formatTime(state.seconds);
        textNode.title = t("Last saved position", "最近保存的位置");
        break;
      case "resumed":
        textNode.textContent = t("Resumed {time}", "已恢复 {time}", { time: formatTime(state.seconds) });
        textNode.classList.add("is-resumed");
        break;
      case "error":
        textNode.textContent = t("⚠ Save failed", "⚠ 保存失败");
        textNode.title = state.message || "";
        textNode.classList.add("is-error");
        break;
      case "live":
        textNode.textContent = t("Live · not saved", "直播 · 不保存");
        break;
      case "choosing":
        textNode.textContent = t("Choose a position…", "请选择播放位置…");
        break;
      case "syncing":
        textNode.textContent = t("Syncing…", "正在同步…");
        break;
      case "idle":
        textNode.textContent = formatTime(0);
        break;
      default:
        textNode.textContent = t("Loading...", "加载中...");
    }
  }
  function show(next) {
    if (state.kind === "resumed" && next.kind === "saved" && resumedTimer) {
      pending = next;
      return;
    }
    if (resumedTimer)
      clearTimeout(resumedTimer);
    resumedTimer = null;
    pending = null;
    state = next;
    if (next.kind === "resumed") {
      resumedTimer = setTimeout(() => {
        resumedTimer = null;
        state = pending || { kind: "saved", seconds: next.seconds };
        pending = null;
        render();
      }, RESUMED_NOTICE_MS);
    }
    render();
  }
  function build2() {
    textNode = h("span", { class: "last-save-info-text" });
    const label = t("Open settings", "打开设置");
    const button = h("button", { type: "button", class: "ysrp-settings-button", title: label, "aria-label": label }, icon("gear"));
    shieldFromPlayer(button, () => open());
    node = h("div", { class: "last-save-info-container" }, h("div", { class: "last-save-info" }, textNode, button));
    render();
  }
  function ensure() {
    const host = document.querySelector("#movie_player .ytp-left-controls");
    if (!host)
      return;
    if (node && node.parentNode === host)
      return;
    document.querySelectorAll(".last-save-info-container").forEach((n) => n.remove());
    if (!node)
      build2();
    host.appendChild(node);
    for (const listener of mountListeners)
      listener(node);
  }
  function rebuild2() {
    node?.remove();
    node = null;
    textNode = null;
    ensure();
  }
  function destroy() {
    node?.remove();
    node = null;
    textNode = null;
  }
  var current = () => node?.isConnected ? node : null;
  function onMount(listener) {
    mountListeners.add(listener);
    return () => mountListeners.delete(listener);
  }

  // src/api/ResumePrompt.ts
  var node2 = null;
  function close2() {
    node2?.remove();
    node2 = null;
  }
  function open2(times, onChoose) {
    close2();
    const host = document.getElementById("movie_player");
    if (!host) {
      onChoose("link");
      return;
    }
    const choose = (choice) => {
      close2();
      onChoose(choice);
    };
    const option = (choice, iconName, label, seconds) => {
      const button = h("button", { type: "button", class: `ysrp-btn ysrp-resume-${choice}`, dataset: { choice } }, icon(iconName), h("span", { text: `${label} ${formatTime(seconds)}` }));
      shieldFromPlayer(button, () => choose(choice));
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ")
          return;
        event.preventDefault();
        event.stopPropagation();
        choose(choice);
      });
      return button;
    };
    const saved = option("saved", "clock-rotate-left", t("Saved progress", "上次进度"), times.saved);
    const title = t("Where to continue?", "从哪里继续播放？");
    const dialog = h("div", { class: "ysrp-theme ysrp-resume", role: "dialog", "aria-modal": "false", "aria-label": title }, h("div", { class: "ysrp-resume-title", text: title }), h("div", { class: "ysrp-resume-sub", text: t("This link starts at a different time than your saved progress.", "这个链接指定的时间与你上次的进度不同。") }), h("div", { class: "ysrp-row-actions" }, saved, option("link", "link", t("Link time", "链接时间"), times.link)));
    for (const type of ["click", "mousedown", "pointerdown", "touchstart", "dblclick"]) {
      dialog.addEventListener(type, (event) => event.stopPropagation());
    }
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        choose("link");
      }
    });
    node2 = dialog;
    host.appendChild(dialog);
    saved.focus({ preventScroll: true });
  }

  // src/api/Titles.ts
  var originals = new Map;
  var originalFetches = new Map;
  var dearrows = new Map;
  var dearrowFetches = new Map;
  function rememberOriginal(id, title) {
    const value = normTitle(title);
    if (id && value)
      originals.set(id, value);
  }
  function getOriginal(id) {
    if (!id)
      return Promise.resolve(null);
    const known = originals.get(id);
    if (known)
      return Promise.resolve(known);
    const pending = originalFetches.get(id);
    if (pending)
      return pending;
    const url = OEMBED_API + encodeURIComponent(`https://youtu.be/${id}`);
    const promise = fetch(url, { credentials: "omit", cache: "no-store" }).then((res) => res.ok ? res.json() : null).then((data) => {
      const title = data && typeof data.title === "string" ? normTitle(data.title) : null;
      if (title) {
        originals.set(id, title);
        updateIfExists(id, (rec) => Object.assign(rec, { originalTitle: title }));
      }
      return title || null;
    }).catch(() => null).finally(() => originalFetches.delete(id));
    originalFetches.set(id, promise);
    return promise;
  }
  function pickDeArrow(data) {
    if (!data || !Array.isArray(data.titles))
      return null;
    const entry = data.titles.find((item) => item && typeof item.title === "string" && item.original !== true && (Boolean(item.locked) || (typeof item.votes === "number" ? item.votes : 0) >= 0));
    return entry ? normTitle(entry.title) || null : null;
  }
  function cachedDeArrow(id) {
    const hit = dearrows.get(id);
    return hit && Date.now() - hit.at < DEARROW_TTL_MS ? hit : null;
  }
  function getDeArrow(id) {
    if (!id)
      return Promise.resolve(null);
    const hit = cachedDeArrow(id);
    if (hit)
      return Promise.resolve(hit.title);
    const pending = dearrowFetches.get(id);
    if (pending)
      return pending;
    const promise = fetch(DEARROW_API + encodeURIComponent(id), { credentials: "omit", cache: "no-store" }).then((res) => {
      if (res.status === 404)
        return { titles: [] };
      if (!res.ok)
        throw new Error(`DeArrow HTTP ${res.status}`);
      return res.json();
    }).then((data) => {
      let title = pickDeArrow(data);
      if (title && sameTitle(title, originals.get(id)))
        title = null;
      dearrows.set(id, { title, at: Date.now() });
      if (title)
        emit(EVT_TITLE, { videoId: id, title });
      return title;
    }).catch(() => null).finally(() => dearrowFetches.delete(id));
    dearrowFetches.set(id, promise);
    return promise;
  }
  var knownOriginal = (id) => originals.get(id) || null;
  function knownDeArrow(id) {
    const hit = cachedDeArrow(id);
    return hit ? hit.title : undefined;
  }

  // src/utils/youtube.ts
  function getPlayer() {
    const player = document.querySelector("#movie_player");
    return player && typeof player.getCurrentTime === "function" && typeof player.getDuration === "function" && typeof player.seekTo === "function" ? player : null;
  }
  function urlVideoId() {
    if (!/^\/watch\/?$/.test(location.pathname))
      return null;
    const id = new URLSearchParams(location.search).get("v");
    return id && /^[\w-]+$/.test(id) ? id : null;
  }
  function urlHasStartTime() {
    const params = new URLSearchParams(location.search);
    if (params.has("t") || params.has("start"))
      return true;
    return /(?:^|[#&])t=/.test(location.hash.replace(/^#/, "&"));
  }
  function urlStartTime() {
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const raw = params.get("t") || params.get("start") || hash.get("t");
    if (!raw)
      return null;
    if (/^\d+(?:\.\d+)?s?$/.test(raw))
      return parseFloat(raw);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
    return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : null;
  }
  function playerVideoData(player) {
    try {
      const data = player.getVideoData?.();
      return data && typeof data === "object" ? data : {};
    } catch {
      return {};
    }
  }
  function isAdShowing(player) {
    return player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
  }
  function isPlayerReadyFor(player, id) {
    if (!player || !id)
      return false;
    const loadedId = playerVideoData(player).video_id;
    if (loadedId && loadedId !== id)
      return false;
    let duration = 0;
    try {
      duration = Number(player.getDuration()) || 0;
    } catch {}
    return duration > 0 && !isAdShowing(player);
  }

  // src/plugins/_core/engine/index.ts
  var logger3 = new Logger("Engine");
  var session = null;
  var timer = null;
  var cleanups = [];
  function newSession(id) {
    return {
      id,
      phase: "waiting",
      ready: true,
      isLive: false,
      duration: 0,
      lastTime: null,
      lastWritten: null,
      lastWriteAt: 0,
      restoreTarget: 0,
      restoreStartedAt: 0,
      lastSeekAt: 0,
      seekAttempts: 0,
      confirmations: 0
    };
  }
  function titleFor(id, rec) {
    const dearrow = knownDeArrow(id);
    const original = knownOriginal(id) || rec && normTitle(rec.originalTitle) || null;
    if (dearrow)
      return { videoName: dearrow, originalTitle: original };
    const stored = rec && !isPlaceholderTitle(rec.videoName) ? normTitle(rec.videoName) : null;
    return { videoName: stored || original || UNKNOWN_TITLE, originalTitle: original };
  }
  function write(s) {
    if (s.phase !== "tracking" || s.isLive || s.lastTime === null)
      return false;
    const position = Math.round(s.lastTime * 1000) / 1000;
    try {
      update(s.id, (rec) => {
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
      logger3.error("Failed to save progress:", err);
      show({ kind: "error", message: errorMessage(err) });
      return false;
    }
    s.lastWritten = position;
    s.lastWriteAt = Date.now();
    show({ kind: "saved", seconds: position });
    emit(EVT_RECORD, { videoId: s.id, videoProgress: position });
    return true;
  }
  function maybeWrite(s, force) {
    if (!s || s.phase !== "tracking" || s.isLive || s.lastTime === null)
      return;
    if (s.lastWritten !== null && Math.abs(s.lastTime - s.lastWritten) < MIN_SAVE_DELTA)
      return;
    if (!force && Date.now() - s.lastWriteAt < SAVE_THROTTLE_MS)
      return;
    write(s);
  }
  function enterTracking(s, notice) {
    s.phase = "tracking";
    if (notice)
      show(notice);
    else if (s.lastWritten === null)
      show({ kind: "idle" });
  }
  function beginRestore(s, player) {
    const data = playerVideoData(player);
    s.isLive = Boolean(data.isLive);
    if (data.title)
      rememberOriginal(s.id, data.title);
    if (s.isLive)
      return enterTracking(s, { kind: "live" });
    const rec = get(s.id);
    const target = rec ? Number(rec.videoProgress) : NaN;
    if (!Number.isFinite(target) || target <= MIN_RESTORE_POSITION)
      return enterTracking(s);
    if (target >= s.duration - END_GUARD_SECONDS)
      return enterTracking(s);
    s.restoreTarget = target;
    if (urlHasStartTime())
      return askForChoice(s, player);
    startRestoring(s, player);
  }
  function startRestoring(s, player) {
    s.phase = "restoring";
    s.restoreStartedAt = Date.now();
    s.seekAttempts = 0;
    seek(s, player);
  }
  function askForChoice(s, player) {
    const linkTime = urlStartTime() ?? (Number(player.getCurrentTime()) || 0);
    if (Math.abs(linkTime - s.restoreTarget) <= RESTORE_TOLERANCE)
      return enterTracking(s);
    s.phase = "choosing";
    let wasPlaying = false;
    try {
      wasPlaying = player.getPlayerState?.() === 1;
      player.pauseVideo?.();
    } catch {}
    show({ kind: "choosing" });
    open2({ saved: s.restoreTarget, link: linkTime }, (choice) => {
      if (session !== s || s.phase !== "choosing")
        return;
      const current = getPlayer();
      if (choice === "saved" && current)
        startRestoring(s, current);
      else
        enterTracking(s);
      if (wasPlaying && current) {
        try {
          current.playVideo?.();
        } catch {}
      }
    });
  }
  function seek(s, player) {
    s.seekAttempts++;
    s.lastSeekAt = Date.now();
    s.confirmations = 0;
    try {
      player.seekTo(s.restoreTarget, true);
    } catch (err) {
      logger3.error("seekTo failed", err);
    }
  }
  function continueRestore(s, player, now) {
    const current = Number(player.getCurrentTime()) || 0;
    if (Math.abs(current - s.restoreTarget) <= RESTORE_TOLERANCE) {
      s.confirmations++;
      if (s.confirmations >= 2) {
        s.lastWritten = s.restoreTarget;
        enterTracking(s, { kind: "resumed", seconds: s.restoreTarget });
      }
      return;
    }
    s.confirmations = 0;
    if (s.seekAttempts >= RESTORE_MAX_ATTEMPTS || now - s.restoreStartedAt > RESTORE_TIMEOUT_MS) {
      logger3.warn("Could not restore position for", s.id);
      s.lastWritten = current;
      enterTracking(s);
      return;
    }
    if (now - s.lastSeekAt >= RESTORE_RETRY_MS)
      seek(s, player);
  }
  function startSession(id) {
    close2();
    const s = id ? newSession(id) : null;
    session = s;
    show({ kind: "loading" });
    if (s) {
      const rec = get(s.id);
      if (rec && normTitle(rec.originalTitle))
        rememberOriginal(s.id, rec.originalTitle);
      getDeArrow(s.id).then((title) => {
        if (title)
          updateIfExists(s.id, (r) => Object.assign(r, { videoName: title }));
      });
      const hooks = runRestoreHooks(s.id);
      if (hooks.length) {
        s.ready = false;
        show({ kind: "syncing" });
        const timeout = new Promise((resolve) => setTimeout(resolve, BEFORE_RESTORE_TIMEOUT_MS));
        Promise.race([Promise.allSettled(hooks), timeout]).then(() => {
          s.ready = true;
          if (session === s && s.phase === "waiting")
            show({ kind: "loading" });
        });
      }
    }
    emit(EVT_VIDEO, { videoId: id, title: id ? titleFor(id, get(id)).videoName : null });
  }
  function sample(s) {
    const player = getPlayer();
    if (!isPlayerReadyFor(player, s.id))
      return null;
    const time = Number(player.getCurrentTime());
    s.duration = Number(player.getDuration()) || s.duration;
    if (s.phase === "tracking" && Number.isFinite(time))
      s.lastTime = time;
    return player;
  }
  function tick() {
    const id = urlVideoId();
    if (!session || session.id !== id) {
      if (session) {
        sample(session);
        maybeWrite(session, true);
      }
      startSession(id);
    }
    const s = session;
    if (!s)
      return;
    const player = sample(s);
    if (!player)
      return;
    if (s.phase === "waiting") {
      if (!s.ready)
        return;
      beginRestore(s, player);
    } else if (s.phase === "restoring")
      continueRestore(s, player, Date.now());
    if (s.phase === "tracking") {
      if (s.lastTime === null)
        sample(s);
      maybeWrite(s, false);
    }
  }
  function flush() {
    const s = session;
    if (!s || s.id !== urlVideoId()) {
      tick();
      return;
    }
    sample(s);
    maybeWrite(s, true);
  }
  var safeTick = () => {
    try {
      tick();
    } catch (err) {
      logger3.error("tick failed", err);
    }
  };
  var safeFlush = () => {
    try {
      flush();
    } catch (err) {
      logger3.error("flush failed", err);
    }
  };
  function listen(target, name, handler, capture = false) {
    target.addEventListener(name, handler, capture);
    cleanups.push(() => target.removeEventListener(name, handler, capture));
  }
  var fromPlayer = (event) => Boolean(event.target?.closest?.("#movie_player"));
  var currentId = () => session?.id ?? null;
  var currentDuration = () => session?.duration ?? 0;
  var engine_default = definePlugin({
    name: "Engine",
    title: () => t("Progress engine", "进度引擎"),
    description: () => t("Saves the playback position and resumes it when you come back.", "保存播放位置，回来时自动接着播放。"),
    authors: [Devs.V],
    required: true,
    start() {
      cleanup();
      timer = setInterval(safeTick, TICK_MS);
      setTimeout(safeTick, 0);
      for (const name of ["pause", "seeked"])
        listen(document, name, (event) => {
          if (fromPlayer(event))
            safeFlush();
        }, true);
      for (const name of ["loadedmetadata", "durationchange", "playing"])
        listen(document, name, (event) => {
          if (fromPlayer(event))
            safeTick();
        }, true);
      listen(window, "yt-navigate-start", safeFlush, true);
      listen(window, "yt-navigate-finish", safeTick, true);
      listen(window, "popstate", safeTick);
      listen(document, "visibilitychange", () => document.hidden ? safeFlush() : safeTick());
      listen(window, "pagehide", safeFlush);
      listen(window, "beforeunload", safeFlush);
    },
    stop() {
      safeFlush();
      if (timer)
        clearInterval(timer);
      timer = null;
      for (const fn of cleanups.splice(0))
        fn();
      session = null;
    }
  });

  // src/plugins/_core/playerBadge/index.ts
  var timer2 = null;
  var languageTimer = null;
  var offLanguage = null;
  var ensure2 = () => ensure();
  var playerBadge_default = definePlugin({
    name: "PlayerBadge",
    title: () => t("Player badge", "播放器徽标"),
    description: () => t("Shows the last saved time and the settings button in the player controls.", "在播放器控制栏显示最近保存的时间和设置按钮。"),
    authors: [Devs.V],
    required: true,
    start() {
      timer2 = setInterval(ensure2, TICK_MS);
      window.addEventListener("yt-navigate-finish", ensure2, true);
      ensure2();
      offLanguage = on(EVT_LANG, () => {
        if (languageTimer)
          clearTimeout(languageTimer);
        languageTimer = setTimeout(() => rebuild2(), 50);
      });
    },
    stop() {
      if (timer2)
        clearInterval(timer2);
      timer2 = null;
      window.removeEventListener("yt-navigate-finish", ensure2, true);
      offLanguage?.();
      offLanguage = null;
      close2();
      destroy();
    }
  });

  // src/plugins/_core/settings/DisplayPane.ts
  function DisplayPane() {
    const names = { zh: "中文", en: "English" };
    const status = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const choice = ChoiceGroup("ysrp-language", "--ysrp-display", [
      { value: "auto", badge: t("Auto", "自动"), label: t("Auto", "自动"), hint: t("Match the browser language automatically.", "自动跟随浏览器语言。") },
      { value: "zh", badge: "中文", label: "中文", hint: "始终使用简体中文。" },
      { value: "en", badge: "English", label: "English", hint: "Always use English." }
    ], languagePreference(), (value) => {
      if (!setLanguagePreference(value))
        setMessage(status, t("Already using this language.", "当前已使用该语言。"));
    });
    choice.node.classList.add("ysrp-language-options");
    return {
      node: h("div", {}, card("globe", "--ysrp-display", t("Interface Language", "界面语言"), t("Choose how the script UI should appear.", "为脚本界面选择显示语言。"), choice.node, h("div", { class: "ysrp-info" }, h("div", { class: "ysrp-info-row" }, h("b", { text: t("Active language", "当前语言") }), h("span", { text: names[resolvedLanguage()] })), h("div", { class: "ysrp-info-row" }, h("b", { text: t("Browser language", "浏览器语言") }), h("span", { text: names[detectBrowserLanguage()] }))), status))
    };
  }

  // src/plugins/_core/settings/PluginsPane.ts
  function settingControl(settings, key, def) {
    const store = settings.store;
    const value = store[key];
    if (def.type === 2 /* BOOLEAN */) {
      const input = h("input", { type: "checkbox", dataset: { setting: key } });
      input.checked = Boolean(value);
      input.addEventListener("change", () => {
        store[key] = input.checked;
      });
      return h("label", { class: "ysrp-check" }, input, h("span", { text: def.description() }));
    }
    let control;
    if (def.type === 3 /* SELECT */) {
      const select = h("select", { class: "ysrp-select", dataset: { setting: key } }, def.options.map((option) => h("option", { value: option.value, text: option.label() })));
      select.value = String(value);
      select.addEventListener("change", () => {
        store[key] = select.value;
      });
      control = select;
    } else {
      const input = h("input", {
        class: "ysrp-input",
        type: def.type === 1 /* NUMBER */ ? "number" : "text",
        placeholder: def.type === 0 /* STRING */ ? def.placeholder : undefined,
        min: def.type === 1 /* NUMBER */ ? def.min : undefined,
        max: def.type === 1 /* NUMBER */ ? def.max : undefined,
        dataset: { setting: key }
      });
      input.value = String(value ?? "");
      input.addEventListener("change", () => {
        store[key] = def.type === 1 /* NUMBER */ ? Number(input.value) : input.value;
      });
      control = input;
    }
    return h("label", { class: "ysrp-field" }, h("span", { text: def.description() }), control);
  }
  function PluginCard(plugin) {
    const toggle = h("button", { type: "button", class: "ysrp-switch", role: "switch", "aria-label": plugin.title(), dataset: { plugin: plugin.name } });
    const settingsBox = h("div", { class: "ysrp-plugin-settings" });
    const defs = plugin.settings ? Object.entries(plugin.settings.def).filter(([, def]) => !def.hidden) : [];
    for (const [key, def] of defs)
      settingsBox.appendChild(settingControl(plugin.settings, key, def));
    function render() {
      const enabled = isPluginEnabled(plugin.name);
      toggle.setAttribute("aria-checked", String(enabled));
      toggle.disabled = Boolean(plugin.required);
      toggle.title = plugin.required ? t("Core plugin, always on", "核心插件，始终开启") : enabled ? t("Turn off", "关闭") : t("Turn on", "开启");
      settingsBox.hidden = !enabled || defs.length === 0;
    }
    toggle.addEventListener("click", () => {
      if (plugin.required)
        return;
      setPluginEnabled(plugin.name, !isPluginEnabled(plugin.name));
    });
    render();
    const node = h("div", { class: "ysrp-card ysrp-plugin", dataset: { plugin: plugin.name } }, h("div", { class: "ysrp-plugin-head" }, h("div", { class: "ysrp-plugin-text" }, h("div", { class: "ysrp-plugin-name" }, h("span", { text: plugin.title() }), plugin.required ? h("span", { class: "ysrp-plugin-tag", text: t("Core", "核心") }) : null), h("div", { class: "ysrp-plugin-desc", text: plugin.description() })), toggle), settingsBox);
    return { node, render };
  }
  function PluginsPane() {
    const all = listPlugins();
    const cards = [...all.filter((p) => !p.required), ...all.filter((p) => p.required)].map(PluginCard);
    const off = onPluginToggle(() => {
      for (const c of cards)
        c.render();
    });
    return {
      node: h("div", {}, h("div", { class: "ysrp-msg", text: t("Turn features on or off. Changes apply immediately.", "开启或关闭各项功能，立即生效。") }), cards.map((c) => c.node)),
      refresh() {
        for (const c of cards)
          c.render();
      },
      destroy: off
    };
  }

  // src/plugins/_core/settings/RecordsPane.ts
  var logger4 = new Logger("Records");
  function RecordsPane(ctx) {
    const list2 = h("ul", { class: "ysrp-list" });
    const empty = h("div", { class: "ysrp-empty", text: t("No saved videos yet.", "还没有保存的视频。") });
    const node = h("div", {}, empty, list2);
    const rows = new Map;
    let renderedKey = null;
    function render() {
      ctx.spin(true);
      try {
        const current = currentId();
        const items = list().sort((a, b) => Number(b.id === current) - Number(a.id === current) || (Number(b.rec.saveDate) || 0) - (Number(a.rec.saveDate) || 0));
        ctx.setCount(items.length);
        empty.style.display = items.length ? "none" : "";
        const key = `${current}|${items.map((item) => item.id).join(",")}`;
        if (key !== renderedKey) {
          renderedKey = key;
          const next = new Map;
          list2.replaceChildren(...items.map(({ id, rec }) => {
            const row = rows.get(id) || RecordRow(id, rec, () => remove2(id));
            next.set(id, row);
            return row.node;
          }));
          rows.clear();
          next.forEach((row, id) => rows.set(id, row));
        }
        for (const { id, rec } of items)
          rows.get(id)?.update(rec, id === current);
      } finally {
        ctx.spin(false);
      }
    }
    function remove2(id) {
      remove(id);
      for (const action of getRecordActions())
        action.onRemoved?.(id);
      render();
    }
    ctx.listen(document, EVT_RECORD, () => {
      if (isOpen())
        render();
    });
    ctx.listen(document, EVT_VIDEO, () => {
      if (isOpen())
        render();
    });
    ctx.listen(document, EVT_TITLE, (event) => {
      const detail = event.detail;
      if (detail && rows.has(detail.videoId))
        rows.get(detail.videoId)?.setDeArrow(detail.title);
    });
    const offActions = onRecordActionsChange(() => {
      rows.clear();
      renderedKey = null;
      if (isOpen())
        render();
    });
    return { node, refresh: render, destroy: offActions };
  }
  function RecordRow(id, initialRecord, onDelete) {
    const url = `https://www.youtube.com/watch?v=${id}`;
    let rec = initialRecord;
    let isCurrent = false;
    let original = normTitle(rec.originalTitle) || knownOriginal(id) || null;
    let dearrow;
    let showOriginal = false;
    const titleEl = h("span", { class: "ysrp-title" });
    const pctEl = h("span", { class: "ysrp-pct" });
    const daButton = h("button", { type: "button", class: "ysrp-ibtn ysrp-da" }, deArrowIcon());
    daButton.addEventListener("click", () => {
      if (typeof dearrow !== "string")
        return;
      showOriginal = !showOriginal;
      if (showOriginal && !original) {
        titleEl.textContent = t("Loading original title…", "正在获取原标题…");
        getOriginal(id).then((value) => {
          original = value || original;
          renderTitle();
        });
        return;
      }
      renderTitle();
    });
    const storedName = () => isPlaceholderTitle(rec.videoName) ? null : normTitle(rec.videoName);
    function renderTitle() {
      const missing = t("Original title unavailable", "未找到原标题");
      if (dearrow === null) {
        daButton.remove();
        titleEl.textContent = original || storedName() || missing;
        return;
      }
      if (dearrow === undefined) {
        daButton.disabled = true;
        daButton.classList.add("is-pending");
        daButton.title = t("Checking DeArrow title…", "正在检测 DeArrow 标题…");
        titleEl.textContent = original || storedName() || t("Loading original title…", "正在获取原标题…");
        return;
      }
      daButton.disabled = false;
      daButton.classList.remove("is-pending");
      daButton.classList.toggle("is-off", showOriginal);
      daButton.title = showOriginal ? t("Show DeArrow title", "恢复 DeArrow 标题") : t("Show original title", "显示原标题");
      daButton.setAttribute("aria-label", daButton.title);
      titleEl.textContent = showOriginal ? original || missing : dearrow;
    }
    function setDeArrow(value) {
      const title = normTitle(value);
      if (title && !sameTitle(title, original)) {
        dearrow = title;
        if (rec.videoName !== title)
          updateIfExists(id, (r) => Object.assign(r, { videoName: title }));
      } else {
        dearrow = null;
        if (isPlaceholderTitle(rec.videoName) && original)
          updateIfExists(id, (r) => Object.assign(r, { videoName: original }));
      }
      renderTitle();
    }
    function resolveTitles() {
      const cached = knownDeArrow(id);
      if (cached !== undefined)
        setDeArrow(cached);
      else if (original && storedName() && !sameTitle(storedName(), original)) {
        dearrow = storedName();
        renderTitle();
      }
      const originalReady = original ? Promise.resolve(original) : getOriginal(id);
      originalReady.then((value) => {
        if (value && !original) {
          original = value;
          renderTitle();
        }
        if (knownDeArrow(id) !== undefined || typeof dearrow === "string")
          return;
        return getDeArrow(id).then(setDeArrow);
      });
    }
    const copiedTip = h("span", { class: "ysrp-status", text: t("Copied", "已复制"), style: { display: "none", flex: "0 0 auto" } });
    const copyBtn = iconButton("copy", t("Copy URL", "复制 URL"), async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.classList.add("is-copied");
        setIcon(copyBtn, "check");
        copiedTip.style.display = "";
        setTimeout(() => {
          copyBtn.classList.remove("is-copied");
          setIcon(copyBtn, "copy");
        }, 1000);
        setTimeout(() => {
          copiedTip.style.display = "none";
        }, 2000);
      } catch (err) {
        logger4.error("copy failed", err);
      }
    }, "is-link");
    const linkPanel = h("div", { class: "ysrp-panel ysrp-link-container" }, h("div", { class: "ysrp-url" }, h("span", { text: t("URL: {url}", "链接：{url}", { url }) }), copiedTip, copyBtn, iconButton("arrow-up-right-from-square", t("Open in new tab", "在新标签页中打开 URL"), () => window.open(url, "_blank"), "is-note")));
    let editing = false;
    let noteTextarea = null;
    const noteText = h("div", { class: "ysrp-note-text" });
    const noteEditButton = iconButton("pencil", t("Edit note", "编辑笔记"), () => editing ? commitNote() : startNote(), "is-link");
    const notePanel = h("div", { class: "ysrp-panel ysrp-note-container" }, h("div", { class: "ysrp-panel-head" }, h("strong", { class: "ysrp-panel-label", text: t("Notes", "笔记") }), noteEditButton), noteText);
    const noteValue = () => typeof rec.videoNote === "string" ? rec.videoNote : "";
    function renderNote() {
      const value = noteValue();
      noteText.textContent = value || t("No notes yet", "暂无笔记");
      noteText.classList.toggle("is-empty", !value);
      const noteOpen = notePanel.classList.contains("is-open");
      noteButton.title = editing ? t("Save & collapse note", "保存并折叠笔记") : value ? noteOpen ? t("Hide notes", "隐藏笔记") : t("Show notes", "显示笔记") : t("Add note", "添加笔记");
      noteEditButton.title = editing ? t("Save note", "保存笔记") : t("Edit note", "编辑笔记");
      setIcon(noteEditButton, editing ? "floppy-disk" : "pencil");
    }
    function setNoteOpen(open) {
      notePanel.classList.toggle("is-open", open);
      renderNote();
    }
    function startNote() {
      if (editing)
        return;
      editing = true;
      const textarea = h("textarea", { class: "ysrp-textarea", rows: "3" });
      textarea.value = noteValue();
      noteTextarea = textarea;
      noteText.replaceWith(textarea);
      setNoteOpen(true);
      requestAnimationFrame(() => {
        try {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        } catch {}
      });
    }
    function commitNote() {
      if (!editing || !noteTextarea)
        return;
      const value = noteTextarea.value.trim();
      editing = false;
      noteTextarea.replaceWith(noteText);
      noteTextarea = null;
      try {
        rec = update(id, (r) => {
          if (value)
            r.videoNote = value;
          else
            delete r.videoNote;
          return r;
        });
      } catch (err) {
        logger4.error("Failed to save note", err);
      }
      renderNote();
    }
    const actions = getRecordActions().map((action) => action.create({ id, url, record: () => rec }));
    const noteButton = iconButton("pen-to-square", t("Show notes", "显示笔记"), () => {
      if (editing) {
        commitNote();
        setNoteOpen(false);
        return;
      }
      if (!noteValue()) {
        startNote();
        return;
      }
      setNoteOpen(!notePanel.classList.contains("is-open"));
    }, "is-note");
    const linkButton = iconButton("link", t("Show / hide URL", "显示/隐藏 URL"), () => linkPanel.classList.toggle("is-open"), "is-link");
    const deleteButton = iconButton("trash-can", t("Delete record", "删除保存记录"), () => onDelete(), "is-delete");
    const node = h("li", { class: "ysrp-row", dataset: { videoId: id } }, h("div", { class: "ysrp-row-top" }, pctEl, titleEl, daButton, actions.map((a) => a.button), noteButton, linkButton, deleteButton), linkPanel, actions.map((a) => a.panel), notePanel);
    function renderPercent() {
      const progress = Number(rec.videoProgress) || 0;
      const duration = Number(rec.videoDuration) || (isCurrent ? currentDuration() : 0);
      pctEl.textContent = duration > 0 ? `${Math.min(100, progress / duration * 100).toFixed(1)}%` : formatTime(progress);
      pctEl.title = duration > 0 ? `${formatTime(progress)} / ${formatTime(duration)}` : t("Saved position", "保存的位置");
    }
    function update2(nextRecord, current) {
      rec = nextRecord;
      isCurrent = Boolean(current);
      node.classList.toggle("is-current", isCurrent);
      if (!original && normTitle(rec.originalTitle))
        original = normTitle(rec.originalTitle);
      renderPercent();
      renderTitle();
      if (!editing)
        renderNote();
      for (const action of actions)
        action.update?.(rec);
    }
    renderTitle();
    renderNote();
    resolveTitles();
    return { node, update: update2, setDeArrow };
  }

  // src/plugins/_core/settings/StoragePane.ts
  function StoragePane(ctx) {
    const modeMsg = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const modeChoice = ChoiceGroup("ysrp-storage-mode", "--ysrp-storage", [
      { value: "local", badge: t("LOCAL", "本地"), label: t("localStorage (default)", "localStorage（默认）"), hint: t("Fast storage scoped to this browser profile.", "快速、本地浏览器可用的存储。") },
      { value: "gm", badge: "GM", label: t("GM storage", "GM 存储"), hint: hasGM ? t("Userscript-manager storage that can sync across profiles.", "由脚本管理器提供、可在配置间同步的存储。") : t("Not available in this userscript manager.", "当前脚本管理器不支持。"), disabled: !hasGM }
    ], getMode());
    const applyButton = textButton("right-left", t("Apply & Migrate", "应用并迁移"), () => {
      const target = modeChoice.value();
      if (!target || target === getMode()) {
        setMessage(modeMsg, t("Already using this backend.", "当前已在使用该存储。"));
        return;
      }
      try {
        const moved = setMode(target);
        ctx.renderModeBadge();
        setMessage(modeMsg, t("Moved {count} record(s).", "已迁移 {count} 条记录。", { count: moved }), "ok");
        emit(EVT_RECORD, { videoId: null });
      } catch (err) {
        modeChoice.select(getMode());
        setMessage(modeMsg, t("Migration failed: {message}", "迁移失败：{message}", { message: errorMessage(err) }), "error");
      }
    });
    applyButton.style.setProperty("--ysrp-btn-accent", "var(--ysrp-storage)");
    applyButton.style.flex = "0 0 auto";
    const storageCard = card("database", "--ysrp-storage", t("Storage Backend", "存储后端"), t("Choose where to store your progress data.", "选择保存进度的存储方式。"), modeChoice.node, h("div", { class: "ysrp-row-actions" }, applyButton, h("span", { class: "ysrp-msg", text: t("Migrates all saved records to the selected backend (moves data).", "将所有记录迁移至所选存储后端（移动数据）。") })), modeMsg);
    const exportMsg = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const exportJson = () => JSON.stringify(exportAll(), null, 2);
    const exportFileName = () => {
      const now = new Date;
      const p = (n) => String(n).padStart(2, "0");
      return `[Youtube] Video Memory「${now.getFullYear()} ${p(now.getMonth() + 1)} ${p(now.getDate())}」「${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}」.json`;
    };
    const copyExport = textButton("copy", t("Copy JSON", "复制 JSON"), async () => {
      try {
        await navigator.clipboard.writeText(exportJson());
        setMessage(exportMsg, t("JSON copied to clipboard.", "JSON 已复制到剪贴板。"), "ok");
      } catch (err) {
        setMessage(exportMsg, t("Copy export failed: {message}", "复制导出失败：{message}", { message: errorMessage(err) }), "error");
      }
    });
    const downloadExport = textButton("file-arrow-down", t("Download JSON", "下载 JSON"), async () => {
      try {
        const json = exportJson();
        const fileName = exportFileName();
        if (runtime.isIOS) {
          if (runtime.canShareFile) {
            try {
              await navigator.share({
                files: [new File([json], fileName, { type: "application/json" })],
                title: t("Video Memory Export", "视频记忆导出"),
                text: t("Choose “Save to Files” to store your backup.", "请选择“存储到文件”以保存备份。")
              });
              setMessage(exportMsg, t("Share sheet opened. Choose “Save to Files”.", "已打开系统分享面板，请选择“存储到文件”。"), "ok");
              return;
            } catch (err) {
              const name = err?.name;
              if (name === "AbortError" || name === "NotAllowedError") {
                setMessage(exportMsg, t("Share cancelled.", "已取消分享。"));
                return;
              }
            }
          } else if (window.open(`data:application/json;charset=utf-8,${encodeURIComponent(json)}`, "_blank", "noopener")) {
            setMessage(exportMsg, t("Export opened in a new tab. Use the share menu to save it.", "已在新标签页打开导出，请通过分享菜单保存。"), "ok");
            return;
          }
        }
        const blobUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const anchor = h("a", { href: blobUrl, download: fileName, style: { display: "none" } });
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          anchor.remove();
          URL.revokeObjectURL(blobUrl);
        }, 1000);
        setMessage(exportMsg, t("Export download started.", "导出下载已开始。"), "ok");
      } catch (err) {
        setMessage(exportMsg, t("Download failed: {message}", "下载失败：{message}", { message: errorMessage(err) }), "error");
      }
    });
    for (const btn of [copyExport, downloadExport])
      btn.style.setProperty("--ysrp-btn-accent", "var(--ysrp-ok)");
    const exportCard = card("file-arrow-down", "--ysrp-ok", t("Export Data", "导出数据"), t("Back up your saved progress as JSON.", "将保存的进度备份为 JSON。"), h("div", { class: "ysrp-row-actions" }, copyExport, downloadExport), h("div", { class: "ysrp-msg", text: t("Exports all saved records from the currently selected backend.", "导出当前存储后端中的所有记录。") }), exportMsg);
    const importMsg = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const overwrite = h("input", { type: "checkbox", class: "ysrp-overwrite" });
    const importText = h("textarea", { class: "ysrp-textarea", rows: "3", placeholder: t("Paste exported JSON here...", "在此粘贴导出的 JSON...") });
    function doImport(text) {
      try {
        const count = importPayload(JSON.parse(text), { overwrite: overwrite.checked });
        setMessage(importMsg, t("Imported {count} record(s).", "已导入 {count} 条记录。", { count }), "ok");
        emit(EVT_RECORD, { videoId: null });
      } catch (err) {
        setMessage(importMsg, t("Import failed: {message}", "导入失败：{message}", { message: errorMessage(err) }), "error");
      }
    }
    const importButton = textButton("file-arrow-up", t("Import from Text", "从文本导入"), () => {
      const text = importText.value.trim();
      if (!text) {
        setMessage(importMsg, t("Nothing to import.", "没有可导入的内容。"));
        return;
      }
      doImport(text);
    });
    const noFile = t("No file chosen", "未选择文件");
    const fileName = h("span", { class: "ysrp-file-name", text: noFile });
    const fileInput = h("input", { type: "file", accept: "application/json,.json" });
    const fileLabel = h("label", { class: `ysrp-file${runtime.isIOS ? " is-ios" : ""}`, tabindex: "0", title: t("Select an export JSON file", "选择要导入的 JSON 文件") }, icon("file-arrow-up"), h("strong", { text: t("Choose File", "选择文件") }), fileName, fileInput);
    if (!runtime.isIOS) {
      const openPicker = (event) => {
        event.preventDefault();
        try {
          if (typeof fileInput.showPicker === "function") {
            fileInput.showPicker();
            return;
          }
        } catch {}
        fileInput.click();
      };
      fileLabel.addEventListener("click", openPicker);
      fileLabel.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ")
          openPicker(event);
      });
    }
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (!file)
        return;
      fileName.textContent = file.name;
      const reader = new FileReader;
      reader.onload = () => {
        importText.value = String(reader.result || "");
        doImport(importText.value);
        fileInput.value = "";
        fileName.textContent = noFile;
      };
      reader.readAsText(file);
    });
    const importCard = card("file-arrow-up", "--ysrp-accent", t("Import Data", "导入数据"), t("Restore a previous export to merge or replace your saved records.", "导入之前的导出文件，用于合并或替换记录。"), h("label", { class: "ysrp-check" }, overwrite, h("strong", { text: t("Overwrite", "覆盖") }), h("span", { class: "ysrp-msg", text: t("Clears the current backend before importing; otherwise records are merged.", "勾选后导入前先清空当前存储后端，否则合并。") })), importText, h("div", { class: "ysrp-row-actions" }, importButton, fileLabel), importMsg);
    return { node: h("div", {}, storageCard, exportCard, importCard) };
  }

  // src/plugins/_core/settings/index.ts
  var tabs2 = [
    { id: "records", order: 10, icon: "database", label: () => t("Records", "记录"), render: RecordsPane },
    { id: "storage", order: 20, icon: "gear", label: () => t("Storage", "存储"), render: StoragePane },
    { id: "plugins", order: 90, icon: "puzzle-piece", label: () => t("Plugins", "插件"), render: PluginsPane },
    { id: "display", order: 100, icon: "globe", label: () => t("Display", "界面"), render: DisplayPane }
  ];
  var languageTimer2 = null;
  var offLanguage2 = null;
  var settings_default = definePlugin({
    name: "Settings",
    title: () => t("Settings dialog", "设置弹窗"),
    description: () => t("The records list, storage, plugins and language settings.", "记录列表，以及存储、插件、语言等设置。"),
    authors: [Devs.V],
    required: true,
    start() {
      mount();
      for (const tab of tabs2)
        addSettingsTab(tab);
      offLanguage2 = on(EVT_LANG, () => {
        if (languageTimer2)
          clearTimeout(languageTimer2);
        languageTimer2 = setTimeout(() => rebuild(), 50);
      });
    },
    stop() {
      offLanguage2?.();
      offLanguage2 = null;
      for (const tab of tabs2)
        removeSettingsTab(tab.id);
      unmount();
    }
  });

  // src/plugins/badgeToggle/styles.css
  var styles_default = `.ysrp-badge-toggle {
    flex: 0 0 auto;
    margin-right: .5rem;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
}

.last-save-info-container.ysrp-badge-hidden {
    opacity: 0;
    pointer-events: none;
}
`;

  // src/plugins/badgeToggle/index.ts
  var settings = definePluginSettings({
    startHidden: {
      type: 2 /* BOOLEAN */,
      default: true,
      description: () => t("Hide the badge when a page opens", "打开页面时先隐藏徽标")
    }
  });
  var button = null;
  var hidden = true;
  var offMount = null;
  function render2(badge) {
    if (!button)
      return;
    button.setAttribute("aria-pressed", String(!hidden));
    button.title = hidden ? t("Show progress badge", "显示进度徽标") : t("Hide progress badge", "隐藏进度徽标");
    button.setAttribute("aria-label", button.title);
    if (badge)
      badge.classList.toggle("ysrp-badge-hidden", hidden);
  }
  function attach(badge) {
    if (!button) {
      button = h("button", { type: "button", class: "ysrp-badge-toggle", text: "\uD83D\uDCBE" });
      shieldFromPlayer(button, () => {
        hidden = !hidden;
        render2(current());
      });
    }
    if (button.nextElementSibling !== badge)
      badge.before(button);
    render2(badge);
  }
  var badgeToggle_default = definePlugin({
    name: "BadgeToggle",
    title: () => t("Badge toggle", "徽标开关"),
    description: () => t("Adds a \uD83D\uDCBE button that shows or hides the progress badge.", "在徽标旁加一个 \uD83D\uDCBE 按钮，点击显示或隐藏进度徽标。"),
    authors: [Devs.V],
    enabledByDefault: true,
    settings,
    start() {
      hidden = settings.store.startHidden;
      registerStyle("badgeToggle", styles_default);
      offMount = onMount(attach);
      const badge = current();
      if (badge)
        attach(badge);
    },
    stop() {
      offMount?.();
      offMount = null;
      button?.remove();
      button = null;
      current()?.classList.remove("ysrp-badge-hidden");
      unregisterStyle("badgeToggle");
    }
  });

  // src/utils/http.ts
  function wrap(status, text) {
    return {
      status,
      ok: status >= 200 && status < 300,
      text,
      json: () => JSON.parse(text || "null")
    };
  }
  var hasGMXhr = () => typeof GM_xmlhttpRequest === "function";
  function request(req) {
    const timeoutMs = req.timeoutMs ?? 30000;
    if (hasGMXhr()) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: req.method,
          url: req.url,
          headers: req.headers,
          data: req.body,
          timeout: timeoutMs,
          onload: (res) => resolve(wrap(res.status, res.responseText ?? "")),
          onerror: () => reject(new Error(`Network error: ${req.method} ${new URL(req.url).host}`)),
          ontimeout: () => reject(new Error(`Timed out: ${req.method} ${new URL(req.url).host}`)),
          onabort: () => reject(new Error("Request aborted"))
        });
      });
    }
    const controller = new AbortController;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: controller.signal, credentials: "omit", cache: "no-store" }).then(async (res) => wrap(res.status, await res.text())).finally(() => clearTimeout(timer));
  }

  // src/plugins/driveSync/drive.ts
  var TOKEN_URL = "https://oauth2.googleapis.com/token";
  var FILES_URL = "https://www.googleapis.com/drive/v3/files";
  var UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
  var FOLDER_NAME = "[Youtube] Video Memory";
  var LEGACY_FILE_NAME = "[Youtube] Video Memory Sync.json";
  var FOLDER_MIME = "application/vnd.google-apps.folder";
  var JSON_MIME = "application/json";
  var FILE_FIELDS = "id,name,modifiedTime";

  class DriveError extends Error {
    status;
    constructor(message, status = 0) {
      super(message);
      this.status = status;
    }
  }
  function readCredentials() {
    let stored = {};
    try {
      stored = JSON.parse(readSecret(KEY_DRIVE) || "{}") || {};
    } catch {}
    return {
      clientId: typeof stored.clientId === "string" ? stored.clientId.trim() : "",
      clientSecret: typeof stored.clientSecret === "string" ? stored.clientSecret.trim() : "",
      refreshToken: typeof stored.refreshToken === "string" ? stored.refreshToken.trim() : ""
    };
  }
  function writeCredentials(creds) {
    let stored = {};
    try {
      stored = JSON.parse(readSecret(KEY_DRIVE) || "{}") || {};
    } catch {}
    writeSecret(KEY_DRIVE, JSON.stringify({ ...stored, ...creds }));
  }
  var hasCredentials = (c) => Boolean(c.clientId && c.clientSecret && c.refreshToken);
  function fileNameFor(title, videoId) {
    const clean = String(title ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120).trim();
    return `${clean || UNKNOWN_TITLE}｜${videoId}.json`;
  }
  function videoIdFromName(name) {
    const m = /(?:｜([\w-]+)|\[([\w-]+)\])\.json$/.exec(name);
    return m ? m[1] || m[2] : null;
  }
  var quote = (value) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  function describe(status, text) {
    try {
      const body = JSON.parse(text);
      const message = body?.error?.message || body?.error_description || body?.error;
      if (message)
        return `HTTP ${status}: ${typeof message === "string" ? message : JSON.stringify(message)}`;
    } catch {}
    return `HTTP ${status}`;
  }

  class DriveClient {
    credentials;
    token = null;
    folder = null;
    constructor(credentials) {
      this.credentials = credentials;
    }
    reset() {
      this.token = null;
      this.folder = null;
    }
    async accessToken(force = false) {
      if (!force && this.token && Date.now() < this.token.expiresAt)
        return this.token.value;
      const c = this.credentials();
      if (!hasCredentials(c))
        throw new DriveError("Missing credentials");
      const body = new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        refresh_token: c.refreshToken,
        grant_type: "refresh_token"
      }).toString();
      const res = await request({ method: "POST", url: TOKEN_URL, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      if (!res.ok)
        throw new DriveError(describe(res.status, res.text), res.status);
      const data = res.json();
      if (!data?.access_token)
        throw new DriveError("Token response has no access_token");
      const lifetime = (Number(data.expires_in) || 3600) * 1000;
      this.token = { value: data.access_token, expiresAt: Date.now() + Math.max(0, lifetime - 60000) };
      return this.token.value;
    }
    async call(method, url, init = {}, retry = true) {
      const token = await this.accessToken();
      const res = await request({ method, url, headers: { ...init.headers, Authorization: `Bearer ${token}` }, body: init.body });
      if (res.status === 401 && retry) {
        this.token = null;
        return this.call(method, url, init, false);
      }
      if (!res.ok && !(method === "DELETE" && res.status === 404))
        throw new DriveError(describe(res.status, res.text), res.status);
      return res.text;
    }
    async list(q, orderBy) {
      const params = new URLSearchParams({ q, fields: `files(${FILE_FIELDS})`, pageSize: "100", spaces: "drive" });
      if (orderBy)
        params.set("orderBy", orderBy);
      const text = await this.call("GET", `${FILES_URL}?${params}`);
      return JSON.parse(text || "{}").files ?? [];
    }
    async folderId() {
      if (this.folder)
        return this.folder;
      const found = await this.list(`name = ${quote(FOLDER_NAME)} and mimeType = ${quote(FOLDER_MIME)} and trashed = false`, "createdTime");
      if (found[0])
        return this.folder = found[0].id;
      const text = await this.call("POST", `${FILES_URL}?fields=id`, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME })
      });
      return this.folder = JSON.parse(text).id;
    }
    async filesFor(videoId) {
      const folder = await this.folderId();
      const files = await this.list(`name contains ${quote(videoId)} and mimeType = ${quote(JSON_MIME)} and trashed = false and ${quote(folder)} in parents`, "modifiedTime desc");
      return files.filter((f) => videoIdFromName(f.name) === videoId);
    }
    async findByName(name) {
      return this.list(`name = ${quote(name)} and trashed = false`, "modifiedTime desc");
    }
    async download(fileId) {
      const text = await this.call("GET", `${FILES_URL}/${encodeURIComponent(fileId)}?alt=media`);
      return JSON.parse(text);
    }
    async upload(name, content, existingId) {
      const boundary = `ysrp-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      const metadata = { name, mimeType: JSON_MIME };
      if (!existingId)
        metadata.parents = [await this.folderId()];
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(metadata),
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(content),
        `--${boundary}--`,
        ""
      ].join(`\r
`);
      const url = existingId ? `${UPLOAD_URL}/${encodeURIComponent(existingId)}?uploadType=multipart&fields=${FILE_FIELDS}` : `${UPLOAD_URL}?uploadType=multipart&fields=${FILE_FIELDS}`;
      const text = await this.call(existingId ? "PATCH" : "POST", url, {
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body
      });
      return JSON.parse(text);
    }
    async remove(fileId) {
      await this.call("DELETE", `${FILES_URL}/${encodeURIComponent(fileId)}`);
    }
  }

  // src/plugins/driveSync/sync.ts
  var logger5 = new Logger("DriveSync");
  var DEBOUNCE_MS = 1500;
  var MIN_INTERVAL_MS = 15000;
  var RETRY_MS = 30000;
  var PAYLOAD_VERSION = "2";
  var client = new DriveClient(readCredentials);
  var queue = new Map;
  var lastUpload = new Map;
  var timer3 = null;
  var timerDue = 0;
  var running = false;
  var rerun = false;
  var active2 = false;
  var fullSyncPending = false;
  var status = { state: "idle", done: 0, total: 0, message: "", at: 0 };
  var configured = () => hasCredentials(readCredentials());
  var getStatus = () => status;
  function setStatus(next) {
    status = { done: 0, total: 0, message: "", ...next, at: Date.now() };
    emit(EVT_DRIVE_STATUS, status);
  }
  function arm(ms) {
    if (!active2)
      return;
    const due = Date.now() + Math.max(0, ms);
    if (timer3 && timerDue <= due)
      return;
    if (timer3)
      clearTimeout(timer3);
    timerDue = due;
    timer3 = setTimeout(() => {
      timer3 = null;
      flush2();
    }, Math.max(0, ms));
  }
  function schedule(videoId, action, force = false) {
    if (!active2 || !configured())
      return;
    const previous = queue.get(videoId);
    queue.set(videoId, { action, force: force || previous?.action === action && previous.force });
    arm(DEBOUNCE_MS);
  }
  var stripMeta = ({ driveSync: _meta, ...rest }) => rest;
  async function uploadRecord(videoId, force) {
    const startedAt = Date.now();
    const rec = get(videoId);
    if (!rec)
      return false;
    if (!force && (Number(rec.updatedAt) || 0) <= (Number(rec.driveSync?.lastUploadAt) || 0))
      return false;
    const files = await client.filesFor(videoId);
    const payload = {
      version: PAYLOAD_VERSION,
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      exportedAt: startedAt,
      record: stripMeta(rec)
    };
    const saved = await client.upload(fileNameFor(rec.videoName, videoId), payload, files[0]?.id);
    for (const extra of files.slice(1))
      await client.remove(extra.id);
    const remoteModifiedAt = Date.parse(saved?.modifiedTime) || Date.now();
    updateIfExists(videoId, (r) => ({ ...r, driveSync: { ...r.driveSync, lastUploadAt: startedAt, remoteModifiedAt } }), { touch: false, source: "sync" });
    return true;
  }
  async function removeRemote(videoId) {
    for (const file of await client.filesFor(videoId))
      await client.remove(file.id);
  }
  async function flush2() {
    if (!active2)
      return;
    if (running) {
      rerun = true;
      return;
    }
    if (!queue.size)
      return;
    running = true;
    let failed = false;
    try {
      const total = queue.size;
      let done = 0;
      let nextDue = Infinity;
      setStatus({ state: "start", done, total });
      for (const [videoId, job] of [...queue]) {
        if (!active2)
          break;
        const last = lastUpload.get(videoId) || 0;
        if (!job.force && job.action === "set" && Date.now() - last < MIN_INTERVAL_MS) {
          nextDue = Math.min(nextDue, last + MIN_INTERVAL_MS);
          continue;
        }
        queue.delete(videoId);
        try {
          if (job.action === "remove")
            await removeRemote(videoId);
          else if (await uploadRecord(videoId, job.force))
            lastUpload.set(videoId, Date.now());
        } catch (err) {
          failed = true;
          if (!queue.has(videoId))
            queue.set(videoId, job);
          logger5.warn(`${job.action} ${videoId} failed`, err);
          setStatus({ state: "error", done, total, message: errorMessage(err) });
          arm(RETRY_MS);
          break;
        }
        done++;
        setStatus({ state: "progress", done, total });
      }
      if (!failed) {
        if (nextDue < Infinity) {
          setStatus({ state: "deferred", done, total });
          arm(nextDue - Date.now());
        } else {
          if (fullSyncPending && !queue.size) {
            fullSyncPending = false;
            writeSetting(KEY_DRIVE_FULL_SYNC, "1");
          }
          setStatus({ state: "done", done, total });
        }
      }
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        arm(0);
      }
    }
  }
  function uploadAll() {
    if (!active2 || !configured())
      return 0;
    const items = list();
    for (const { id } of items)
      queue.set(id, { action: "set", force: true });
    arm(0);
    return items.length;
  }
  async function importLegacy() {
    const [file] = await client.findByName(LEGACY_FILE_NAME);
    if (!file)
      return 0;
    const payload = await client.download(file.id);
    const count = importPayload(payload, {
      source: "sync",
      accept: (_id, incoming, existing) => !existing || (Number(incoming.saveDate) || 0) > (Number(existing.saveDate) || 0)
    });
    if (count)
      emit(EVT_RECORD, { videoId: null });
    logger5.info(`Imported ${count} record(s) from ${LEGACY_FILE_NAME}`);
    return count;
  }
  async function fullSync() {
    if (!active2 || !configured())
      return;
    fullSyncPending = true;
    try {
      await importLegacy();
    } catch (err) {
      logger5.warn("Legacy import failed", err);
    }
    uploadAll();
  }
  function maybeFirstFullSync() {
    if (readSetting(KEY_DRIVE_FULL_SYNC) !== "1")
      fullSync();
  }
  async function pullRecord(videoId) {
    if (!active2 || !configured())
      return;
    const [file] = await client.filesFor(videoId);
    const local = get(videoId);
    if (!file) {
      if (local)
        schedule(videoId, "set");
      return;
    }
    const remoteTime = Date.parse(file.modifiedTime) || 0;
    const meta = local?.driveSync ?? {};
    const newer = remoteTime > (Number(local?.updatedAt) || 0) && remoteTime > (Number(meta.lastDownloadAt) || 0) && remoteTime > (Number(meta.remoteModifiedAt) || 0);
    if (!newer) {
      if (local && (Number(local.updatedAt) || 0) > (Number(meta.lastUploadAt) || 0))
        schedule(videoId, "set");
      return;
    }
    const payload = await client.download(file.id);
    const remote = payload?.record;
    if (!remote || typeof remote !== "object" || Array.isArray(remote) || payload.videoId && payload.videoId !== videoId)
      return;
    const now = Date.now();
    update(videoId, (r) => ({
      ...r,
      ...stripMeta(remote),
      updatedAt: Number(remote.updatedAt) || remoteTime,
      driveSync: { ...r.driveSync, lastDownloadAt: now, lastUploadAt: now, remoteModifiedAt: remoteTime }
    }), { touch: false, source: "sync" });
    emit(EVT_RECORD, { videoId, videoProgress: remote.videoProgress });
  }
  function activate() {
    active2 = true;
    if (queue.size)
      arm(DEBOUNCE_MS);
  }
  function deactivate() {
    active2 = false;
    if (timer3)
      clearTimeout(timer3);
    timer3 = null;
    queue.clear();
    fullSyncPending = false;
    setStatus({ state: "idle" });
  }

  // src/plugins/driveSync/DrivePane.ts
  function statusText(s) {
    if (!configured())
      return t("Not configured: fill in the three fields below.", "未配置：请填写下面三项。");
    switch (s.state) {
      case "start":
      case "progress":
        return t("Syncing… {done} / {total}", "同步中… {done} / {total}", { done: s.done, total: s.total });
      case "done":
        return t("Synced at {time}", "已同步（{time}）", { time: new Date(s.at).toLocaleTimeString() });
      case "deferred":
        return t("Waiting a few seconds before the next upload…", "稍后继续上传…");
      case "error":
        return t("Sync failed: {message}", "同步出错：{message}", { message: s.message });
      default:
        return t("Ready. Changes upload automatically.", "已就绪，修改会自动上传。");
    }
  }
  function DrivePane(ctx) {
    const creds = readCredentials();
    const clientId = h("input", { class: "ysrp-input", type: "text", placeholder: "xxxx.apps.googleusercontent.com", autocomplete: "off", spellcheck: "false" });
    const secret = secretInput("GOCSPX-…", () => t("Show", "显示"), () => t("Hide", "隐藏"), "--ysrp-accent");
    const token = secretInput("1//…", () => t("Show", "显示"), () => t("Hide", "隐藏"), "--ysrp-accent");
    clientId.value = creds.clientId;
    secret.input.value = creds.clientSecret;
    token.input.value = creds.refreshToken;
    const status = h("div", { class: "ysrp-msg ysrp-drive-status" });
    const result = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const renderStatus = () => {
      const s = getStatus();
      status.textContent = statusText(s);
      status.className = `ysrp-msg ysrp-drive-status${s.state === "error" ? " is-error" : s.state === "done" ? " is-ok" : ""}`;
    };
    const save = textButton("floppy-disk", t("Save & verify", "保存并验证"), async () => {
      const next = { clientId: clientId.value.trim(), clientSecret: secret.input.value.trim(), refreshToken: token.input.value.trim() };
      const wasConfigured = configured();
      writeCredentials(next);
      client.reset();
      renderStatus();
      if (!hasCredentials(next)) {
        setMessage(result, t("Saved. All three fields are needed to sync.", "已保存。三项都填写后才会同步。"));
        return;
      }
      save.disabled = true;
      setMessage(result, t("Checking…", "正在验证…"));
      try {
        await client.accessToken(true);
        setMessage(result, t("Connected to Google Drive.", "已连接 Google Drive。"), "ok");
        if (!wasConfigured)
          fullSync();
      } catch (err) {
        setMessage(result, t("Could not connect: {message}", "连接失败：{message}", { message: errorMessage(err) }), "error");
      } finally {
        save.disabled = false;
      }
    });
    const upload = textButton("cloud-arrow-up", t("Upload all", "全部上传"), () => {
      if (!configured()) {
        setMessage(result, t("Fill in and save the credentials first.", "请先填写并保存凭据。"), "error");
        return;
      }
      const count = uploadAll();
      setMessage(result, t("Uploading {count} record(s)…", "正在上传 {count} 条记录…", { count }));
    });
    upload.style.setProperty("--ysrp-btn-accent", "var(--ysrp-ok)");
    ctx.listen(document, EVT_DRIVE_STATUS, renderStatus);
    renderStatus();
    return {
      node: h("div", {}, card("cloud", "--ysrp-accent", t("Google Drive sync", "Google Drive 同步"), t("Each video is saved as one JSON file in the “{folder}” folder of your Drive, and pulled back when you open the video on another device.", "每个视频在你云端硬盘的“{folder}”文件夹里保存为一个 JSON 文件；在另一台设备打开该视频时会先拉取云端进度。", { folder: FOLDER_NAME }), status, field(t("OAuth client ID", "OAuth 客户端 ID"), clientId), field(t("Client secret", "客户端密钥"), secret.node), field(t("Refresh token", "Refresh token"), token.node), h("div", { class: "ysrp-row-actions" }, save, upload), result), card("circle-info", "--ysrp-fg", t("Getting credentials", "如何获取凭据"), t("Create an OAuth client in Google Cloud Console, enable the Drive API, then use the OAuth Playground with your own client and the Drive scope to get a refresh token.", "在 Google Cloud Console 创建 OAuth 客户端并启用 Drive API，然后在 OAuth Playground 里用你自己的客户端和 Drive 权限换取 refresh token。"))),
      refresh: renderStatus
    };
  }

  // src/plugins/driveSync/index.ts
  var STARTUP_DELAY_MS = 2000;
  var offChange = null;
  var startupTimer = null;
  var driveSync_default = definePlugin({
    name: "DriveSync",
    title: () => t("Google Drive sync", "云同步"),
    description: () => t("Keeps your records in your own Google Drive and picks up progress from other devices.", "把记录同步到你自己的 Google Drive，在其它设备上接着看。"),
    authors: [Devs.V],
    enabledByDefault: true,
    settingsTab: {
      id: "drive",
      order: 40,
      icon: "cloud",
      label: () => t("Sync", "云同步"),
      render: DrivePane
    },
    start() {
      activate();
      offChange = onRecordChange((change) => {
        if (change.source !== "local" || !change.id)
          return;
        if (change.type === "set")
          schedule(change.id, "set");
        else if (change.type === "remove")
          schedule(change.id, "remove");
      });
      startupTimer = setTimeout(() => {
        if (configured())
          maybeFirstFullSync();
      }, STARTUP_DELAY_MS);
    },
    stop() {
      offChange?.();
      offChange = null;
      if (startupTimer)
        clearTimeout(startupTimer);
      startupTimer = null;
      deactivate();
    },
    beforeRestore(videoId) {
      if (!configured())
        return;
      return pullRecord(videoId);
    }
  });

  // src/plugins/transcript/api.ts
  var SUFFIX = "/v1/chat/completions";
  var DEFAULTS = Object.freeze({
    endpoint: "https://0-v-YouTube-Transcript-Generator-api.hf.space/v1/chat/completions",
    model: "transcript",
    apiKey: "sk-asdlfjalalfja",
    timeoutMs: 10 * 60 * 1000
  });
  var MIN_MINUTES = 1;
  var MAX_MINUTES = 60;
  var CACHE_TTL_MS = 30 * 60 * 1000;
  var cache = new Map;
  var inflight = new Map;
  function clampTimeoutMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0)
      return DEFAULTS.timeoutMs;
    return Math.min(MAX_MINUTES * 60000, Math.max(MIN_MINUTES * 60000, Math.round(n)));
  }
  function normalizeEndpoint(value) {
    let raw = typeof value === "string" ? value.trim() : "";
    if (!raw)
      return "";
    if (!/^https?:\/\//i.test(raw))
      raw = `https://${raw}`;
    try {
      const url = new URL(raw);
      const path = url.pathname.replace(/\/+$/, "");
      url.pathname = path || SUFFIX;
      return url.toString().replace(/\/+$/, "");
    } catch {
      const trimmed = raw.replace(/\/+$/, "");
      return /\/\/[^/]+$/.test(trimmed) ? trimmed + SUFFIX : trimmed;
    }
  }
  function getSettings() {
    const merged = { ...DEFAULTS, ...readJsonSetting(KEY_TRANSCRIPT) };
    return {
      endpoint: normalizeEndpoint(merged.endpoint) || DEFAULTS.endpoint,
      model: String(merged.model || DEFAULTS.model),
      apiKey: typeof merged.apiKey === "string" ? merged.apiKey : "",
      timeoutMs: clampTimeoutMs(merged.timeoutMs)
    };
  }
  function saveSettings(partial) {
    const next = getSettings();
    if (typeof partial.endpoint === "string" && partial.endpoint.trim())
      next.endpoint = normalizeEndpoint(partial.endpoint);
    if (typeof partial.model === "string" && partial.model.trim())
      next.model = partial.model.trim();
    if (typeof partial.apiKey === "string" && partial.apiKey.trim())
      next.apiKey = partial.apiKey.trim();
    if (partial.timeoutMs !== undefined && Number(partial.timeoutMs) > 0)
      next.timeoutMs = clampTimeoutMs(partial.timeoutMs);
    writeSetting(KEY_TRANSCRIPT, JSON.stringify(next));
    return next;
  }
  function extractText(payload) {
    if (!payload)
      return "";
    if (typeof payload === "string")
      return payload.trim();
    if (Array.isArray(payload))
      return payload.map(extractText).filter(Boolean).join(`
`).trim();
    if (payload.error?.message)
      throw new Error(payload.error.message);
    if (typeof payload.transcript === "string")
      return payload.transcript.trim();
    if (Array.isArray(payload.transcript))
      return payload.transcript.join(`
`).trim();
    if (typeof payload.output_text === "string")
      return payload.output_text.trim();
    if (Array.isArray(payload.output_text))
      return payload.output_text.join(`
`).trim();
    if (Array.isArray(payload.output)) {
      const joined = payload.output.flatMap((entry) => entry && Array.isArray(entry.content) ? entry.content : []).map((part) => part && typeof part.text === "string" ? part.text : "").filter(Boolean).join(`
`).trim();
      if (joined)
        return joined;
    }
    if (Array.isArray(payload.choices)) {
      const joined = payload.choices.map((choice) => {
        if (!choice)
          return "";
        const content = choice.message?.content;
        if (typeof content === "string")
          return content;
        if (Array.isArray(content))
          return content.map((part) => part?.text || "").join(`
`);
        return typeof choice.text === "string" ? choice.text : "";
      }).filter(Boolean).join(`
`).trim();
      if (joined)
        return joined;
    }
    if (typeof payload.text === "string")
      return payload.text.trim();
    if (typeof payload.data === "string")
      return payload.data.trim();
    return "";
  }
  function cached(id) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at <= CACHE_TTL_MS)
      return hit.text;
    const rec = get(id);
    if (rec && typeof rec.videoTranscript === "string" && rec.videoTranscript.trim()) {
      const text = rec.videoTranscript.trim();
      cache.set(id, { text, at: rec.videoTranscriptUpdatedAt || Date.now() });
      return text;
    }
    return "";
  }
  function fetchFor(id, force) {
    if (!id)
      return Promise.reject(new Error(t("Cannot detect the video id.", "无法识别当前视频 ID。")));
    if (!force) {
      const hit = cached(id);
      if (hit)
        return Promise.resolve(hit);
    }
    const pending = inflight.get(id);
    if (pending)
      return pending;
    const settings = getSettings();
    if (!settings.endpoint)
      return Promise.reject(new Error(t("Please configure the transcript endpoint first.", "请先配置字幕接口路径。")));
    const headers = { "Content-Type": "application/json" };
    if (settings.apiKey.trim())
      headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
    const body = JSON.stringify({
      model: settings.model,
      messages: [{ role: "user", content: `https://www.youtube.com/watch?v=${id}` }]
    });
    const minutes = Math.round(settings.timeoutMs / 60000);
    const controller = new AbortController;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          controller.abort();
        } catch {}
        reject(new Error(t("The transcript endpoint did not respond within {n} minute(s); request cancelled.", "字幕接口在 {n} 分钟内无响应，已自动取消请求。", { n: minutes })));
      }, settings.timeoutMs);
    });
    const requestText = (async () => {
      const res = await fetch(settings.endpoint, { method: "POST", headers, body, signal: controller.signal });
      const rawText = await res.text();
      let payload = rawText;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {}
      if (!res.ok) {
        const detail = payload?.error?.message || payload?.message || rawText || `HTTP ${res.status}`;
        throw new Error(String(detail));
      }
      const text = extractText(payload);
      if (!text)
        throw new Error(t("The transcript endpoint returned no content.", "字幕接口未返回有效内容。"));
      cache.set(id, { text, at: Date.now() });
      updateIfExists(id, (rec) => Object.assign(rec, { videoTranscript: text, videoTranscriptUpdatedAt: Date.now() }));
      return text;
    })();
    const promise = Promise.race([requestText, timeout]).finally(() => {
      clearTimeout(timer);
      inflight.delete(id);
    });
    inflight.set(id, promise);
    return promise;
  }

  // src/plugins/transcript/TranscriptPane.ts
  function TranscriptPane(ctx) {
    const settings = getSettings();
    const endpoint = h("input", { class: "ysrp-input", type: "text", placeholder: "https://example.com/v1/chat/completions", autocomplete: "off", spellcheck: "false" });
    const model = h("input", { class: "ysrp-input", type: "text", placeholder: "transcript", autocomplete: "off", spellcheck: "false" });
    const apiKey = secretInput("sk-***", () => t("Show", "显示"), () => t("Hide", "隐藏"), "--ysrp-transcript");
    const timeout = h("input", { class: "ysrp-input", type: "number", min: String(MIN_MINUTES), max: String(MAX_MINUTES), step: "1", placeholder: "10" });
    endpoint.value = settings.endpoint;
    model.value = settings.model;
    apiKey.input.value = settings.apiKey;
    timeout.value = String(Math.round(settings.timeoutMs / 60000));
    let timer;
    const persist = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const minutes = parseFloat(timeout.value);
        saveSettings({
          endpoint: endpoint.value,
          model: model.value,
          apiKey: apiKey.input.value,
          timeoutMs: Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : undefined
        });
      }, 250);
    };
    for (const input of [endpoint, model, apiKey.input, timeout]) {
      input.addEventListener("input", persist);
      input.addEventListener("change", persist);
    }
    const videoTitle = h("span");
    const videoId = h("span", { class: "ysrp-mono" });
    const videoIdRow = h("div", { class: "ysrp-info-row" }, h("b", { text: t("Video ID", "视频 ID") }), videoId);
    function updateVideo() {
      const id = currentId();
      if (!id) {
        videoTitle.textContent = t("No active video detected", "未检测到可用的影片");
        videoIdRow.style.display = "none";
        return;
      }
      const rec = get(id);
      videoTitle.textContent = knownDeArrow(id) || knownOriginal(id) || (rec && !isPlaceholderTitle(rec.videoName) ? rec.videoName : "") || UNKNOWN_TITLE;
      videoId.textContent = id;
      videoIdRow.style.display = "";
    }
    updateVideo();
    ctx.listen(document, EVT_VIDEO, updateVideo);
    return {
      node: h("div", {}, card("closed-captioning", "--ysrp-transcript", t("Subtitles · Transcript", "字幕与接口设置"), t("Configure the OpenAI-compatible endpoint used for subtitles. Fetching lives in the Records tab.", "配置字幕接口（兼容 OpenAI）。字幕获取功能位于“记录”标签。"), field(t("API Endpoint", "API 接口路径"), endpoint), field(t("Model", "模型名称"), model), field(t("API Key", "API 密钥"), apiKey.node), field(t("Timeout (minutes)", "超时时长（分钟）"), timeout)), card("pen-to-square", "--ysrp-fg", t("Status & Tips", "状态与提示"), t("These settings apply instantly. Use the Records tab to fetch transcripts for specific videos.", "设置立即生效，具体字幕获取请在“记录”标签中触发。"), h("div", { class: "ysrp-info" }, h("div", { class: "ysrp-info-row" }, h("b", { text: t("Active video", "当前视频") }), videoTitle), videoIdRow))),
      refresh: updateVideo
    };
  }

  // src/plugins/transcript/index.ts
  var openState = new Set;
  function TranscriptAction({ id }) {
    const status = h("span", { class: "ysrp-status" });
    const output = h("textarea", { class: "ysrp-textarea is-mono", readonly: "readonly", rows: "5", placeholder: t("Transcript will appear here…", "字幕内容加载后会显示在这里…") });
    let loading = false;
    const setStatus = (text, isError = false) => {
      status.textContent = text || "";
      status.classList.toggle("is-error", isError);
    };
    const refresh = iconButton("arrows-rotate", t("Refresh transcript", "刷新字幕"), () => load(true));
    const copy = iconButton("copy", t("Copy transcript", "复制字幕"), async () => {
      if (!output.value.trim())
        return setStatus(t("No transcript content to copy.", "暂无字幕内容可复制。"));
      try {
        await navigator.clipboard.writeText(output.value.trim());
        setStatus(t("Transcript copied.", "字幕内容已复制。"));
      } catch (err) {
        setStatus(t("Copy failed: {message}", "复制失败：{message}", { message: errorMessage(err) }), true);
      }
    }, "is-link");
    const panel = h("div", { class: "ysrp-panel ysrp-transcript-container" }, h("div", { class: "ysrp-panel-head" }, h("div", { class: "ysrp-header-left" }, h("strong", { class: "ysrp-panel-label", text: t("Transcript", "字幕") }), status), h("div", { class: "ysrp-header-left" }, refresh, copy)), output);
    const button = iconButton("closed-captioning", t("Show transcript", "获取字幕"), () => setOpen(!panel.classList.contains("is-open")), "is-transcript");
    function setOpen(open) {
      panel.classList.toggle("is-open", open);
      button.title = open ? t("Hide transcript", "隐藏字幕") : t("Show transcript", "获取字幕");
      if (open)
        openState.add(id);
      else
        openState.delete(id);
      if (open && !output.value)
        load(false);
    }
    function load(force) {
      if (loading)
        return;
      if (!force) {
        const hit = cached(id);
        if (hit) {
          output.value = hit;
          copy.disabled = false;
          setStatus(t("Transcript loaded from cache.", "字幕来自缓存。"));
          return;
        }
      }
      loading = true;
      refresh.disabled = true;
      button.disabled = true;
      setStatus(t("Loading…", "正在获取…"));
      fetchFor(id, force).then((text) => {
        output.value = text;
        setStatus(t("Transcript updated ({time})", "字幕已更新（{time}）", { time: new Date().toLocaleTimeString() }));
      }).catch((err) => setStatus(t("Transcript failed: {message}", "字幕获取失败：{message}", { message: errorMessage(err) }), true)).finally(() => {
        loading = false;
        refresh.disabled = false;
        button.disabled = false;
        copy.disabled = !output.value;
      });
    }
    if (openState.has(id))
      setOpen(true);
    return { button, panel };
  }
  var transcript_default = definePlugin({
    name: "Transcript",
    title: () => t("Transcript", "字幕"),
    description: () => t("Fetch a video's transcript from an OpenAI-compatible endpoint, from the records list.", "在记录列表里通过兼容 OpenAI 的接口获取视频字幕。"),
    authors: [Devs.V],
    enabledByDefault: true,
    settingsTab: {
      id: "transcript",
      order: 30,
      icon: "closed-captioning",
      label: () => t("Transcript", "字幕"),
      render: TranscriptPane
    },
    recordAction: {
      id: "transcript",
      order: 10,
      create: TranscriptAction,
      onRemoved: (id) => openState.delete(id)
    }
  });

  // virtual:~plugins
  var __plugins_default = { [engine_default.name]: engine_default, [playerBadge_default.name]: playerBadge_default, [settings_default.name]: settings_default, [badgeToggle_default.name]: badgeToggle_default, [driveSync_default.name]: driveSync_default, [transcript_default.name]: transcript_default };

  // src/api/PluginManager.ts
  var logger6 = new Logger("PluginManager");
  var plugins = {};
  var order = [];
  var toggleListeners = new Set;
  for (const plugin of Object.values(__plugins_default)) {
    plugin.started = false;
    if (plugin.settings)
      plugin.settings.pluginName = plugin.name;
    plugins[plugin.name] = plugin;
    order.push(plugin.name);
  }
  onPluginSettingChange((name, key) => {
    const plugin = plugins[name];
    if (key === "enabled" || !plugin?.started)
      return;
    try {
      plugin.onSettingsChange?.(key);
    } catch (err) {
      logger6.error(`${name}.onSettingsChange failed`, err);
    }
  });
  function listPlugins() {
    return order.map((name) => plugins[name]);
  }
  function isPluginEnabled(name) {
    const plugin = plugins[name];
    if (!plugin)
      return false;
    if (plugin.required)
      return true;
    return getPluginSettings(name)?.enabled ?? plugin.enabledByDefault ?? false;
  }
  function startPlugin(plugin) {
    if (plugin.started)
      return true;
    try {
      plugin.start?.();
      if (plugin.settingsTab)
        addSettingsTab(plugin.settingsTab);
      if (plugin.recordAction)
        addRecordAction(plugin.recordAction);
      if (plugin.beforeRestore)
        addRestoreHook(plugin.name, plugin.beforeRestore.bind(plugin));
      plugin.started = true;
      return true;
    } catch (err) {
      logger6.error(`Failed to start ${plugin.name}`, err);
      return false;
    }
  }
  function stopPlugin(plugin) {
    if (!plugin.started)
      return true;
    try {
      if (plugin.settingsTab)
        removeSettingsTab(plugin.settingsTab.id);
      if (plugin.recordAction)
        removeRecordAction(plugin.recordAction.id);
      removeRestoreHook(plugin.name);
      plugin.stop?.();
      plugin.started = false;
      return true;
    } catch (err) {
      logger6.error(`Failed to stop ${plugin.name}`, err);
      return false;
    }
  }
  function setPluginEnabled(name, enabled) {
    const plugin = plugins[name];
    if (!plugin || plugin.required)
      return false;
    setPluginSetting(name, "enabled", enabled);
    const ok = enabled ? startPlugin(plugin) : stopPlugin(plugin);
    for (const listener of toggleListeners)
      listener();
    return ok;
  }
  function onPluginToggle(listener) {
    toggleListeners.add(listener);
    return () => toggleListeners.delete(listener);
  }
  function startAllPlugins() {
    for (const name of order) {
      if (isPluginEnabled(name))
        startPlugin(plugins[name]);
    }
  }

  // src/styles.css
  var styles_default2 = `.ysrp-theme, .last-save-info-container {
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
.ysrp-url { display: flex; align-items: center; gap: 4px; word-break: break-all; color: var(--ysrp-sub); text-align: left; }
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
.ysrp-plugin { gap: 8px; }
.ysrp-plugin-head { display: flex; align-items: flex-start; gap: 12px; }
.ysrp-plugin-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ysrp-plugin-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; }
.ysrp-plugin-desc { color: var(--ysrp-sub); }
.ysrp-plugin-tag { font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 6px; background: var(--ysrp-hover); color: var(--ysrp-accent); }
.ysrp-plugin-settings { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; border-top: 1px solid var(--ysrp-border); }
.ysrp-plugin-settings[hidden] { display: none; }
.ysrp-switch { position: relative; flex: 0 0 auto; width: 36px; height: 20px; margin-top: 2px; padding: 0; border: none; border-radius: 10px; background: var(--ysrp-thumb); cursor: pointer; transition: background .15s; }
.ysrp-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; }
.ysrp-switch[aria-checked="true"] { background: var(--ysrp-accent); }
.ysrp-switch[aria-checked="true"]::after { transform: translateX(16px); }
.ysrp-switch:disabled { opacity: .5; cursor: default; }
.ysrp-select { width: 100%; padding: 6px 8px; border: 1px solid var(--ysrp-input-border); border-radius: 6px; background: var(--ysrp-input); color: var(--ysrp-fg); font: inherit; }
`;

  // src/index.ts
  var logger7 = new Logger("Core");
  var flag = "__ysrpVideoMemory";
  var host = window;
  if (!host[flag]) {
    host[flag] = { version: "[20261010] v2.1.0", plugins };
    try {
      registerStyle("core", styles_default2);
      ensureFontAwesome();
      startAllPlugins();
    } catch (err) {
      logger7.error("Fatal init error", err);
    }
  }
})();
