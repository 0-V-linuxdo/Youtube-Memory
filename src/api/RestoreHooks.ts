/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { Logger } from "@utils/Logger";

const logger = new Logger("RestoreHooks");

export type RestoreHook = (videoId: string) => Promise<unknown> | void;

const hooks = new Map<string, RestoreHook>();

export function addRestoreHook(owner: string, hook: RestoreHook) {
    hooks.set(owner, hook);
}

export function removeRestoreHook(owner: string) {
    hooks.delete(owner);
}

// P-D.8: work that should settle (or time out) before the engine reads the saved position.
export function runRestoreHooks(videoId: string): Promise<unknown>[] {
    const pending: Promise<unknown>[] = [];
    for (const [owner, hook] of hooks) {
        try {
            const result = hook(videoId);
            if (result) pending.push(result.catch(err => logger.warn(`${owner} failed`, err)));
        } catch (err) {
            logger.warn(`${owner} failed`, err);
        }
    }
    return pending;
}
