/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import * as Modal from "@api/Modal";
import { getRecordActions, onRecordActionsChange, type RecordActionInstance } from "@api/RecordActions";
import type { Pane, PaneContext } from "@api/SettingsTabs";
import * as Store from "@api/Store";
import * as Titles from "@api/Titles";
import { currentDuration, currentId } from "@plugins/_core/engine";
import { EVT_RECORD, EVT_TITLE, EVT_VIDEO } from "@utils/constants";
import { deArrowIcon, h, iconButton, setIcon } from "@utils/dom";
import { t } from "@utils/i18n";
import { Logger } from "@utils/Logger";
import { formatTime, isPlaceholderTitle, normTitle, sameTitle } from "@utils/misc";

const logger = new Logger("Records");

interface Row {
    node: HTMLElement;
    update(rec: Store.VideoRecord, current: boolean): void;
    setDeArrow(title: string | null): void;
}

export function RecordsPane(ctx: PaneContext): Pane {
    const list = h("ul", { class: "ysrp-list" });
    const empty = h("div", { class: "ysrp-empty", text: t("No saved videos yet.", "还没有保存的视频。") });
    const node = h("div", {}, empty, list);
    const rows = new Map<string, Row>();
    let renderedKey: string | null = null;

    function render() {
        ctx.spin(true);
        try {
            const current = currentId();
            const items = Store.list().sort((a, b) =>
                (Number(b.id === current) - Number(a.id === current)) || ((Number(b.rec.saveDate) || 0) - (Number(a.rec.saveDate) || 0)));
            ctx.setCount(items.length);
            empty.style.display = items.length ? "none" : "";
            const key = `${current}|${items.map(item => item.id).join(",")}`;
            if (key !== renderedKey) {
                renderedKey = key;
                const next = new Map<string, Row>();
                list.replaceChildren(...items.map(({ id, rec }) => {
                    const row = rows.get(id) || RecordRow(id, rec, () => remove(id));
                    next.set(id, row);
                    return row.node;
                }));
                rows.clear();
                next.forEach((row, id) => rows.set(id, row));
            }
            for (const { id, rec } of items) rows.get(id)?.update(rec, id === current);
        } finally {
            ctx.spin(false);
        }
    }

    function remove(id: string) {
        Store.remove(id);
        for (const action of getRecordActions()) action.onRemoved?.(id);
        render();
    }

    ctx.listen(document, EVT_RECORD, () => { if (Modal.isOpen()) render(); });
    ctx.listen(document, EVT_VIDEO, () => { if (Modal.isOpen()) render(); });
    ctx.listen(document, EVT_TITLE, event => {
        const detail = (event as CustomEvent<{ videoId: string; title: string; }>).detail;
        if (detail && rows.has(detail.videoId)) rows.get(detail.videoId)?.setDeArrow(detail.title);
    });
    const offActions = onRecordActionsChange(() => {
        rows.clear();
        renderedKey = null;
        if (Modal.isOpen()) render();
    });

    return { node, refresh: render, destroy: offActions };
}

function RecordRow(id: string, initialRecord: Store.VideoRecord, onDelete: () => void): Row {
    const url = `https://www.youtube.com/watch?v=${id}`;
    let rec = initialRecord;
    let isCurrent = false;

    /* title / DeArrow (F-4.9) */
    let original: string | null = normTitle(rec.originalTitle) || Titles.knownOriginal(id) || null;
    let dearrow: string | null | undefined;
    let showOriginal = false;
    const titleEl = h("span", { class: "ysrp-title" });
    const pctEl = h("span", { class: "ysrp-pct" });
    const daButton = h("button", { type: "button", class: "ysrp-ibtn ysrp-da" }, deArrowIcon());
    daButton.addEventListener("click", () => {
        if (typeof dearrow !== "string") return;
        showOriginal = !showOriginal;
        if (showOriginal && !original) {
            titleEl.textContent = t("Loading original title…", "正在获取原标题…");
            Titles.getOriginal(id).then(value => { original = value || original; renderTitle(); });
            return;
        }
        renderTitle();
    });

    const storedName = () => (isPlaceholderTitle(rec.videoName) ? null : normTitle(rec.videoName));

    function renderTitle() {
        const missing = t("Original title unavailable", "未找到原标题");
        if (dearrow === null) {
            daButton.remove();
            titleEl.textContent = original || storedName() || missing;
            return;
        }
        if (dearrow === undefined) {
            daButton.disabled = true;
            daButton.classList.add("is-pending");
            daButton.title = t("Checking DeArrow title…", "正在检测 DeArrow 标题…");
            titleEl.textContent = original || storedName() || t("Loading original title…", "正在获取原标题…");
            return;
        }
        daButton.disabled = false;
        daButton.classList.remove("is-pending");
        daButton.classList.toggle("is-off", showOriginal);
        daButton.title = showOriginal ? t("Show DeArrow title", "恢复 DeArrow 标题") : t("Show original title", "显示原标题");
        daButton.setAttribute("aria-label", daButton.title);
        titleEl.textContent = showOriginal ? original || missing : dearrow;
    }

    function setDeArrow(value: string | null) {
        const title = normTitle(value);
        if (title && !sameTitle(title, original)) {
            dearrow = title;
            if (rec.videoName !== title) Store.updateIfExists(id, r => Object.assign(r, { videoName: title }));
        } else {
            dearrow = null;
            if (isPlaceholderTitle(rec.videoName) && original) Store.updateIfExists(id, r => Object.assign(r, { videoName: original }));
        }
        renderTitle();
    }

    function resolveTitles() {
        const cached = Titles.knownDeArrow(id);
        if (cached !== undefined) setDeArrow(cached);
        else if (original && storedName() && !sameTitle(storedName(), original)) { dearrow = storedName(); renderTitle(); }
        const originalReady = original ? Promise.resolve(original) : Titles.getOriginal(id);
        originalReady.then(value => {
            if (value && !original) { original = value; renderTitle(); }
            if (Titles.knownDeArrow(id) !== undefined || typeof dearrow === "string") return;
            return Titles.getDeArrow(id).then(setDeArrow);
        });
    }

    /* link panel (F-4.12) */
    const copiedTip = h("span", { class: "ysrp-status", text: t("Copied", "已复制"), style: { display: "none", flex: "0 0 auto" } });
    const copyBtn = iconButton("copy", t("Copy URL", "复制 URL"), async () => {
        try {
            await navigator.clipboard.writeText(url);
            copyBtn.classList.add("is-copied");
            setIcon(copyBtn, "check");
            copiedTip.style.display = "";
            setTimeout(() => { copyBtn.classList.remove("is-copied"); setIcon(copyBtn, "copy"); }, 1000);
            setTimeout(() => { copiedTip.style.display = "none"; }, 2000);
        } catch (err) {
            logger.error("copy failed", err);
        }
    }, "is-link");
    // The panel and the URL row are separate elements: .ysrp-url's display must not override the collapsed panel.
    const linkPanel = h("div", { class: "ysrp-panel ysrp-link-container" },
        h("div", { class: "ysrp-url" },
            h("span", { text: t("URL: {url}", "链接：{url}", { url }) }), copiedTip, copyBtn,
            iconButton("arrow-up-right-from-square", t("Open in new tab", "在新标签页中打开 URL"), () => window.open(url, "_blank"), "is-note")));

    /* notes (F-4.11) */
    let editing = false;
    let noteTextarea: HTMLTextAreaElement | null = null;
    const noteText = h("div", { class: "ysrp-note-text" });
    const noteEditButton = iconButton("pencil", t("Edit note", "编辑笔记"), () => (editing ? commitNote() : startNote()), "is-link");
    const notePanel = h("div", { class: "ysrp-panel ysrp-note-container" },
        h("div", { class: "ysrp-panel-head" }, h("strong", { class: "ysrp-panel-label", text: t("Notes", "笔记") }), noteEditButton),
        noteText);

    const noteValue = () => (typeof rec.videoNote === "string" ? rec.videoNote : "");

    function renderNote() {
        const value = noteValue();
        noteText.textContent = value || t("No notes yet", "暂无笔记");
        noteText.classList.toggle("is-empty", !value);
        const noteOpen = notePanel.classList.contains("is-open");
        noteButton.title = editing ? t("Save & collapse note", "保存并折叠笔记")
            : value ? (noteOpen ? t("Hide notes", "隐藏笔记") : t("Show notes", "显示笔记")) : t("Add note", "添加笔记");
        noteEditButton.title = editing ? t("Save note", "保存笔记") : t("Edit note", "编辑笔记");
        setIcon(noteEditButton, editing ? "floppy-disk" : "pencil");
    }

    function setNoteOpen(open: boolean) {
        notePanel.classList.toggle("is-open", open);
        renderNote();
    }

    function startNote() {
        if (editing) return;
        editing = true;
        const textarea = h("textarea", { class: "ysrp-textarea", rows: "3" });
        textarea.value = noteValue();
        noteTextarea = textarea;
        noteText.replaceWith(textarea);
        setNoteOpen(true);
        requestAnimationFrame(() => {
            try { textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length); } catch {}
        });
    }

    function commitNote() {
        if (!editing || !noteTextarea) return;
        const value = noteTextarea.value.trim();
        editing = false;
        noteTextarea.replaceWith(noteText);
        noteTextarea = null;
        try {
            rec = Store.update(id, r => {
                if (value) r.videoNote = value;
                else delete r.videoNote;
                return r;
            });
        } catch (err) {
            logger.error("Failed to save note", err);
        }
        renderNote();
    }

    /* plugin actions (P-1), then the built-in buttons */
    const actions: RecordActionInstance[] = getRecordActions().map(action => action.create({ id, url, record: () => rec }));
    const noteButton = iconButton("pen-to-square", t("Show notes", "显示笔记"), () => {
        if (editing) { commitNote(); setNoteOpen(false); return; }
        if (!noteValue()) { startNote(); return; }
        setNoteOpen(!notePanel.classList.contains("is-open"));
    }, "is-note");
    const linkButton = iconButton("link", t("Show / hide URL", "显示/隐藏 URL"), () => linkPanel.classList.toggle("is-open"), "is-link");
    const deleteButton = iconButton("trash-can", t("Delete record", "删除保存记录"), () => onDelete(), "is-delete");

    const node = h("li", { class: "ysrp-row", dataset: { videoId: id } },
        h("div", { class: "ysrp-row-top" }, pctEl, titleEl, daButton, actions.map(a => a.button), noteButton, linkButton, deleteButton),
        linkPanel, actions.map(a => a.panel), notePanel);

    function renderPercent() {
        const progress = Number(rec.videoProgress) || 0;
        const duration = Number(rec.videoDuration) || (isCurrent ? currentDuration() : 0);
        // Records from older versions have no duration: show the saved position instead of a percentage.
        pctEl.textContent = duration > 0 ? `${Math.min(100, (progress / duration) * 100).toFixed(1)}%` : formatTime(progress);
        pctEl.title = duration > 0 ? `${formatTime(progress)} / ${formatTime(duration)}` : t("Saved position", "保存的位置");
    }

    function update(nextRecord: Store.VideoRecord, current: boolean) {
        rec = nextRecord;
        isCurrent = Boolean(current);
        node.classList.toggle("is-current", isCurrent);
        if (!original && normTitle(rec.originalTitle)) original = normTitle(rec.originalTitle);
        renderPercent();
        renderTitle();
        if (!editing) renderNote();
        for (const action of actions) action.update?.(rec);
    }

    renderTitle();
    renderNote();
    resolveTitles();

    return { node, update, setDeArrow };
}
