/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

export const RECORD_PREFIX = "Youtube_SaveResume_Progress-";
export const KEY_STORAGE_MODE = "YSRP_StorageMode";
export const KEY_TRANSCRIPT = "YSRP_TranscriptSettings";
export const KEY_LANGUAGE = "YSRP_LanguagePreference";
export const KEY_PLUGINS = "YSRP_Plugins";
export const KEY_DRIVE = "YSRP_DriveSettings";
export const KEY_DRIVE_FULL_SYNC = "YSRP_DriveFullSyncDone";

export const UNKNOWN_TITLE = "Unknown Title";
export const PLACEHOLDER_TITLES = new Set(["unknown title", "正在获取标题…"]);

export const EVT_RECORD = "ysrp-record-updated";
export const EVT_VIDEO = "ysrp-current-video-status";
export const EVT_TITLE = "ysrp-dearrow-title-ready";
export const EVT_LANG = "ysrp-language-changed";
export const EVT_DRIVE_STATUS = "ysrp-drive-sync-status";

export const TICK_MS = 500;
export const SAVE_THROTTLE_MS = 1500;
export const MIN_SAVE_DELTA = 0.5;
export const MIN_RESTORE_POSITION = 1;
export const END_GUARD_SECONDS = 5;
export const RESTORE_TOLERANCE = 3;
export const RESTORE_MAX_ATTEMPTS = 8;
export const RESTORE_TIMEOUT_MS = 15000;
export const RESTORE_RETRY_MS = 1200;
export const RESUMED_NOTICE_MS = 3000;
export const BEFORE_RESTORE_TIMEOUT_MS = 4000;

export const FONT_AWESOME_CSS = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
export const DEARROW_API = "https://sponsor.ajay.app/api/branding?videoID=";
export const OEMBED_API = "https://www.youtube.com/oembed?format=json&url=";
export const DEARROW_TTL_MS = 6 * 60 * 60 * 1000;

export const Devs = {
    V: "0_V",
};
