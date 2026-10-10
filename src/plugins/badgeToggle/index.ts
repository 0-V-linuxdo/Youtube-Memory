/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Badge from "@api/Badge";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { registerStyle, unregisterStyle } from "@utils/css";
import { h, shieldFromPlayer } from "@utils/dom";
import { t } from "@utils/i18n";
import definePlugin, { OptionType } from "@utils/types";

import css from "./styles.css";

const settings = definePluginSettings({
    startHidden: {
        type: OptionType.BOOLEAN,
        default: true,
        description: () => t("Hide the badge when a page opens", "打开页面时先隐藏徽标"),
    },
});

let button: HTMLButtonElement | null = null;
let hidden = true;
let offMount: (() => void) | null = null;

function render(badge: HTMLElement | null) {
    if (!button) return;
    button.setAttribute("aria-pressed", String(!hidden));
    button.title = hidden ? t("Show progress badge", "显示进度徽标") : t("Hide progress badge", "隐藏进度徽标");
    button.setAttribute("aria-label", button.title);
    if (badge) badge.classList.toggle("ysrp-badge-hidden", hidden);
}

// P-B.1: one 💾 button right before the badge, re-attached whenever the badge is rebuilt.
function attach(badge: HTMLElement) {
    if (!button) {
        button = h("button", { type: "button", class: "ysrp-badge-toggle", text: "💾" });
        shieldFromPlayer(button, () => {
            hidden = !hidden;
            render(Badge.current());
        });
    }
    if (button.nextElementSibling !== badge) badge.before(button);
    render(badge);
}

export default definePlugin({
    name: "BadgeToggle",
    title: () => t("Badge toggle", "徽标开关"),
    description: () => t("Adds a 💾 button that shows or hides the progress badge.", "在徽标旁加一个 💾 按钮，点击显示或隐藏进度徽标。"),
    authors: [Devs.V],
    enabledByDefault: true,
    settings,

    start() {
        hidden = settings.store.startHidden;
        registerStyle("badgeToggle", css);
        offMount = Badge.onMount(attach);
        const badge = Badge.current();
        if (badge) attach(badge);
    },

    stop() {
        offMount?.();
        offMount = null;
        button?.remove();
        button = null;
        Badge.current()?.classList.remove("ysrp-badge-hidden");
        unregisterStyle("badgeToggle");
    },
});
