/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { plugins, startAllPlugins } from "@api/PluginManager";
import { ensureFontAwesome, registerStyle } from "@utils/css";
import { Logger } from "@utils/Logger";

import css from "./styles.css";

const logger = new Logger("Core");
const flag = "__ysrpVideoMemory";
const host = window as unknown as Record<string, unknown>;

if (!host[flag]) {
    host[flag] = { version: VERSION, plugins };
    try {
        registerStyle("core", css);
        ensureFontAwesome();
        startAllPlugins();
    } catch (err) {
        logger.error("Fatal init error", err);
    }
}
