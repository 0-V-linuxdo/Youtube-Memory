/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Badge from "@api/Badge";
import { runRestoreHooks } from "@api/RestoreHooks";
import * as ResumePrompt from "@api/ResumePrompt";
import * as Store from "@api/Store";
import * as Titles from "@api/Titles";
import {
    BEFORE_RESTORE_TIMEOUT_MS, Devs, END_GUARD_SECONDS, EVT_RECORD, EVT_VIDEO, MIN_RESTORE_POSITION, MIN_SAVE_DELTA, RESTORE_MAX_ATTEMPTS,
    RESTORE_RETRY_MS, RESTORE_TIMEOUT_MS, RESTORE_TOLERANCE, SAVE_THROTTLE_MS, TICK_MS, UNKNOWN_TITLE
} from "@utils/constants";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { emit, errorMessage, isPlaceholderTitle, normTitle } from "@utils/misc";
import definePlugin from "@utils/types";
import { getPlayer, isPlayerReadyFor, playerVideoData, urlHasStartTime, urlStartTime, urlVideoId, type YouTubePlayer } from "@utils/youtube";

const logger = new Logger("Engine");

type Phase = "waiting" | "choosing" | "restoring" | "tracking";

interface Session {
    id: string;
    phase: Phase;
    ready: boolean;
    isLive: boolean;
    duration: number;
    lastTime: number | null;
    lastWritten: number | null;
    lastWriteAt: number;
    restoreTarget: number;
    restoreStartedAt: number;
    lastSeekAt: number;
    seekAttempts: number;
    confirmations: number;
}

let session: Session | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const cleanups: (() => void)[] = [];

function newSession(id: string): Session {
    return {
        id,
        phase: "waiting",
        ready: true,
        isLive: false,
        duration: 0,
        lastTime: null,
        lastWritten: null,
        lastWriteAt: 0,
        restoreTarget: 0,
        restoreStartedAt: 0,
        lastSeekAt: 0,
        seekAttempts: 0,
        confirmations: 0,
    };
}

function titleFor(id: string, rec: Store.VideoRecord | null) {
    const dearrow = Titles.knownDeArrow(id);
    const original = Titles.knownOriginal(id) || (rec && normTitle(rec.originalTitle)) || null;
    if (dearrow) return { videoName: dearrow, originalTitle: original };
    const stored = rec && !isPlaceholderTitle(rec.videoName) ? normTitle(rec.videoName) : null;
    return { videoName: stored || original || UNKNOWN_TITLE, originalTitle: original };
}

function write(s: Session) {
    if (s.phase !== "tracking" || s.isLive || s.lastTime === null) return false;
    const position = Math.round(s.lastTime * 1000) / 1000;
    try {
        Store.update(s.id, rec => {
            const titles = titleFor(s.id, rec);
            return Object.assign(rec, {
                videoProgress: position,
                saveDate: Date.now(),
                videoName: titles.videoName,
                originalTitle: titles.originalTitle || rec.originalTitle || null,
                videoDuration: s.duration || rec.videoDuration,
            });
        });
    } catch (err) {
        logger.error("Failed to save progress:", err);
        Badge.show({ kind: "error", message: errorMessage(err) });
        return false;
    }
    s.lastWritten = position;
    s.lastWriteAt = Date.now();
    Badge.show({ kind: "saved", seconds: position });
    emit(EVT_RECORD, { videoId: s.id, videoProgress: position });
    return true;
}

function maybeWrite(s: Session | null, force: boolean) {
    if (!s || s.phase !== "tracking" || s.isLive || s.lastTime === null) return;
    if (s.lastWritten !== null && Math.abs(s.lastTime - s.lastWritten) < MIN_SAVE_DELTA) return;
    if (!force && Date.now() - s.lastWriteAt < SAVE_THROTTLE_MS) return;
    write(s);
}

function enterTracking(s: Session, notice?: Badge.BadgeState) {
    s.phase = "tracking";
    if (notice) Badge.show(notice);
    else if (s.lastWritten === null) Badge.show({ kind: "idle" });
}

function beginRestore(s: Session, player: YouTubePlayer) {
    const data = playerVideoData(player);
    s.isLive = Boolean(data.isLive);
    if (data.title) Titles.rememberOriginal(s.id, data.title);
    if (s.isLive) return enterTracking(s, { kind: "live" });
    const rec = Store.get(s.id);
    const target = rec ? Number(rec.videoProgress) : NaN;
    if (!Number.isFinite(target) || target <= MIN_RESTORE_POSITION) return enterTracking(s);
    if (target >= s.duration - END_GUARD_SECONDS) return enterTracking(s);
    s.restoreTarget = target;
    if (urlHasStartTime()) return askForChoice(s, player);
    startRestoring(s, player);
}

function startRestoring(s: Session, player: YouTubePlayer) {
    s.phase = "restoring";
    s.restoreStartedAt = Date.now();
    s.seekAttempts = 0;
    seek(s, player);
}

// D-1 / F-2.6: a timestamp link and a saved position disagree; the user picks one.
function askForChoice(s: Session, player: YouTubePlayer) {
    const linkTime = urlStartTime() ?? (Number(player.getCurrentTime()) || 0);
    if (Math.abs(linkTime - s.restoreTarget) <= RESTORE_TOLERANCE) return enterTracking(s);
    s.phase = "choosing";
    let wasPlaying = false;
    try { wasPlaying = player.getPlayerState?.() === 1; player.pauseVideo?.(); } catch {}
    Badge.show({ kind: "choosing" });
    ResumePrompt.open({ saved: s.restoreTarget, link: linkTime }, choice => {
        if (session !== s || s.phase !== "choosing") return;
        const current = getPlayer();
        if (choice === "saved" && current) startRestoring(s, current);
        else enterTracking(s);
        if (wasPlaying && current) { try { current.playVideo?.(); } catch {} }
    });
}

function seek(s: Session, player: YouTubePlayer) {
    s.seekAttempts++;
    s.lastSeekAt = Date.now();
    s.confirmations = 0;
    try { player.seekTo(s.restoreTarget, true); } catch (err) { logger.error("seekTo failed", err); }
}

function continueRestore(s: Session, player: YouTubePlayer, now: number) {
    const current = Number(player.getCurrentTime()) || 0;
    if (Math.abs(current - s.restoreTarget) <= RESTORE_TOLERANCE) {
        s.confirmations++;
        if (s.confirmations >= 2) {
            s.lastWritten = s.restoreTarget;
            enterTracking(s, { kind: "resumed", seconds: s.restoreTarget });
        }
        return;
    }
    s.confirmations = 0;
    if (s.seekAttempts >= RESTORE_MAX_ATTEMPTS || now - s.restoreStartedAt > RESTORE_TIMEOUT_MS) {
        logger.warn("Could not restore position for", s.id);
        s.lastWritten = current;
        enterTracking(s);
        return;
    }
    if (now - s.lastSeekAt >= RESTORE_RETRY_MS) seek(s, player);
}

function startSession(id: string | null) {
    ResumePrompt.close();
    const s = id ? newSession(id) : null;
    session = s;
    Badge.show({ kind: "loading" });
    if (s) {
        const rec = Store.get(s.id);
        if (rec && normTitle(rec.originalTitle)) Titles.rememberOriginal(s.id, rec.originalTitle);
        Titles.getDeArrow(s.id).then(title => {
            if (title) Store.updateIfExists(s.id, r => Object.assign(r, { videoName: title }));
        });
        const hooks = runRestoreHooks(s.id);
        if (hooks.length) {
            s.ready = false;
            Badge.show({ kind: "syncing" });
            const timeout = new Promise(resolve => setTimeout(resolve, BEFORE_RESTORE_TIMEOUT_MS));
            Promise.race([Promise.allSettled(hooks), timeout]).then(() => {
                s.ready = true;
                if (session === s && s.phase === "waiting") Badge.show({ kind: "loading" });
            });
        }
    }
    emit(EVT_VIDEO, { videoId: id, title: id ? titleFor(id, Store.get(id)).videoName : null });
}

// Reads the player only when it is showing this session's video (BUG-3).
function sample(s: Session) {
    const player = getPlayer();
    if (!isPlayerReadyFor(player, s.id)) return null;
    const time = Number(player.getCurrentTime());
    s.duration = Number(player.getDuration()) || s.duration;
    if (s.phase === "tracking" && Number.isFinite(time)) s.lastTime = time;
    return player;
}

function tick() {
    const id = urlVideoId();
    if (!session || session.id !== id) {
        if (session) { sample(session); maybeWrite(session, true); }
        startSession(id);
    }
    const s = session;
    if (!s) return;
    const player = sample(s);
    if (!player) return;
    if (s.phase === "waiting") {
        if (!s.ready) return;
        beginRestore(s, player);
    } else if (s.phase === "restoring") continueRestore(s, player, Date.now());
    if (s.phase === "tracking") {
        if (s.lastTime === null) sample(s);
        maybeWrite(s, false);
    }
}

function flush() {
    const s = session;
    if (!s || s.id !== urlVideoId()) { tick(); return; }
    sample(s);
    maybeWrite(s, true);
}

const safeTick = () => { try { tick(); } catch (err) { logger.error("tick failed", err); } };
const safeFlush = () => { try { flush(); } catch (err) { logger.error("flush failed", err); } };

function listen(target: EventTarget, name: string, handler: (event: Event) => void, capture = false) {
    target.addEventListener(name, handler, capture);
    cleanups.push(() => target.removeEventListener(name, handler, capture));
}

const fromPlayer = (event: Event) => Boolean((event.target as Element | null)?.closest?.("#movie_player"));

export const currentId = () => session?.id ?? null;
export const currentDuration = () => session?.duration ?? 0;
export const phase = () => session?.phase ?? null;

export default definePlugin({
    name: "Engine",
    title: () => t("Progress engine", "进度引擎"),
    description: () => t("Saves the playback position and resumes it when you come back.", "保存播放位置，回来时自动接着播放。"),
    authors: [Devs.V],
    required: true,

    start() {
        Store.cleanup();
        timer = setInterval(safeTick, TICK_MS);
        setTimeout(safeTick, 0);
        for (const name of ["pause", "seeked"]) listen(document, name, event => { if (fromPlayer(event)) safeFlush(); }, true);
        for (const name of ["loadedmetadata", "durationchange", "playing"]) listen(document, name, event => { if (fromPlayer(event)) safeTick(); }, true);
        listen(window, "yt-navigate-start", safeFlush, true);
        listen(window, "yt-navigate-finish", safeTick, true);
        listen(window, "popstate", safeTick);
        listen(document, "visibilitychange", () => (document.hidden ? safeFlush() : safeTick()));
        listen(window, "pagehide", safeFlush);
        listen(window, "beforeunload", safeFlush);
    },

    stop() {
        safeFlush();
        if (timer) clearInterval(timer);
        timer = null;
        for (const fn of cleanups.splice(0)) fn();
        session = null;
    },
});
