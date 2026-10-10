/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

export class Logger {
    constructor(public name: string) {}

    private prefix() {
        return `[Video Memory] ${this.name}:`;
    }

    info(...args: unknown[]) {
        console.info(this.prefix(), ...args);
    }

    warn(...args: unknown[]) {
        console.warn(this.prefix(), ...args);
    }

    error(...args: unknown[]) {
        console.error(this.prefix(), ...args);
    }
}
