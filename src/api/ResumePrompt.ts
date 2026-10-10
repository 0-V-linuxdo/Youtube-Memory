/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { h, icon, shieldFromPlayer } from "@utils/dom";
import { t } from "@utils/i18n";
import { formatTime } from "@utils/misc";

export type ResumeChoice = "saved" | "link";

let node: HTMLElement | null = null;

export function close() {
    node?.remove();
    node = null;
}

// F-2.6
export function open(times: { saved: number; link: number; }, onChoose: (choice: ResumeChoice) => void) {
    close();
    const host = document.getElementById("movie_player");
    if (!host) { onChoose("link"); return; }
    const choose = (choice: ResumeChoice) => { close(); onChoose(choice); };
    const option = (choice: ResumeChoice, iconName: string, label: string, seconds: number) => {
        const button = h("button", { type: "button", class: `ysrp-btn ysrp-resume-${choice}`, dataset: { choice } },
            icon(iconName), h("span", { text: `${label} ${formatTime(seconds)}` }));
        shieldFromPlayer(button, () => choose(choice));
        button.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            choose(choice);
        });
        return button;
    };
    const saved = option("saved", "clock-rotate-left", t("Saved progress", "上次进度"), times.saved);
    const title = t("Where to continue?", "从哪里继续播放？");
    const dialog = h("div", { class: "ysrp-theme ysrp-resume", role: "dialog", "aria-modal": "false", "aria-label": title },
        h("div", { class: "ysrp-resume-title", text: title }),
        h("div", { class: "ysrp-resume-sub", text: t("This link starts at a different time than your saved progress.", "这个链接指定的时间与你上次的进度不同。") }),
        h("div", { class: "ysrp-row-actions" }, saved, option("link", "link", t("Link time", "链接时间"), times.link)));
    for (const type of ["click", "mousedown", "pointerdown", "touchstart", "dblclick"]) {
        dialog.addEventListener(type, event => event.stopPropagation());
    }
    dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.stopPropagation(); choose("link"); }
    });
    node = dialog;
    host.appendChild(dialog);
    saved.focus({ preventScroll: true });
}

export const isOpen = () => Boolean(node);
