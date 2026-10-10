/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Modal from "@api/Modal";
import { RESUMED_NOTICE_MS } from "@utils/constants";
import { h, icon, shieldFromPlayer } from "@utils/dom";
import { t } from "@utils/i18n";
import { formatTime } from "@utils/misc";

export type BadgeState =
    | { kind: "loading" | "idle" | "live" | "choosing" | "syncing"; }
    | { kind: "saved" | "resumed"; seconds: number; }
    | { kind: "error"; message?: string; };

let node: HTMLElement | null = null;
let textNode: HTMLElement | null = null;
let state: BadgeState = { kind: "loading" };
let pending: BadgeState | null = null;
let resumedTimer: ReturnType<typeof setTimeout> | null = null;
const mountListeners = new Set<(node: HTMLElement) => void>();

function render() {
    if (!textNode) return;
    textNode.classList.remove("is-error", "is-resumed");
    textNode.removeAttribute("title");
    switch (state.kind) {
        case "saved":
            textNode.textContent = formatTime(state.seconds);
            textNode.title = t("Last saved position", "最近保存的位置");
            break;
        case "resumed":
            textNode.textContent = t("Resumed {time}", "已恢复 {time}", { time: formatTime(state.seconds) });
            textNode.classList.add("is-resumed");
            break;
        case "error":
            textNode.textContent = t("⚠ Save failed", "⚠ 保存失败");
            textNode.title = state.message || "";
            textNode.classList.add("is-error");
            break;
        case "live":
            textNode.textContent = t("Live · not saved", "直播 · 不保存");
            break;
        case "choosing":
            textNode.textContent = t("Choose a position…", "请选择播放位置…");
            break;
        case "syncing":
            textNode.textContent = t("Syncing…", "正在同步…");
            break;
        case "idle":
            textNode.textContent = formatTime(0);
            break;
        default:
            textNode.textContent = t("Loading...", "加载中...");
    }
}

export function show(next: BadgeState) {
    if (state.kind === "resumed" && next.kind === "saved" && resumedTimer) {
        pending = next;
        return;
    }
    if (resumedTimer) clearTimeout(resumedTimer);
    resumedTimer = null;
    pending = null;
    state = next;
    if (next.kind === "resumed") {
        resumedTimer = setTimeout(() => {
            resumedTimer = null;
            state = pending || { kind: "saved", seconds: next.seconds };
            pending = null;
            render();
        }, RESUMED_NOTICE_MS);
    }
    render();
}

function build() {
    textNode = h("span", { class: "last-save-info-text" });
    const label = t("Open settings", "打开设置");
    const button = h("button", { type: "button", class: "ysrp-settings-button", title: label, "aria-label": label }, icon("gear"));
    shieldFromPlayer(button, () => Modal.open());
    node = h("div", { class: "last-save-info-container" }, h("div", { class: "last-save-info" }, textNode, button));
    render();
}

// F-3.1 / F-3.3
export function ensure() {
    const host = document.querySelector("#movie_player .ytp-left-controls");
    if (!host) return;
    if (node && node.parentNode === host) return;
    document.querySelectorAll(".last-save-info-container").forEach(n => n.remove());
    if (!node) build();
    host.appendChild(node as HTMLElement);
    for (const listener of mountListeners) listener(node as HTMLElement);
}

export function rebuild() {
    node?.remove();
    node = null;
    textNode = null;
    ensure();
}

export function destroy() {
    node?.remove();
    node = null;
    textNode = null;
}

export const current = () => (node?.isConnected ? node : null);

export function onMount(listener: (node: HTMLElement) => void) {
    mountListeners.add(listener);
    return () => mountListeners.delete(listener);
}
