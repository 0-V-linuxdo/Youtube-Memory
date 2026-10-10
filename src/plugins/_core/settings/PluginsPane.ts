/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { isPluginEnabled, listPlugins, onPluginToggle, setPluginEnabled } from "@api/PluginManager";
import { defaultValue, getPluginSettings, setPluginSetting } from "@api/Settings";
import type { Pane } from "@api/SettingsTabs";
import { h, icon, iconButton } from "@utils/dom";
import { t } from "@utils/i18n";
import { type DefinedSettings, OptionType, type Plugin, type PluginSettingDef } from "@utils/types";

type Filter = "all" | "enabled" | "disabled";

export function Switch(checked: boolean, label: string, onChange: (next: boolean) => void, disabled = false) {
    const node = h("button", { type: "button", class: "ysrp-switch", role: "switch", "aria-label": label });
    const set = (value: boolean) => node.setAttribute("aria-checked", String(value));
    set(checked);
    node.disabled = disabled;
    node.addEventListener("click", () => {
        if (node.disabled) return;
        const next = node.getAttribute("aria-checked") !== "true";
        set(next);
        onChange(next);
    });
    return { node, set };
}

const visibleSettings = (plugin: Plugin) =>
    plugin.settings ? Object.entries(plugin.settings.def as Record<string, PluginSettingDef>).filter(([, def]) => !def.hidden) : [];

// A void++ SettingsRow: label on the left, control on the right (text and number fields go underneath).
function SettingRow(settings: DefinedSettings, key: string, def: PluginSettingDef) {
    const store = settings.store as Record<string, unknown>;
    const label = h("div", { class: "ysrp-row-label" }, h("div", { class: "ysrp-row-title", text: def.description() }));
    if (def.type === OptionType.BOOLEAN) {
        const sw = Switch(Boolean(store[key]), def.description(), next => { store[key] = next; });
        sw.node.dataset.setting = key;
        return { node: h("div", { class: "ysrp-setting-row" }, label, sw.node), reset: () => sw.set(Boolean(store[key])) };
    }
    if (def.type === OptionType.SELECT) {
        const select = h("select", { class: "ysrp-select", dataset: { setting: key } },
            def.options.map(option => h("option", { value: option.value, text: option.label() })));
        select.value = String(store[key]);
        select.addEventListener("change", () => { store[key] = select.value; });
        return { node: h("div", { class: "ysrp-setting-row" }, label, select), reset: () => { select.value = String(store[key]); } };
    }
    const input = h("input", {
        class: "ysrp-input",
        type: def.type === OptionType.NUMBER ? "number" : "text",
        placeholder: def.type === OptionType.STRING ? def.placeholder : undefined,
        min: def.type === OptionType.NUMBER ? def.min : undefined,
        max: def.type === OptionType.NUMBER ? def.max : undefined,
        dataset: { setting: key },
    });
    input.value = String(store[key] ?? "");
    input.addEventListener("change", () => { store[key] = def.type === OptionType.NUMBER ? Number(input.value) : input.value; });
    return { node: h("div", { class: "ysrp-setting-row is-stacked" }, label, input), reset: () => { input.value = String(store[key] ?? ""); } };
}

// The void++ plugin dialog: name, description, authors, settings and a Reset button, over the settings window.
function openPluginDialog(plugin: Plugin, host: HTMLElement) {
    host.querySelector(".ysrp-dialog-layer")?.remove();
    const settings = plugin.settings as DefinedSettings;
    const entries = visibleSettings(plugin);
    const rows = entries.map(([key, def]) => SettingRow(settings, key, def));
    const layer = h("div", { class: "ysrp-dialog-layer" });
    const close = () => layer.remove();
    let armed: ReturnType<typeof setTimeout> | null = null;
    const reset = h("button", { type: "button", class: "ysrp-btn is-small", text: t("Reset", "重置") });
    reset.addEventListener("click", () => {
        if (!armed) {
            reset.textContent = t("Click again to reset", "再点一次确认重置");
            reset.classList.add("is-armed");
            armed = setTimeout(() => { armed = null; reset.classList.remove("is-armed"); reset.textContent = t("Reset", "重置"); }, 3000);
            return;
        }
        clearTimeout(armed);
        armed = null;
        for (const [key, def] of entries) {
            if (getPluginSettings(plugin.name)?.[key] !== undefined) setPluginSetting(plugin.name, key, defaultValue(def));
        }
        for (const row of rows) row.reset();
        reset.classList.remove("is-armed");
        reset.textContent = t("Reset", "重置");
    });
    const dialog = h("div", { class: "ysrp-dialog", role: "dialog", "aria-label": plugin.title(), dataset: { plugin: plugin.name } },
        h("button", { type: "button", class: "ysrp-close ysrp-dialog-close", title: t("Close", "关闭"), "aria-label": t("Close", "关闭"), onclick: close }, icon("xmark")),
        h("div", { class: "ysrp-dialog-header" },
            h("div", { class: "ysrp-dialog-title", text: plugin.title() }),
            h("div", { class: "ysrp-dialog-desc", text: plugin.description() })),
        h("div", { class: "ysrp-separator" }),
        h("div", { class: "ysrp-dialog-field" },
            h("div", { class: "ysrp-dialog-label", text: t("Authors", "作者") }),
            h("div", { class: "ysrp-dialog-text", text: plugin.authors.join(", ") })),
        h("div", { class: "ysrp-dialog-field is-grow" },
            h("div", { class: "ysrp-dialog-label", text: t("Settings", "设置") }),
            rows.length ? h("div", { class: "ysrp-dialog-settings" }, rows.map(r => r.node)) : h("div", { class: "ysrp-dialog-text", text: t("No configurable settings.", "没有可配置的设置。") })),
        rows.length ? h("div", { class: "ysrp-dialog-footer" }, reset) : null);
    layer.addEventListener("click", event => { if (event.target === layer) close(); });
    layer.appendChild(dialog);
    host.appendChild(layer);
}

// The void++ plugin card: icon chip, name, controls, two-line description, author footer.
function PluginCard(plugin: Plugin, openSettings: (plugin: Plugin) => void) {
    const sw = Switch(isPluginEnabled(plugin.name), plugin.title(), next => setPluginEnabled(plugin.name, next), Boolean(plugin.required));
    sw.node.dataset.plugin = plugin.name;
    const controls = h("div", { class: "ysrp-card-controls" });
    if (visibleSettings(plugin).length) {
        controls.appendChild(iconButton("sliders", t("Settings", "设置"), () => openSettings(plugin), "ysrp-plugin-config"));
    }
    controls.appendChild(sw.node);
    const node = h("div", { class: `ysrp-plugin${plugin.required ? " is-required" : ""}`, dataset: { plugin: plugin.name } },
        h("div", { class: "ysrp-plugin-body" },
            h("div", { class: "ysrp-plugin-head" },
                h("div", { class: "ysrp-plugin-name" },
                    h("span", { class: "ysrp-plugin-icon" }, icon(plugin.icon || "puzzle-piece")),
                    h("span", { class: "ysrp-plugin-title", text: plugin.title(), title: plugin.title() }),
                    plugin.required ? h("span", { class: "ysrp-plugin-tag", title: t("Core plugin, always on", "核心插件，始终开启") }, icon("circle-exclamation")) : null),
                controls),
            h("div", { class: "ysrp-plugin-desc", text: plugin.description() })),
        h("div", { class: "ysrp-separator" }),
        h("div", { class: "ysrp-plugin-footer", text: plugin.authors.join(", ") || " " }));
    return {
        node,
        plugin,
        render() {
            sw.set(isPluginEnabled(plugin.name));
            sw.node.title = plugin.required ? t("Core plugin, always on", "核心插件，始终开启") : isPluginEnabled(plugin.name) ? t("Turn off", "关闭") : t("Turn on", "开启");
        },
    };
}

// P-6
export function PluginsPane(): Pane {
    const all = listPlugins();
    const optional = all.filter(p => !p.required);
    const required = all.filter(p => p.required);
    let search = "";
    let filter: Filter = "all";
    const node = h("div", { class: "ysrp-plugins" });
    const openSettings = (plugin: Plugin) => {
        const host = node.closest(".ysrp-settings-container");
        if (host) openPluginDialog(plugin, host as HTMLElement);
    };
    const cards = [...optional, ...required].map(p => PluginCard(p, openSettings));

    const input = h("input", { class: "ysrp-input ysrp-search", type: "text", placeholder: t("Search {n} plugins...", "搜索 {n} 个插件...", { n: all.length }) });
    const select = h("select", { class: "ysrp-select ysrp-filter" },
        h("option", { value: "all", text: t("All", "全部") }),
        h("option", { value: "enabled", text: t("Enabled", "已开启") }),
        h("option", { value: "disabled", text: t("Disabled", "已关闭") }));
    const userGrid = h("div", { class: "ysrp-grid" });
    const requiredGrid = h("div", { class: "ysrp-grid" });
    const divider = h("div", { class: "ysrp-separator" });
    const empty = h("div", { class: "ysrp-empty", text: t("No plugins match your search.", "没有符合条件的插件。") });

    function apply() {
        const q = search.trim().toLowerCase();
        const visible = (c: ReturnType<typeof PluginCard>) => {
            const enabled = isPluginEnabled(c.plugin.name);
            if (filter === "enabled" && !enabled) return false;
            if (filter === "disabled" && enabled) return false;
            return !q || `${c.plugin.name} ${c.plugin.title()} ${c.plugin.description()} ${c.plugin.authors.join(" ")}`.toLowerCase().includes(q);
        };
        const user = cards.filter(c => !c.plugin.required && visible(c));
        const core = cards.filter(c => c.plugin.required && visible(c));
        userGrid.replaceChildren(...user.map(c => c.node));
        requiredGrid.replaceChildren(...core.map(c => c.node));
        userGrid.hidden = !user.length;
        requiredGrid.hidden = !core.length;
        divider.hidden = !user.length || !core.length;
        empty.hidden = Boolean(user.length || core.length);
    }
    input.addEventListener("input", () => { search = input.value; apply(); });
    select.addEventListener("change", () => { filter = select.value as Filter; apply(); });

    node.append(
        h("div", { class: "ysrp-pane-hint", text: t("Turn features on or off. Changes apply immediately. Click the sliders icon to configure.", "开启或关闭各项功能，立即生效。点滑杆图标进行配置。") }),
        h("div", { class: "ysrp-search-bar" }, input, select),
        userGrid, divider, requiredGrid, empty);
    apply();
    const off = onPluginToggle(() => { for (const c of cards) c.render(); apply(); });
    return {
        node,
        refresh() { for (const c of cards) c.render(); apply(); },
        destroy: off,
    };
}
