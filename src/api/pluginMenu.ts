// N-5.9.2 / N-5.9.4: which enabled plugins the gear menu lists. The PluginsMenu plugin stores the choice
// as `menuPlugins` ({name: boolean}) in its own YSRP_Plugins entry; unchosen plugins are listed when they
// have visible settings. With PluginsMenu off, every enabled plugin with visible settings is listed.

import { Emitter } from './events';
import { findPlugin, hasVisibleSettings, isEnabled, listPlugins, type PluginDef } from './plugins';
import { setStoredValue, storedValue } from './pluginSettings';

export const MENU_PLUGIN = 'PluginsMenu';
export const MENU_KEY = 'menuPlugins';
export const menuChoiceChanged = new Emitter<void>();

export function menuChoices(): Record<string, boolean> {
  const raw = storedValue(MENU_PLUGIN, MENU_KEY);
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** Default for a plugin nobody chose yet. */
export function defaultInMenu(plugin: PluginDef): boolean {
  return hasVisibleSettings(plugin);
}

export function chosenInMenu(plugin: PluginDef): boolean {
  const choice = menuChoices()[plugin.name];
  return typeof choice === 'boolean' ? choice : defaultInMenu(plugin);
}

export function setInMenu(name: string, on: boolean): void {
  setStoredValue(MENU_PLUGIN, MENU_KEY, { ...menuChoices(), [name]: on });
  menuChoiceChanged.emit();
}

/** Enabled plugins for the gear menu (not yet sorted). */
export function menuPlugins(): PluginDef[] {
  const menuPlugin = findPlugin(MENU_PLUGIN);
  const useChoice = Boolean(menuPlugin && isEnabled(menuPlugin));
  return listPlugins().filter(p => isEnabled(p) && (useChoice ? chosenInMenu(p) : hasVisibleSettings(p)));
}
