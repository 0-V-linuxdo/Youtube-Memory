/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Store from "@api/Store";
import { KEY_TRANSCRIPT } from "@utils/constants";
import { t } from "@utils/i18n";
import { readJsonSetting, writeSetting } from "@utils/storage";

const SUFFIX = "/v1/chat/completions";
export const DEFAULTS = Object.freeze({
    endpoint: "https://0-v-YouTube-Transcript-Generator-api.hf.space/v1/chat/completions",
    model: "transcript",
    apiKey: "sk-asdlfjalalfja",
    timeoutMs: 10 * 60 * 1000,
});
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 60;
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface TranscriptSettings {
    endpoint: string;
    model: string;
    apiKey: string;
    timeoutMs: number;
}

const cache = new Map<string, { text: string; at: number; }>();
const inflight = new Map<string, Promise<string>>();

function clampTimeoutMs(value: unknown) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return DEFAULTS.timeoutMs;
    return Math.min(MAX_MINUTES * 60000, Math.max(MIN_MINUTES * 60000, Math.round(n)));
}

// F-4.19
export function normalizeEndpoint(value: unknown) {
    let raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return "";
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    try {
        const url = new URL(raw);
        const path = url.pathname.replace(/\/+$/, "");
        url.pathname = path || SUFFIX;
        return url.toString().replace(/\/+$/, "");
    } catch {
        const trimmed = raw.replace(/\/+$/, "");
        return /\/\/[^/]+$/.test(trimmed) ? trimmed + SUFFIX : trimmed;
    }
}

export function getSettings(): TranscriptSettings {
    const merged = { ...DEFAULTS, ...readJsonSetting<TranscriptSettings>(KEY_TRANSCRIPT) };
    return {
        endpoint: normalizeEndpoint(merged.endpoint) || DEFAULTS.endpoint,
        model: String(merged.model || DEFAULTS.model),
        apiKey: typeof merged.apiKey === "string" ? merged.apiKey : "",
        timeoutMs: clampTimeoutMs(merged.timeoutMs),
    };
}

export function saveSettings(partial: Partial<TranscriptSettings>) {
    const next = getSettings();
    if (typeof partial.endpoint === "string" && partial.endpoint.trim()) next.endpoint = normalizeEndpoint(partial.endpoint);
    if (typeof partial.model === "string" && partial.model.trim()) next.model = partial.model.trim();
    if (typeof partial.apiKey === "string" && partial.apiKey.trim()) next.apiKey = partial.apiKey.trim();
    if (partial.timeoutMs !== undefined && Number(partial.timeoutMs) > 0) next.timeoutMs = clampTimeoutMs(partial.timeoutMs);
    writeSetting(KEY_TRANSCRIPT, JSON.stringify(next));
    return next;
}

// F-4.22
export function extractText(payload: any): string {
    if (!payload) return "";
    if (typeof payload === "string") return payload.trim();
    if (Array.isArray(payload)) return payload.map(extractText).filter(Boolean).join("\n").trim();
    if (payload.error?.message) throw new Error(payload.error.message);
    if (typeof payload.transcript === "string") return payload.transcript.trim();
    if (Array.isArray(payload.transcript)) return payload.transcript.join("\n").trim();
    if (typeof payload.output_text === "string") return payload.output_text.trim();
    if (Array.isArray(payload.output_text)) return payload.output_text.join("\n").trim();
    if (Array.isArray(payload.output)) {
        const joined = payload.output
            .flatMap((entry: any) => (entry && Array.isArray(entry.content) ? entry.content : []))
            .map((part: any) => (part && typeof part.text === "string" ? part.text : ""))
            .filter(Boolean).join("\n").trim();
        if (joined) return joined;
    }
    if (Array.isArray(payload.choices)) {
        const joined = payload.choices.map((choice: any) => {
            if (!choice) return "";
            const content = choice.message?.content;
            if (typeof content === "string") return content;
            if (Array.isArray(content)) return content.map((part: any) => part?.text || "").join("\n");
            return typeof choice.text === "string" ? choice.text : "";
        }).filter(Boolean).join("\n").trim();
        if (joined) return joined;
    }
    if (typeof payload.text === "string") return payload.text.trim();
    if (typeof payload.data === "string") return payload.data.trim();
    return "";
}

export function cached(id: string) {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at <= CACHE_TTL_MS) return hit.text;
    const rec = Store.get(id);
    if (rec && typeof rec.videoTranscript === "string" && rec.videoTranscript.trim()) {
        const text = rec.videoTranscript.trim();
        cache.set(id, { text, at: rec.videoTranscriptUpdatedAt || Date.now() });
        return text;
    }
    return "";
}

// F-4.21
export function fetchFor(id: string, force: boolean): Promise<string> {
    if (!id) return Promise.reject(new Error(t("Cannot detect the video id.", "无法识别当前视频 ID。")));
    if (!force) {
        const hit = cached(id);
        if (hit) return Promise.resolve(hit);
    }
    const pending = inflight.get(id);
    if (pending) return pending;
    const settings = getSettings();
    if (!settings.endpoint) return Promise.reject(new Error(t("Please configure the transcript endpoint first.", "请先配置字幕接口路径。")));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
    const body = JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: `https://www.youtube.com/watch?v=${id}` }],
    });
    const minutes = Math.round(settings.timeoutMs / 60000);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            try { controller.abort(); } catch {}
            reject(new Error(t("The transcript endpoint did not respond within {n} minute(s); request cancelled.",
                "字幕接口在 {n} 分钟内无响应，已自动取消请求。", { n: minutes })));
        }, settings.timeoutMs);
    });
    const requestText = (async () => {
        const res = await fetch(settings.endpoint, { method: "POST", headers, body, signal: controller.signal });
        const rawText = await res.text();
        let payload: any = rawText;
        try { payload = rawText ? JSON.parse(rawText) : null; } catch {}
        if (!res.ok) {
            const detail = payload?.error?.message || payload?.message || rawText || `HTTP ${res.status}`;
            throw new Error(String(detail));
        }
        const text = extractText(payload);
        if (!text) throw new Error(t("The transcript endpoint returned no content.", "字幕接口未返回有效内容。"));
        cache.set(id, { text, at: Date.now() });
        Store.updateIfExists(id, rec => Object.assign(rec, { videoTranscript: text, videoTranscriptUpdatedAt: Date.now() }));
        return text;
    })();
    const promise = Promise.race([requestText, timeout]).finally(() => {
        clearTimeout(timer);
        inflight.delete(id);
    });
    inflight.set(id, promise);
    return promise;
}
