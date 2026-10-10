/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import type { Pane } from "@api/SettingsTabs";
import { card, ChoiceGroup, h, setMessage } from "@utils/dom";
import { detectBrowserLanguage, languagePreference, resolvedLanguage, setLanguagePreference, t } from "@utils/i18n";

// F-4.24
export function DisplayPane(): Pane {
    const names = { zh: "中文", en: "English" };
    const status = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const choice = ChoiceGroup("ysrp-language", "--ysrp-display", [
        { value: "auto", badge: t("Auto", "自动"), label: t("Auto", "自动"), hint: t("Match the browser language automatically.", "自动跟随浏览器语言。") },
        { value: "zh", badge: "中文", label: "中文", hint: "始终使用简体中文。" },
        { value: "en", badge: "English", label: "English", hint: "Always use English." },
    ], languagePreference(), value => {
        if (!setLanguagePreference(value)) setMessage(status, t("Already using this language.", "当前已使用该语言。"));
    });
    choice.node.classList.add("ysrp-language-options");
    return {
        node: h("div", {},
            card("globe", "--ysrp-display", t("Interface Language", "界面语言"), t("Choose how the script UI should appear.", "为脚本界面选择显示语言。"),
                choice.node,
                h("div", { class: "ysrp-info" },
                    h("div", { class: "ysrp-info-row" }, h("b", { text: t("Active language", "当前语言") }), h("span", { text: names[resolvedLanguage()] })),
                    h("div", { class: "ysrp-info-row" }, h("b", { text: t("Browser language", "浏览器语言") }), h("span", { text: names[detectBrowserLanguage()] }))),
                status)),
    };
}
