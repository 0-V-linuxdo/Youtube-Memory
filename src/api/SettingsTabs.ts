/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

export interface PaneContext {
    setCount(count: number): void;
    spin(on: boolean): void;
    renderModeBadge(): void;
    listen(target: EventTarget, name: string, handler: (event: Event) => void): void;
}

export interface Pane {
    node: HTMLElement;
    refresh?(): void;
    destroy?(): void;
}

export type SettingsTabGroup = "general" | "plugins";

export interface SettingsTabDef {
    id: string;
    group: SettingsTabGroup;
    order: number;
    label: () => string;
    icon: string;
    render(ctx: PaneContext): Pane;
}

const tabs = new Map<string, SettingsTabDef>();
const listeners = new Set<() => void>();

export function addSettingsTab(tab: SettingsTabDef) {
    tabs.set(tab.id, tab);
    for (const listener of listeners) listener();
}

export function removeSettingsTab(id: string) {
    if (!tabs.delete(id)) return;
    for (const listener of listeners) listener();
}

export function getSettingsTabs() {
    const rank = (g: SettingsTabGroup) => (g === "general" ? 0 : 1);
    return [...tabs.values()].sort((a, b) => rank(a.group) - rank(b.group) || a.order - b.order);
}

export function onSettingsTabsChange(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
