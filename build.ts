/*
 * [Youtube] Video Memory
 * Copyright (c) 2025 0-V-linuxdo
 * SPDX-License-Identifier: MIT
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { resolve } from "path";

const isWatch = process.argv.includes("--watch");
const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

const VERSION_DATE = "20261010";
const displayVersion = `[${VERSION_DATE}] v${pkg.version}`;
const OUT_NAME = "[Youtube] Video Memory";
const REPO = "https://github.com/0-V-linuxdo/Youtube-Memory";

const USERSCRIPT_HEADER = `// ==UserScript==
// @name         [Youtube] Video Memory ${displayVersion}
// @namespace    0_V userscripts/Youtube Save & Resume Progress
// @description  Save & resume YouTube playback progress: per-video sessions that survive in-site navigation, ads, slow loads and multiple tabs. Records list with DeArrow titles, notes and transcripts; localStorage / GM storage with import & export; plugins for a badge toggle and Google Drive sync; Chinese / English UI.
// @version      ${displayVersion}
// @update-log   ${displayVersion} · Rebuilt on a plugin architecture (after void++): TypeScript sources, a Plugins tab, the 💾 badge toggle built in, and Google Drive sync back as a plugin.
// @author       0_V
// @license      MIT
// @homepageURL  ${REPO}
// @supportURL   ${REPO}/issues
// @match        *://*.youtube.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @connect      oauth2.googleapis.com
// @connect      www.googleapis.com
// @icon         ${REPO}/raw/refs/heads/main/main_icon/main_icon.svg
// ==/UserScript==
`;

const LICENSE_BANNER = `/**
 * [Youtube] Video Memory ${displayVersion}
 * (c) 2025 0-V-linuxdo · MIT License
 * Source: ${REPO} (src/, built with \`bun run build\`)
 * Behaviour spec: docs/functional-spec.md
 */`;

const pluginRoot = resolve("src/plugins");

function scan(dir: string, imports: string[], exports: string[], counter: { i: number; }) {
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
        const path = resolve(dir, entry.name);
        if (!existsSync(`${path}/index.ts`)) continue;
        const name = `p${counter.i++}`;
        imports.push(`import ${name} from ${JSON.stringify(path.replaceAll("\\", "/"))};`);
        exports.push(`[${name}.name]: ${name}`);
    }
}

function pluginModule() {
    const imports: string[] = [];
    const exports: string[] = [];
    const counter = { i: 0 };
    scan(resolve(pluginRoot, "_core"), imports, exports, counter);
    scan(pluginRoot, imports, exports, counter);
    console.log(`[build] ${counter.i} plugins`);
    return `${imports.join("\n")}\nexport default { ${exports.join(", ")} };\n`;
}

const pluginsPlugin: import("bun").BunPlugin = {
    name: "virtual-plugins",
    setup(build) {
        build.onResolve({ filter: /^~plugins$/ }, () => ({ path: "~plugins", namespace: "virtual" }));
        build.onLoad({ filter: /^~plugins$/, namespace: "virtual" }, () => ({ contents: pluginModule(), loader: "ts" }));
    },
};

const cssPlugin: import("bun").BunPlugin = {
    name: "css-text",
    setup(build) {
        build.onLoad({ filter: /\.css$/ }, async args => ({
            contents: `export default ${JSON.stringify(await Bun.file(args.path).text())};`,
            loader: "js",
        }));
    },
};

async function build() {
    const result = await Bun.build({
        entrypoints: ["src/index.ts"],
        target: "browser",
        format: "iife",
        minify: false,
        define: { VERSION: JSON.stringify(displayVersion) },
        plugins: [pluginsPlugin, cssPlugin],
    });
    if (!result.success) {
        for (const log of result.logs) console.error(log);
        throw new Error("Build failed");
    }
    const code = await result.outputs[0].text();
    const content = `${USERSCRIPT_HEADER}\n${LICENSE_BANNER}\n${code}`;
    if (/\.innerHTML\s*=/.test(code)) throw new Error("innerHTML assignment found: YouTube enforces Trusted Types");
    mkdirSync("userscript", { recursive: true });
    await Bun.write(`userscript/${OUT_NAME}.user.js`, content);
    await Bun.write(`userscript/${OUT_NAME}.meta.js`, USERSCRIPT_HEADER);
    console.log(`[build] userscript/${OUT_NAME}.user.js (${(content.length / 1024).toFixed(1)} KB)`);
}

if (isWatch) {
    const { watch } = await import("fs");
    let timer: ReturnType<typeof setTimeout> | null = null;
    await build().catch(console.error);
    watch("src", { recursive: true }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => build().catch(console.error), 200);
    });
} else {
    await build();
}
