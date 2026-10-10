/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Store from "@api/Store";
import { EVT_DRIVE_STATUS, EVT_RECORD, KEY_DRIVE_FULL_SYNC } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { emit, errorMessage } from "@utils/misc";
import { readSetting, writeSetting } from "@utils/storage";

import { DriveClient, fileNameFor, hasCredentials, LEGACY_FILE_NAME, readCredentials, type RecordPayload } from "./drive";

const logger = new Logger("DriveSync");

export const DEBOUNCE_MS = 1500;
export const MIN_INTERVAL_MS = 15000;
const RETRY_MS = 30000;
const PAYLOAD_VERSION = "2";

export type SyncState = "idle" | "start" | "progress" | "done" | "deferred" | "error";

export interface SyncStatus {
    state: SyncState;
    done: number;
    total: number;
    message: string;
    at: number;
}

interface Job {
    action: "set" | "remove";
    force: boolean;
}

export const client = new DriveClient(readCredentials);

const queue = new Map<string, Job>();
const lastUpload = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let timerDue = 0;
let running = false;
let rerun = false;
let active = false;
let fullSyncPending = false;
let status: SyncStatus = { state: "idle", done: 0, total: 0, message: "", at: 0 };

export const configured = () => hasCredentials(readCredentials());
export const getStatus = () => status;

function setStatus(next: Partial<SyncStatus> & { state: SyncState; }) {
    status = { done: 0, total: 0, message: "", ...next, at: Date.now() };
    emit(EVT_DRIVE_STATUS, status);
}

// Keeps the earliest deadline: a steady stream of changes (a save every 1.5 s) must not push the upload back forever.
function arm(ms: number) {
    if (!active) return;
    const due = Date.now() + Math.max(0, ms);
    if (timer && timerDue <= due) return;
    if (timer) clearTimeout(timer);
    timerDue = due;
    timer = setTimeout(() => { timer = null; void flush(); }, Math.max(0, ms));
}

export function schedule(videoId: string, action: Job["action"], force = false) {
    if (!active || !configured()) return;
    const previous = queue.get(videoId);
    queue.set(videoId, { action, force: force || (previous?.action === action && previous.force) });
    arm(DEBOUNCE_MS);
}

const stripMeta = ({ driveSync: _meta, ...rest }: Store.VideoRecord) => rest;

async function uploadRecord(videoId: string, force: boolean) {
    const startedAt = Date.now();
    const rec = Store.get(videoId);
    if (!rec) return false;
    if (!force && (Number(rec.updatedAt) || 0) <= (Number(rec.driveSync?.lastUploadAt) || 0)) return false;
    const files = await client.filesFor(videoId);
    const payload: RecordPayload = {
        version: PAYLOAD_VERSION,
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        exportedAt: startedAt,
        record: stripMeta(rec),
    };
    const saved = await client.upload(fileNameFor(rec.videoName, videoId), payload, files[0]?.id);
    for (const extra of files.slice(1)) await client.remove(extra.id);
    const remoteModifiedAt = Date.parse(saved?.modifiedTime) || Date.now();
    Store.updateIfExists(videoId, r => ({ ...r, driveSync: { ...r.driveSync, lastUploadAt: startedAt, remoteModifiedAt } }), { touch: false, source: "sync" });
    return true;
}

async function removeRemote(videoId: string) {
    for (const file of await client.filesFor(videoId)) await client.remove(file.id);
}

// P-D.6 / P-D.7: one job at a time, 1.5 s debounce, at most one upload per video every 15 s.
export async function flush() {
    if (!active) return;
    if (running) { rerun = true; return; }
    if (!queue.size) return;
    running = true;
    let failed = false;
    try {
        const total = queue.size;
        let done = 0;
        let nextDue = Infinity;
        setStatus({ state: "start", done, total });
        for (const [videoId, job] of [...queue]) {
            if (!active) break;
            const last = lastUpload.get(videoId) || 0;
            if (!job.force && job.action === "set" && Date.now() - last < MIN_INTERVAL_MS) {
                nextDue = Math.min(nextDue, last + MIN_INTERVAL_MS);
                continue;
            }
            queue.delete(videoId);
            try {
                if (job.action === "remove") await removeRemote(videoId);
                else if (await uploadRecord(videoId, job.force)) lastUpload.set(videoId, Date.now());
            } catch (err) {
                failed = true;
                if (!queue.has(videoId)) queue.set(videoId, job);
                logger.warn(`${job.action} ${videoId} failed`, err);
                setStatus({ state: "error", done, total, message: errorMessage(err) });
                arm(RETRY_MS);
                break;
            }
            done++;
            setStatus({ state: "progress", done, total });
        }
        if (!failed) {
            if (nextDue < Infinity) {
                setStatus({ state: "deferred", done, total });
                arm(nextDue - Date.now());
            } else {
                if (fullSyncPending && !queue.size) {
                    fullSyncPending = false;
                    writeSetting(KEY_DRIVE_FULL_SYNC, "1");
                }
                setStatus({ state: "done", done, total });
            }
        }
    } finally {
        running = false;
        if (rerun) { rerun = false; arm(0); }
    }
}

export function uploadAll() {
    if (!active || !configured()) return 0;
    const items = Store.list();
    for (const { id } of items) queue.set(id, { action: "set", force: true });
    arm(0);
    return items.length;
}

// P-D.9: legacy single-file backups from early v1.4.0 builds.
async function importLegacy() {
    const [file] = await client.findByName(LEGACY_FILE_NAME);
    if (!file) return 0;
    const payload = await client.download(file.id);
    const count = Store.importPayload(payload, {
        source: "sync",
        accept: (_id, incoming, existing) => !existing || (Number(incoming.saveDate) || 0) > (Number(existing.saveDate) || 0),
    });
    if (count) emit(EVT_RECORD, { videoId: null });
    logger.info(`Imported ${count} record(s) from ${LEGACY_FILE_NAME}`);
    return count;
}

export async function fullSync() {
    if (!active || !configured()) return;
    fullSyncPending = true;
    try {
        await importLegacy();
    } catch (err) {
        logger.warn("Legacy import failed", err);
    }
    uploadAll();
}

export function maybeFirstFullSync() {
    if (readSetting(KEY_DRIVE_FULL_SYNC) !== "1") void fullSync();
}

// P-D.8
export async function pullRecord(videoId: string) {
    if (!active || !configured()) return;
    const [file] = await client.filesFor(videoId);
    const local = Store.get(videoId);
    if (!file) {
        if (local) schedule(videoId, "set");
        return;
    }
    const remoteTime = Date.parse(file.modifiedTime) || 0;
    const meta = local?.driveSync ?? {};
    const newer = remoteTime > (Number(local?.updatedAt) || 0)
        && remoteTime > (Number(meta.lastDownloadAt) || 0)
        && remoteTime > (Number(meta.remoteModifiedAt) || 0);
    if (!newer) {
        if (local && (Number(local.updatedAt) || 0) > (Number(meta.lastUploadAt) || 0)) schedule(videoId, "set");
        return;
    }
    const payload = await client.download<RecordPayload>(file.id);
    const remote = payload?.record;
    if (!remote || typeof remote !== "object" || Array.isArray(remote) || (payload.videoId && payload.videoId !== videoId)) return;
    const now = Date.now();
    Store.update(videoId, r => ({
        ...r,
        ...stripMeta(remote),
        updatedAt: Number(remote.updatedAt) || remoteTime,
        driveSync: { ...r.driveSync, lastDownloadAt: now, lastUploadAt: now, remoteModifiedAt: remoteTime },
    }), { touch: false, source: "sync" });
    emit(EVT_RECORD, { videoId, videoProgress: remote.videoProgress });
}

export function activate() {
    active = true;
    if (queue.size) arm(DEBOUNCE_MS);
}

export function deactivate() {
    active = false;
    if (timer) clearTimeout(timer);
    timer = null;
    queue.clear();
    fullSyncPending = false;
    setStatus({ state: "idle" });
}
