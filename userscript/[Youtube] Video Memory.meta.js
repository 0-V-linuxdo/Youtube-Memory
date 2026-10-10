// ==UserScript==
// @name         [Youtube] Video Memory [20261010] v2.2.0
// @namespace    0_V userscripts/Youtube Save & Resume Progress
// @version      [20261010] v2.2.0
// @description  Save & resume YouTube playback progress reliably (waits for the player, skips ads, per-video sessions), timestamp-link choice dialog, records/storage/transcript settings, void++-style plugins, 💾 badge toggle and optional Google Drive sync.
// @update-log   [20261010] v2.2.0 · Clean-room rewrite: new progress engine (no lost progress), &t= choice dialog, void++-style plugin architecture and settings UI, 💾 badge toggle plugin, per-video Google Drive sync, page scrollbar kept while the dialog is open.
// @author       0_V
// @license      MIT
// @match        *://*.youtube.com/*
// @icon         https://github.com/0-V-linuxdo/Youtube-Memory/raw/refs/heads/main/main_icon/main_icon.svg
// @homepageURL  https://github.com/0-V-linuxdo/Youtube-Memory
// @supportURL   https://github.com/0-V-linuxdo/Youtube-Memory/issues
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      oauth2.googleapis.com
// @connect      www.googleapis.com
// ==/UserScript==
