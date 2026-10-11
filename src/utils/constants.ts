// Storage keys, event names, DOM contracts and URLs (all external contracts, see spec C-14..C-21, N-1).

export const VERSION: string = typeof __VERSION__ === 'string' ? __VERSION__ : 'dev';
/** Short git hash of the build (N-5.3.5); "dev" when git was not available. */
export const COMMIT: string = typeof __COMMIT__ === 'string' && __COMMIT__ ? __COMMIT__ : 'dev';
export const IS_DEV_BUILD: boolean = typeof __BUILD_MODE__ === 'string' && __BUILD_MODE__ === 'development';
export const VERSION_SHORT: string = (VERSION.match(/v[\d.]+/) || [VERSION])[0];

export const RECORD_PREFIX = 'Youtube_SaveResume_Progress-';
export const KEY_STORAGE_MODE = 'YSRP_StorageMode';
export const KEY_TRANSCRIPT = 'YSRP_TranscriptSettings';
export const KEY_LANGUAGE = 'YSRP_LanguagePreference';
export const KEY_PLUGINS = 'YSRP_Plugins';
export const KEY_DRIVE = 'YSRP_DriveSettings';
export const KEY_DRIVE_FULL_SYNC = 'YSRP_DriveFullSyncDone';

export const UNKNOWN_TITLE = 'Unknown Title';
/** Legacy loading placeholder (C-19). Never stored by this version, but recognised in old records. */
export const LEGACY_LOADING_TITLE = '正在获取标题…';

export const EVT_LANGUAGE = 'ysrp-language-changed';
export const EVT_VIDEO_STATUS = 'ysrp-current-video-status';
export const EVT_DEARROW_READY = 'ysrp-dearrow-title-ready';
export const EVT_RECORD_UPDATED = 'ysrp-record-updated';
export const EVT_DRIVE_STATUS = 'ysrp-drive-sync-status';

export const CLS_BADGE_CONTAINER = 'last-save-info-container';
export const CLS_BADGE_INNER = 'last-save-info';
export const CLS_BADGE_TEXT = 'last-save-info-text';
export const CLS_SETTINGS_BUTTON = 'ysrp-settings-button';
export const CLS_MODAL = 'ysrp-settings-container';
export const CLS_MODAL_BODY = 'ysrp-settings-container-body';
export const CLS_BACKDROP = 'ysrp-backdrop';

export const FONT_AWESOME_URL = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
export const HOMEPAGE_URL = 'https://github.com/0-V-linuxdo/Youtube-Memory';

export const OEMBED_URL = 'https://www.youtube.com/oembed?format=json&url=';
export const DEARROW_URL = 'https://sponsor.ajay.app/api/branding?videoID=';

export const watchUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`;
