// Acceptance tests for the userscript against a mock YouTube watch page (tests/mock).
// Usage: node tests/acceptance.mjs [path/to/script.user.js] [--only A-2,A-5]
// Requires the `playwright` package (global install is fine: NODE_PATH=$(npm root -g)).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;
const scriptPath = args.find((a, i) => !a.startsWith('--') && (onlyIdx < 0 || i !== onlyIdx + 1)) ||
  path.join(here, '..', 'userscript', '[Youtube] Video Memory.user.js');
const userscript = fs.readFileSync(scriptPath, 'utf8');
const PREFIX = 'Youtube_SaveResume_Progress-';

/* ------------------------------------------------------------------ server */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/mock-player.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(fs.readFileSync(path.join(here, 'mock', 'mock-player.js')));
  }
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    // Same enforcement YouTube uses: any innerHTML assignment throws.
    'content-security-policy': "require-trusted-types-for 'script'"
  });
  res.end(fs.readFileSync(path.join(here, 'mock', 'index.html')));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

/* ------------------------------------------------------------------ browser */
const browser = await chromium.launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// GM_* shim persisted in localStorage under a separate namespace so it survives reloads.
const gmShim = `
  (() => {
    const NS = '__gm__';
    window.GM_getValue = (k, d) => { const v = localStorage.getItem(NS + k); return v === null ? d : JSON.parse(v); };
    window.GM_setValue = (k, v) => localStorage.setItem(NS + k, JSON.stringify(v));
    window.GM_deleteValue = k => localStorage.removeItem(NS + k);
    window.GM_listValues = () => Object.keys(localStorage).filter(k => k.startsWith(NS)).map(k => k.slice(NS.length));
  })();`;

async function newPage(context, config = {}) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', err => page.errors.push(String(err)));
  page.on('console', msg => { if (msg.type() === 'error') page.errors.push(msg.text()); });
  await page.addInitScript(`window.__mockConfig = ${JSON.stringify(config)};`);
  await page.addInitScript(gmShim);
  // Tampermonkey's default run-at is document-idle: run after the DOM is parsed.
  await page.addInitScript(`document.addEventListener('DOMContentLoaded', () => {\n${userscript}\n});`);
  return page;
}

async function newContext() {
  const context = await browser.newContext({ locale: 'zh-CN', permissions: ['clipboard-read', 'clipboard-write'] });
  // External services are unreachable from CI; answer them locally.
  await context.route('https://sponsor.ajay.app/**', route => {
    const id = new URL(route.request().url()).searchParams.get('videoID');
    if (id.startsWith('da')) return route.fulfill({ json: { titles: [{ title: `DeArrow ${id}`, votes: 1, original: false }] } });
    return route.fulfill({ status: 404, body: 'Not Found' });
  });
  await context.route('https://www.youtube.com/oembed**', route => {
    const target = new URL(route.request().url()).searchParams.get('url');
    return route.fulfill({ json: { title: `Original ${target.split('/').pop()}` } });
  });
  await context.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  return context;
}

const record = (page, id) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), PREFIX + id);
const seed = (page, id, rec) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [PREFIX + id, rec]);
const playerTime = page => page.evaluate(() => window.__mock.player.getCurrentTime());
const goto = (page, query) => page.goto(`${ORIGIN}/watch?${query}`);

// Pre-seed storage on a blank page of the same origin before the script ever runs.
async function seeded(context, records, config) {
  const blank = await context.newPage();
  await blank.goto(`${ORIGIN}/blank`);
  for (const [id, rec] of Object.entries(records)) await seed(blank, id, rec);
  await blank.close();
  return newPage(context, config);
}


// The 💾 badge toggle (default-on plugin) hides the badge until it is clicked.
async function showBadge(page) {
  const hidden = await page.evaluate(() => document.querySelector('.last-save-info-container')?.classList.contains('ysrp-badge-hidden'));
  if (hidden) await page.click('.ysrp-badge-toggle');
}

// N-5.9: the gear opens the plugin menu (or the window directly when "show the plugin menu" is off).
async function pressGear(page) {
  await showBadge(page);
  await page.click('.ysrp-settings-button');
}

// Open the settings window on its only page, Plugins: gear, then "All plugins" when the menu appears.
async function openSettings(page) {
  await pressGear(page);
  if (await page.locator('.ysrp-plugin-menu').count()) await page.click('.ysrp-plugin-menu .ysrp-menu-item[data-action="all"]');
  await page.waitForSelector('.ysrp-settings-container.is-open');
}

// Open one plugin's settings dialog straight from the gear menu (N-5.6.5).
async function openPlugin(page, name) {
  await pressGear(page);
  await page.click(`.ysrp-plugin-menu .ysrp-menu-item[data-plugin="${name}"]`);
  await page.waitForSelector(`.ysrp-plugin-dialog[data-plugin="${name}"]`);
}

// Close menus, dialogs and the window (Esc closes the top layer first).
async function closeAll(page) {
  for (let i = 0; i < 6; i++) {
    const open = await page.evaluate(() => Boolean(document.querySelector('.ysrp-plugin-menu, .ysrp-dialog-layer, .ysrp-settings-container.is-open')));
    if (!open) return;
    await page.keyboard.press('Escape');
  }
}

// Entries of the open gear menu: plugin names, then "#all".
const menuItems = page => page.$$eval('.ysrp-plugin-menu .ysrp-menu-item', els => els.map(e => e.dataset.plugin || `#${e.dataset.action}`));


// In-memory Google OAuth + Drive v3 used by the DriveSync tests.
async function driveMock(context, initialFiles = []) {
  const drive = { files: [], uploads: [], deletes: 0, tokenCalls: 0, seq: 0 };
  const add = f => { const file = { id: `f${++drive.seq}`, parents: [], mimeType: 'application/json', modifiedTime: new Date().toISOString(), content: '', ...f }; drive.files.push(file); return file; };
  drive.add = add;
  const folder = () => drive.files.find(f => f.mimeType === 'application/vnd.google-apps.folder');
  drive.folder = folder;
  drive.inFolder = () => drive.files.filter(f => folder() && f.parents.includes(folder().id));
  for (const f of initialFiles) add(f);
  const meta = f => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime });
  const matches = (f, q) => q.split(' and ').every(c => {
    let m;
    if ((m = /^name = '(.*)'$/.exec(c))) return f.name === m[1].replace(/\\'/g, "'");
    if ((m = /^name contains '(.*)'$/.exec(c))) return f.name.includes(m[1]);
    if ((m = /^mimeType = '(.*)'$/.exec(c))) return f.mimeType === m[1];
    if ((m = /^'(.*)' in parents$/.exec(c))) return f.parents.includes(m[1]);
    if (c === 'trashed = false') return true;
    throw new Error(`unsupported query ${c}`);
  });
  await context.route('https://oauth2.googleapis.com/token', route => {
    drive.tokenCalls++;
    const body = new URLSearchParams(route.request().postData());
    if (body.get('refresh_token') !== 'rt-ok' || body.get('grant_type') !== 'refresh_token') return route.fulfill({ status: 400, json: { error: 'invalid_grant' } });
    return route.fulfill({ json: { access_token: 'at-1', expires_in: 3600 } });
  });
  await context.route('https://www.googleapis.com/**', route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.headers().authorization !== 'Bearer at-1') return route.fulfill({ status: 401, json: { error: { message: 'no auth' } } });
    const idMatch = /\/files\/([^/?]+)$/.exec(url.pathname);
    if (url.pathname.startsWith('/upload/')) {
      const raw = req.postData();
      const boundary = /boundary=(\S+)/.exec(req.headers()['content-type'])[1];
      const parts = raw.split(`--${boundary}`).slice(1, 3).map(p => p.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''));
      const metadata = JSON.parse(parts[0]);
      let file;
      if (idMatch) {
        file = drive.files.find(f => f.id === idMatch[1]);
        Object.assign(file, { name: metadata.name, content: parts[1], modifiedTime: new Date().toISOString() });
      } else {
        file = add({ name: metadata.name, parents: metadata.parents || [], content: parts[1] });
      }
      drive.uploads.push({ name: file.name, method: req.method() });
      return route.fulfill({ json: meta(file) });
    }
    if (req.method() === 'GET' && !idMatch) {
      const q = url.searchParams.get('q');
      let list = drive.files.filter(f => matches(f, q));
      if ((url.searchParams.get('orderBy') || '').startsWith('modifiedTime desc')) list = list.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
      return route.fulfill({ json: { files: list.map(meta) } });
    }
    if (req.method() === 'POST' && !idMatch) {
      const body = JSON.parse(req.postData());
      return route.fulfill({ json: { id: add({ name: body.name, mimeType: body.mimeType, parents: body.parents || [] }).id } });
    }
    const file = idMatch && drive.files.find(f => f.id === idMatch[1]);
    if (!file) return route.fulfill({ status: 404, json: { error: { message: 'not found' } } });
    if (req.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: file.content });
    if (req.method() === 'DELETE') { drive.files = drive.files.filter(f => f !== file); drive.deletes++; return route.fulfill({ status: 204, body: '' }); }
    return route.fulfill({ status: 400, body: 'unexpected' });
  });
  return drive;
}

const DRIVE_CREDS = { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'secret', refreshToken: 'rt-ok' };
// GM shim values are JSON-encoded; DriveSync stores its settings as a JSON string in GM.
const gmSeed = (key, value) => ['__gm__' + key, JSON.stringify(value)];
async function seedRaw(context, pairs) {
  const blank = await context.newPage();
  await blank.goto(`${ORIGIN}/blank`);
  await blank.evaluate(entries => entries.forEach(([k, v]) => localStorage.setItem(k, v)), pairs);
  await blank.close();
}
const remotePayload = (id, record) => JSON.stringify({ version: '2', videoId: id, videoUrl: `https://www.youtube.com/watch?v=${id}`, exportedAt: 1, record });

/* ------------------------------------------------------------------ tests */
const results = [];
function check(id, name, ok, detail) {
  results.push({ id, name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const tests = {
  async 'A-1'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a1video');
    await sleep(5000);
    const before = await playerTime(page);
    await page.reload(); // the position is flushed on pagehide
    await sleep(2500);
    const after = await playerTime(page);
    check('A-1', 'reload resumes from the saved position', before >= 3 && after >= before && after < before + 4,
      `left at ${before.toFixed(1)}s, 2.5s after reload at ${after.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-2'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { a2second: { videoProgress: 60, saveDate: 1, videoName: 'B', originalTitle: 'B' } });
    await goto(page, 'v=a2first');
    await sleep(4500);
    await page.evaluate(() => window.__mock.nav('a2second'));
    await sleep(3500);
    const timeB = await playerTime(page);
    const recB = await record(page, 'a2second');
    const recA = await record(page, 'a2first');
    check('A-2', 'in-site navigation to a watched video resumes it and keeps its record',
      timeB >= 60 && timeB < 66 && recB.videoProgress >= 60 && recA.videoProgress >= 3 && recA.videoProgress < 7,
      `B plays at ${timeB.toFixed(1)}s, B record ${recB.videoProgress.toFixed(1)}s, A record ${recA.videoProgress.toFixed(1)}s`);
    await page.goBack();
    await sleep(3000);
    const timeA = await playerTime(page);
    check('A-3', 'going back resumes the previous video', timeA >= recA.videoProgress - 0.5 && timeA < recA.videoProgress + 6,
      `A plays at ${timeA.toFixed(1)}s (record ${recA.videoProgress.toFixed(1)}s)`);
    await ctx.close();
  },

  async 'A-4'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { a4slow: { videoProgress: 100, saveDate: 1, videoName: 'Slow' } }, { playerCreateDelay: 5000 });
    await goto(page, 'v=a4slow');
    await sleep(4000);
    const during = await record(page, 'a4slow');
    await sleep(4500);
    const time = await playerTime(page);
    check('A-4', 'slow player start-up does not overwrite the record and still resumes',
      during.videoProgress === 100 && time >= 100 && time < 105,
      `record while loading ${during.videoProgress}s, plays at ${time.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-5'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { a5ad: { videoProgress: 80, saveDate: 1, videoName: 'Ad' } }, { ads: { a5ad: 4 } });
    await goto(page, 'v=a5ad');
    await sleep(3000);
    const during = await record(page, 'a5ad');
    await sleep(4500);
    const time = await playerTime(page);
    check('A-5', 'pre-roll ad: no save during the ad, resume afterwards',
      during.videoProgress === 80 && time >= 80 && time < 85,
      `record during ad ${during.videoProgress}s, plays at ${time.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-6'() {
    // Link time and saved progress disagree: a dialog asks, nothing is saved meanwhile; "link time" keeps the link.
    const ctx = await newContext();
    const page = await seeded(ctx, { a6link: { videoProgress: 100, saveDate: 1, videoName: 'Link' } });
    await goto(page, 'v=a6link&t=5');
    await sleep(3000);
    const dialog = await page.locator('.ysrp-resume').count();
    const paused = await page.evaluate(() => window.__mock.player.getPlayerState() === 2);
    const waiting = await record(page, 'a6link');
    await page.locator('.ysrp-resume-link').dispatchEvent('pointerdown');
    await sleep(3000);
    const time = await playerTime(page);
    const rec = await record(page, 'a6link');
    const gone = await page.locator('.ysrp-resume').count();
    check('A-6', '&t= with different saved progress: dialog asks; "link time" plays from the link, then saves',
      dialog === 1 && paused && waiting.videoProgress === 100 && gone === 0 &&
      time >= 5 && time < 10 && rec.videoProgress >= 5 && rec.videoProgress < 10,
      `dialog ${dialog}, paused ${paused}, record while asking ${waiting.videoProgress}s, ` +
      `then plays at ${time.toFixed(1)}s, record ${rec.videoProgress.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-6b'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { a6saved: { videoProgress: 100, saveDate: 1, videoName: 'Saved' } });
    await goto(page, 'v=a6saved&t=5');
    await sleep(3000);
    await page.locator('.ysrp-resume-saved').dispatchEvent('pointerdown');
    await sleep(3000);
    const time = await playerTime(page);
    const playing = await page.evaluate(() => window.__mock.player.getPlayerState() === 1);
    check('A-6b', '"saved progress" in the dialog resumes from the saved position and keeps playing',
      time >= 100 && time < 106 && playing, `plays at ${time.toFixed(1)}s, playing ${playing}`);
    await ctx.close();
  },

  async 'A-6c'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { a6same: { videoProgress: 31, saveDate: 1, videoName: 'Same' },
      a6none: { videoProgress: 0, saveDate: 1, videoName: 'None' } });
    await goto(page, 'v=a6same&t=30');
    await sleep(3000);
    const same = await page.locator('.ysrp-resume').count();
    await goto(page, 'v=a6none&t=30');
    await sleep(3000);
    const none = await page.locator('.ysrp-resume').count();
    const time = await playerTime(page);
    check('A-6c', 'no dialog when the link time matches the saved position or there is nothing to resume',
      same === 0 && none === 0 && time >= 30 && time < 35, `dialogs ${same}/${none}, plays at ${time.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-7'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a7paused');
    await sleep(3500);
    await page.evaluate(() => window.__mock.pause());
    await sleep(500);
    // Another tab keeps watching and saves a later position.
    const other = await newPage(ctx);
    await goto(other, 'v=blank');
    await other.evaluate(k => {
      const rec = JSON.parse(localStorage.getItem(k));
      rec.videoProgress = 200;
      localStorage.setItem(k, JSON.stringify(rec));
    }, PREFIX + 'a7paused');
    await sleep(4000);
    const rec = await record(page, 'a7paused');
    check('A-7', 'a paused tab does not overwrite progress saved by another tab', rec.videoProgress === 200,
      `record after 4s: ${rec.videoProgress}s`);
    await ctx.close();
  },

  async 'A-8'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a8old');
    await sleep(6000);
    // URL switches first while the player keeps showing the old video (~6s in) for 2.5s.
    await page.evaluate(() => window.__mock.navUrlFirst('a8new', 2500));
    await sleep(1500);
    const duringUrlFirst = await record(page, 'a8new');
    await sleep(3500);
    const afterUrlFirst = await record(page, 'a8new');
    await sleep(2000);
    const newBefore = await record(page, 'a8new');
    // Player switches first while the URL still names a8new for 2.5s.
    await page.evaluate(() => window.__mock.navPlayerFirst('a8third', 2500));
    await sleep(1800);
    const duringPlayerFirst = await record(page, 'a8new');
    check('A-8', 'URL/player mismatch during navigation never writes the wrong video',
      duringUrlFirst === null && afterUrlFirst && afterUrlFirst.videoProgress < 3 &&
      duringPlayerFirst.videoProgress >= newBefore.videoProgress - 0.01,
      `URL-first: new video record during mismatch ${duringUrlFirst ? duringUrlFirst.videoProgress : 'none'}, after ${afterUrlFirst ? afterUrlFirst.videoProgress.toFixed(1) : 'none'}s; ` +
      `player-first: previous video record ${newBefore.videoProgress.toFixed(1)}s → ${duringPlayerFirst.videoProgress.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-9b'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { a9reset: { videoProgress: 120, saveDate: 1, videoName: 'Reset' } }, { resetAfterLoad: { a9reset: true } });
    await goto(page, 'v=a9reset');
    await sleep(4000);
    const time = await playerTime(page);
    const rec = await record(page, 'a9reset');
    check('A-9b', 'player jumping back to 0 right after load is corrected (restore retries)',
      time >= 120 && time < 126 && rec.videoProgress >= 120, `plays at ${time.toFixed(1)}s, record ${rec.videoProgress.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-9'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { a9done: { videoProgress: 298, saveDate: 1, videoName: 'Done' } });
    await goto(page, 'v=a9done');
    await sleep(3000);
    const time = await playerTime(page);
    check('A-9', 'a finished video starts from the beginning', time < 5, `plays at ${time.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-10'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).startsWith('Youtube_SaveResume_Progress-')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, k, v);
      };
    });
    await goto(page, 'v=a10quota');
    await sleep(3500);
    const text = await page.textContent('.last-save-info-text');
    check('A-10', 'storage failure is shown on the badge', /保存失败|Save failed/.test(text), `badge: "${text}"`);
    await ctx.close();
  },

  async 'A-11'() {
    const ctx = await newContext();
    const legacy = { videoProgress: 42.5, saveDate: 1, videoName: 'Legacy', originalTitle: 'Legacy original', videoNote: 'my note', videoTranscript: 'line 1', videoTranscriptUpdatedAt: 5 };
    const page = await seeded(ctx, { a11legacy: legacy });
    await goto(page, 'v=a11legacy');
    await sleep(5000);
    const time = await playerTime(page);
    const rec = await record(page, 'a11legacy');
    check('A-11', 'legacy record resumes and keeps notes/transcript after saving',
      time >= 44 && rec.videoProgress > 43 && rec.videoNote === 'my note' && rec.videoTranscript === 'line 1' && rec.videoDuration === 300,
      `plays at ${time.toFixed(1)}s, record ${JSON.stringify({ p: rec.videoProgress, note: rec.videoNote, tr: rec.videoTranscript, dur: rec.videoDuration })}`);
    await ctx.close();
  },

  async 'A-12'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a12badge');
    await sleep(3500);
    const count = await page.locator('.last-save-info-container').count();
    const inControls = await page.locator('#movie_player .ytp-left-controls .last-save-info-container').count();
    const text = await page.textContent('.last-save-info-text');
    await page.evaluate(() => document.querySelector('.last-save-info-container').remove());
    await sleep(1000);
    const again = await page.locator('#movie_player .ytp-left-controls .last-save-info-container').count();
    check('A-12', 'badge sits in the left controls, is unique, shows the time and comes back',
      count === 1 && inControls === 1 && /^\d+:\d\d$/.test(text.trim()) && again === 1, `count ${count}, text "${text}", re-added ${again}`);
    await ctx.close();
  },

  async 'A-13'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a13modal');
    await sleep(2000);
    const playingBefore = await page.evaluate(() => window.__mock.state.playing);
    // N-5.9.1: the gear pops up the plugin menu without touching playback.
    await pressGear(page);
    const menu = await page.evaluate(() => {
      const m = document.querySelector('.ysrp-plugin-menu');
      return m ? { role: m.getAttribute('role'), items: m.querySelectorAll('[role="menuitem"]').length, title: m.querySelector('.ysrp-menu-title')?.textContent } : null;
    });
    const items = await menuItems(page);
    const windowWithMenu = await page.isVisible('.ysrp-settings-container');
    const playingAfter = await page.evaluate(() => window.__mock.state.playing);
    const clicks = await page.evaluate(() => window.__mock.state.clicks);
    await page.keyboard.press('Escape');
    const menuEsc = await page.locator('.ysrp-plugin-menu').count() === 0;
    await pressGear(page);
    await page.mouse.click(5, 5);
    const menuOutside = await page.locator('.ysrp-plugin-menu').count() === 0;
    await pressGear(page);
    await pressGear(page);
    const menuGearAgain = await page.locator('.ysrp-plugin-menu').count() === 0;
    // Keyboard: End moves to "All plugins", Enter opens the window on the Plugins page.
    await pressGear(page);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const visible = await page.isVisible('.ysrp-settings-container');
    const menuClosedOnSelect = await page.locator('.ysrp-plugin-menu').count() === 0;
    const host = await page.evaluate(() => document.querySelector('.ysrp-settings-container').parentElement.id);
    await page.keyboard.press('Escape');
    const closedByEsc = !(await page.isVisible('.ysrp-settings-container'));
    await openSettings(page);
    await page.mouse.click(5, 5);
    const closedByBackdrop = !(await page.isVisible('.ysrp-settings-container'));
    await openSettings(page);
    await page.click('.ysrp-close');
    const closedByX = !(await page.isVisible('.ysrp-settings-container'));
    const overflow = await page.evaluate(() => document.body.style.overflow);
    // "Show the plugin menu on the gear button" off: the gear opens the window directly.
    await openPlugin(page, 'Settings');
    await page.click('.ysrp-plugin-dialog .ysrp-switch[data-setting="showMenu"]');
    const storedOff = await page.evaluate(() => JSON.parse(localStorage.getItem('YSRP_Plugins')).plugins.Settings.showMenu);
    await closeAll(page);
    await pressGear(page);
    const direct = await page.isVisible('.ysrp-settings-container') && await page.locator('.ysrp-plugin-menu').count() === 0;
    const expected = ['BadgeToggle', 'DriveSync', 'PluginsMenu', 'Records', 'Settings', 'Storage', 'Toasts', 'Transcript'];
    const ok = menu && menu.role === 'menu' && menu.title === '插件' && menu.items === expected.length + 1 &&
      JSON.stringify(items.slice(0, -1).slice().sort()) === JSON.stringify(expected) && items[items.length - 1] === '#all' && !windowWithMenu &&
      playingBefore === playingAfter && clicks === 0 && menuEsc && menuOutside && menuGearAgain &&
      visible && menuClosedOnSelect && host === 'content' && closedByEsc && closedByBackdrop && closedByX && overflow === '' &&
      storedOff === false && direct;
    check('A-13', 'gear pops up the plugin menu (menu plugins + All plugins) without touching playback; Esc / outside / gear close it; All plugins opens the window; ✕/backdrop/Esc close it; menu switch off opens the window directly', ok,
      `menu ${JSON.stringify(menu)}, items ${items.join(',')}, window with menu ${windowWithMenu}, player clicks ${clicks}, menu esc ${menuEsc} outside ${menuOutside} gear ${menuGearAgain}, window ${visible} host #${host}, esc ${closedByEsc}, backdrop ${closedByBackdrop}, ✕ ${closedByX}, showMenu ${storedOff} direct ${direct}`);
    await ctx.close();
  },

  async 'A-13b'() {
    const ctx = await newContext();
    const page = await seeded(ctx, Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`a13b${i}`, { videoProgress: 10, saveDate: i, videoName: `V${i}`, originalTitle: `V${i}` }])));
    await page.setViewportSize({ width: 1000, height: 600 });
    await goto(page, 'v=a13bscroll');
    await page.evaluate(() => document.body.appendChild(Object.assign(document.createElement('div'), { style: 'height:3000px' })));
    await sleep(2000);
    const widthBefore = await page.evaluate(() => document.documentElement.clientWidth);
    // The records list now lives in the Records plugin's dialog on top of the window (N-5.4).
    await openPlugin(page, 'Records');
    await sleep(500);
    const after = await page.evaluate(() => ({ width: document.documentElement.clientWidth, body: document.body.style.overflow, html: document.documentElement.style.overflow, bodyCs: getComputedStyle(document.body).overflowY }));
    await page.mouse.move(20, 300);
    await page.mouse.wheel(0, 600);
    await sleep(300);
    const pageScrollWhileOpen = await page.evaluate(() => window.scrollY);
    const list = '.ysrp-plugin-dialog[data-plugin="Records"] .ysrp-plugin-settings';
    const box = await page.locator(list).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);
    await sleep(300);
    const paneScroll = await page.evaluate(sel => document.querySelector(sel).scrollTop, list);
    await closeAll(page);
    await page.mouse.move(20, 300);
    await page.mouse.wheel(0, 400);
    await sleep(300);
    const pageScrollAfterClose = await page.evaluate(() => window.scrollY);
    check('A-13b', 'open window keeps the page scrollbar (no sideways shift) but stops page scrolling; the list still scrolls',
      after.width === widthBefore && after.body === '' && after.html === '' && after.bodyCs !== 'hidden' && pageScrollWhileOpen === 0 && paneScroll > 0 && pageScrollAfterClose > 0,
      `viewport width ${widthBefore} → ${after.width}, body overflow "${after.body}", page scroll while open ${pageScrollWhileOpen}, list scroll ${paneScroll}, page scroll after close ${pageScrollAfterClose}`);
    await ctx.close();
  },

  async 'A-14'() {
    const ctx = await newContext();
    const page = await seeded(ctx, {
      daolder: { videoProgress: 30, saveDate: 10, videoName: 'Unknown Title', videoDuration: 120 },
      plainnew: { videoProgress: 10, saveDate: 20, videoName: 'Unknown Title' }
    });
    await goto(page, 'v=a14current');
    await sleep(3000);
    // Menu → Records: the window opens with the Records plugin's large dialog on top (N-5.6.5).
    await openPlugin(page, 'Records');
    await sleep(800);
    const dlg = '.ysrp-plugin-dialog[data-plugin="Records"]';
    const shell = await page.evaluate(sel => {
      const d = document.querySelector(sel);
      return { window: document.querySelector('.ysrp-settings-container').classList.contains('is-open'), large: d.classList.contains('is-lg'), width: Math.round(d.getBoundingClientRect().width), panel: Boolean(d.querySelector('.ysrp-custom[data-setting="list"] .ysrp-records')) };
    }, dlg);
    const card = id => `.ysrp-record[data-video-id="${id}"]`;
    const ids = await page.$$eval('.ysrp-record', rows => rows.map(r => r.dataset.videoId));
    const count = () => page.textContent('.ysrp-records-count');
    const heading = await count();
    const badge = await page.textContent('.ysrp-records-storage');
    // N-5.4.2: Void++ card anatomy and the description / footer lines.
    const anatomy = await page.$eval(card('daolder'), el => el.classList.contains('ysrp-card') &&
      ['.ysrp-card-icon', '.ysrp-card-title', '.ysrp-card-controls', '.ysrp-card-desc', '.ysrp-card-sep', '.ysrp-card-footer'].every(sel => el.querySelector(sel)));
    // Single column, 8px apart.
    const layout = await page.$$eval('.ysrp-record', cards => {
      const r = cards.map(c => c.getBoundingClientRect());
      return { columns: new Set(r.map(x => Math.round(x.left))).size, gap: Math.round(r[1].top - r[0].bottom) };
    });
    const columns = layout.columns;
    const pct = await page.textContent(`${card('daolder')} .ysrp-card-desc`);
    const legacyPct = await page.textContent(`${card('plainnew')} .ysrp-card-desc`);
    const footer = await page.textContent(`${card('daolder')} .ysrp-card-footer`);
    const currentIcon = await page.$eval(`${card('a14current')} .ysrp-card-icon i`, i => i.className);
    const daTitle = await page.textContent(`${card('daolder')} .ysrp-card-title`);
    const plainTitle = await page.textContent(`${card('plainnew')} .ysrp-card-title`);
    const plainHasDa = await page.locator(`${card('plainnew')} .ysrp-da`).count();
    await page.click(`${card('daolder')} .ysrp-da`);
    const toggled = await page.textContent(`${card('daolder')} .ysrp-card-title`);
    // note: edited and saved in the notes dialog
    await page.click(`${card('plainnew')} .ysrp-ibtn.is-note`);
    await page.fill('.ysrp-note-dialog textarea', '  hello note  ');
    await page.click('.ysrp-note-dialog .ysrp-note-save');
    const noted = await record(page, 'plainnew');
    const noteMark = await page.locator(`${card('plainnew')} .is-note-mark`).count();
    // link dialog + copy
    await page.click(`${card('plainnew')} .ysrp-ibtn.is-link`);
    const linkValue = await page.inputValue('.ysrp-link-dialog .ysrp-link-input');
    await page.click('.ysrp-link-dialog .ysrp-link-copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const copied = (await page.textContent('.ysrp-link-dialog .ysrp-link-copy')).trim();
    await page.keyboard.press('Escape');
    const linkClosed = await page.locator('.ysrp-link-dialog').count() === 0 && await page.locator(dlg).count() === 1 && await page.isVisible('.ysrp-settings-container');
    // N-5.4.3: nothing ever expands inside a card
    const inlinePanels = await page.$$eval('.ysrp-record', cards => cards.filter(c => c.querySelector('textarea, input, select, .ysrp-panel')).length);
    // delete goes through the confirm dialog
    await page.click(`${card('daolder')} .ysrp-ibtn.is-delete`);
    const confirmShown = await page.locator('.ysrp-dialog.is-confirm').count();
    await page.click('.ysrp-confirm-cancel');
    const keptOnCancel = Boolean(await record(page, 'daolder')) && await page.locator(card('daolder')).count() === 1;
    await page.click(`${card('daolder')} .ysrp-ibtn.is-delete`);
    await page.click('.ysrp-confirm-ok');
    const afterDelete = await page.$$eval('.ysrp-record', rows => rows.map(r => r.dataset.videoId));
    const heading2 = await count();
    // search + filter bar
    const visibleIds = () => page.$$eval('.ysrp-record', rows => rows.filter(r => r.offsetParent).map(r => r.dataset.videoId).join(','));
    await page.fill('.ysrp-records-search', 'PLAINNEW');
    const searched = await visibleIds();
    const matches = await count();
    await page.fill('.ysrp-records-search', '');
    await page.selectOption('.ysrp-records-filter', 'notes');
    const withNotes = await visibleIds();
    await page.selectOption('.ysrp-records-filter', 'all');
    // N-5.4.9: Records off → not in the menu, progress still saved.
    await closeAll(page);
    await openSettings(page);
    await page.click('.ysrp-cat[data-cat="all"]');
    await page.click('.ysrp-switch[data-plugin="Records"]');
    await closeAll(page);
    const savedBefore = (await record(page, 'a14current')).saveDate;
    await pressGear(page);
    const menuWithout = await menuItems(page);
    await page.keyboard.press('Escape');
    await sleep(2500);
    const savedAfter = (await record(page, 'a14current')).saveDate;
    const ok = shell.window && shell.large && shell.width === 600 && shell.panel &&
      ids[0] === 'a14current' && ids.join() === 'a14current,plainnew,daolder' && heading === '3 条记录' && badge === '浏览器本地存储' &&
      anatomy && columns === 1 && layout.gap === 8 && pct === '已看 25.0% · 0:30 / 2:00' && legacyPct === '已看到 0:10' && /^保存于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(footer) &&
      currentIcon.includes('fa-play') && daTitle === 'DeArrow daolder' && toggled === 'Original daolder' && plainTitle === 'Original plainnew' &&
      plainHasDa === 0 && noted.videoNote === 'hello note' && noteMark === 1 && linkValue === 'https://www.youtube.com/watch?v=plainnew' &&
      clip === 'https://www.youtube.com/watch?v=plainnew' && copied === '已复制' && linkClosed && inlinePanels === 0 &&
      confirmShown === 1 && keptOnCancel && afterDelete.join() === 'a14current,plainnew' && heading2 === '2 条记录' && !(await record(page, 'daolder')) &&
      searched === 'plainnew' && matches === '1 条匹配' && withNotes === 'plainnew' &&
      !menuWithout.includes('Records') && menuWithout.includes('Storage') && savedAfter > savedBefore;
    check('A-14', 'records plugin: menu → large dialog, ordering, count, single-column Void++ cards, %, DeArrow toggle, note dialog, link dialog copy, confirmed delete, search/filter; plugin off → not in the menu, progress still saved', ok,
      `${JSON.stringify(shell)}, order ${ids.join()}, "${heading}" badge "${badge}", anatomy ${anatomy}, layout ${JSON.stringify(layout)}, desc "${pct}"/"${legacyPct}", footer "${footer}", titles "${daTitle}"/"${toggled}"/"${plainTitle}", note "${noted.videoNote}" mark ${noteMark}, link ${linkValue}, clip ${clip} (${copied}), inline panels ${inlinePanels}, confirm ${confirmShown} kept ${keptOnCancel}, after delete ${afterDelete.join()} "${heading2}", search "${searched}" "${matches}", notes "${withNotes}", menu off ${menuWithout.join(',')}, saved ${savedBefore} → ${savedAfter}`);
    await ctx.close();
  },

  async 'A-15'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { s1: { videoProgress: 11, saveDate: 1, videoName: 'S1' }, s2: { videoProgress: 22, saveDate: 2, videoName: 'S2' } });
    await goto(page, 'v=a15store');
    await sleep(3000);
    // Everything happens in the Storage plugin's settings dialog (N-5.7.1).
    await openPlugin(page, 'Storage');
    const dlg = '.ysrp-plugin-dialog[data-plugin="Storage"]';
    await page.selectOption(`${dlg} .ysrp-storage-mode`, 'gm');
    await page.click(`${dlg} .ysrp-apply-migrate`);
    const migrateConfirm = await page.locator('.ysrp-dialog.is-confirm').count();
    await page.click('.ysrp-confirm-ok');
    const state = await page.evaluate(() => ({
      local: Object.keys(localStorage).filter(k => k.startsWith('Youtube_SaveResume_Progress-')).length,
      gm: GM_listValues().filter(k => k.startsWith('Youtube_SaveResume_Progress-')).length,
      mode: localStorage.getItem('YSRP_StorageMode')
    }));
    // export -> clipboard, wipe one record, overwrite-import (confirmed)
    await page.click(`${dlg} .ysrp-copy-json`);
    const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    await page.evaluate(() => { GM_deleteValue('Youtube_SaveResume_Progress-s1'); GM_setValue('Youtube_SaveResume_Progress-junk', '{}'); });
    await page.click(`${dlg} .ysrp-overwrite`);
    const overwriteOn = await page.getAttribute(`${dlg} .ysrp-overwrite`, 'aria-checked');
    await page.fill(`${dlg} .ysrp-import-text`, JSON.stringify(exported));
    await page.click(`${dlg} .ysrp-import-btn`);
    const importConfirm = await page.locator('.ysrp-dialog.is-confirm').count();
    await page.click('.ysrp-confirm-ok');
    const msg = await page.textContent(`${dlg} .ysrp-import-msg`);
    const after = await page.evaluate(() => GM_listValues().filter(k => k.startsWith('Youtube_SaveResume_Progress-')).sort());
    const s1 = await page.evaluate(() => JSON.parse(GM_getValue('Youtube_SaveResume_Progress-s1')));
    // The storage badge (now in the records toolbar, N-5.4.1) names the new backend.
    await closeAll(page);
    await openPlugin(page, 'Records');
    const badge = await page.textContent('.ysrp-records-storage');
    const ok = migrateConfirm === 1 && state.local === 0 && state.gm === 3 && state.mode === 'gm' && badge === 'GM 存储' &&
      exported.version === '1' && exported.storageMode === 'gm' && Object.keys(exported.entries).length === 3 &&
      overwriteOn === 'true' && importConfirm === 1 &&
      after.length === 3 && !after.includes('Youtube_SaveResume_Progress-junk') && s1.videoProgress === 11 && /已导入 3 条记录/.test(msg);
    check('A-15', 'storage plugin dialog: confirmed migration to GM, export, confirmed overwrite import round trip', ok,
      `confirm ${migrateConfirm}/${importConfirm}, ${JSON.stringify(state)}, badge "${badge}", exported ${Object.keys(exported.entries).length}, overwrite ${overwriteOn}, after import ${after.length}, msg "${msg}"`);
    await ctx.close();
  },

  async 'A-16'() {
    const ctx = await newContext();
    let requestBody = null;
    let auth = null;
    await ctx.route('https://example.com/**', route => {
      requestBody = route.request().postDataJSON();
      auth = route.request().headers().authorization;
      return route.fulfill({ json: { choices: [{ message: { content: 'hello transcript' } }] } });
    });
    const page = await newPage(ctx);
    await goto(page, 'v=a16tr');
    await sleep(3000);
    // N-5.7.2: settings in the Transcript plugin's dialog, still stored in YSRP_TranscriptSettings.
    await openPlugin(page, 'Transcript');
    const dlg = '.ysrp-plugin-dialog[data-plugin="Transcript"]';
    await page.fill(`${dlg} input[data-setting="endpoint"]`, 'example.com');
    await page.fill(`${dlg} input[data-setting="apiKey"]`, 'sk-test');
    await page.fill(`${dlg} input[data-setting="timeout"]`, '60');
    await sleep(600);
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('YSRP_TranscriptSettings')));
    const secret = await page.$eval(`${dlg} input[data-setting="apiKey"]`, i => i.type === 'password' && Boolean(i.closest('.ysrp-secret')?.querySelector('.ysrp-secret-toggle')));
    const info = await page.textContent(`${dlg} .ysrp-custom[data-setting="currentVideo"] .ysrp-mono`);
    await closeAll(page);
    await openPlugin(page, 'Records');
    await page.click('.ysrp-record[data-video-id="a16tr"] .ysrp-ibtn.is-transcript');
    await sleep(1000);
    const text = await page.inputValue('.ysrp-transcript-dialog textarea');
    const rec = await record(page, 'a16tr');
    const ok = settings.endpoint === 'https://example.com/v1/chat/completions' && settings.apiKey === 'sk-test' && settings.timeoutMs === 3600000 &&
      secret && info === 'a16tr' && requestBody && requestBody.model === 'transcript' &&
      requestBody.messages[0].content === 'https://www.youtube.com/watch?v=a16tr' && auth === 'Bearer sk-test' &&
      text === 'hello transcript' && rec.videoTranscript === 'hello transcript';
    check('A-16', 'transcript plugin dialog saves settings (normalised), request format, response parsing, transcript dialog', ok,
      `${JSON.stringify(settings)}, secret ${secret}, info "${info}", body ${JSON.stringify(requestBody)}, auth ${auth}, text "${text}"`);
    await ctx.close();
  },

  async 'A-17'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a17lang');
    await sleep(2500);
    // N-5.7.4: the language is a setting of the Settings window plugin.
    await openPlugin(page, 'Settings');
    const before = await page.textContent('.ysrp-tab[data-tab-id="plugins"]');
    const inRow = await page.locator('.ysrp-plugin-dialog .ysrp-srow select[data-setting="language"]').count();
    await page.selectOption('.ysrp-plugin-dialog select[data-setting="language"]', 'en');
    await sleep(500);
    const after = await page.textContent('.ysrp-tab[data-tab-id="plugins"]');
    const stillOpen = await page.isVisible('.ysrp-settings-container');
    const dialogTitle = await page.textContent('.ysrp-plugin-dialog[data-plugin="Settings"] .ysrp-dialog-title');
    const selected = await page.inputValue('.ysrp-plugin-dialog select[data-setting="language"]');
    const stored = await page.evaluate(() => localStorage.getItem('YSRP_LanguagePreference'));
    await page.reload();
    await sleep(2500);
    const gearTitle = await page.getAttribute('.ysrp-settings-button', 'title');
    check('A-17', 'language switch in the Settings plugin dialog applies immediately, keeps the window and the dialog open and persists',
      before.trim() === '插件' && inRow === 1 && after.trim() === 'Plugins' && stillOpen && dialogTitle === 'Settings window' && selected === 'en' && stored === 'en' && gearTitle === 'Open settings',
      `"${before.trim()}" → "${after.trim()}", open ${stillOpen}, dialog "${dialogTitle}" (${selected}), stored ${stored}, after reload "${gearTitle}"`);
    await ctx.close();
  },

  async 'A-19'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { a19rec: { videoProgress: 20, saveDate: 1, videoName: 'R', originalTitle: 'R' } });
    await goto(page, 'v=a19plugins');
    await sleep(2000);
    await openSettings(page);
    await page.click('.ysrp-cat[data-cat="all"]');
    const names = await page.$$eval('.ysrp-plugin', els => els.map(e => e.dataset.plugin));
    const coreLocked = await page.$$eval('.ysrp-plugin[data-plugin="Engine"] .ysrp-switch', els => els[0].disabled);
    await page.click('.ysrp-switch[data-plugin="Transcript"]');
    await sleep(300);
    const activeTab = await page.evaluate(() => document.querySelector('.ysrp-settings-container').dataset.activeTab);
    await closeAll(page);
    // N-4.7: the menu entry and the card button disappear at once.
    await pressGear(page);
    const menuGone = !(await menuItems(page)).includes('Transcript');
    await page.click('.ysrp-plugin-menu .ysrp-menu-item[data-plugin="Records"]');
    await page.waitForSelector('.ysrp-record');
    const rowButtonGone = await page.locator('.ysrp-record .is-transcript').count() === 0;
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('YSRP_Plugins')).plugins.Transcript.enabled);
    await page.reload();
    await sleep(2000);
    await pressGear(page);
    const stillOff = !(await menuItems(page)).includes('Transcript');
    await page.keyboard.press('Escape');
    await openSettings(page);
    await page.click('.ysrp-cat[data-cat="all"]');
    await page.click('.ysrp-switch[data-plugin="Transcript"]');
    await sleep(300);
    await closeAll(page);
    await pressGear(page);
    const menuBack = (await menuItems(page)).includes('Transcript');
    await page.click('.ysrp-plugin-menu .ysrp-menu-item[data-plugin="Records"]');
    await page.waitForSelector('.ysrp-record');
    const back = menuBack && await page.locator('.ysrp-record .is-transcript').count() > 0;
    const expected = ['BadgeToggle', 'DriveSync', 'PluginsMenu', 'Records', 'TabSync', 'Toasts', 'Transcript', 'Engine', 'PlayerBadge', 'Settings', 'Storage'];
    check('A-19', 'plugins page lists plugins; turning Transcript off removes its menu entry and card button, persists, and comes back',
      JSON.stringify(names) === JSON.stringify(expected) && coreLocked && menuGone && activeTab === 'plugins' && rowButtonGone && stored === false && stillOff && back,
      `plugins ${names.join(',')}, core locked ${coreLocked}, menu entry gone ${menuGone} (page ${activeTab}), card button gone ${rowButtonGone}, stored ${stored}, after reload off ${stillOff}, back ${back}`);
    await ctx.close();
  },

  async 'A-20'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a20toggle');
    await sleep(2500);
    const toggles = await page.locator('.ysrp-badge-toggle').count();
    const beforeBadge = await page.evaluate(() => document.querySelector('.ysrp-badge-toggle').nextElementSibling.classList.contains('last-save-info-container'));
    const style = el => page.evaluate(() => { const b = document.querySelector('.last-save-info-container'); const cs = getComputedStyle(b); return `${cs.opacity}/${cs.pointerEvents}`; });
    const hiddenAtStart = await style();
    const playing = await page.evaluate(() => window.__mock.state.playing);
    await page.click('.ysrp-badge-toggle');
    const shown = await style();
    const playingAfter = await page.evaluate(() => window.__mock.state.playing);
    const clicks = await page.evaluate(() => window.__mock.state.clicks);
    await page.evaluate(() => document.querySelector('.last-save-info-container').remove());
    await sleep(1000);
    const afterRebuild = await style();
    const togglesAfterRebuild = await page.locator('.ysrp-badge-toggle').count();
    await page.click('.ysrp-badge-toggle');
    const hiddenAgain = await style();
    await openSettings(page);
    await page.click('.ysrp-cat[data-cat="all"]');
    await page.click('.ysrp-switch[data-plugin="BadgeToggle"]');
    await page.keyboard.press('Escape');
    const togglesOff = await page.locator('.ysrp-badge-toggle').count();
    const visibleOff = await style();
    check('A-20', 'badge toggle: one 💾 before the badge, hidden by default, toggles without touching playback, survives rebuilds, plugin off restores the badge',
      toggles === 1 && beforeBadge && hiddenAtStart === '0/none' && shown === '1/auto' && playing === playingAfter && clicks === 0 &&
      afterRebuild === '1/auto' && togglesAfterRebuild === 1 && hiddenAgain === '0/none' && togglesOff === 0 && visibleOff === '1/auto',
      `toggles ${toggles}, start ${hiddenAtStart}, click ${shown}, player clicks ${clicks}, rebuilt ${afterRebuild} (${togglesAfterRebuild}), again ${hiddenAgain}, plugin off ${togglesOff} ${visibleOff}`);
    await ctx.close();
  },

  async 'A-21'() {
    const ctx = await newContext();
    const drive = await driveMock(ctx);
    const folderId = drive.add({ name: '[Youtube] Video Memory', mimeType: 'application/vnd.google-apps.folder' }).id;
    drive.add({ name: 'Other｜a21other.json', parents: [folderId], modifiedTime: '2020-01-01T00:00:00.000Z', content: remotePayload('a21other', { videoProgress: 9 }) });
    await seedRaw(ctx, [gmSeed('YSRP_DriveSettings', JSON.stringify(DRIVE_CREDS)), ['YSRP_DriveFullSyncDone', '1'],
      ['Youtube_SaveResume_Progress-a21other', JSON.stringify({ videoProgress: 9, saveDate: 1, videoName: 'Other', updatedAt: 1 })]]);
    const page = await newPage(ctx);
    await goto(page, 'v=a21upload');
    await sleep(4500);
    const files = drive.inFolder().filter(f => f.name.endsWith('｜a21upload.json'));
    const payload = files[0] && JSON.parse(files[0].content);
    await sleep(6000);
    const uploadsIn10s = drive.uploads.filter(u => u.name.endsWith('｜a21upload.json')).length;
    await sleep(8000);
    const uploads = drive.uploads.filter(u => u.name.endsWith('｜a21upload.json'));
    const latest = JSON.parse(drive.inFolder().find(f => f.name.endsWith('｜a21upload.json')).content);
    const rec = await record(page, 'a21upload');
    await openPlugin(page, 'Records');
    await page.click('.ysrp-record[data-video-id="a21other"] .is-delete');
    await page.click('.ysrp-confirm-ok');
    await sleep(2500);
    const remaining = drive.files.filter(f => f.name.endsWith('｜a21other.json')).length;
    check('A-21', 'drive: progress uploads as "<title>｜<id>.json" in the folder, at most once per 15 s, delete removes the file',
      files.length === 1 && files[0].name === 'Original a21upload｜a21upload.json' && payload.version === '2' && payload.videoId === 'a21upload' &&
      payload.videoUrl === 'https://www.youtube.com/watch?v=a21upload' && typeof payload.record.videoProgress === 'number' && !('driveSync' in payload.record) &&
      uploadsIn10s === 1 && uploads.length === 2 && uploads[1].method === 'PATCH' && latest.record.videoProgress > 10 &&
      rec.driveSync && rec.driveSync.lastUploadAt > 0 && remaining === 0,
      `files ${files.map(f => f.name).join(',')}, uploads ${uploadsIn10s} in 10s, ${uploads.length} in 18s (${uploads.map(u => u.method).join('/')}), latest progress ${latest.record.videoProgress}, after delete ${remaining}`);
    await ctx.close();
  },

  async 'A-22'() {
    const ctx = await newContext();
    const drive = await driveMock(ctx);
    const folderId = drive.add({ name: '[Youtube] Video Memory', mimeType: 'application/vnd.google-apps.folder' }).id;
    const now = new Date().toISOString();
    drive.add({ name: 'R｜a22remote.json', parents: [folderId], modifiedTime: now, content: remotePayload('a22remote', { videoProgress: 120, saveDate: Date.now(), videoName: 'R', videoNote: 'from phone', updatedAt: Date.now() - 1000 }) });
    drive.add({ name: 'O｜a22old.json', parents: [folderId], modifiedTime: '2020-01-01T00:00:00.000Z', content: remotePayload('a22old', { videoProgress: 200, saveDate: 1, videoName: 'O' }) });
    await seedRaw(ctx, [gmSeed('YSRP_DriveSettings', JSON.stringify(DRIVE_CREDS)), ['YSRP_DriveFullSyncDone', '1'],
      ['Youtube_SaveResume_Progress-a22remote', JSON.stringify({ videoProgress: 30, saveDate: 1, videoName: 'R', updatedAt: Date.now() - 86400000 })],
      ['Youtube_SaveResume_Progress-a22old', JSON.stringify({ videoProgress: 40, saveDate: 1, videoName: 'O', updatedAt: Date.now() })]]);
    const page = await newPage(ctx);
    await goto(page, 'v=a22remote');
    await sleep(3000);
    const remoteTime = await playerTime(page);
    const remoteRec = await record(page, 'a22remote');
    await goto(page, 'v=a22old');
    await sleep(3000);
    const oldTime = await playerTime(page);
    check('A-22', 'drive: a newer remote record is applied before resuming; an older one does not overwrite local',
      remoteTime >= 119 && remoteTime < 126 && remoteRec.videoNote === 'from phone' && oldTime >= 39 && oldTime < 46,
      `newer remote → plays at ${remoteTime.toFixed(1)}s (note "${remoteRec.videoNote}"), older remote → plays at ${oldTime.toFixed(1)}s`);
    await ctx.close();
  },

  async 'A-23'() {
    const ctx = await newContext();
    const drive = await driveMock(ctx);
    const recs = ['a23one', 'a23two', 'a23three'].map(id => [`Youtube_SaveResume_Progress-${id}`, JSON.stringify({ videoProgress: 50, saveDate: 1, videoName: `Title ${id}` })]);
    await seedRaw(ctx, [gmSeed('YSRP_DriveSettings', JSON.stringify(DRIVE_CREDS)), ...recs]);
    const page = await newPage(ctx);
    await page.goto(`${ORIGIN}/`);
    await sleep(6000);
    const names = drive.inFolder().map(f => f.name).sort();
    const flag = await page.evaluate(() => localStorage.getItem('YSRP_DriveFullSyncDone'));
    const uploads = drive.uploads.length;
    await page.reload();
    await sleep(4500);
    check('A-23', 'drive: first configuration uploads every record once and sets the done flag',
      names.join(',') === 'Title a23one｜a23one.json,Title a23three｜a23three.json,Title a23two｜a23two.json' && flag === '1' && drive.uploads.length === uploads,
      `files ${names.join(',')}, flag ${flag}, uploads ${uploads} then ${drive.uploads.length} after reload`);
    await ctx.close();
  },

  async 'A-24'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a24dialog');
    await sleep(2000);
    // YouTube sets html { font-size: 10px }; the dialog must not shrink with it.
    await page.evaluate(() => { document.documentElement.style.fontSize = '10px'; });
    await openSettings(page);
    const size = await page.evaluate(() => {
      const r = document.querySelector('.ysrp-settings-container').getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    });
    const navWidth = await page.evaluate(() => Math.round(document.querySelector('.ysrp-nav').getBoundingClientRect().width));
    const footer = await page.$$eval('.ysrp-nav-footer .ysrp-version-line', ls => ls.map(l => l.textContent));
    const homeLink = await page.$eval('.ysrp-nav-footer a', a => a.getAttribute('href'));
    // N-5.3.5: one group with a single item, Plugins, always current.
    const groups = await page.$$eval('.ysrp-nav-group', els => els.length);
    const navItems = await page.$$eval('.ysrp-tab', els => els.map(e => `${e.dataset.tabId}:${e.textContent.trim()}:${e.classList.contains('is-active')}`).join(','));
    const visible = () => page.$$eval('.ysrp-plugin', els => els.filter(e => e.offsetParent).map(e => e.dataset.plugin).join(','));
    const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('YSRP_Plugins') || '{}'));
    // categories: Favorites by default (empty), All lists the core plugins after the separator
    const defaultCat = await page.$eval('.ysrp-cat.is-active', e => e.dataset.cat);
    const favEmpty = await page.isVisible('.ysrp-plugins-empty');
    await page.click('.ysrp-cat[data-cat="all"]');
    const layout = await page.evaluate(() => {
      const sep = document.querySelector('.ysrp-core-sep');
      const cards = [...document.querySelectorAll('.ysrp-plugin')];
      const after = c => Boolean(sep.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {
        sepShown: Boolean(sep.offsetParent),
        core: cards.filter(after).map(c => c.dataset.plugin).join(','),
        coreFlag: cards.filter(after).every(c => c.classList.contains('is-core')) && !cards.filter(c => !after(c)).some(c => c.classList.contains('is-core'))
      };
    });
    await page.fill('.ysrp-pane[data-pane="plugins"] .ysrp-search', '字幕');
    const searched = await visible();
    await page.fill('.ysrp-pane[data-pane="plugins"] .ysrp-search', '');
    await page.selectOption('.ysrp-pane[data-pane="plugins"] .ysrp-filter', 'disabled');
    const disabledOnly = await visible();
    const emptyShown = await page.isVisible('.ysrp-plugins .ysrp-empty');
    await page.selectOption('.ysrp-pane[data-pane="plugins"] .ysrp-filter', 'all');
    // star + pin are saved to YSRP_Plugins; a pinned plugin moves to the top; Favorites lists the starred one
    await page.click('.ysrp-plugin[data-plugin="Transcript"] .is-star');
    await page.click('.ysrp-plugin[data-plugin="Transcript"] .is-pin');
    const lists = await prefs();
    const firstCard = await page.$eval('.ysrp-plugin', e => e.dataset.plugin);
    await page.click('.ysrp-cat[data-cat="favorites"]');
    const favorites = await visible();
    await page.click('.ysrp-cat[data-cat="all"]');
    // plugin settings dialog: immediate save, reset through the confirm dialog
    await page.click('.ysrp-plugin[data-plugin="BadgeToggle"] .ysrp-plugin-config');
    const title = await page.textContent('.ysrp-plugin-dialog .ysrp-dialog-title');
    await page.click('.ysrp-plugin-dialog .ysrp-switch[data-setting="startHidden"]');
    const stored = async () => (await prefs()).plugins.BadgeToggle.startHidden;
    const afterToggle = await stored();
    await page.click('.ysrp-plugin-reset');
    const confirmShown = await page.locator('.ysrp-dialog.is-confirm').count();
    const afterOneClick = await stored();
    await page.keyboard.press('Escape');
    const escClosedConfirmOnly = await page.locator('.ysrp-dialog.is-confirm').count() === 0 && await page.locator('.ysrp-plugin-dialog').count() === 1;
    const afterCancel = await stored();
    await page.click('.ysrp-plugin-reset');
    await page.click('.ysrp-confirm-ok');
    const afterReset = await stored();
    const switchOn = await page.getAttribute('.ysrp-plugin-dialog .ysrp-switch[data-setting="startHidden"]', 'aria-checked');
    await page.keyboard.press('Escape');
    const dialogGone = await page.locator('.ysrp-dialog').count() === 0;
    const modalOpen = await page.isVisible('.ysrp-settings-container');
    const ok = size === '896x640' && navWidth === 224 && groups === 1 && navItems === 'plugins:插件:true' &&
      /^Video Memory • v\d+\.\d+\.\d+ • \((?:[0-9a-f]{4,}|dev)\)$/.test(footer[0] || '') && footer[1] === 'Production • Userscript' &&
      homeLink === 'https://github.com/0-V-linuxdo/Youtube-Memory' &&
      defaultCat === 'favorites' && favEmpty && layout.sepShown && layout.core === 'Engine,PlayerBadge,Settings,Storage' && layout.coreFlag &&
      searched === 'Transcript' && disabledOnly === '' && emptyShown &&
      JSON.stringify(lists.starred) === '["Transcript"]' && JSON.stringify(lists.pinned) === '["Transcript"]' && firstCard === 'Transcript' && favorites === 'Transcript' &&
      title === '徽标开关' && afterToggle === false && confirmShown === 1 && afterOneClick === false && escClosedConfirmOnly && afterCancel === false &&
      afterReset === true && switchOn === 'true' && dialogGone && modalOpen;
    check('A-24', 'plugins page: 896x640 under html 10px, 224px nav with the single item Plugins, two-line footer, Favorites/All, search and filter, star/pin saved, settings dialog saves, confirmed reset, Esc closes the top dialog first', ok,
      `size ${size}, nav ${navWidth}, groups ${groups} items ${navItems}, footer ${JSON.stringify(footer)}, default ${defaultCat} empty ${favEmpty}, core "${layout.core}" sep ${layout.sepShown}, search "${searched}", disabled "${disabledOnly}" empty ${emptyShown}, starred ${JSON.stringify(lists.starred)} pinned ${JSON.stringify(lists.pinned)} first ${firstCard}, favorites "${favorites}", title ${title}, stored ${afterToggle}/${afterOneClick}/${afterCancel}/${afterReset} confirm ${confirmShown} esc ${escClosedConfirmOnly}, switch ${switchOn}, dialog gone ${dialogGone}, modal open ${modalOpen}`);
    await ctx.close();
  },

  async 'A-25'() {
    // Everything is a plugin: the window has no feature pages; each feature's UI is only in its plugin dialog,
    // built from the N-5.2 parts; monochrome; colours follow the system scheme.
    const ctx = await newContext();
    const page = await seeded(ctx, {
      daa25: { videoProgress: 30, saveDate: 10, videoName: 'Unknown Title', videoDuration: 120, videoNote: 'n' },
      a25plain: { videoProgress: 10, saveDate: 20, videoName: 'Plain', originalTitle: 'Plain' }
    });
    await goto(page, 'v=a25look');
    await sleep(2500);
    await openSettings(page);
    await page.click('.ysrp-cat[data-cat="all"]');
    const shell = await page.evaluate(() => {
      const win = document.querySelector('.ysrp-settings-container');
      return {
        navIcons: [...win.querySelectorAll('.ysrp-tab')].map(t => `${t.dataset.tabId}:${[...t.querySelector('i').classList].find(c => c.startsWith('fa-') && c !== 'fa-solid')}`).join(','),
        panes: [...win.querySelectorAll('.ysrp-pane')].map(p => p.dataset.pane).join(','),
        features: win.querySelectorAll('.ysrp-record, .ysrp-storage-mode, select[data-setting="language"], input[data-setting="endpoint"], input[data-field="clientId"]').length,
        plugins: win.querySelectorAll('.ysrp-plugin').length,
        info: Boolean(win.querySelector('.ysrp-header .ysrp-info-hint'))
      };
    });
    await closeAll(page);
    // Each feature plugin's dialog: what is on screen, and where the feature's own control sits.
    const marker = {
      Storage: '.ysrp-srow select.ysrp-storage-mode',
      Settings: '.ysrp-srow select[data-setting="language"]',
      Transcript: '.ysrp-srow input[data-setting="endpoint"]',
      DriveSync: 'input[data-field="clientId"]'
    };
    const dialogs = {};
    for (const name of Object.keys(marker)) {
      await openPlugin(page, name);
      dialogs[name] = await page.evaluate(([n, sel]) => {
        const d = document.querySelector(`.ysrp-plugin-dialog[data-plugin="${n}"]`);
        return {
          rows: d.querySelectorAll('.ysrp-srow').length,
          radios: d.querySelectorAll('input[type="radio"], input[type="checkbox"], .ysrp-choice').length,
          cards: d.querySelectorAll('.ysrp-card').length,
          marker: d.querySelectorAll(sel).length,
          custom: d.querySelectorAll('.ysrp-custom').length
        };
      }, [name, marker[name]]);
      await closeAll(page);
    }
    await openPlugin(page, 'Records');
    await sleep(800);
    const records = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.ysrp-record')];
      return {
        n: cards.length,
        inDialog: cards.every(c => c.closest('.ysrp-plugin-dialog[data-plugin="Records"] .ysrp-custom')),
        cards: cards.every(c => c.classList.contains('ysrp-card') && c.querySelector(':scope > .ysrp-card-body .ysrp-card-top .ysrp-card-icon') && c.querySelector(':scope > .ysrp-card-sep + .ysrp-card-footer')),
        cols: new Set(cards.map(c => Math.round(c.getBoundingClientRect().left))).size,
        radius: [...new Set(cards.map(c => getComputedStyle(c).borderRadius))].join(','),
        leftBar: cards.some(c => { const cs = getComputedStyle(c); return cs.borderLeftWidth !== cs.borderRightWidth || cs.borderLeftColor !== cs.borderRightColor; }),
        inline: cards.some(c => c.querySelector('textarea, input, select, .ysrp-panel'))
      };
    });
    // Note / link open nested dialogs outside the card.
    await page.click('.ysrp-record[data-video-id="a25plain"] .is-note');
    const noteDialogOutside = await page.evaluate(() => { const d = document.querySelector('.ysrp-note-dialog'); return Boolean(d) && !d.closest('.ysrp-record'); });
    await page.keyboard.press('Escape');
    await page.click('.ysrp-record[data-video-id="a25plain"] .is-link');
    const linkDialogOutside = await page.evaluate(() => { const d = document.querySelector('.ysrp-link-dialog'); return Boolean(d) && !d.closest('.ysrp-record'); });
    await page.keyboard.press('Escape');
    const stillNoPanels = await page.$$eval('.ysrp-record', cards => cards.filter(c => c.querySelector('textarea, input, select, .ysrp-panel')).length);
    // Monochrome: no inline colours, no multi-colour SVG logos, icon buttons only in the grey / primary tokens.
    // (The pointer leaves the last-clicked button first so no colour transition is caught half-way.)
    await page.mouse.move(1, 1);
    await sleep(300);
    const mono = await page.evaluate(() => {
      const scope = [document.querySelector('.ysrp-settings-container'), ...document.querySelectorAll('.ysrp-dialog-layer')];
      const all = scope.flatMap(el => [el, ...el.querySelectorAll('*')]);
      const probe = v => { const d = document.createElement('div'); d.style.color = `var(${v})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      const allowed = new Set(['--ysrp-fg-primary', '--ysrp-fg-secondary', '--ysrp-fg-tertiary'].map(probe));
      const ibtns = scope.flatMap(el => [...el.querySelectorAll('.ysrp-ibtn')]);
      return {
        inlineColour: all.filter(el => /(^|;)\s*(color|background|background-color|fill|border-color)\s*:/i.test(el.getAttribute('style') || '')).length,
        svgFill: scope.reduce((n, el) => n + el.querySelectorAll('svg [fill]').length, 0),
        offPalette: ibtns.filter(b => !allowed.has(getComputedStyle(b).color)).map(b => b.className),
        ibtnCount: ibtns.length
      };
    });
    // Colours follow the system scheme live.
    const colours = async () => page.evaluate(() => ({
      modal: getComputedStyle(document.querySelector('.ysrp-settings-container')).backgroundColor,
      card: getComputedStyle(document.querySelector('.ysrp-record')).backgroundColor
    }));
    const light = await colours();
    await page.emulateMedia({ colorScheme: 'dark' });
    await sleep(200);
    const dark = await colours();
    await page.emulateMedia({ colorScheme: 'light' });
    const dialogsOk = Object.values(dialogs).every(d => d.marker === 1 && d.rows >= 1 && d.radios === 0 && d.cards === 0) && dialogs.Storage.custom === 3 && dialogs.DriveSync.custom === 2;
    const ok = shell.navIcons === 'plugins:fa-plug' && shell.panes === 'plugins' && shell.features === 0 && shell.plugins === 11 && shell.info &&
      dialogsOk && records.n === 3 && records.inDialog && records.cards && records.cols === 1 && records.radius === '8px' && !records.leftBar && !records.inline &&
      noteDialogOutside && linkDialogOutside && stillNoPanels === 0 &&
      mono.inlineColour === 0 && mono.svgFill === 0 && mono.offPalette.length === 0 && mono.ibtnCount > 0 &&
      light.modal === 'rgb(255, 255, 255)' && light.card === 'rgb(244, 244, 245)' && dark.modal === 'rgb(14, 14, 16)' && dark.card === 'rgb(20, 20, 22)';
    check('A-25', 'everything is a plugin: no feature pages or nav items; features only in their plugin dialogs, built from N-5.2 parts (settings-row drop-downs, single-column cards, no inline panels / capsules / left bars / colours); theme follows the system', ok,
      `shell ${JSON.stringify(shell)}, dialogs ${JSON.stringify(dialogs)}, records ${JSON.stringify(records)}, dialogs outside ${noteDialogOutside}/${linkDialogOutside}, mono ${JSON.stringify(mono)}, light ${JSON.stringify(light)}, dark ${JSON.stringify(dark)}`);
    await ctx.close();
  },


  async 'A-26'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a26menu');
    await sleep(2000);
    const choices = () => page.evaluate(() => (JSON.parse(localStorage.getItem('YSRP_Plugins') || '{}').plugins?.PluginsMenu || {}).menuPlugins);
    // N-5.9.4: the PluginsMenu dialog lists every plugin with a switch.
    await openPlugin(page, 'PluginsMenu');
    const dlg = '.ysrp-plugin-dialog[data-plugin="PluginsMenu"]';
    const listed = await page.$$eval(`${dlg} .ysrp-switch[data-menu-plugin]`, els => els.length);
    const defaults = await page.$$eval(`${dlg} .ysrp-switch[data-menu-plugin]`, els => Object.fromEntries(els.map(e => [e.dataset.menuPlugin, e.getAttribute('aria-checked')])));
    await page.click(`${dlg} .ysrp-switch[data-menu-plugin="Storage"]`);
    const storedOff = await choices();
    await closeAll(page);
    await pressGear(page);
    const withoutStorage = await menuItems(page);
    await page.keyboard.press('Escape');
    await openPlugin(page, 'PluginsMenu');
    await page.click(`${dlg} .ysrp-switch[data-menu-plugin="Storage"]`);
    await page.click(`${dlg} .ysrp-switch[data-menu-plugin="Engine"]`);
    const storedOn = await choices();
    await closeAll(page);
    await pressGear(page);
    const withStorage = await menuItems(page);
    await page.keyboard.press('Escape');
    // PluginsMenu off: every enabled plugin with visible settings, whatever was chosen.
    await openPlugin(page, 'PluginsMenu');
    await page.click(`${dlg} .ysrp-switch[data-menu-plugin="Storage"]`);
    await closeAll(page);
    await openSettings(page);
    await page.click('.ysrp-cat[data-cat="all"]');
    await page.click('.ysrp-switch[data-plugin="PluginsMenu"]');
    await closeAll(page);
    await pressGear(page);
    const fallback = await menuItems(page);
    // Choosing a plugin opens the window and that plugin's dialog; closing the dialog leaves the window open.
    await page.click('.ysrp-plugin-menu .ysrp-menu-item[data-plugin="DriveSync"]');
    const opened = await page.isVisible('.ysrp-settings-container') && await page.locator('.ysrp-plugin-dialog[data-plugin="DriveSync"]').count() === 1;
    await page.keyboard.press('Escape');
    const backToPage = await page.locator('.ysrp-dialog').count() === 0 && await page.isVisible('.ysrp-settings-container');
    const sorted = list => JSON.stringify(list.filter(x => x !== '#all').sort());
    const ok = listed === 11 && defaults.Storage === 'true' && defaults.Engine === 'false' && defaults.PlayerBadge === 'false' &&
      storedOff && storedOff.Storage === false && !withoutStorage.includes('Storage') && withoutStorage.includes('Records') && withoutStorage[withoutStorage.length - 1] === '#all' &&
      storedOn && storedOn.Storage === true && storedOn.Engine === true && withStorage.includes('Storage') && withStorage.includes('Engine') &&
      sorted(fallback) === JSON.stringify(['BadgeToggle', 'DriveSync', 'Records', 'Settings', 'Storage', 'Toasts', 'Transcript']) &&
      opened && backToPage;
    check('A-26', 'plugins menu plugin: switching a plugin off removes it from the gear menu and back on restores it (saved in menuPlugins); with the plugin off the menu lists every enabled plugin with settings; choosing one opens the window and its dialog', ok,
      `listed ${listed}, defaults ${JSON.stringify(defaults)}, stored ${JSON.stringify(storedOff)} → ${JSON.stringify(storedOn)}, menu without ${withoutStorage.join(',')}, with ${withStorage.join(',')}, fallback ${fallback.join(',')}, opened ${opened}, back ${backToPage}`);
    await ctx.close();
  },
  async 'A-27'() {
    const meta = fs.readFileSync(scriptPath.replace(/\.user\.js$/, '.meta.js'), 'utf8');
    const base = 'https://raw.githubusercontent.com/0-V-linuxdo/Youtube-Memory/main/userscript/%5BYoutube%5D%20Video%20Memory';
    const has = (text, key, url) => new RegExp(`^// @${key}\\s+${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(text);
    const ok = [userscript, meta].every(t => has(t, 'updateURL', `${base}.meta.js`) && has(t, 'downloadURL', `${base}.user.js`));
    check('A-27', 'script and .meta.js carry @updateURL / @downloadURL on the main branch', ok,
      `updateURL ${(meta.match(/@updateURL\s+(\S+)/) || [])[1]}, downloadURL ${(meta.match(/@downloadURL\s+(\S+)/) || [])[1]}`);
  },

  async 'A-28'() {
    const ctx = await newContext();
    const page = await seeded(ctx, {
      a28toast: { videoProgress: 50, saveDate: 1, videoName: 'Toast' },
      a28next: { videoProgress: 40, saveDate: 1, videoName: 'Next' }
    });
    await goto(page, 'v=a28toast');
    await page.waitForSelector('.ysrp-toast[data-toast-id="resume"]', { timeout: 8000 }).catch(() => null);
    const resumeText = await page.locator('.ysrp-toast[data-toast-id="resume"]').textContent().catch(() => '');
    const inBody = await page.evaluate(() => document.querySelector('.ysrp-toasts')?.parentElement === document.body);
    await sleep(5000);
    const goneAfter = await page.locator('.ysrp-toast[data-toast-id="resume"]').count() === 0;

    // Slider and disabled switch in the Toasts dialog.
    await openPlugin(page, 'Toasts');
    const dlg = '.ysrp-plugin-dialog[data-plugin="Toasts"]';
    await page.$eval(`${dlg} input.ysrp-slider[data-setting="duration"]`, el => {
      el.value = '2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const sliderLabel = await page.textContent(`${dlg} .ysrp-slider-value`);
    const storedDuration = await page.evaluate(() => JSON.parse(localStorage.getItem('YSRP_Plugins')).plugins.Toasts.duration);
    const cloudEnabledBefore = await page.$eval(`${dlg} .ysrp-switch[data-setting="cloud"]`, el => !el.disabled);
    await closeAll(page);
    await openSettings(page);
    await page.click('.ysrp-cat[data-cat="all"]');
    await page.click('.ysrp-switch[data-plugin="DriveSync"]');
    await page.click('.ysrp-plugin[data-plugin="Toasts"] .ysrp-plugin-config');
    const cloudDisabled = await page.$eval(`${dlg} .ysrp-switch[data-setting="cloud"]`, el => el.disabled && el.closest('.ysrp-srow').classList.contains('is-disabled'));
    const reason = await page.textContent(`${dlg} .ysrp-srow[data-setting="cloud"] .ysrp-srow-desc`);
    await page.keyboard.press('Escape');

    // Turning the plugin off: no more toasts.
    await page.click('.ysrp-switch[data-plugin="Toasts"]');
    await closeAll(page);
    await page.evaluate(() => window.__mock.nav('a28next'));
    await sleep(4000);
    const noToastWhenOff = await page.locator('.ysrp-toast').count() === 0;
    await ctx.close();

    // Persistent save failures: one toast only.
    const ctx2 = await newContext();
    const page2 = await newPage(ctx2);
    await page2.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).startsWith('Youtube_SaveResume_Progress-')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return original.call(this, k, v);
      };
    });
    await goto(page2, 'v=a28quota');
    await sleep(6000);
    const failToasts = await page2.locator('.ysrp-toast[data-type="error"]').count();
    const failText = await page2.locator('.ysrp-toast[data-toast-id="save-failed"]').textContent().catch(() => '');
    await ctx2.close();

    const ok = /已恢复到 0:50/.test(resumeText || '') && inBody && goneAfter && sliderLabel === '2 秒' && storedDuration === 2 &&
      cloudEnabledBefore && cloudDisabled && /需要开启云同步插件/.test(reason || '') && noToastWhenOff &&
      failToasts === 1 && /进度保存失败/.test(failText || '');
    check('A-28', 'toasts: resume toast that times out, slider saved, cloud switch disabled without Drive sync, none when the plugin is off, one toast for repeated save failures', ok,
      `resume "${resumeText}" body ${inBody} gone ${goneAfter}, slider "${sliderLabel}" stored ${storedDuration}, cloud ${cloudEnabledBefore}→disabled ${cloudDisabled} "${reason}", off ${noToastWhenOff}, failures ${failToasts} "${failText}"`);
  },

  async 'A-29'() {
    const ctx = await newContext();
    const p2 = await seeded(ctx, {
      a29x: { videoProgress: 30, saveDate: 3, videoName: 'X', videoDuration: 600 },
      a29del: { videoProgress: 10, saveDate: 2, videoName: 'Del', videoDuration: 600 },
      a29s: { videoProgress: 20, saveDate: 1, videoName: 'S', videoDuration: 600 }
    });
    await goto(p2, 'v=a29other');
    await sleep(2500);
    await openPlugin(p2, 'Records');
    const desc = id => p2.textContent(`.ysrp-record[data-video-id="${id}"] .ysrp-card-desc`).catch(() => null);
    const before = await desc('a29x');

    const p1 = await newPage(ctx);
    await goto(p1, 'v=a29x');
    await sleep(2500);
    await p1.evaluate(() => window.__mock.player.seekTo(200));
    await sleep(1500);
    const after = await desc('a29x');
    const listUpdated = before !== after && /3:2\d/.test(after || '');

    // Delete in p1, the card disappears in p2.
    await openPlugin(p1, 'Records');
    await p1.click('.ysrp-record[data-video-id="a29del"] .ysrp-ibtn.is-delete');
    await p1.click('.ysrp-confirm-ok, .ysrp-dialog.is-confirm .ysrp-btn.is-danger');
    await sleep(800);
    const deletedThere = await p2.locator('.ysrp-record[data-video-id="a29del"]').count() === 0;
    await closeAll(p1);

    // Plugin choice: Transcript off in p1, its card button disappears in p2.
    const buttonsBefore = await p2.locator('.ysrp-record .is-transcript').count();
    await openSettings(p1);
    await p1.click('.ysrp-cat[data-cat="all"]');
    await p1.click('.ysrp-switch[data-plugin="Transcript"]');
    await sleep(800);
    const buttonsAfter = await p2.locator('.ysrp-record .is-transcript').count();
    await closeAll(p1);

    // Language: English in p1, p2 follows.
    await openPlugin(p1, 'Settings');
    await p1.selectOption('select[data-setting="language"]', 'en');
    await sleep(1000);
    const p2Title = await p2.textContent('.ysrp-plugin-dialog .ysrp-dialog-title').catch(() => '');
    const p2Pref = await p2.evaluate(() => localStorage.getItem('YSRP_LanguagePreference'));
    await closeAll(p1);
    await closeAll(p2);

    // Stale tabs: p2 plays S in the background while p1 moves S to 250 s; then p2 pauses and closes.
    await p2.evaluate(() => window.__mock.nav('a29s'));
    await sleep(3000);
    await p2.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p1.evaluate(() => window.__mock.nav('a29s'));
    await sleep(3000);
    await p1.evaluate(() => { window.__mock.player.seekTo(250); window.__mock.pause(); });
    await sleep(3500);
    const whileHidden = (await record(p1, 'a29s')).videoProgress;
    const p2Time = await p2.evaluate(() => window.__mock.player.getCurrentTime());
    await p2.evaluate(() => window.__mock.pause());
    await sleep(300);
    await showBadge(p2);
    const p2Badge = await p2.textContent('.last-save-info-text');
    await p2.close({ runBeforeUnload: true });
    await sleep(500);
    const rec = await record(p1, 'a29s');
    await ctx.close();

    const ok = listUpdated && deletedThere && buttonsBefore > 0 && buttonsAfter === 0 && p2Title === 'Records' && p2Pref === 'en' &&
      whileHidden >= 249 && p2Time < 100 && rec && rec.videoProgress >= 249 && /4:1\d/.test(p2Badge || '');
    check('A-29', 'tab sync: progress, deletion, plugin choice and language reach the other tab; a paused stale tab does not overwrite newer progress', ok,
      `card "${before}" → "${after}", deleted ${deletedThere}, transcript buttons ${buttonsBefore} → ${buttonsAfter}, other tab title "${p2Title}" pref ${p2Pref}, background tab at ${p2Time.toFixed(1)}s, record while hidden ${whileHidden.toFixed(1)}, stale badge "${p2Badge}", record ${rec && rec.videoProgress.toFixed(1)}`);
  },

  async 'A-30'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a30valid');
    await sleep(2500);
    await openPlugin(page, 'Transcript');
    const dlg = '.ysrp-plugin-dialog[data-plugin="Transcript"]';
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('YSRP_TranscriptSettings') || '{}'));
    const state = async key => page.$eval(`${dlg} .ysrp-srow[data-setting="${key}"]`, row => ({
      error: row.querySelector('.ysrp-srow-error')?.textContent || '',
      invalid: row.querySelector('input')?.getAttribute('aria-invalid') === 'true'
    }));
    const results = {};
    for (const v of ['0', '61']) {
      await page.fill(`${dlg} input[data-setting="timeout"]`, v);
      await sleep(500);
      results[v] = { ...(await state('timeout')), saved: (await stored()).timeoutMs };
    }
    await page.fill(`${dlg} input[data-setting="timeout"]`, '5');
    await sleep(500);
    results['5'] = { ...(await state('timeout')), saved: (await stored()).timeoutMs };
    await page.fill(`${dlg} input[data-setting="endpoint"]`, 'ftp://x');
    await sleep(500);
    const ftp = { ...(await state('endpoint')), saved: (await stored()).endpoint };
    await ctx.close();
    const bad = r => /1–60/.test(r.error) && r.invalid && r.saved !== 0 && r.saved !== 61 * 60000;
    const ok = bad(results['0']) && bad(results['61']) && results['5'].error === '' && !results['5'].invalid && results['5'].saved === 300000 &&
      /http\(s\)/.test(ftp.error) && ftp.invalid && !/^ftp/.test(ftp.saved || '');
    check('A-30', 'setting validation: invalid timeout / endpoint show an error, are marked invalid and are not saved; a valid value clears the error and saves', ok, JSON.stringify({ ...results, ftp }));
  },

  async 'A-31'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a31deps');
    await sleep(2500);
    await openSettings(page);
    await page.click('.ysrp-cat[data-cat="all"]');
    const mark = (plugin, cls) => page.getAttribute(`.ysrp-plugin[data-plugin="${plugin}"] .${cls}`, 'title').catch(() => null);
    const requires = await mark('Transcript', 'is-deps-mark');
    const usedBy = await mark('Records', 'is-used-by-mark');
    const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('YSRP_Plugins')).plugins);
    const checked = name => page.getAttribute(`.ysrp-switch[data-plugin="${name}"]`, 'aria-checked');
    await page.click('.ysrp-switch[data-plugin="Records"]');
    await sleep(300);
    const offToast = await page.locator('.ysrp-toast[data-toast-id="plugin-deps"]').textContent().catch(() => '');
    const off = await prefs();
    const offSwitch = await checked('Transcript');
    await page.click('.ysrp-switch[data-plugin="Transcript"]');
    await sleep(300);
    const onToast = await page.locator('.ysrp-toast[data-toast-id="plugin-deps"]').textContent().catch(() => '');
    const on = await prefs();
    const recordsSwitch = await checked('Records');
    const menu = (await closeAll(page), await (async () => { await pressGear(page); const m = await menuItems(page); await closeAll(page); return m; })());
    await ctx.close();
    const ok = /依赖：记录/.test(requires || '') && /被以下插件依赖：字幕/.test(usedBy || '') &&
      off.Records.enabled === false && off.Transcript.enabled === false && offSwitch === 'false' && /已同时关闭：字幕/.test(offToast || '') &&
      on.Records.enabled === true && on.Transcript.enabled === true && recordsSwitch === 'true' && /已同时开启：记录/.test(onToast || '') &&
      menu.includes('Records') && menu.includes('Transcript');
    check('A-31', 'plugin dependencies: marks on both cards; disabling Records disables Transcript, enabling Transcript enables Records, each with a toast', ok,
      `requires "${requires}", used by "${usedBy}", off ${JSON.stringify([off.Records, off.Transcript])} switch ${offSwitch} toast "${offToast}", on ${JSON.stringify([on.Records, on.Transcript])} switch ${recordsSwitch} toast "${onToast}", menu ${menu.join(',')}`);
  },
};

const allErrors = [];
for (const [id, fn] of Object.entries(tests)) {
  if (only && !only.has(id)) continue;
  try {
    await fn();
  } catch (err) {
    check(id, 'threw', false, String(err && err.stack || err).split('\n').slice(0, 3).join(' | '));
  }
}

// A-18 is checked across every page the suite opened.
const ctxErr = await newContext();
const page = await newPage(ctxErr);
await goto(page, 'v=a18tt');
await sleep(2500);
for (const name of ['Storage', 'Transcript', 'DriveSync', 'Settings', 'PluginsMenu']) {
  await openPlugin(page, name);
  await closeAll(page);
}
await openPlugin(page, 'Records');
await page.click('.ysrp-record .ysrp-ibtn.is-note');
await page.click('.ysrp-note-dialog .ysrp-note-save');
await page.click('.ysrp-record .ysrp-ibtn.is-link');
await page.keyboard.press('Escape');
await page.click('.ysrp-record .ysrp-ibtn.is-delete');
await page.click('.ysrp-confirm-cancel');
await closeAll(page);
await openSettings(page);
await page.click('.ysrp-cat[data-cat="all"]');
await page.click('.ysrp-plugin[data-plugin="BadgeToggle"] .ysrp-plugin-config');
await page.keyboard.press('Escape');
await sleep(500);
const ttErrors = page.errors.filter(e => /Trusted|TypeError|ReferenceError/.test(e));
check('A-18', 'no Trusted Types / runtime errors with require-trusted-types-for', ttErrors.length === 0, ttErrors.join(' | '));
await ctxErr.close();

await browser.close();
server.close();
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(here, 'last-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
