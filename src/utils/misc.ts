/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { PLACEHOLDER_TITLES } from "./constants";

export function emit(name: string, detail?: unknown) {
    try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}

export function on<T = unknown>(name: string, handler: (detail: T) => void): () => void {
    const listener = (event: Event) => handler((event as CustomEvent<T>).detail);
    document.addEventListener(name, listener);
    return () => document.removeEventListener(name, listener);
}

export function formatTime(seconds: unknown) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const ss = String(total % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export const normTitle = (text: unknown) => String(text == null ? "" : text).replace(/\s+/g, " ").trim();
export const sameTitle = (a: unknown, b: unknown) => Boolean(a) && Boolean(b) && normTitle(a).toLowerCase() === normTitle(b).toLowerCase();
export const isPlaceholderTitle = (text: unknown) => !normTitle(text) || PLACEHOLDER_TITLES.has(normTitle(text).toLowerCase());

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const runtime = (() => {
    const ua = String(navigator.userAgent || "").toLowerCase();
    const isIOS = /\b(ipad|iphone|ipod)\b/.test(ua)
        || (ua.includes("mac") && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1);
    let canShareFile = false;
    if (isIOS && typeof File === "function" && typeof navigator.share === "function") {
        canShareFile = true;
        if (typeof navigator.canShare === "function") {
            try {
                canShareFile = navigator.canShare({ files: [new File(["{}"], "probe.json", { type: "application/json" })] });
            } catch {
                canShareFile = false;
            }
        }
    }
    return { isIOS, canShareFile };
})();
