// YSRP_Plugins store: {"plugins": {"<name>": {"enabled": bool, ...settings}}} (N-1.3, N-4.5).

import { KEY_PLUGINS } from '../utils/constants';
import { readSetting, writeSetting } from '../utils/storage';

type PluginBag = Record<string, unknown>;
let cache: { plugins: Record<string, PluginBag> } | null = null;

function load(): { plugins: Record<string, PluginBag> } {
  if (cache) return cache;
  let parsed: unknown = null;
  try {
    const raw = readSetting(KEY_PLUGINS);
    parsed = raw ? JSON.parse(raw) : null;
  } catch { parsed = null; }
  const plugins = parsed && typeof parsed === 'object' && (parsed as { plugins?: unknown }).plugins;
  cache = { plugins: plugins && typeof plugins === 'object' ? { ...(plugins as Record<string, PluginBag>) } : {} };
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
