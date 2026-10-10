/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import type { RecordActionContext } from "@api/RecordActions";
import { Devs } from "@utils/constants";
import { h, iconButton } from "@utils/dom";
import { t } from "@utils/i18n";
import { errorMessage } from "@utils/misc";
import definePlugin from "@utils/types";

import { cached, fetchFor } from "./api";
import { TranscriptPane } from "./TranscriptPane";

const openState = new Set<string>();

// F-4.10
function TranscriptAction({ id }: RecordActionContext) {
    const status = h("span", { class: "ysrp-status" });
    const output = h("textarea", { class: "ysrp-textarea is-mono", readonly: "readonly", rows: "5", placeholder: t("Transcript will appear here…", "字幕内容加载后会显示在这里…") });
    let loading = false;

    const setStatus = (text: string, isError = false) => {
        status.textContent = text || "";
        status.classList.toggle("is-error", isError);
    };

    const refresh = iconButton("arrows-rotate", t("Refresh transcript", "刷新字幕"), () => load(true));
    const copy = iconButton("copy", t("Copy transcript", "复制字幕"), async () => {
        if (!output.value.trim()) return setStatus(t("No transcript content to copy.", "暂无字幕内容可复制。"));
        try {
            await navigator.clipboard.writeText(output.value.trim());
            setStatus(t("Transcript copied.", "字幕内容已复制。"));
        } catch (err) {
            setStatus(t("Copy failed: {message}", "复制失败：{message}", { message: errorMessage(err) }), true);
        }
    }, "is-link");
    const panel = h("div", { class: "ysrp-panel ysrp-transcript-container" },
        h("div", { class: "ysrp-panel-head" },
            h("div", { class: "ysrp-header-left" }, h("strong", { class: "ysrp-panel-label", text: t("Transcript", "字幕") }), status),
            h("div", { class: "ysrp-header-left" }, refresh, copy)),
        output);
    const button = iconButton("closed-captioning", t("Show transcript", "获取字幕"),
        () => setOpen(!panel.classList.contains("is-open")), "is-transcript");

    function setOpen(open: boolean) {
        panel.classList.toggle("is-open", open);
        button.title = open ? t("Hide transcript", "隐藏字幕") : t("Show transcript", "获取字幕");
        if (open) openState.add(id);
        else openState.delete(id);
        if (open && !output.value) load(false);
    }

    function load(force: boolean) {
        if (loading) return;
        if (!force) {
            const hit = cached(id);
            if (hit) {
                output.value = hit;
                copy.disabled = false;
                setStatus(t("Transcript loaded from cache.", "字幕来自缓存。"));
                return;
            }
        }
        loading = true;
        refresh.disabled = true;
        button.disabled = true;
        setStatus(t("Loading…", "正在获取…"));
        fetchFor(id, force)
            .then(text => {
                output.value = text;
                setStatus(t("Transcript updated ({time})", "字幕已更新（{time}）", { time: new Date().toLocaleTimeString() }));
            })
            .catch(err => setStatus(t("Transcript failed: {message}", "字幕获取失败：{message}", { message: errorMessage(err) }), true))
            .finally(() => {
                loading = false;
                refresh.disabled = false;
                button.disabled = false;
                copy.disabled = !output.value;
            });
    }

    if (openState.has(id)) setOpen(true);
    return { button, panel };
}

export default definePlugin({
    name: "Transcript",
    title: () => t("Transcript", "字幕"),
    description: () => t("Fetch a video's transcript from an OpenAI-compatible endpoint, from the records list.", "在记录列表里通过兼容 OpenAI 的接口获取视频字幕。"),
    authors: [Devs.V],
    enabledByDefault: true,

    settingsTab: {
        id: "transcript",
        order: 30,
        icon: "closed-captioning",
        label: () => t("Transcript", "字幕"),
        render: TranscriptPane,
    },

    recordAction: {
        id: "transcript",
        order: 10,
        create: TranscriptAction,
        onRemoved: id => openState.delete(id),
    },
});
