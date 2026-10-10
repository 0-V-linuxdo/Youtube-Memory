/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { KEY_PLUGINS } from "@utils/constants";
import { readJsonSetting, writeSetting } from "@utils/storage";
import { type DefinedSettings, OptionType, type PluginSettingDef, type SettingsDefinition, type SettingsValues } from "@utils/types";

export interface PluginSettingsBag {
    enabled?: boolean;
    [key: string]: unknown;
}

interface SettingsData {
    plugins: Record<string, PluginSettingsBag>;
}

function load(): SettingsData {
    const stored = readJsonSetting<SettingsData>(KEY_PLUGINS);
    const plugins = stored?.plugins && typeof stored.plugins === "object" ? stored.plugins : {};
    return { plugins: plugins as Record<string, PluginSettingsBag> };
}

const data = load();
const listeners = new Set<(plugin: string, key: string) => void>();

function save() {
    writeSetting(KEY_PLUGINS, JSON.stringify(data));
}

export function getPluginSettings(name: string): PluginSettingsBag | undefined {
    return data.plugins[name];
}

export function setPluginSetting(name: string, key: string, value: unknown) {
    const bag = data.plugins[name] ??= {};
    if (bag[key] === value) return;
    bag[key] = value;
    save();
    for (const listener of listeners) listener(name, key);
}

export function onPluginSettingChange(listener: (plugin: string, key: string) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function defaultValue(def: PluginSettingDef): unknown {
    if (def.type === OptionType.SELECT) return (def.options.find(o => o.default) ?? def.options[0])?.value;
    if ("default" in def && def.default !== undefined) return def.default;
    return def.type === OptionType.BOOLEAN ? false : def.type === OptionType.NUMBER ? 0 : "";
}

export function definePluginSettings<D extends SettingsDefinition>(def: D): DefinedSettings<D> {
    const settings: DefinedSettings<D> = {
        def,
        pluginName: "",
        store: new Proxy({} as SettingsValues<D>, {
            get(_, key: string) {
                const stored = data.plugins[settings.pluginName]?.[key];
                return stored !== undefined ? stored : def[key] ? defaultValue(def[key]) : undefined;
            },
            set(_, key: string, value) {
                setPluginSetting(settings.pluginName, key, value);
                return true;
            },
        }),
    };
    return settings;
}
