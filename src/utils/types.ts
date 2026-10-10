/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import type { RecordActionDef } from "@api/RecordActions";
import type { SettingsTabDef } from "@api/SettingsTabs";

export const enum OptionType {
    STRING,
    NUMBER,
    BOOLEAN,
    SELECT,
}

export type Text = () => string;

interface SettingCommon {
    description: Text;
    hidden?: boolean;
}

export interface StringSetting extends SettingCommon { type: OptionType.STRING; default?: string; placeholder?: string; }
export interface NumberSetting extends SettingCommon { type: OptionType.NUMBER; default?: number; min?: number; max?: number; }
export interface BooleanSetting extends SettingCommon { type: OptionType.BOOLEAN; default?: boolean; }
export interface SelectSetting extends SettingCommon {
    type: OptionType.SELECT;
    options: readonly { label: Text; value: string; default?: boolean; }[];
}

export type PluginSettingDef = StringSetting | NumberSetting | BooleanSetting | SelectSetting;
export type SettingsDefinition = Record<string, PluginSettingDef>;

type ValueOf<D extends PluginSettingDef> =
    D extends StringSetting ? string
        : D extends NumberSetting ? number
            : D extends BooleanSetting ? boolean
                : D extends SelectSetting ? D["options"][number]["value"]
                    : never;

export type SettingsValues<D extends SettingsDefinition> = { [K in keyof D]: ValueOf<D[K]> };

export interface DefinedSettings<D extends SettingsDefinition = SettingsDefinition> {
    def: D;
    pluginName: string;
    store: SettingsValues<D>;
}

export interface PluginDef {
    name: string;
    title: Text;
    description: Text;
    authors: string[];
    required?: boolean;
    enabledByDefault?: boolean;
    settings?: DefinedSettings<any>;
    start?(): void;
    stop?(): void;
    onSettingsChange?(key: string): void;
    settingsTab?: SettingsTabDef;
    recordAction?: RecordActionDef;
    beforeRestore?(videoId: string): Promise<unknown> | void;
}

export interface Plugin extends PluginDef {
    started: boolean;
}

export default function definePlugin<P extends PluginDef>(p: P) {
    return p as P & Plugin;
}
