// YSRP_Plugins store (N-1.3, N-4.5, N-5.5.4):
// {"plugins": {"<name>": {"enabled": bool, ...settings}}, "starred": [names], "pinned": [names]}.
// Unknown top-level keys are kept as they are.

import { KEY_PLUGINS } from '../utils/constants';
import { readSetting, writeSetting } from '../utils/storage';

type PluginBag = Record<string, unknown>;
interface Store {
  plugins: Record<string, PluginBag>;
  starred: string[];
  pinned: string[];
  [extra: string]: unknown;
}
let cache: Store | null = null;

const nameList = (value: unknown): string[] =>
  Array.isArray(value) ? Array.from(new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0))) : [];

function load(): Store {
  if (cache) return cache;
  let parsed: Record<string, unknown> | null = null;
  try {
    const raw = readSetting(KEY_PLUGINS);
    const value = raw ? JSON.parse(raw) : null;
    parsed = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { parsed = null; }
  const plugins = parsed && parsed.plugins;
  cache = {
    ...(parsed || {}),
    plugins: plugins && typeof plugins === 'object' ? { ...(plugins as Record<string, PluginBag>) } : {},
    starred: nameList(parsed && parsed.starred),
    pinned: nameList(parsed && parsed.pinned)
  };
  return cache;
}

function save(): void {
  writeSetting(KEY_PLUGINS, JSON.stringify(load()));
}

export function storedValue(plugin: string, key: string): unknown {
  return load().plugins[plugin]?.[key];
}

export function setStoredValue(plugin: string, key: string, value: unknown): void {
  const data = load();
  data.plugins[plugin] = { ...(data.plugins[plugin] || {}), [key]: value };
  save();
}

export function starredPlugins(): string[] {
  return load().starred.slice();
}

export function pinnedPlugins(): string[] {
  return load().pinned.slice();
}

/** Adds or removes a name, keeping the order in which names were added (pin order, N-5.5.2). */
export function setListed(list: 'starred' | 'pinned', name: string, on: boolean): void {
  const data = load();
  const next = data[list].filter(n => n !== name);
  if (on) next.push(name);
  data[list] = next;
  save();
}
