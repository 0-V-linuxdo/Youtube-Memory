/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

declare const VERSION: string;

declare function GM_getValue<T = unknown>(key: string, defaultValue?: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_deleteValue(key: string): void;
declare function GM_listValues(): string[];

interface GMXhrResponse {
    status: number;
    responseText: string;
}

interface GMXhrDetails {
    method: string;
    url: string;
    headers?: Record<string, string>;
    data?: string;
    timeout?: number;
    onload?(response: GMXhrResponse): void;
    onerror?(error: unknown): void;
    ontimeout?(): void;
    onabort?(): void;
}

declare function GM_xmlhttpRequest(details: GMXhrDetails): void;

declare module "*.css" {
    const css: string;
    export default css;
}

declare module "~plugins" {
    const plugins: Record<string, import("@utils/types").Plugin>;
    export default plugins;
}
