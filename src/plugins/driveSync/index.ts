/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Store from "@api/Store";
import { Devs } from "@utils/constants";
import { t } from "@utils/i18n";
import definePlugin from "@utils/types";

import { DrivePane } from "./DrivePane";
import { activate, configured, deactivate, maybeFirstFullSync, pullRecord, schedule } from "./sync";

const STARTUP_DELAY_MS = 2000;

let offChange: (() => void) | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;

export default definePlugin({
    name: "DriveSync",
    title: () => t("Google Drive sync", "云同步"),
    description: () => t("Keeps your records in your own Google Drive and picks up progress from other devices.", "把记录同步到你自己的 Google Drive，在其它设备上接着看。"),
    icon: "cloud",
    authors: [Devs.V],
    enabledByDefault: true,

    settingsTab: {
        id: "drive",
        group: "plugins",
        order: 30,
        icon: "cloud",
        label: () => t("Sync", "云同步"),
        render: DrivePane,
    },

    start() {
        activate();
        offChange = Store.onRecordChange(change => {
            if (change.source !== "local" || !change.id) return;
            if (change.type === "set") schedule(change.id, "set");
            else if (change.type === "remove") schedule(change.id, "remove");
        });
        startupTimer = setTimeout(() => { if (configured()) maybeFirstFullSync(); }, STARTUP_DELAY_MS);
    },

    stop() {
        offChange?.();
        offChange = null;
        if (startupTimer) clearTimeout(startupTimer);
        startupTimer = null;
        deactivate();
    },

    beforeRestore(videoId: string) {
        if (!configured()) return;
        return pullRecord(videoId);
    },
});
