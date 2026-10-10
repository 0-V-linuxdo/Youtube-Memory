// Plugin manager (N-4): definitions, enable state, ordered start, live start/stop with full cleanup.

import type { Bilingual } from '../utils/i18n';
import { addStyle } from '../utils/dom';
import { Emitter } from './events';
import { addBeforeRestoreHook, type BeforeRestoreHook } from './hooks';
import { setStoredValue, storedValue } from './pluginSettings';
import { registerRowButton, type RowContribution } from './rows';
import { registerTab, type TabDef } from './tabs';

export type SettingType = 'switch' | 'text' | 'number' | 'select';

export interface SettingDef {
  type: SettingType;
  default: string | number | boolean;
  label: Bilingual;
  description?: Bilingual;
  hidden?: boolean;
  options?: Array<{ value: string; label: Bilingual }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface PluginDef {
  name: string;
  displayName: Bilingual;
  description: Bilingual;
  authors: string[];
  icon: string;
  enabledByDefault?: boolean;
  required?: boolean;
  settings?: Record<string, SettingDef>;
  start(ctx: PluginContext): void;
  stop?(ctx: PluginContext): void;
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

  addTab(def: TabDef): void {
    this.onDispose(registerTab(def));
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
    set: (key: string, value: unknown): void => {
      setStoredValue(this.plugin.name, key, value);
      this.notify(key, value);
      settingsChanged.emit({ plugin: this.plugin.name, key });
    },
    reset: (): void => {
      // Defaults are written explicitly so the stored value reflects the reset (N-5.6).
      for (const [key, def] of Object.entries(this.plugin.settings || {})) setStoredValue(this.plugin.name, key, def.default);
      for (const key of Object.keys(this.plugin.settings || {})) this.notify(key, getSetting(this.plugin, key));
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
  const stored = storedValue(plugin.name, key);
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

/** N-5.5.3: enabled but its start() threw. */
export function hasFailed(name: string): boolean {
  return failed.has(name);
}

export function listPlugins(): PluginDef[] {
  return registry.slice();
}

export function findPlugin(name: string): PluginDef | undefined {
  return registry.find(p => p.name === name);
}

/** N-4.2 */
export function isEnabled(plugin: PluginDef): boolean {
  if (plugin.required) return true;
  const stored = storedValue(plugin.name, 'enabled');
  return typeof stored === 'boolean' ? stored : plugin.enabledByDefault !== false;
}

export function isRunning(name: string): boolean {
  return running.has(name);
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
  failed.delete(plugin.name);
  try { plugin.stop?.(ctx); } catch (err) { console.error(`[Video Memory] Plugin ${plugin.name} failed to stop:`, err); }
  ctx.dispose();
}

/** N-4.3: core plugins first, then the others. */
export function startPlugins(plugins: PluginDef[]): void {
  registry.push(...plugins);
  const ordered = [...plugins.filter(p => p.required), ...plugins.filter(p => !p.required)];
  for (const plugin of ordered) {
    if (isEnabled(plugin)) startPlugin(plugin);
  }
  pluginsChanged.emit();
}

/** N-4.4: toggle at runtime, persisted immediately. */
export function setPluginEnabled(name: string, enabled: boolean): void {
  const plugin = findPlugin(name);
  if (!plugin || plugin.required) return;
  setStoredValue(name, 'enabled', enabled);
  if (enabled) startPlugin(plugin);
  else stopPlugin(plugin);
  pluginsChanged.emit();
}
