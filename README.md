<img src="https://github.com/0-V-linuxdo/Youtube-Memory/raw/refs/heads/main/main_icon/main_icon.svg"/>

# [Youtube] Video Memory

Save & resume YouTube playback progress. Install [`userscript/[Youtube] Video Memory.user.js`](userscript/) in Tampermonkey / Violentmonkey.

## Features

| Plugin | Default | What it does |
|---|---|---|
| Progress engine (core) | always on | Saves the position per video and resumes it, across in-site navigation, ads, slow loads and tabs |
| Player badge (core) | always on | Last saved time + settings button in the player controls |
| Settings dialog (core) | always on | Records list (DeArrow titles, notes, links), storage, plugins, language |
| Badge toggle | on | 💾 button that shows / hides the badge |
| Transcript | on | Fetch transcripts from an OpenAI-compatible endpoint |
| Google Drive sync | on | One JSON file per video in your own Drive; pulled before resuming on another device. Idle until you add credentials |

Plugins are switched on and off in **Settings → Plugins**.

## Development

The script is built from TypeScript sources, with the plugin layout of [void++](https://github.com/0-V-linuxdo/VoidPP):

```
src/
  index.ts            entry
  api/                PluginManager, Settings, Store, Badge, Modal, SettingsTabs, RecordActions, RestoreHooks, Titles
  utils/              dom, i18n, storage, http, css, youtube, types (definePlugin / OptionType)
  plugins/_core/      engine, playerBadge, settings (required)
  plugins/<name>/     badgeToggle, transcript, driveSync
```

```bash
bun install
bun run build        # → userscript/[Youtube] Video Memory.user.js
NODE_PATH=$(npm root -g) node tests/acceptance.mjs   # Playwright acceptance suite
```

The behaviour is specified in [docs/functional-spec.md](docs/functional-spec.md); every acceptance item there has a test.
