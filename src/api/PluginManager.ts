/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { addRecordAction, removeRecordAction } from "@api/RecordActions";
import { addRestoreHook, removeRestoreHook } from "@api/RestoreHooks";
import { getPluginSettings, onPluginSettingChange, setPluginSetting } from "@api/Settings";
import { addSettingsTab, removeSettingsTab } from "@api/SettingsTabs";
import { Logger } from "@utils/Logger";
import type { Plugin } from "@utils/types";

import pluginModules from "~plugins";

const logger = new Logger("PluginManager");

export const plugins: Record<string, Plugin> = {};
const order: string[] = [];
const toggleListeners = new Set<() => void>();

for (const plugin of Object.values(pluginModules) as Plugin[]) {
    plugin.started = false;
    if (plugin.settings) plugin.settings.pluginName = plugin.name;
    plugins[plugin.name] = plugin;
    order.push(plugin.name);
}

onPluginSettingChange((name, key) => {
    const plugin = plugins[name];
    if (key === "enabled" || !plugin?.started) return;
    try { plugin.onSettingsChange?.(key); } catch (err) { logger.error(`${name}.onSettingsChange failed`, err); }
});

export function listPlugins() {
    return order.map(name => plugins[name]);
}

export function isPluginEnabled(name: string) {
    const plugin = plugins[name];
    if (!plugin) return false;
    if (plugin.required) return true;
    return getPluginSettings(name)?.enabled ?? plugin.enabledByDefault ?? false;
}

export function startPlugin(plugin: Plugin) {
    if (plugin.started) return true;
    try {
        plugin.start?.();
        if (plugin.settingsTab) addSettingsTab(plugin.settingsTab);
        if (plugin.recordAction) addRecordAction(plugin.recordAction);
        if (plugin.beforeRestore) addRestoreHook(plugin.name, plugin.beforeRestore.bind(plugin));
        plugin.started = true;
        return true;
    } catch (err) {
        logger.error(`Failed to start ${plugin.name}`, err);
        return false;
    }
}

export function stopPlugin(plugin: Plugin) {
    if (!plugin.started) return true;
    try {
        if (plugin.settingsTab) removeSettingsTab(plugin.settingsTab.id);
        if (plugin.recordAction) removeRecordAction(plugin.recordAction.id);
        removeRestoreHook(plugin.name);
        plugin.stop?.();
        plugin.started = false;
        return true;
    } catch (err) {
        logger.error(`Failed to stop ${plugin.name}`, err);
        return false;
    }
}

export function setPluginEnabled(name: string, enabled: boolean) {
    const plugin = plugins[name];
    if (!plugin || plugin.required) return false;
    setPluginSetting(name, "enabled", enabled);
    const ok = enabled ? startPlugin(plugin) : stopPlugin(plugin);
    for (const listener of toggleListeners) listener();
    return ok;
}

export function onPluginToggle(listener: () => void) {
    toggleListeners.add(listener);
    return () => toggleListeners.delete(listener);
}

export function startAllPlugins() {
    for (const name of order) {
        if (isPluginEnabled(name)) startPlugin(plugins[name]);
    }
}
