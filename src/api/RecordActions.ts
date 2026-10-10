/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import type { VideoRecord } from "@api/Store";

export interface RecordActionContext {
    id: string;
    url: string;
    record(): VideoRecord;
}

export interface RecordActionInstance {
    button: HTMLElement;
    panel?: HTMLElement;
    update?(record: VideoRecord): void;
}

export interface RecordActionDef {
    id: string;
    order: number;
    create(ctx: RecordActionContext): RecordActionInstance;
    onRemoved?(id: string): void;
}

const actions = new Map<string, RecordActionDef>();
const listeners = new Set<() => void>();
let version = 0;

export function addRecordAction(action: RecordActionDef) {
    actions.set(action.id, action);
    version++;
    for (const listener of listeners) listener();
}

export function removeRecordAction(id: string) {
    if (!actions.delete(id)) return;
    version++;
    for (const listener of listeners) listener();
}

export function getRecordActions() {
    return [...actions.values()].sort((a, b) => a.order - b.order);
}

export const recordActionsVersion = () => version;

export function onRecordActionsChange(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
