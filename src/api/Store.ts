/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { KEY_STORAGE_MODE, RECORD_PREFIX, UNKNOWN_TITLE } from "@utils/constants";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { hasGM, readSetting, writeSetting } from "@utils/storage";

const logger = new Logger("Store");

export interface VideoRecord {
    videoProgress?: number;
    saveDate?: number;
    videoName?: string;
    originalTitle?: string | null;
    videoNote?: string;
    videoTranscript?: string;
    videoTranscriptUpdatedAt?: number;
    videoDuration?: number;
    updatedAt?: number;
    driveSync?: { lastUploadAt?: number; lastDownloadAt?: number; remoteModifiedAt?: number; };
    [key: string]: unknown;
}

export type StorageMode = "local" | "gm";

export interface RecordChange {
    id: string | null;
    type: "set" | "remove" | "bulk";
    source: "local" | "sync";
}

export interface UpdateOptions {
    touch?: boolean;
    source?: RecordChange["source"];
}

interface Backend {
    available: boolean;
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    keys(): string[];
}

const backends: Record<StorageMode, Backend> = {
    local: {
        available: true,
        get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
        set(key, value) { window.localStorage.setItem(key, value); },
        remove(key) { try { window.localStorage.removeItem(key); } catch {} },
        keys() {
            try {
                const out: string[] = [];
                for (let i = 0; i < window.localStorage.length; i++) out.push(window.localStorage.key(i) as string);
                return out;
            } catch {
                return [];
            }
        },
    },
    gm: {
        available: hasGM,
        get(key) {
            if (!hasGM) return null;
            try {
                const value = GM_getValue<unknown>(key, null);
                if (value === null || value === undefined) return null;
                return typeof value === "string" ? value : JSON.stringify(value);
            } catch {
                return null;
            }
        },
        set(key, value) {
            if (!hasGM) throw new Error("GM storage is not available");
            GM_setValue(key, value);
        },
        remove(key) { if (hasGM) { try { GM_deleteValue(key); } catch {} } },
        keys() { if (!hasGM) return []; try { return GM_listValues() || []; } catch { return []; } },
    },
};

let mode: StorageMode | null = null;
const listeners = new Set<(change: RecordChange) => void>();

function notify(change: RecordChange) {
    for (const listener of listeners) {
        try { listener(change); } catch (err) { logger.error("change listener failed", err); }
    }
}

export function getMode(): StorageMode {
    if (!mode) mode = readSetting(KEY_STORAGE_MODE) === "gm" && hasGM ? "gm" : "local";
    return mode;
}

export const isModeAvailable = (m: StorageMode) => backends[m].available;

const backend = () => backends[getMode()];
const keyOf = (id: string) => RECORD_PREFIX + id;

function parse(raw: string | null): VideoRecord | null {
    if (raw === null || raw === undefined) return null;
    try {
        const obj = JSON.parse(raw);
        return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
    } catch {
        return null;
    }
}

function rawEntries(be: Backend): [string, string][] {
    return be.keys()
        .filter(k => typeof k === "string" && k.startsWith(RECORD_PREFIX))
        .map(k => [k, be.get(k)] as [string, string | null])
        .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== undefined);
}

export function onRecordChange(listener: (change: RecordChange) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function get(id: string | null): VideoRecord | null {
    return id ? parse(backend().get(keyOf(id))) : null;
}

// Read-merge-write so fields written elsewhere (notes, transcripts, sync metadata) survive (F-1.1).
export function update(id: string, mutate: (rec: VideoRecord) => VideoRecord | void, options: UpdateOptions = {}) {
    const key = keyOf(id);
    const current = parse(backend().get(key)) || {};
    const next = mutate({ ...current }) || current;
    if (options.touch !== false) next.updatedAt = Date.now();
    backend().set(key, JSON.stringify(next));
    notify({ id, type: "set", source: options.source ?? "local" });
    return next;
}

export function updateIfExists(id: string, mutate: (rec: VideoRecord) => VideoRecord | void, options?: UpdateOptions) {
    if (!get(id)) return null;
    try {
        return update(id, mutate, options);
    } catch (err) {
        logger.error("update failed", err);
        return null;
    }
}

export function remove(id: string) {
    backend().remove(keyOf(id));
    notify({ id, type: "remove", source: "local" });
}

export function list() {
    const out: { id: string; rec: VideoRecord; }[] = [];
    for (const [key, raw] of rawEntries(backend())) {
        const rec = parse(raw);
        if (rec) out.push({ id: key.slice(RECORD_PREFIX.length), rec });
    }
    return out;
}

export function setMode(next: StorageMode) {
    if (!backends[next]?.available) throw new Error(`Storage "${next}" is not available`);
    const current = getMode();
    if (current === next) return 0;
    const src = backends[current];
    const dst = backends[next];
    const items = rawEntries(src);
    for (const [k, v] of items) dst.set(k, v);
    for (const [k] of items) src.remove(k);
    mode = next;
    writeSetting(KEY_STORAGE_MODE, next);
    notify({ id: null, type: "bulk", source: "local" });
    return items.length;
}

export function exportAll() {
    const entries: Record<string, string> = {};
    for (const [k, v] of rawEntries(backend())) entries[k] = v;
    return { version: "1", exportedAt: Date.now(), storageMode: getMode(), entries };
}

export interface ImportOptions {
    overwrite?: boolean;
    accept?(id: string, incoming: VideoRecord, existing: VideoRecord | null): boolean;
    source?: RecordChange["source"];
}

export function importPayload(payload: unknown, options: ImportOptions = {}) {
    const entries = (payload as { entries?: unknown; } | null)?.entries;
    if (!payload || typeof payload !== "object" || !entries || typeof entries !== "object") {
        throw new Error(t("Invalid import payload", "导入内容格式无效"));
    }
    const be = backend();
    if (options.overwrite) for (const [k] of rawEntries(be)) be.remove(k);
    let count = 0;
    for (const [k, v] of Object.entries(entries as Record<string, unknown>)) {
        if (!k.startsWith(RECORD_PREFIX) || v === null || v === undefined) continue;
        const text = typeof v === "string" ? v : JSON.stringify(v);
        if (options.accept) {
            const incoming = parse(text);
            if (!incoming || !options.accept(k.slice(RECORD_PREFIX.length), incoming, parse(be.get(k)))) continue;
        }
        be.set(k, text);
        count++;
    }
    notify({ id: null, type: "bulk", source: options.source ?? "local" });
    return count;
}

// F-5.1
export function cleanup() {
    const be = backend();
    for (const [key, raw] of rawEntries(be)) {
        const rec = parse(raw);
        if (!rec) { be.remove(key); continue; }
        const name = typeof rec.videoName === "string" && rec.videoName.trim() ? rec.videoName.trim() : UNKNOWN_TITLE;
        if (name !== rec.videoName) {
            rec.videoName = name;
            try { be.set(key, JSON.stringify(rec)); } catch {}
        }
    }
}
