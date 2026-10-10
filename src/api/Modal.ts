/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { getSettingsTabs, onSettingsTabsChange, type Pane, type PaneContext } from "@api/SettingsTabs";
import * as Store from "@api/Store";
import { ensureFontAwesome } from "@utils/css";
import { h, icon } from "@utils/dom";
import { t } from "@utils/i18n";

interface ModalUI {
    backdrop: HTMLElement;
    container: HTMLElement;
    setTab(id: string): void;
    refresh(): void;
    destroy(): void;
}

let ui: ModalUI | null = null;
let activeTab = "records";
let keyListener: ((event: KeyboardEvent) => void) | null = null;
let unsubscribeTabs: (() => void) | null = null;

function hostRoot() {
    return document.querySelector("ytd-app #content") || document.querySelector("#content")
        || document.querySelector("#page-manager") || document.body;
}

// F-4.2: block page scrolling without touching overflow, so the page scrollbar stays and nothing shifts sideways.
const SCROLL_KEYS = new Set([" ", "PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"]);
let scrollGuard: ((event: Event) => void) | null = null;

function scrollableInside(target: EventTarget | null, container: HTMLElement) {
    for (let el = target as HTMLElement | null; el && el !== container.parentElement; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return true;
        if (el === container) break;
    }
    return false;
}

function lockScroll() {
    if (scrollGuard) return;
    scrollGuard = event => {
        if (!ui) return;
        if (event instanceof KeyboardEvent) {
            const target = event.target as HTMLElement | null;
            if (!SCROLL_KEYS.has(event.key) || ui.container.contains(target) || target?.closest?.("input, textarea, select, [contenteditable]")) return;
        } else if (scrollableInside(event.target, ui.container)) {
            return;
        }
        event.preventDefault();
    };
    for (const type of ["wheel", "touchmove", "keydown"]) window.addEventListener(type, scrollGuard, { capture: true, passive: false });
}

function unlockScroll() {
    if (!scrollGuard) return;
    for (const type of ["wheel", "touchmove", "keydown"]) window.removeEventListener(type, scrollGuard, { capture: true });
    scrollGuard = null;
}

export function isOpen() {
    return Boolean(ui && ui.container.style.display !== "none" && ui.container.isConnected);
}

export function open(tab?: string) {
    if (!keyListener) return;
    ensureFontAwesome();
    if (!ui) ui = build();
    const root = hostRoot();
    if (!ui.backdrop.isConnected) root.appendChild(ui.backdrop);
    if (!ui.container.isConnected) root.appendChild(ui.container);
    ui.backdrop.style.display = "block";
    ui.container.style.display = "flex";
    ui.setTab(tab || activeTab);
    ui.refresh();
    lockScroll();
}

export function close() {
    if (!ui) return;
    ui.container.style.display = "none";
    ui.backdrop.style.display = "none";
    unlockScroll();
}

export function rebuild() {
    const wasOpen = isOpen();
    if (ui) { ui.destroy(); ui = null; }
    if (wasOpen) open(activeTab);
    else unlockScroll();
}

export function mount() {
    if (keyListener) return;
    keyListener = event => {
        if (event.key === "Escape" && isOpen()) { event.stopPropagation(); close(); }
    };
    document.addEventListener("keydown", keyListener, true);
    unsubscribeTabs = onSettingsTabsChange(() => { if (ui) rebuild(); });
}

export function unmount() {
    if (isOpen()) close();
    ui?.destroy();
    ui = null;
    if (keyListener) document.removeEventListener("keydown", keyListener, true);
    keyListener = null;
    unsubscribeTabs?.();
    unsubscribeTabs = null;
}

function build(): ModalUI {
    const cleanups: (() => void)[] = [];
    const listen = (target: EventTarget, name: string, fn: (event: Event) => void) => {
        target.addEventListener(name, fn);
        cleanups.push(() => target.removeEventListener(name, fn));
    };

    const backdrop = h("div", { class: "ysrp-backdrop ysrp-theme", style: { display: "none" } });
    backdrop.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); close(); });

    const title = h("h3");
    const modeBadge = h("span", { class: "ysrp-badge" });
    const spinner = h("span", { class: "ysrp-spinner", title: t("Refreshing…", "正在更新列表…") }, h("i", { class: "fa-solid fa-arrows-rotate fa-spin" }));
    const setCount = (n: number) => { title.textContent = t("Saved Videos - ({count})", "已保存视频 - ({count})", { count: n }); };
    const renderModeBadge = () => {
        modeBadge.textContent = Store.getMode() === "gm" ? t("GM Storage", "GM 存储") : t("localStorage", "浏览器本地存储");
    };
    setCount(Store.list().length);
    renderModeBadge();

    const header = h("div", { class: "ysrp-header" },
        h("div", { class: "ysrp-header-left" }, title, modeBadge),
        h("div", { class: "ysrp-header-left" }, spinner,
            h("button", { type: "button", class: "ysrp-close", title: t("Close", "关闭"), "aria-label": t("Close", "关闭"), text: "✖", onclick: close })));

    const ctx: PaneContext = {
        setCount,
        spin: on => spinner.classList.toggle("is-active", on),
        renderModeBadge,
        listen,
    };

    const tabs = getSettingsTabs();
    const panes = new Map<string, Pane>();
    const tabButtons = new Map<string, HTMLButtonElement>();
    const tabsBar = h("div", { class: "ysrp-tabs", role: "tablist" });
    const body = h("div", { class: "ysrp-body ysrp-settings-container-body" });
    for (const tab of tabs) {
        const pane = tab.render(ctx);
        pane.node.classList.add("ysrp-pane");
        pane.node.dataset.pane = tab.id;
        panes.set(tab.id, pane);
        const button = h("button", { type: "button", class: "ysrp-tab", role: "tab", dataset: { tabId: tab.id }, onclick: () => setTab(tab.id) },
            icon(tab.icon), h("span", { text: tab.label() }));
        tabButtons.set(tab.id, button);
        tabsBar.appendChild(button);
        body.appendChild(pane.node);
    }

    const container = h("div", { class: "ysrp-settings-container ysrp-theme", role: "dialog", "aria-modal": "true", style: { display: "none" } },
        header, tabsBar, body);
    for (const name of ["keydown", "keyup", "keypress"]) {
        container.addEventListener(name, event => {
            if ((event as KeyboardEvent).key !== "Escape") event.stopPropagation();
        });
    }

    function setTab(id: string) {
        activeTab = panes.has(id) ? id : tabs[0]?.id ?? "records";
        container.dataset.activeTab = activeTab;
        for (const [key, button] of tabButtons) {
            const on = key === activeTab;
            button.classList.toggle("is-active", on);
            button.setAttribute("aria-selected", String(on));
            panes.get(key)?.node.classList.toggle("is-active", on);
        }
    }

    return {
        backdrop,
        container,
        setTab,
        refresh() {
            renderModeBadge();
            for (const pane of panes.values()) pane.refresh?.();
        },
        destroy() {
            for (const fn of cleanups) fn();
            for (const pane of panes.values()) pane.destroy?.();
            container.remove();
            backdrop.remove();
        },
    };
}
