/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Modal from "@api/Modal";
import { addSettingsTab, removeSettingsTab, type SettingsTabDef } from "@api/SettingsTabs";
import { Devs, EVT_LANG } from "@utils/constants";
import { t } from "@utils/i18n";
import { on } from "@utils/misc";
import definePlugin from "@utils/types";

import { DisplayPane } from "./DisplayPane";
import { PluginsPane } from "./PluginsPane";
import { RecordsPane } from "./RecordsPane";
import { StoragePane } from "./StoragePane";

const tabs: SettingsTabDef[] = [
    { id: "records", group: "general", order: 10, icon: "database", label: () => t("Records", "记录"), render: RecordsPane },
    { id: "storage", group: "general", order: 20, icon: "gear", label: () => t("Storage", "存储"), render: StoragePane },
    { id: "plugins", group: "plugins", order: 10, icon: "puzzle-piece", label: () => t("Plugins", "插件"), render: PluginsPane },
    { id: "display", group: "general", order: 30, icon: "globe", label: () => t("Display", "界面"), render: DisplayPane },
];

let languageTimer: ReturnType<typeof setTimeout> | null = null;
let offLanguage: (() => void) | null = null;

export default definePlugin({
    name: "Settings",
    title: () => t("Settings dialog", "设置弹窗"),
    description: () => t("The records list, storage, plugins and language settings.", "记录列表，以及存储、插件、语言等设置。"),
    icon: "gear",
    authors: [Devs.V],
    required: true,

    start() {
        Modal.mount();
        for (const tab of tabs) addSettingsTab(tab);
        offLanguage = on(EVT_LANG, () => {
            if (languageTimer) clearTimeout(languageTimer);
            languageTimer = setTimeout(() => Modal.rebuild(), 50);
        });
    },

    stop() {
        offLanguage?.();
        offLanguage = null;
        for (const tab of tabs) removeSettingsTab(tab.id);
        Modal.unmount();
    },
});
