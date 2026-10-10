/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Badge from "@api/Badge";
import * as ResumePrompt from "@api/ResumePrompt";
import { Devs, EVT_LANG, TICK_MS } from "@utils/constants";
import { t } from "@utils/i18n";
import { on } from "@utils/misc";
import definePlugin from "@utils/types";

let timer: ReturnType<typeof setInterval> | null = null;
let languageTimer: ReturnType<typeof setTimeout> | null = null;
let offLanguage: (() => void) | null = null;
const ensure = () => Badge.ensure();

export default definePlugin({
    name: "PlayerBadge",
    title: () => t("Player badge", "播放器徽标"),
    description: () => t("Shows the last saved time and the settings button in the player controls.", "在播放器控制栏显示最近保存的时间和设置按钮。"),
    icon: "tag",
    authors: [Devs.V],
    required: true,

    start() {
        timer = setInterval(ensure, TICK_MS);
        window.addEventListener("yt-navigate-finish", ensure, true);
        ensure();
        offLanguage = on(EVT_LANG, () => {
            if (languageTimer) clearTimeout(languageTimer);
            languageTimer = setTimeout(() => Badge.rebuild(), 50);
        });
    },

    stop() {
        if (timer) clearInterval(timer);
        timer = null;
        window.removeEventListener("yt-navigate-finish", ensure, true);
        offLanguage?.();
        offLanguage = null;
        ResumePrompt.close();
        Badge.destroy();
    },
});
