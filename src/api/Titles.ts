/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Store from "@api/Store";
import { DEARROW_API, DEARROW_TTL_MS, EVT_TITLE, OEMBED_API } from "@utils/constants";
import { emit, normTitle, sameTitle } from "@utils/misc";

// F-2.5: original titles come from the player or oEmbed, replacement titles from DeArrow.
const originals = new Map<string, string>();
const originalFetches = new Map<string, Promise<string | null>>();
const dearrows = new Map<string, { title: string | null; at: number; }>();
const dearrowFetches = new Map<string, Promise<string | null>>();

export function rememberOriginal(id: string, title: unknown) {
    const value = normTitle(title);
    if (id && value) originals.set(id, value);
}

export function getOriginal(id: string): Promise<string | null> {
    if (!id) return Promise.resolve(null);
    const known = originals.get(id);
    if (known) return Promise.resolve(known);
    const pending = originalFetches.get(id);
    if (pending) return pending;
    const url = OEMBED_API + encodeURIComponent(`https://youtu.be/${id}`);
    const promise = fetch(url, { credentials: "omit", cache: "no-store" })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
            const title = data && typeof data.title === "string" ? normTitle(data.title) : null;
            if (title) {
                originals.set(id, title);
                Store.updateIfExists(id, rec => Object.assign(rec, { originalTitle: title }));
            }
            return title || null;
        })
        .catch(() => null)
        .finally(() => originalFetches.delete(id));
    originalFetches.set(id, promise);
    return promise;
}

function pickDeArrow(data: { titles?: { title?: unknown; original?: boolean; locked?: boolean; votes?: number; }[]; } | null) {
    if (!data || !Array.isArray(data.titles)) return null;
    const entry = data.titles.find(item => item && typeof item.title === "string" && item.original !== true
        && (Boolean(item.locked) || (typeof item.votes === "number" ? item.votes : 0) >= 0));
    return entry ? normTitle(entry.title) || null : null;
}

function cachedDeArrow(id: string) {
    const hit = dearrows.get(id);
    return hit && Date.now() - hit.at < DEARROW_TTL_MS ? hit : null;
}

export function getDeArrow(id: string): Promise<string | null> {
    if (!id) return Promise.resolve(null);
    const hit = cachedDeArrow(id);
    if (hit) return Promise.resolve(hit.title);
    const pending = dearrowFetches.get(id);
    if (pending) return pending;
    const promise = fetch(DEARROW_API + encodeURIComponent(id), { credentials: "omit", cache: "no-store" })
        .then(res => {
            if (res.status === 404) return { titles: [] };
            if (!res.ok) throw new Error(`DeArrow HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            let title = pickDeArrow(data);
            if (title && sameTitle(title, originals.get(id))) title = null;
            dearrows.set(id, { title, at: Date.now() });
            if (title) emit(EVT_TITLE, { videoId: id, title });
            return title;
        })
        .catch(() => null)
        .finally(() => dearrowFetches.delete(id));
    dearrowFetches.set(id, promise);
    return promise;
}

export const knownOriginal = (id: string) => originals.get(id) || null;

export function knownDeArrow(id: string): string | null | undefined {
    const hit = cachedDeArrow(id);
    return hit ? hit.title : undefined;
}
