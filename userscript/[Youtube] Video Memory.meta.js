// ==UserScript==
// @name         [Youtube] Video Memory [20261010] v2.1.0
// @namespace    0_V userscripts/Youtube Save & Resume Progress
// @description  Save & resume YouTube playback progress: per-video sessions that survive in-site navigation, ads, slow loads and multiple tabs. Records list with DeArrow titles, notes and transcripts; localStorage / GM storage with import & export; plugins for a badge toggle and Google Drive sync; Chinese / English UI.
// @version      [20261010] v2.1.0
// @update-log   [20261010] v2.1.0 · Rebuilt on a plugin architecture (after void++): TypeScript sources, a Plugins tab, the 💾 badge toggle built in, and Google Drive sync back as a plugin.
// @author       0_V
// @license      MIT
// @homepageURL  https://github.com/0-V-linuxdo/Youtube-Memory
// @supportURL   https://github.com/0-V-linuxdo/Youtube-Memory/issues
// @match        *://*.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      oauth2.googleapis.com
// @connect      www.googleapis.com
// @icon         https://github.com/0-V-linuxdo/Youtube-Memory/raw/refs/heads/main/main_icon/main_icon.svg
// ==/UserScript==
