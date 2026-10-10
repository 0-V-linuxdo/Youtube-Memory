/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { EVT_LANG, KEY_LANGUAGE } from "./constants";
import { emit } from "./misc";
import { readSetting, writeSetting } from "./storage";

export type Language = "zh" | "en";
export type LanguagePreference = Language | "auto";

export function detectBrowserLanguage(): Language {
    const candidates = ([] as string[]).concat(navigator.languages || [], navigator.language || []).filter(Boolean);
    return candidates.length && String(candidates[0]).toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
    const raw = String(value || "").trim().toLowerCase();
    if (raw.startsWith("zh")) return "zh";
    if (raw.startsWith("en")) return "en";
    return "auto";
}

let preference = normalizeLanguagePreference(readSetting(KEY_LANGUAGE));

export const languagePreference = () => preference;
export const resolvedLanguage = (): Language => (preference === "auto" ? detectBrowserLanguage() : preference);

export function t(en: string, zh: string, params?: Record<string, unknown>) {
    let text = resolvedLanguage() === "zh" ? zh : en;
    if (params) {
        text = text.replace(/\{(\w+)\}/g, (_, key: string) => (Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : ""));
    }
    return text;
}

export function setLanguagePreference(value: unknown) {
    const next = normalizeLanguagePreference(value);
    if (next === preference) return false;
    preference = next;
    writeSetting(KEY_LANGUAGE, next);
    emit(EVT_LANG, { preference: next, resolved: resolvedLanguage() });
    return true;
}
