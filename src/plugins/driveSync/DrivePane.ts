/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import type { Pane, PaneContext } from "@api/SettingsTabs";
import { EVT_DRIVE_STATUS } from "@utils/constants";
import { card, field, h, secretInput, setMessage, textButton } from "@utils/dom";
import { t } from "@utils/i18n";
import { errorMessage } from "@utils/misc";

import { FOLDER_NAME, hasCredentials, readCredentials, writeCredentials } from "./drive";
import { client, configured, fullSync, getStatus, type SyncStatus, uploadAll } from "./sync";

function statusText(s: SyncStatus) {
    if (!configured()) return t("Not configured: fill in the three fields below.", "未配置：请填写下面三项。");
    switch (s.state) {
        case "start":
        case "progress":
            return t("Syncing… {done} / {total}", "同步中… {done} / {total}", { done: s.done, total: s.total });
        case "done":
            return t("Synced at {time}", "已同步（{time}）", { time: new Date(s.at).toLocaleTimeString() });
        case "deferred":
            return t("Waiting a few seconds before the next upload…", "稍后继续上传…");
        case "error":
            return t("Sync failed: {message}", "同步出错：{message}", { message: s.message });
        default:
            return t("Ready. Changes upload automatically.", "已就绪，修改会自动上传。");
    }
}

// P-D.11
export function DrivePane(ctx: PaneContext): Pane {
    const creds = readCredentials();
    const clientId = h("input", { class: "ysrp-input", type: "text", placeholder: "xxxx.apps.googleusercontent.com", autocomplete: "off", spellcheck: "false" });
    const secret = secretInput("GOCSPX-…", () => t("Show", "显示"), () => t("Hide", "隐藏"), "--ysrp-accent");
    const token = secretInput("1//…", () => t("Show", "显示"), () => t("Hide", "隐藏"), "--ysrp-accent");
    clientId.value = creds.clientId;
    secret.input.value = creds.clientSecret;
    token.input.value = creds.refreshToken;

    const status = h("div", { class: "ysrp-msg ysrp-drive-status" });
    const result = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const renderStatus = () => {
        const s = getStatus();
        status.textContent = statusText(s);
        status.className = `ysrp-msg ysrp-drive-status${s.state === "error" ? " is-error" : s.state === "done" ? " is-ok" : ""}`;
    };

    const save = textButton("floppy-disk", t("Save & verify", "保存并验证"), async () => {
        const next = { clientId: clientId.value.trim(), clientSecret: secret.input.value.trim(), refreshToken: token.input.value.trim() };
        const wasConfigured = configured();
        writeCredentials(next);
        client.reset();
        renderStatus();
        if (!hasCredentials(next)) { setMessage(result, t("Saved. All three fields are needed to sync.", "已保存。三项都填写后才会同步。")); return; }
        save.disabled = true;
        setMessage(result, t("Checking…", "正在验证…"));
        try {
            await client.accessToken(true);
            setMessage(result, t("Connected to Google Drive.", "已连接 Google Drive。"), "ok");
            if (!wasConfigured) void fullSync();
        } catch (err) {
            setMessage(result, t("Could not connect: {message}", "连接失败：{message}", { message: errorMessage(err) }), "error");
        } finally {
            save.disabled = false;
        }
    });
    const upload = textButton("cloud-arrow-up", t("Upload all", "全部上传"), () => {
        if (!configured()) { setMessage(result, t("Fill in and save the credentials first.", "请先填写并保存凭据。"), "error"); return; }
        const count = uploadAll();
        setMessage(result, t("Uploading {count} record(s)…", "正在上传 {count} 条记录…", { count }));
    });
    upload.style.setProperty("--ysrp-btn-accent", "var(--ysrp-ok)");

    ctx.listen(document, EVT_DRIVE_STATUS, renderStatus);
    renderStatus();

    return {
        node: h("div", {},
            card("cloud", "--ysrp-accent", t("Google Drive sync", "Google Drive 同步"),
                t("Each video is saved as one JSON file in the “{folder}” folder of your Drive, and pulled back when you open the video on another device.",
                    "每个视频在你云端硬盘的“{folder}”文件夹里保存为一个 JSON 文件；在另一台设备打开该视频时会先拉取云端进度。", { folder: FOLDER_NAME }),
                status,
                field(t("OAuth client ID", "OAuth 客户端 ID"), clientId),
                field(t("Client secret", "客户端密钥"), secret.node),
                field(t("Refresh token", "Refresh token"), token.node),
                h("div", { class: "ysrp-row-actions" }, save, upload),
                result),
            card("circle-info", "--ysrp-fg", t("Getting credentials", "如何获取凭据"),
                t("Create an OAuth client in Google Cloud Console, enable the Drive API, then use the OAuth Playground with your own client and the Drive scope to get a refresh token.",
                    "在 Google Cloud Console 创建 OAuth 客户端并启用 Drive API，然后在 OAuth Playground 里用你自己的客户端和 Drive 权限换取 refresh token。"))),
        refresh: renderStatus,
    };
}
