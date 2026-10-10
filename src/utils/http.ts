/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

export interface HttpRequest {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
}

export interface HttpResponse {
    status: number;
    ok: boolean;
    text: string;
    json<T = any>(): T;
}

function wrap(status: number, text: string): HttpResponse {
    return {
        status,
        ok: status >= 200 && status < 300,
        text,
        json: () => JSON.parse(text || "null"),
    };
}

const hasGMXhr = () => typeof GM_xmlhttpRequest === "function";

export function request(req: HttpRequest): Promise<HttpResponse> {
    const timeoutMs = req.timeoutMs ?? 30000;
    if (hasGMXhr()) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: req.method,
                url: req.url,
                headers: req.headers,
                data: req.body,
                timeout: timeoutMs,
                onload: res => resolve(wrap(res.status, res.responseText ?? "")),
                onerror: () => reject(new Error(`Network error: ${req.method} ${new URL(req.url).host}`)),
                ontimeout: () => reject(new Error(`Timed out: ${req.method} ${new URL(req.url).host}`)),
                onabort: () => reject(new Error("Request aborted")),
            });
        });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: controller.signal, credentials: "omit", cache: "no-store" })
        .then(async res => wrap(res.status, await res.text()))
        .finally(() => clearTimeout(timer));
}
