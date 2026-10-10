/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

type Child = Node | string | null | undefined | false | Child[];
type Props = Record<string, unknown> & {
    class?: string;
    style?: Partial<CSSStyleDeclaration> | Record<string, string>;
    text?: string;
    dataset?: Record<string, string>;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (props) {
        for (const [key, value] of Object.entries(props)) {
            if (value === null || value === undefined || value === false) continue;
            if (key === "class") node.className = String(value);
            else if (key === "style") Object.assign(node.style, value);
            else if (key === "text") node.textContent = String(value);
            else if (key === "dataset") Object.assign(node.dataset, value);
            else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value as EventListener);
            else if (typeof value === "boolean") (node as unknown as Record<string, unknown>)[key] = value;
            else node.setAttribute(key, String(value));
        }
    }
    for (const child of (children as unknown[]).flat(Infinity) as (Node | string | null | undefined | false)[]) {
        if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
}

export const icon = (name: string) => h("i", { class: `fa-solid fa-${name} ysrp-icon`, "aria-hidden": "true" });

export function setIcon(button: HTMLElement, name: string) {
    const el = button.firstElementChild;
    if (el) el.className = `fa-solid fa-${name} ysrp-icon`;
}

export function iconButton(name: string, title: string, onClick: (event: MouseEvent) => void, extraClass = "") {
    return h("button", { type: "button", class: `ysrp-ibtn ${extraClass}`, title, "aria-label": title, onclick: onClick }, icon(name));
}

export function textButton(name: string, label: string, onClick: (event: MouseEvent) => void, extraClass = "") {
    return h("button", { type: "button", class: `ysrp-btn ${extraClass}`, title: label, onclick: onClick }, icon(name), h("span", { text: label }));
}

export function deArrowIcon() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 36 36");
    svg.setAttribute("width", "22");
    svg.setAttribute("height", "22");
    svg.setAttribute("aria-hidden", "true");
    for (const [r, fill] of [[18, "#1213BD"], [13, "#88C9F9"], [6, "#0A62A5"]] as const) {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", "18");
        circle.setAttribute("cy", "18");
        circle.setAttribute("r", String(r));
        circle.setAttribute("fill", fill);
        svg.appendChild(circle);
    }
    return svg;
}

// F-3.4: pointer, click and touch on our controls must not reach the player.
export function shieldFromPlayer(button: HTMLElement, onActivate: () => void) {
    const swallow = (event: Event) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); };
    button.addEventListener("pointerdown", event => { swallow(event); onActivate(); }, { capture: true });
    button.addEventListener("mousedown", swallow, { capture: true });
    button.addEventListener("click", swallow, { capture: true });
    button.addEventListener("touchstart", swallow, { capture: true, passive: false });
}

export function setMessage(el: HTMLElement, text: string, kind?: "ok" | "error") {
    el.textContent = text || "";
    el.className = `ysrp-msg${kind ? ` is-${kind}` : ""}`;
    el.style.display = text ? "" : "none";
}

// Cards are monochrome like void++; the accent argument is kept so callers stay unchanged.
export function card(iconName: string, _accentVar: string, titleText: string, subtitle: string | null, ...children: Child[]) {
    return h("div", { class: "ysrp-card" },
        h("div", { class: "ysrp-card-title" }, h("span", { class: "ysrp-card-icon" }, icon(iconName)), h("span", { text: titleText })),
        subtitle ? h("div", { class: "ysrp-card-sub", text: subtitle }) : null,
        ...children);
}

export function field(label: string, control: Node) {
    return h("label", { class: "ysrp-field" }, h("span", { text: label }), control);
}

export interface ChoiceOption {
    value: string;
    badge: string;
    label: string;
    hint?: string;
    disabled?: boolean;
}

export function ChoiceGroup(name: string, accentVar: string, options: ChoiceOption[], selected: string, onPick?: (value: string) => void) {
    const items = new Map<string, { row: HTMLLabelElement; input: HTMLInputElement; }>();
    const node = h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } });
    for (const option of options) {
        const input = h("input", { type: "radio", name, value: option.value });
        const row = h("label", { class: `ysrp-choice${option.disabled ? " is-disabled" : ""}`, dataset: { value: option.value } },
            input,
            h("span", { class: "ysrp-choice-badge", text: option.badge }),
            h("span", { class: "ysrp-choice-text" },
                h("span", { class: "ysrp-choice-label", text: option.label }),
                option.hint ? h("span", { class: "ysrp-choice-hint", text: option.hint }) : null));
        row.style.setProperty("--ysrp-choice-accent", `var(${accentVar})`);
        row.addEventListener("click", event => {
            event.preventDefault();
            if (option.disabled) return;
            select(option.value);
            onPick?.(option.value);
        });
        items.set(option.value, { row, input });
        node.appendChild(row);
    }
    function select(value: string) {
        for (const [key, item] of items) {
            item.input.checked = key === value;
            item.row.classList.toggle("is-selected", key === value);
        }
    }
    select(selected);
    return { node, select, value: () => [...items].find(([, item]) => item.input.checked)?.[0] };
}

export function secretInput(placeholder: string, showLabel: () => string, hideLabel: () => string, accentVar: string) {
    const input = h("input", { class: "ysrp-input", type: "password", placeholder, autocomplete: "new-password", spellcheck: "false" });
    const toggle = h("button", { type: "button", class: "ysrp-btn", text: showLabel() });
    toggle.style.setProperty("--ysrp-btn-accent", `var(${accentVar})`);
    toggle.addEventListener("click", () => {
        const hidden = input.type === "password";
        input.type = hidden ? "text" : "password";
        toggle.textContent = hidden ? hideLabel() : showLabel();
    });
    return { input, node: h("div", { class: "ysrp-inline" }, input, toggle) };
}
