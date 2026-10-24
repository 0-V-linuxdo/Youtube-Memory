// Plugin manager (N-4): definitions, enable state, ordered start, live start/stop with full cleanup.

import { pick, tr, type Bilingual } from '../utils/i18n';
import { addStyle } from '../utils/dom';
import { Emitter } from './events';
import { addBeforeRestoreHook, type BeforeRestoreHook } from './hooks';
import { reloadPluginStore, setStoredValue, storedValue } from './pluginSettings';
import { registerRowButton, type RowContribution } from './rows';
import { showToast } from './toast';

/** N-4.5: switch, text (optionally secret), number, select, slider (N-12.3), and a custom panel drawn by the plugin. */
export type SettingType = 'switch' | 'text' | 'number' | 'select' | 'slider' | 'custom';

/** Static bilingual text, or a function evaluated each time the dialog is drawn. */
export type SettingText = Bilingual | (() => string);

export function settingText(text: SettingText | undefined): string {
  if (!text) return '';
  return typeof text === 'function' ? text() : pick(text);
}

export interface SettingDef {
  type: SettingType;
  /** Not used by custom panels. */
  default?: string | number | boolean;
  label?: SettingText;
  description?: SettingText;
  hidden?: boolean;
  /** text: password input with a Show / Hide button (N-5.6.3). */
  secret?: boolean;
  options?: Array<{ value: string; label: SettingText }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  /** N-5.7.6: map the value onto an existing storage key instead of YSRP_Plugins. */
  get?(): unknown;
  set?(value: unknown): void;
  /** N-12.1: an error text when the value is invalid (it is then not saved), otherwise null. */
  validate?(value: unknown): string | null;
  /** N-12.2: re-evaluated after any setting or plugin change; the row is disabled while true. */
  disabled?(): boolean;
  disabledReason?: SettingText;
  /** slider: text shown after the slider, e.g. "4 s". */
  format?(value: number): string;
  /** custom: draw the panel (only N-5.2 parts) into the element; may return a cleanup. */
  render?(el: HTMLElement): void | (() => void);
}

export interface PluginDef {
  name: string;
  displayName: Bilingual;
  description: Bilingual;
  authors: string[];
  icon: string;
  enabledByDefault?: boolean;
  required?: boolean;
  /** N-13: internal names of plugins that must run first (enabled together, disabled together). */
  dependencies?: string[];
  /** N-5.6.1: size of the plugin settings dialog (default medium). */
  dialogSize?: 'md' | 'lg';
  settings?: Record<string, SettingDef>;
  start(ctx: PluginContext): void;
  stop?(ctx: PluginContext): void;
}

export function visibleSettings(plugin: PluginDef): Array<[string, SettingDef]> {
  return Object.entries(plugin.settings || {}).filter(([, def]) => !def.hidden);
}

export function hasVisibleSettings(plugin: PluginDef): boolean {
  return visibleSettings(plugin).length > 0;
}

/** N-5.6.2: everything except custom panels can be reset. */
export function isResettable(def: SettingDef): boolean {
  return def.type !== 'custom';
}

export function definePlugin(def: PluginDef): PluginDef {
  return def;
}

type Disposer = () => void;

/** Everything a plugin adds goes through its context so stop() can remove it (N-4.4). */
export class PluginContext {
  private disposers: Disposer[] = [];
  private settingListeners = new Set<(key: string, value: unknown) => void>();

  constructor(readonly plugin: PluginDef) {}

  onDispose(fn: Disposer): void {
    this.disposers.push(fn);
  }

  listen<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (ev: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions | boolean): void;
  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (ev: WindowEventMap[K]) => void, opts?: AddEventListenerOptions | boolean): void;
  listen(target: EventTarget, type: string, fn: (ev: any) => void, opts?: AddEventListenerOptions | boolean): void;
  listen(target: EventTarget, type: string, fn: (ev: any) => void, opts?: AddEventListenerOptions | boolean): void {
    target.addEventListener(type, fn, opts);
    this.onDispose(() => target.removeEventListener(type, fn, opts));
  }

  interval(fn: () => void, ms: number): number {
    const id = window.setInterval(fn, ms);
    this.onDispose(() => clearInterval(id));
    return id;
  }

  timeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this.onDispose(() => clearTimeout(id));
    return id;
  }

  observe(target: Node, options: MutationObserverInit, fn: MutationCallback): MutationObserver {
    const obs = new MutationObserver(fn);
    obs.observe(target, options);
    this.onDispose(() => obs.disconnect());
    return obs;
  }

  addStyle(css: string): HTMLStyleElement {
    const style = addStyle(css);
    style.dataset.ysrpPlugin = this.plugin.name;
    this.onDispose(() => style.remove());
    return style;
  }

  addRowButton(def: RowContribution): void {
    this.onDispose(registerRowButton(def));
  }

  beforeRestore(fn: BeforeRestoreHook): void {
    this.onDispose(addBeforeRestoreHook(fn));
  }

  /** Track an element so it is removed when the plugin stops. */
  own<T extends Element>(el: T): T {
    this.onDispose(() => el.remove());
    return el;
  }

  readonly settings = {
    get: <T = unknown>(key: string): T => getSetting(this.plugin, key) as T,
    /** Returns false when the value failed validation (N-12.1) and was not saved. */
    set: (key: string, value: unknown): boolean => {
      const def = this.plugin.settings?.[key];
      if (def && def.validate && def.validate(value)) return false;
      if (def && def.set) def.set(value);
      else setStoredValue(this.plugin.name, key, value);
      this.notify(key, value);
      settingsChanged.emit({ plugin: this.plugin.name, key });
      return true;
    },
    reset: (): void => {
      // Defaults are written explicitly so the stored value reflects the reset (N-5.6).
      const entries = Object.entries(this.plugin.settings || {}).filter(([, def]) => isResettable(def) && def.default !== undefined);
      for (const [key, def] of entries) {
        if (def.set) def.set(def.default);
        else setStoredValue(this.plugin.name, key, def.default);
      }
      for (const [key] of entries) this.notify(key, getSetting(this.plugin, key));
      settingsChanged.emit({ plugin: this.plugin.name, key: '*' });
    },
    onChange: (fn: (key: string, value: unknown) => void): void => {
      this.settingListeners.add(fn);
      this.onDispose(() => this.settingListeners.delete(fn));
    }
  };

  private notify(key: string, value: unknown): void {
    for (const fn of Array.from(this.settingListeners)) {
      try { fn(key, value); } catch (err) { console.error(`[Video Memory] ${this.plugin.name} setting listener failed:`, err); }
    }
  }

  dispose(): void {
    const list = this.disposers.splice(0).reverse();
    for (const fn of list) {
      try { fn(); } catch (err) { console.error(`[Video Memory] ${this.plugin.name} cleanup failed:`, err); }
    }
  }
}

export function getSetting(plugin: PluginDef, key: string): unknown {
  const def = plugin.settings?.[key];
  const stored = def && def.get ? def.get() : storedValue(plugin.name, key);
  if (stored === undefined || stored === null) return def ? def.default : undefined;
  if (def && typeof def.default === 'boolean') return Boolean(stored);
  if (def && typeof def.default === 'number') {
    const n = Number(stored);
    return Number.isFinite(n) ? n : def.default;
  }
  return stored;
}

export const pluginsChanged = new Emitter<void>();
export const settingsChanged = new Emitter<{ plugin: string; key: string }>();

const registry: PluginDef[] = [];
const running = new Map<string, PluginContext>();
const contexts = new Map<string, PluginContext>();
const failed = new Set<string>();

/** N-5.5.3: enabled but its start() threw, or its dependencies could not run (N-13.2). */
export function hasFailed(name: string): boolean {
  return failed.has(name);
}

export function listPlugins(): PluginDef[] {
  return registry.slice();
}

export function findPlugin(name: string): PluginDef | undefined {
  return registry.find(p => p.name === name);
}

/** N-4.2: the user's choice (stored), not whether it actually runs. */
export function isEnabled(plugin: PluginDef): boolean {
  if (plugin.required) return true;
  const stored = storedValue(plugin.name, 'enabled');
  return typeof stored === 'boolean' ? stored : plugin.enabledByDefault !== false;
}

export function isRunning(name: string): boolean {
  return running.has(name);
}

/** N-13.4: plugins this one depends on / that depend on it (direct only). */
export function dependenciesOf(plugin: PluginDef): PluginDef[] {
  return (plugin.dependencies || []).map(findPlugin).filter((p): p is PluginDef => Boolean(p));
}

export function dependentsOf(plugin: PluginDef): PluginDef[] {
  return registry.filter(p => (p.dependencies || []).includes(plugin.name));
}

/** Context used for reading/writing settings even while the plugin is stopped. */
export function settingsContext(plugin: PluginDef): PluginContext {
  return running.get(plugin.name) || contexts.get(plugin.name) || (() => {
    const ctx = new PluginContext(plugin);
    contexts.set(plugin.name, ctx);
    return ctx;
  })();
}

function startPlugin(plugin: PluginDef): void {
  if (running.has(plugin.name)) return;
  const ctx = new PluginContext(plugin);
  running.set(plugin.name, ctx);
  failed.delete(plugin.name);
  try {
    plugin.start(ctx);
  } catch (err) {
    // N-4.3: a failing plugin is logged and does not affect the others.
    console.error(`[Video Memory] Plugin ${plugin.name} failed to start:`, err);
    failed.add(plugin.name);
  }
}

function stopPlugin(plugin: PluginDef): void {
  const ctx = running.get(plugin.name);
  if (!ctx) return;
  running.delete(plugin.name);
  try { plugin.stop?.(ctx); } catch (err) { console.error(`[Video Memory] Plugin ${plugin.name} failed to stop:`, err); }
  ctx.dispose();
}

/**
 * N-4.3 / N-13.2 start order: core plugins first, then the others, every plugin after its dependencies.
 * Plugins with a missing or circular dependency are returned separately with the reason.
 */
function startOrder(): { order: PluginDef[]; broken: Map<string, string> } {
  const order: PluginDef[] = [];
  const broken = new Map<string, string>();
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (plugin: PluginDef, path: string[]): boolean => {
    const st = state.get(plugin.name);
    if (st === 'done') return !broken.has(plugin.name);
    if (st === 'visiting') {
      broken.set(plugin.name, `circular dependency ${[...path, plugin.name].join(' -> ')}`);
      return false;
    }
    state.set(plugin.name, 'visiting');
    let ok = true;
    for (const dep of plugin.dependencies || []) {
      const target = findPlugin(dep);
      if (!target) {
        broken.set(plugin.name, `missing dependency ${dep}`);
        ok = false;
      } else if (!visit(target, [...path, plugin.name]) && !broken.has(plugin.name)) {
        broken.set(plugin.name, broken.get(target.name) || `dependency ${dep} is broken`);
        ok = false;
      }
    }
    state.set(plugin.name, 'done');
    order.push(plugin);
    return ok && !broken.has(plugin.name);
  };
  for (const plugin of [...registry.filter(p => p.required), ...registry.filter(p => !p.required)]) visit(plugin, []);
  return { order, broken };
}

const reported = new Set<string>();

/** Start and stop plugins until what runs matches the stored choices and the dependencies (N-4.4, N-13.2). */
function reconcile(): void {
  const { order, broken } = startOrder();
  // Stops first, dependents before their dependencies.
  for (const plugin of order.slice().reverse()) {
    const wanted = isEnabled(plugin) && !broken.has(plugin.name) &&
      (plugin.dependencies || []).every(d => { const dep = findPlugin(d); return Boolean(dep && isEnabled(dep)); });
    if (!wanted && running.has(plugin.name)) stopPlugin(plugin);
  }
  for (const plugin of order) {
    if (!isEnabled(plugin)) {
      failed.delete(plugin.name);
      continue;
    }
    const reason = broken.get(plugin.name) ||
      (plugin.dependencies || []).filter(d => !running.has(d) || failed.has(d)).map(d => `dependency ${d} is not running`)[0];
    if (reason) {
      if (running.has(plugin.name)) stopPlugin(plugin);
      failed.add(plugin.name);
      const key = `${plugin.name}: ${reason}`;
      if (!reported.has(key)) {
        reported.add(key);
        console.error(`[Video Memory] Plugin ${plugin.name} was not started: ${reason}`);
      }
      continue;
    }
    startPlugin(plugin);
  }
}

export function startPlugins(plugins: PluginDef[]): void {
  registry.push(...plugins);
  reconcile();
  pluginsChanged.emit();
}

const names = (list: PluginDef[]) => list.map(p => pick(p.displayName)).join(tr(', ', '、'));

/**
 * N-4.4: toggle at runtime, persisted immediately. N-13.3: enabling also enables the plugin's
 * dependencies; disabling also disables every enabled plugin that depends on it.
 */
export function setPluginEnabled(name: string, enabled: boolean): void {
  const plugin = findPlugin(name);
  if (!plugin || plugin.required) return;
  const also: PluginDef[] = [];
  const seen = new Set<string>([name]);
  const walk = (p: PluginDef) => {
    const next = enabled ? dependenciesOf(p) : dependentsOf(p);
    for (const q of next) {
      if (seen.has(q.name)) continue;
      seen.add(q.name);
      if (!q.required && isEnabled(q) !== enabled) also.push(q);
      walk(q);
    }
  };
  walk(plugin);
  for (const p of also) setStoredValue(p.name, 'enabled', enabled);
  setStoredValue(name, 'enabled', enabled);
  reconcile();
  pluginsChanged.emit();
  if (also.length) {
    showToast({
      id: 'plugin-deps',
      text: enabled
        ? tr('Also enabled: {names}', '已同时开启：{names}', { names: names(also) })
        : tr('Also disabled: {names}', '已同时关闭：{names}', { names: names(also) })
    });
  }
}

/** N-11.5: YSRP_Plugins changed in another tab; re-read it and follow its choices. */
export function reloadPluginChoices(): void {
  reloadPluginStore();
  reconcile();
  pluginsChanged.emit();
  settingsChanged.emit({ plugin: '*', key: '*' });
}
