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
    await page.click('.ysrp-settings-button');
    const visible = await page.isVisible('.ysrp-settings-container');
    const playingAfter = await page.evaluate(() => window.__mock.state.playing);
    const clicks = await page.evaluate(() => window.__mock.state.clicks);
    const host = await page.evaluate(() => document.querySelector('.ysrp-settings-container').parentElement.id);
    await page.keyboard.press('Escape');
    const closedByEsc = !(await page.isVisible('.ysrp-settings-container'));
    await page.click('.ysrp-settings-button');
    await page.mouse.click(5, 5);
    const closedByBackdrop = !(await page.isVisible('.ysrp-settings-container'));
    await page.click('.ysrp-settings-button');
    await page.click('.ysrp-close');
    const closedByX = !(await page.isVisible('.ysrp-settings-container'));
    const overflow = await page.evaluate(() => document.body.style.overflow);
    check('A-13', 'gear opens the dialog outside the player without touching playback; ✖/backdrop/Esc close it',
      visible && playingBefore === playingAfter && clicks === 0 && host === 'content' && closedByEsc && closedByBackdrop && closedByX && overflow === '',
      `visible ${visible}, player clicks ${clicks}, host #${host}, esc ${closedByEsc}, backdrop ${closedByBackdrop}, ✖ ${closedByX}`);
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
    await page.click('.ysrp-settings-button');
    await sleep(800);
    const ids = await page.$$eval('.ysrp-row', rows => rows.map(r => r.dataset.videoId));
    const heading = await page.textContent('.ysrp-header h3');
    const pct = await page.textContent('.ysrp-row[data-video-id="daolder"] .ysrp-pct');
    const legacyPct = await page.textContent('.ysrp-row[data-video-id="plainnew"] .ysrp-pct');
    // Every panel (link, note, transcript) starts collapsed.
    const openPanels = await page.$$eval('.ysrp-panel', ps => ps.filter(p => getComputedStyle(p).display !== 'none').length);
    const daTitle = await page.textContent('.ysrp-row[data-video-id="daolder"] .ysrp-title');
    const plainTitle = await page.textContent('.ysrp-row[data-video-id="plainnew"] .ysrp-title');
    const plainHasDa = await page.locator('.ysrp-row[data-video-id="plainnew"] .ysrp-da').count();
    await page.click('.ysrp-row[data-video-id="daolder"] .ysrp-da');
    const toggled = await page.textContent('.ysrp-row[data-video-id="daolder"] .ysrp-title');
    // note
    await page.click('.ysrp-row[data-video-id="plainnew"] .ysrp-ibtn.is-note');
    await page.fill('.ysrp-row[data-video-id="plainnew"] .ysrp-note-container textarea', '  hello note  ');
    await page.click('.ysrp-row[data-video-id="plainnew"] .ysrp-ibtn.is-note');
    const noted = await record(page, 'plainnew');
    // link + copy
    await page.click('.ysrp-row[data-video-id="plainnew"] .ysrp-ibtn.is-link');
    const urlRow = await page.$eval('.ysrp-row[data-video-id="plainnew"] .ysrp-url', el => getComputedStyle(el).flexDirection + '/' + el.getBoundingClientRect().height);
    await page.click('.ysrp-row[data-video-id="plainnew"] .ysrp-url .ysrp-ibtn.is-link');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    // delete
    await page.click('.ysrp-row[data-video-id="daolder"] .ysrp-ibtn.is-delete');
    const afterDelete = await page.$$eval('.ysrp-row', rows => rows.map(r => r.dataset.videoId));
    const heading2 = await page.textContent('.ysrp-header h3');
    const ok = ids[0] === 'a14current' && ids.join() === 'a14current,plainnew,daolder' && heading.includes('(3)') &&
      pct === '25.0%' && legacyPct === '0:10' && openPanels === 0 && urlRow.startsWith('row/') && parseFloat(urlRow.split('/')[1]) < 60 && daTitle === 'DeArrow daolder' && toggled === 'Original daolder' && plainTitle === 'Original plainnew' &&
      plainHasDa === 0 && noted.videoNote === 'hello note' && clip === 'https://www.youtube.com/watch?v=plainnew' &&
      afterDelete.join() === 'a14current,plainnew' && heading2.includes('(2)') && !(await record(page, 'daolder'));
    check('A-14', 'records tab: ordering, count, %, DeArrow toggle, note, copy link, delete', ok,
      `order ${ids.join()}, "${heading}", pct ${pct}/${legacyPct}, open panels ${openPanels}, url row ${urlRow}, titles "${daTitle}"/"${toggled}"/"${plainTitle}", note "${noted.videoNote}", clip ${clip}, after delete ${afterDelete.join()} "${heading2}"`);
    await ctx.close();
  },

  async 'A-15'() {
    const ctx = await newContext();
    const page = await seeded(ctx, { s1: { videoProgress: 11, saveDate: 1, videoName: 'S1' }, s2: { videoProgress: 22, saveDate: 2, videoName: 'S2' } });
    await goto(page, 'v=a15store');
    await sleep(3000);
    await page.click('.ysrp-settings-button');
    await page.click('.ysrp-tab[data-tab-id="storage"]');
    await page.click('.ysrp-choice[data-value="gm"]');
    await page.click('.ysrp-pane[data-pane="storage"] .ysrp-btn >> nth=0');
    const state = await page.evaluate(() => ({
      local: Object.keys(localStorage).filter(k => k.startsWith('Youtube_SaveResume_Progress-')).length,
      gm: GM_listValues().filter(k => k.startsWith('Youtube_SaveResume_Progress-')).length,
      mode: localStorage.getItem('YSRP_StorageMode'),
      badge: document.querySelector('.ysrp-badge').textContent
    }));
    // export -> clipboard, wipe one record, overwrite-import
    await page.click('.ysrp-pane[data-pane="storage"] .ysrp-card >> nth=1 >> .ysrp-btn >> nth=0');
    const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
    await page.evaluate(() => { GM_deleteValue('Youtube_SaveResume_Progress-s1'); GM_setValue('Youtube_SaveResume_Progress-junk', '{}'); });
    await page.check('.ysrp-overwrite');
    await page.fill('.ysrp-pane[data-pane="storage"] textarea', JSON.stringify(exported));
    await page.click('.ysrp-pane[data-pane="storage"] .ysrp-card >> nth=2 >> .ysrp-btn >> nth=0');
    const msg = await page.textContent('.ysrp-pane[data-pane="storage"] .ysrp-card >> nth=2 >> .ysrp-msg >> nth=-1');
    const after = await page.evaluate(() => GM_listValues().filter(k => k.startsWith('Youtube_SaveResume_Progress-')).sort());
    const s1 = await page.evaluate(() => JSON.parse(GM_getValue('Youtube_SaveResume_Progress-s1')));
    const ok = state.local === 0 && state.gm === 3 && state.mode === 'gm' && state.badge === 'GM 存储' &&
      exported.version === '1' && exported.storageMode === 'gm' && Object.keys(exported.entries).length === 3 &&
      after.length === 3 && !after.includes('Youtube_SaveResume_Progress-junk') && s1.videoProgress === 11 && /已导入 3 条记录/.test(msg);
    check('A-15', 'storage tab: migrate to GM, export, overwrite import round trip', ok,
      `${JSON.stringify(state)}, exported ${Object.keys(exported.entries).length}, after import ${after.length}, msg "${msg}"`);
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
    await page.click('.ysrp-settings-button');
    await page.click('.ysrp-tab[data-tab-id="transcript"]');
    await page.fill('.ysrp-pane[data-pane="transcript"] input >> nth=0', 'example.com');
    await page.fill('.ysrp-pane[data-pane="transcript"] input >> nth=2', 'sk-test');
    await page.fill('.ysrp-pane[data-pane="transcript"] input >> nth=3', '99');
    await sleep(600);
    const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('YSRP_TranscriptSettings')));
    const info = await page.textContent('.ysrp-pane[data-pane="transcript"] .ysrp-mono');
    await page.click('.ysrp-tab[data-tab-id="records"]');
    await page.click('.ysrp-row[data-video-id="a16tr"] .ysrp-ibtn.is-transcript');
    await sleep(1000);
    const text = await page.inputValue('.ysrp-row[data-video-id="a16tr"] .ysrp-transcript-container textarea');
    const rec = await record(page, 'a16tr');
    const ok = settings.endpoint === 'https://example.com/v1/chat/completions' && settings.apiKey === 'sk-test' && settings.timeoutMs === 3600000 &&
      info === 'a16tr' && requestBody && requestBody.model === 'transcript' &&
      requestBody.messages[0].content === 'https://www.youtube.com/watch?v=a16tr' && auth === 'Bearer sk-test' &&
      text === 'hello transcript' && rec.videoTranscript === 'hello transcript';
    check('A-16', 'transcript settings, request format and response parsing', ok,
      `${JSON.stringify(settings)}, body ${JSON.stringify(requestBody)}, auth ${auth}, text "${text}"`);
    await ctx.close();
  },

  async 'A-17'() {
    const ctx = await newContext();
    const page = await newPage(ctx);
    await goto(page, 'v=a17lang');
    await sleep(2500);
    await page.click('.ysrp-settings-button');
    const before = await page.textContent('.ysrp-tab[data-tab-id="records"]');
    await page.click('.ysrp-tab[data-tab-id="display"]');
    await page.click('.ysrp-language-options .ysrp-choice[data-value="en"]');
    await sleep(500);
    const after = await page.textContent('.ysrp-tab[data-tab-id="records"]');
    const stillOpen = await page.isVisible('.ysrp-settings-container');
    const tab = await page.evaluate(() => document.querySelector('.ysrp-settings-container').dataset.activeTab);
    const stored = await page.evaluate(() => localStorage.getItem('YSRP_LanguagePreference'));
    await page.reload();
    await sleep(2500);
    const gearTitle = await page.getAttribute('.ysrp-settings-button', 'title');
    check('A-17', 'language switch applies immediately, keeps the dialog open and persists',
      before.trim() === '记录' && after.trim() === 'Records' && stillOpen && tab === 'display' && stored === 'en' && gearTitle === 'Open settings',
      `"${before.trim()}" → "${after.trim()}", open ${stillOpen}, tab ${tab}, stored ${stored}, after reload "${gearTitle}"`);
    await ctx.close();
  }
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
await page.click('.ysrp-settings-button');
for (const tab of ['records', 'storage', 'transcript', 'display']) await page.click(`.ysrp-tab[data-tab-id="${tab}"]`);
await page.click('.ysrp-tab[data-tab-id="records"]');
await page.click('.ysrp-row .ysrp-ibtn.is-note');
await page.click('.ysrp-row .ysrp-note-container .ysrp-ibtn');
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
