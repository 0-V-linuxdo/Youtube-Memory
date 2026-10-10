/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

export interface YouTubePlayer extends HTMLElement {
    getCurrentTime(): number;
    getDuration(): number;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getVideoData?(): { video_id?: string; title?: string; isLive?: boolean } | null;
    getPlayerState?(): number;
    pauseVideo?(): void;
    playVideo?(): void;
}

export function getPlayer(): YouTubePlayer | null {
    const player = document.querySelector("#movie_player") as Partial<YouTubePlayer> | null;
    return player && typeof player.getCurrentTime === "function" && typeof player.getDuration === "function"
        && typeof player.seekTo === "function" ? player as YouTubePlayer : null;
}

export function urlVideoId() {
    if (!/^\/watch\/?$/.test(location.pathname)) return null;
    const id = new URLSearchParams(location.search).get("v");
    return id && /^[\w-]+$/.test(id) ? id : null;
}

export function urlHasStartTime() {
    const params = new URLSearchParams(location.search);
    if (params.has("t") || params.has("start")) return true;
    return /(?:^|[#&])t=/.test(location.hash.replace(/^#/, "&"));
}

export function urlStartTime() {
    const params = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const raw = params.get("t") || params.get("start") || hash.get("t");
    if (!raw) return null;
    if (/^\d+(?:\.\d+)?s?$/.test(raw)) return parseFloat(raw);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
    return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : null;
}

export function playerVideoData(player: YouTubePlayer) {
    try {
        const data = player.getVideoData?.();
        return data && typeof data === "object" ? data : {};
    } catch {
        return {};
    }
}

export function isAdShowing(player: YouTubePlayer) {
    return player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
}

export function isPlayerReadyFor(player: YouTubePlayer | null, id: string | null): player is YouTubePlayer {
    if (!player || !id) return false;
    const loadedId = playerVideoData(player).video_id;
    if (loadedId && loadedId !== id) return false;
    let duration = 0;
    try { duration = Number(player.getDuration()) || 0; } catch {}
    return duration > 0 && !isAdShowing(player);
}
