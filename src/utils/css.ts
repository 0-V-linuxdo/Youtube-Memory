/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { FONT_AWESOME_CSS } from "./constants";

const active = new Map<string, HTMLStyleElement>();

function root() {
    return document.head || document.documentElement;
}

export function registerStyle(name: string, css: string) {
    const existing = active.get(name);
    if (existing?.isConnected) {
        if (existing.textContent !== css) existing.textContent = css;
        return;
    }
    const el = document.createElement("style");
    el.dataset.ysrp = name;
    el.textContent = css;
    root().appendChild(el);
    active.set(name, el);
}

export function unregisterStyle(name: string) {
    active.get(name)?.remove();
    active.delete(name);
}

export function ensureFontAwesome() {
    if (document.getElementById("ysrp-fontawesome")) return;
    const link = document.createElement("link");
    link.id = "ysrp-fontawesome";
    link.rel = "stylesheet";
    link.href = FONT_AWESOME_CSS;
    root().appendChild(link);
}
