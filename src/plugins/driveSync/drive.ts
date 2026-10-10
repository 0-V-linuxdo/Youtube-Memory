/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import type { VideoRecord } from "@api/Store";
import { KEY_DRIVE, UNKNOWN_TITLE } from "@utils/constants";
import { request } from "@utils/http";
import { readSecret, writeSecret } from "@utils/storage";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
export const FOLDER_NAME = "[Youtube] Video Memory";
export const LEGACY_FILE_NAME = "[Youtube] Video Memory Sync.json";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const JSON_MIME = "application/json";
const FILE_FIELDS = "id,name,modifiedTime";

export interface Credentials {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}

export interface DriveFile {
    id: string;
    name: string;
    modifiedTime: string;
}

export interface RecordPayload {
    version: string;
    videoId: string;
    videoUrl: string;
    exportedAt: number;
    record: VideoRecord;
}

export class DriveError extends Error {
    constructor(message: string, public status = 0) {
        super(message);
    }
}

// F-1.2: same key and shape as v1.4.0, so credentials it left behind keep working.
export function readCredentials(): Credentials {
    let stored: Partial<Credentials> = {};
    try { stored = JSON.parse(readSecret(KEY_DRIVE) || "{}") || {}; } catch {}
    return {
        clientId: typeof stored.clientId === "string" ? stored.clientId.trim() : "",
        clientSecret: typeof stored.clientSecret === "string" ? stored.clientSecret.trim() : "",
        refreshToken: typeof stored.refreshToken === "string" ? stored.refreshToken.trim() : "",
    };
}

export function writeCredentials(creds: Credentials) {
    let stored: Record<string, unknown> = {};
    try { stored = JSON.parse(readSecret(KEY_DRIVE) || "{}") || {}; } catch {}
    writeSecret(KEY_DRIVE, JSON.stringify({ ...stored, ...creds }));
}

export const hasCredentials = (c: Credentials) => Boolean(c.clientId && c.clientSecret && c.refreshToken);

// P-D.4
export function fileNameFor(title: unknown, videoId: string) {
    const clean = String(title ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120)
        .trim();
    return `${clean || UNKNOWN_TITLE}｜${videoId}.json`;
}

export function videoIdFromName(name: string) {
    const m = /(?:｜([\w-]+)|\[([\w-]+)\])\.json$/.exec(name);
    return m ? m[1] || m[2] : null;
}

const quote = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function describe(status: number, text: string) {
    try {
        const body = JSON.parse(text);
        const message = body?.error?.message || body?.error_description || body?.error;
        if (message) return `HTTP ${status}: ${typeof message === "string" ? message : JSON.stringify(message)}`;
    } catch {}
    return `HTTP ${status}`;
}

export class DriveClient {
    private token: { value: string; expiresAt: number; } | null = null;
    private folder: string | null = null;

    constructor(private credentials: () => Credentials) {}

    reset() {
        this.token = null;
        this.folder = null;
    }

    // P-D.2
    async accessToken(force = false) {
        if (!force && this.token && Date.now() < this.token.expiresAt) return this.token.value;
        const c = this.credentials();
        if (!hasCredentials(c)) throw new DriveError("Missing credentials");
        const body = new URLSearchParams({
            client_id: c.clientId,
            client_secret: c.clientSecret,
            refresh_token: c.refreshToken,
            grant_type: "refresh_token",
        }).toString();
        const res = await request({ method: "POST", url: TOKEN_URL, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        if (!res.ok) throw new DriveError(describe(res.status, res.text), res.status);
        const data = res.json<{ access_token?: string; expires_in?: number; }>();
        if (!data?.access_token) throw new DriveError("Token response has no access_token");
        const lifetime = (Number(data.expires_in) || 3600) * 1000;
        this.token = { value: data.access_token, expiresAt: Date.now() + Math.max(0, lifetime - 60000) };
        return this.token.value;
    }

    private async call(method: string, url: string, init: { headers?: Record<string, string>; body?: string; } = {}, retry = true): Promise<string> {
        const token = await this.accessToken();
        const res = await request({ method, url, headers: { ...init.headers, Authorization: `Bearer ${token}` }, body: init.body });
        if (res.status === 401 && retry) {
            this.token = null;
            return this.call(method, url, init, false);
        }
        if (!res.ok && !(method === "DELETE" && res.status === 404)) throw new DriveError(describe(res.status, res.text), res.status);
        return res.text;
    }

    private async list(q: string, orderBy?: string): Promise<DriveFile[]> {
        const params = new URLSearchParams({ q, fields: `files(${FILE_FIELDS})`, pageSize: "100", spaces: "drive" });
        if (orderBy) params.set("orderBy", orderBy);
        const text = await this.call("GET", `${FILES_URL}?${params}`);
        return JSON.parse(text || "{}").files ?? [];
    }

    // P-D.3
    async folderId() {
        if (this.folder) return this.folder;
        const found = await this.list(`name = ${quote(FOLDER_NAME)} and mimeType = ${quote(FOLDER_MIME)} and trashed = false`, "createdTime");
        if (found[0]) return (this.folder = found[0].id);
        const text = await this.call("POST", `${FILES_URL}?fields=id`, {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
        });
        return (this.folder = JSON.parse(text).id as string);
    }

    // P-D.5
    async filesFor(videoId: string) {
        const folder = await this.folderId();
        const files = await this.list(
            `name contains ${quote(videoId)} and mimeType = ${quote(JSON_MIME)} and trashed = false and ${quote(folder)} in parents`,
            "modifiedTime desc",
        );
        return files.filter(f => videoIdFromName(f.name) === videoId);
    }

    async findByName(name: string) {
        return this.list(`name = ${quote(name)} and trashed = false`, "modifiedTime desc");
    }

    async download<T = unknown>(fileId: string): Promise<T> {
        const text = await this.call("GET", `${FILES_URL}/${encodeURIComponent(fileId)}?alt=media`);
        return JSON.parse(text);
    }

    async upload(name: string, content: unknown, existingId?: string): Promise<DriveFile> {
        const boundary = `ysrp-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        const metadata: Record<string, unknown> = { name, mimeType: JSON_MIME };
        if (!existingId) metadata.parents = [await this.folderId()];
        const body = [
            `--${boundary}`,
            "Content-Type: application/json; charset=UTF-8",
            "",
            JSON.stringify(metadata),
            `--${boundary}`,
            "Content-Type: application/json; charset=UTF-8",
            "",
            JSON.stringify(content),
            `--${boundary}--`,
            "",
        ].join("\r\n");
        const url = existingId
            ? `${UPLOAD_URL}/${encodeURIComponent(existingId)}?uploadType=multipart&fields=${FILE_FIELDS}`
            : `${UPLOAD_URL}?uploadType=multipart&fields=${FILE_FIELDS}`;
        const text = await this.call(existingId ? "PATCH" : "POST", url, {
            headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
            body,
        });
        return JSON.parse(text);
    }

    async remove(fileId: string) {
        await this.call("DELETE", `${FILES_URL}/${encodeURIComponent(fileId)}`);
    }
}
