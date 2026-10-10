/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import type { Pane, PaneContext } from "@api/SettingsTabs";
import * as Store from "@api/Store";
import { EVT_RECORD } from "@utils/constants";
import { card, ChoiceGroup, h, icon, setMessage, textButton } from "@utils/dom";
import { t } from "@utils/i18n";
import { emit, errorMessage, runtime } from "@utils/misc";
import { hasGM } from "@utils/storage";

export function StoragePane(ctx: PaneContext): Pane {
    const modeMsg = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const modeChoice = ChoiceGroup("ysrp-storage-mode", "--ysrp-storage", [
        { value: "local", badge: t("LOCAL", "本地"), label: t("localStorage (default)", "localStorage（默认）"), hint: t("Fast storage scoped to this browser profile.", "快速、本地浏览器可用的存储。") },
        { value: "gm", badge: "GM", label: t("GM storage", "GM 存储"), hint: hasGM ? t("Userscript-manager storage that can sync across profiles.", "由脚本管理器提供、可在配置间同步的存储。") : t("Not available in this userscript manager.", "当前脚本管理器不支持。"), disabled: !hasGM },
    ], Store.getMode());

    const applyButton = textButton("right-left", t("Apply & Migrate", "应用并迁移"), () => {
        const target = modeChoice.value() as Store.StorageMode | undefined;
        if (!target || target === Store.getMode()) { setMessage(modeMsg, t("Already using this backend.", "当前已在使用该存储。")); return; }
        try {
            const moved = Store.setMode(target);
            ctx.renderModeBadge();
            setMessage(modeMsg, t("Moved {count} record(s).", "已迁移 {count} 条记录。", { count: moved }), "ok");
            emit(EVT_RECORD, { videoId: null });
        } catch (err) {
            modeChoice.select(Store.getMode());
            setMessage(modeMsg, t("Migration failed: {message}", "迁移失败：{message}", { message: errorMessage(err) }), "error");
        }
    });
    applyButton.style.setProperty("--ysrp-btn-accent", "var(--ysrp-storage)");
    applyButton.style.flex = "0 0 auto";

    const storageCard = card("database", "--ysrp-storage", t("Storage Backend", "存储后端"), t("Choose where to store your progress data.", "选择保存进度的存储方式。"),
        modeChoice.node,
        h("div", { class: "ysrp-row-actions" }, applyButton,
            h("span", { class: "ysrp-msg", text: t("Migrates all saved records to the selected backend (moves data).", "将所有记录迁移至所选存储后端（移动数据）。") })),
        modeMsg);

    /* export (F-4.16) */
    const exportMsg = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const exportJson = () => JSON.stringify(Store.exportAll(), null, 2);
    const exportFileName = () => {
        const now = new Date();
        const p = (n: number) => String(n).padStart(2, "0");
        return `[Youtube] Video Memory「${now.getFullYear()} ${p(now.getMonth() + 1)} ${p(now.getDate())}」「${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}」.json`;
    };
    const copyExport = textButton("copy", t("Copy JSON", "复制 JSON"), async () => {
        try {
            await navigator.clipboard.writeText(exportJson());
            setMessage(exportMsg, t("JSON copied to clipboard.", "JSON 已复制到剪贴板。"), "ok");
        } catch (err) {
            setMessage(exportMsg, t("Copy export failed: {message}", "复制导出失败：{message}", { message: errorMessage(err) }), "error");
        }
    });
    const downloadExport = textButton("file-arrow-down", t("Download JSON", "下载 JSON"), async () => {
        try {
            const json = exportJson();
            const fileName = exportFileName();
            if (runtime.isIOS) {
                if (runtime.canShareFile) {
                    try {
                        await navigator.share({
                            files: [new File([json], fileName, { type: "application/json" })],
                            title: t("Video Memory Export", "视频记忆导出"),
                            text: t("Choose “Save to Files” to store your backup.", "请选择“存储到文件”以保存备份。"),
                        });
                        setMessage(exportMsg, t("Share sheet opened. Choose “Save to Files”.", "已打开系统分享面板，请选择“存储到文件”。"), "ok");
                        return;
                    } catch (err) {
                        const name = (err as { name?: string; } | null)?.name;
                        if (name === "AbortError" || name === "NotAllowedError") {
                            setMessage(exportMsg, t("Share cancelled.", "已取消分享。"));
                            return;
                        }
                    }
                } else if (window.open(`data:application/json;charset=utf-8,${encodeURIComponent(json)}`, "_blank", "noopener")) {
                    setMessage(exportMsg, t("Export opened in a new tab. Use the share menu to save it.", "已在新标签页打开导出，请通过分享菜单保存。"), "ok");
                    return;
                }
            }
            const blobUrl = URL.createObjectURL(new Blob([json], { type: "application/json" }));
            const anchor = h("a", { href: blobUrl, download: fileName, style: { display: "none" } });
            document.body.appendChild(anchor);
            anchor.click();
            setTimeout(() => { anchor.remove(); URL.revokeObjectURL(blobUrl); }, 1000);
            setMessage(exportMsg, t("Export download started.", "导出下载已开始。"), "ok");
        } catch (err) {
            setMessage(exportMsg, t("Download failed: {message}", "下载失败：{message}", { message: errorMessage(err) }), "error");
        }
    });
    for (const btn of [copyExport, downloadExport]) btn.style.setProperty("--ysrp-btn-accent", "var(--ysrp-ok)");
    const exportCard = card("file-arrow-down", "--ysrp-ok", t("Export Data", "导出数据"), t("Back up your saved progress as JSON.", "将保存的进度备份为 JSON。"),
        h("div", { class: "ysrp-row-actions" }, copyExport, downloadExport),
        h("div", { class: "ysrp-msg", text: t("Exports all saved records from the currently selected backend.", "导出当前存储后端中的所有记录。") }),
        exportMsg);

    /* import (F-4.17) */
    const importMsg = h("div", { class: "ysrp-msg", style: { display: "none" } });
    const overwrite = h("input", { type: "checkbox", class: "ysrp-overwrite" });
    const importText = h("textarea", { class: "ysrp-textarea", rows: "3", placeholder: t("Paste exported JSON here...", "在此粘贴导出的 JSON...") });
    function doImport(text: string) {
        try {
            const count = Store.importPayload(JSON.parse(text), { overwrite: overwrite.checked });
            setMessage(importMsg, t("Imported {count} record(s).", "已导入 {count} 条记录。", { count }), "ok");
            emit(EVT_RECORD, { videoId: null });
        } catch (err) {
            setMessage(importMsg, t("Import failed: {message}", "导入失败：{message}", { message: errorMessage(err) }), "error");
        }
    }
    const importButton = textButton("file-arrow-up", t("Import from Text", "从文本导入"), () => {
        const text = importText.value.trim();
        if (!text) { setMessage(importMsg, t("Nothing to import.", "没有可导入的内容。")); return; }
        doImport(text);
    });
    const noFile = t("No file chosen", "未选择文件");
    const fileName = h("span", { class: "ysrp-file-name", text: noFile });
    const fileInput = h("input", { type: "file", accept: "application/json,.json" });
    const fileLabel = h("label", { class: `ysrp-file${runtime.isIOS ? " is-ios" : ""}`, tabindex: "0", title: t("Select an export JSON file", "选择要导入的 JSON 文件") },
        icon("file-arrow-up"), h("strong", { text: t("Choose File", "选择文件") }), fileName, fileInput);
    if (!runtime.isIOS) {
        const openPicker = (event: Event) => {
            event.preventDefault();
            try {
                if (typeof fileInput.showPicker === "function") { fileInput.showPicker(); return; }
            } catch {}
            fileInput.click();
        };
        fileLabel.addEventListener("click", openPicker);
        fileLabel.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") openPicker(event); });
    }
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileName.textContent = file.name;
        const reader = new FileReader();
        reader.onload = () => {
            importText.value = String(reader.result || "");
            doImport(importText.value);
            fileInput.value = "";
            fileName.textContent = noFile;
        };
        reader.readAsText(file);
    });
    const importCard = card("file-arrow-up", "--ysrp-accent", t("Import Data", "导入数据"), t("Restore a previous export to merge or replace your saved records.", "导入之前的导出文件，用于合并或替换记录。"),
        h("label", { class: "ysrp-check" }, overwrite, h("strong", { text: t("Overwrite", "覆盖") }),
            h("span", { class: "ysrp-msg", text: t("Clears the current backend before importing; otherwise records are merged.", "勾选后导入前先清空当前存储后端，否则合并。") })),
        importText,
        h("div", { class: "ysrp-row-actions" }, importButton, fileLabel),
        importMsg);

    return { node: h("div", {}, storageCard, exportCard, importCard) };
}
