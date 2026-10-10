/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

export const hasGM = typeof GM_getValue === "function" && typeof GM_setValue === "function"
    && typeof GM_deleteValue === "function" && typeof GM_listValues === "function";

export function readSetting(key: string): string | null {
    let value: unknown = null;
    try { value = window.localStorage.getItem(key); } catch {}
    if ((value === null || value === "") && hasGM) {
        try { value = GM_getValue(key, null); } catch {}
    }
    if (value === undefined || value === null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
}

export function writeSetting(key: string, value: string) {
    try { window.localStorage.setItem(key, value); } catch {}
    if (hasGM) { try { GM_setValue(key, value); } catch {} }
}

export function readJsonSetting<T extends object>(key: string): Partial<T> | null {
    const raw = readSetting(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function readSecret(key: string): string | null {
    if (hasGM) {
        try {
            const value = GM_getValue<unknown>(key, null);
            if (value !== null && value !== undefined && value !== "") return typeof value === "string" ? value : JSON.stringify(value);
        } catch {}
    }
    try { return window.localStorage.getItem(key); } catch { return null; }
}

export function writeSecret(key: string, value: string) {
    if (hasGM) {
        try { GM_setValue(key, value); return; } catch {}
    }
    try { window.localStorage.setItem(key, value); } catch {}
}
