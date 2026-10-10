/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import type { Pane, PaneContext } from "@api/SettingsTabs";
import * as Store from "@api/Store";
import * as Titles from "@api/Titles";
import { currentId } from "@plugins/_core/engine";
import { EVT_VIDEO, UNKNOWN_TITLE } from "@utils/constants";
import { card, field, h, secretInput } from "@utils/dom";
import { t } from "@utils/i18n";
import { isPlaceholderTitle } from "@utils/misc";

import { getSettings, MAX_MINUTES, MIN_MINUTES, saveSettings } from "./api";

// F-4.18 – F-4.23
export function TranscriptPane(ctx: PaneContext): Pane {
    const settings = getSettings();
    const endpoint = h("input", { class: "ysrp-input", type: "text", placeholder: "https://example.com/v1/chat/completions", autocomplete: "off", spellcheck: "false" });
    const model = h("input", { class: "ysrp-input", type: "text", placeholder: "transcript", autocomplete: "off", spellcheck: "false" });
    const apiKey = secretInput("sk-***", () => t("Show", "显示"), () => t("Hide", "隐藏"), "--ysrp-transcript");
    const timeout = h("input", { class: "ysrp-input", type: "number", min: String(MIN_MINUTES), max: String(MAX_MINUTES), step: "1", placeholder: "10" });
    endpoint.value = settings.endpoint;
    model.value = settings.model;
    apiKey.input.value = settings.apiKey;
    timeout.value = String(Math.round(settings.timeoutMs / 60000));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const persist = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const minutes = parseFloat(timeout.value);
            saveSettings({
                endpoint: endpoint.value,
                model: model.value,
                apiKey: apiKey.input.value,
                timeoutMs: Number.isFinite(minutes) && minutes > 0 ? minutes * 60000 : undefined,
            });
        }, 250);
    };
    for (const input of [endpoint, model, apiKey.input, timeout]) {
        input.addEventListener("input", persist);
        input.addEventListener("change", persist);
    }

    const videoTitle = h("span");
    const videoId = h("span", { class: "ysrp-mono" });
    const videoIdRow = h("div", { class: "ysrp-info-row" }, h("b", { text: t("Video ID", "视频 ID") }), videoId);

    function updateVideo() {
        const id = currentId();
        if (!id) {
            videoTitle.textContent = t("No active video detected", "未检测到可用的影片");
            videoIdRow.style.display = "none";
            return;
        }
        const rec = Store.get(id);
        videoTitle.textContent = Titles.knownDeArrow(id) || Titles.knownOriginal(id) || (rec && !isPlaceholderTitle(rec.videoName) ? rec.videoName : "") || UNKNOWN_TITLE;
        videoId.textContent = id;
        videoIdRow.style.display = "";
    }
    updateVideo();
    ctx.listen(document, EVT_VIDEO, updateVideo);

    return {
        node: h("div", {},
            card("closed-captioning", "--ysrp-transcript", t("Subtitles · Transcript", "字幕与接口设置"),
                t("Configure the OpenAI-compatible endpoint used for subtitles. Fetching lives in the Records tab.", "配置字幕接口（兼容 OpenAI）。字幕获取功能位于“记录”标签。"),
                field(t("API Endpoint", "API 接口路径"), endpoint),
                field(t("Model", "模型名称"), model),
                field(t("API Key", "API 密钥"), apiKey.node),
                field(t("Timeout (minutes)", "超时时长（分钟）"), timeout)),
            card("pen-to-square", "--ysrp-fg", t("Status & Tips", "状态与提示"),
                t("These settings apply instantly. Use the Records tab to fetch transcripts for specific videos.", "设置立即生效，具体字幕获取请在“记录”标签中触发。"),
                h("div", { class: "ysrp-info" },
                    h("div", { class: "ysrp-info-row" }, h("b", { text: t("Active video", "当前视频") }), videoTitle),
                    videoIdRow))),
        refresh: updateVideo,
    };
}
