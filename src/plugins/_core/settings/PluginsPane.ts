/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { isPluginEnabled, listPlugins, onPluginToggle, setPluginEnabled } from "@api/PluginManager";
import type { Pane } from "@api/SettingsTabs";
import { h } from "@utils/dom";
import { t } from "@utils/i18n";
import { type DefinedSettings, OptionType, type Plugin, type PluginSettingDef } from "@utils/types";

function settingControl(settings: DefinedSettings, key: string, def: PluginSettingDef) {
    const store = settings.store as Record<string, unknown>;
    const value = store[key];
    if (def.type === OptionType.BOOLEAN) {
        const input = h("input", { type: "checkbox", dataset: { setting: key } });
        input.checked = Boolean(value);
        input.addEventListener("change", () => { store[key] = input.checked; });
        return h("label", { class: "ysrp-check" }, input, h("span", { text: def.description() }));
    }
    let control: HTMLInputElement | HTMLSelectElement;
    if (def.type === OptionType.SELECT) {
        const select = h("select", { class: "ysrp-select", dataset: { setting: key } },
            def.options.map(option => h("option", { value: option.value, text: option.label() })));
        select.value = String(value);
        select.addEventListener("change", () => { store[key] = select.value; });
        control = select;
    } else {
        const input = h("input", {
            class: "ysrp-input",
            type: def.type === OptionType.NUMBER ? "number" : "text",
            placeholder: def.type === OptionType.STRING ? def.placeholder : undefined,
            min: def.type === OptionType.NUMBER ? def.min : undefined,
            max: def.type === OptionType.NUMBER ? def.max : undefined,
            dataset: { setting: key },
        });
        input.value = String(value ?? "");
        input.addEventListener("change", () => {
            store[key] = def.type === OptionType.NUMBER ? Number(input.value) : input.value;
        });
        control = input;
    }
    return h("label", { class: "ysrp-field" }, h("span", { text: def.description() }), control);
}

function PluginCard(plugin: Plugin) {
    const toggle = h("button", { type: "button", class: "ysrp-switch", role: "switch", "aria-label": plugin.title(), dataset: { plugin: plugin.name } });
    const settingsBox = h("div", { class: "ysrp-plugin-settings" });
    const defs = plugin.settings ? Object.entries(plugin.settings.def as Record<string, PluginSettingDef>).filter(([, def]) => !def.hidden) : [];
    for (const [key, def] of defs) settingsBox.appendChild(settingControl(plugin.settings as DefinedSettings, key, def));

    function render() {
        const enabled = isPluginEnabled(plugin.name);
        toggle.setAttribute("aria-checked", String(enabled));
        toggle.disabled = Boolean(plugin.required);
        toggle.title = plugin.required ? t("Core plugin, always on", "核心插件，始终开启") : enabled ? t("Turn off", "关闭") : t("Turn on", "开启");
        settingsBox.hidden = !enabled || defs.length === 0;
    }
    toggle.addEventListener("click", () => {
        if (plugin.required) return;
        setPluginEnabled(plugin.name, !isPluginEnabled(plugin.name));
    });
    render();

    const node = h("div", { class: "ysrp-card ysrp-plugin", dataset: { plugin: plugin.name } },
        h("div", { class: "ysrp-plugin-head" },
            h("div", { class: "ysrp-plugin-text" },
                h("div", { class: "ysrp-plugin-name" }, h("span", { text: plugin.title() }),
                    plugin.required ? h("span", { class: "ysrp-plugin-tag", text: t("Core", "核心") }) : null),
                h("div", { class: "ysrp-plugin-desc", text: plugin.description() })),
            toggle),
        settingsBox);
    return { node, render };
}

// P-6
export function PluginsPane(): Pane {
    const all = listPlugins();
    const cards = [...all.filter(p => !p.required), ...all.filter(p => p.required)].map(PluginCard);
    const off = onPluginToggle(() => { for (const c of cards) c.render(); });
    return {
        node: h("div", {},
            h("div", { class: "ysrp-msg", text: t("Turn features on or off. Changes apply immediately.", "开启或关闭各项功能，立即生效。") }),
            cards.map(c => c.node)),
        refresh() { for (const c of cards) c.render(); },
        destroy: off,
    };
}
