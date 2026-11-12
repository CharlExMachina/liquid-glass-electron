// test:web: the shader's glass (browsers other than Chromium, over a backdropSource) against the compositor's.
//
// For every case of cases.js, Electron draws the glass as Chromium's compositor does and captures it: the reference,
// drawn fresh each run, so it belongs to no machine. It's drawn off screen, in sRGB: on screen Chromium composites in
// the display's colour space, and a display whose profile has another curve than sRGB's (many calibrated ones) gets
// the glass's maps converted, greys too, which moves everything under the glass by some px. Then the same case is drawn by the shader, in Electron itself
// (with LIQUID_GLASS_WEBGL) and in the Safari and Firefox on this Mac, and the glass's canvas is read back by the page
// (no screen capture). Inside the glass, each case has a limit on how far from the compositor's it may be
// (limits.json).
//
//   pnpm test:web                    every case in Electron, Safari and Firefox
//   pnpm test:web --browsers=electron,firefox     only these (electron needs no window on screen)
//   pnpm test:web --case=defaults    one case
//   pnpm test:web --calibrate        write limits.json from what the glass measures now, with room
//   pnpm test:web --self-check       bend half as much again on purpose; fails unless the cases that bend catch it
//   pnpm test:web --scale=2          the device scale to draw the reference at (the browsers' windows must be at it)
import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES } from './cases.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const ROOT = resolve(here('.'), '../..');
const argv = process.argv.slice(2);
const arg = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const calibrate = argv.includes('--calibrate'), selfCheck = argv.includes('--self-check');
const scale = Number(arg('scale') ?? 1);
const only = arg('case');
const browsers = (arg('browsers') ?? (selfCheck ? 'electron' : 'electron,safari,firefox')).split(',');
const cases = CASES.filter((c) => !only || c.name === only);
const limitsFile = here('./limits.json');
const limits = existsSync(limitsFile) ? JSON.parse(readFileSync(limitsFile, 'utf8')) : {};
// the room calibrate leaves over what was measured (the worst of the browsers)
const MEASURES = ['mean', 'rim', 'outliers'];
const room = (v, least) => +Math.max(v * 1.3 + least, least).toFixed(2);

app.commandLine.appendSwitch('force-device-scale-factor', String(scale));
nativeTheme.themeSource = 'light';
app.on('window-all-closed', () => {});

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The photos of demo/assets at the page's size, as PNGs: no browser scales or decodes them differently. */
function backdrops() {
  const out = {};
  for (const name of ['coast', 'ponds', 'alps', 'night']) {
    const img = nativeImage.createFromPath(join(ROOT, `demo/assets/${name}.jpg`));
    const { width, height } = img.getSize(), k = Math.max(640 / width, 400 / height);
    const w = Math.round(width * k), h = Math.round(height * k);
    out[name] = img.resize({ width: w, height: h, quality: 'best' }).crop({ x: Math.floor((w - 640) / 2), y: Math.floor((h - 400) / 2), width: 640, height: 400 }).toPNG();
  }
  return out;
}

/**
 * Inside the glass: the mean |difference| per channel (0..255), the same within 10 px of the edge (`rim`: where the
 * lens of frosted glass is, which the mean over all of it hardly sees), and the share of pixels off by more than 48.
 */
function compare(ref, got, res) {
  const a = ref.toBitmap(), b = got.toBitmap(), { width, height } = ref.getSize();
  const size = got.getSize();
  if (size.width !== width || size.height !== height) return { error: `sizes differ: the compositor's ${width} × ${height}, the shader's ${size.width} × ${size.height} (device scale ${res.dpr}; --scale=${res.dpr}?)` };
  const [, , w, h] = res.box, k = width / w, r = Math.min(res.radius, w / 2, h / 2);
  let sum = 0, out = 0, n = 0, rimSum = 0, rimN = 0;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const o = (j * width + i) * 4;
      // inside the shape by 1.5 px: the edge is antialiased by each in its own way
      let rim = false;
      if (res.free) {
        if (b[o + 3] < 255) continue;
        let whole = true;
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
          const x = i + Math.round(dx * k), y = j + Math.round(dy * k);
          if (x < 0 || y < 0 || x >= width || y >= height || b[(y * width + x) * 4 + 3] < 255) whole = false;
        }
        if (!whole) continue;
      } else {
        const x = (i + 0.5) / k - w / 2, y = (j + 0.5) / k - h / 2;
        const qx = Math.abs(x) - w / 2 + r, qy = Math.abs(y) - h / 2 + r;
        const d = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
        if (d > -1.5) continue;
        rim = d > -10;
      }
      let px = 0;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a[o + c] - b[o + c]);
        sum += d;
        if (rim) rimSum += d;
        px = Math.max(px, d);
      }
      if (rim) rimN++;
      if (px > 48) out++;
      n++;
    }
  }
  if (!n) return { error: 'no pixels inside the glass' };
  const mean = sum / (n * 3);
  return { mean, rim: rimN ? rimSum / (rimN * 3) : mean, outliers: (out / n) * 100 };
}

app.whenReady().then(async () => {
  const photos = backdrops();
  const outDir = here('./out');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const [name, png] of Object.entries(photos)) writeFileSync(join(outDir, `backdrop-${name}.png`), png);

  // what the browsers post: results per browser, and when each is done
  const posted = {}, done = {};
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const m = JSON.parse(body || '{}');
        if (url.pathname === '/result') (posted[m.browser] ??= []).push(m);
        if (url.pathname === '/done') done[m.browser]?.(m);
        res.end('ok');
      });
      return;
    }
    res.setHeader('cache-control', 'no-store');
    const photo = url.pathname.match(/^\/backdrop\/(\w+)\.png$/)?.[1];
    if (photo && photos[photo]) {
      res.setHeader('content-type', 'image/png');
      return res.end(photos[photo]);
    }
    const file = join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT) || !existsSync(file)) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/test/web/page.html`;

  /** A case in an Electron window: its result, and with `capture` the glass as the window shows it. */
  async function inElectron(c, mode, extra = '') {
    const win = new BrowserWindow({ width: 640, height: 400, useContentSize: true, show: false, focusable: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true } });
    const errors = [];
    win.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
    await win.loadURL(`${base}?mode=${mode}&case=${c.name}${extra}`);
    let result;
    for (let i = 0; i < 200 && !(result = await win.webContents.executeJavaScript('window.result')); i++) await sleep(50);
    result ??= { error: 'the page never finished' };
    if (errors.length) result.error = [result.error, ...errors].filter(Boolean).join(' | ');
    let shot = null;
    if (mode === 'ref' && !result.error) {
      await sleep(250);
      const [x, y, width, height] = c.box;
      shot = await win.webContents.capturePage({ x, y, width, height });
    }
    win.destroy();
    return { result, shot };
  }

  const refs = {};
  for (const c of cases) {
    if (c.expect === 'blur') continue;
    const { result, shot } = await inElectron(c, 'ref');
    if (result.error) {
      console.log(`FAIL ${c.name}: the reference: ${result.error}`);
      app.exit(1);
      return;
    }
    refs[c.name] = shot;
    writeFileSync(join(outDir, `${c.name}-compositor.png`), shot.toPNG());
  }

  /** Every case in a browser the system opens; its page posts each result. */
  async function inBrowser(browser) {
    posted[browser] = [];
    const finished = new Promise((r) => (done[browser] = r));
    const url = `${base}?mode=gl&run=all&browser=${browser}`;
    let close = () => {};
    if (browser === 'safari') {
      let running = true;
      try { execFileSync('pgrep', ['-x', 'Safari']); } catch { running = false; }
      execFileSync('open', ['-g', '-a', 'Safari', url]);
      // only what this opened is closed; Safari itself only if this started it
      close = () => {
        try {
          execFileSync('osascript', ['-e', running
            ? `tell application "Safari" to close (every tab of every window whose URL starts with "${base}")`
            : 'quit app "Safari"']);
        } catch {}
      };
    } else if (browser === 'firefox') {
      // a profile of its own, through LaunchServices (started as a child of this process, Firefox finds no profile)
      const dir = join(outDir, 'firefox-profile');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'user.js'), ['browser.shell.checkDefaultBrowser', 'browser.aboutwelcome.enabled', 'app.update.auto', 'app.update.enabled'].map((k) => `user_pref("${k}", false);`).join('\n')
        + '\nuser_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);\nuser_pref("termsofuse.bypassNotification", true);\nuser_pref("app.update.disabledForTesting", true);\n');
      execFileSync('open', ['-g', '-na', 'Firefox', '--args', '-profile', dir, '-no-remote', '-width', '900', '-height', '700', url]);
      close = () => {
        try { execFileSync('pkill', ['-f', dir]); } catch {}
        rmSync(dir, { recursive: true, force: true });
      };
    } else throw new Error(`no such browser: ${browser}`);
    const info = await Promise.race([finished, sleep(120_000).then(() => null)]);
    await sleep(300);
    close();
    if (!info) posted[browser].push({ name: 'page', error: `${browser} didn't finish within two minutes (is it installed, and may this terminal open it?)` });
    return posted[browser];
  }

  let failed = 0;
  const measured = {};
  for (const browser of browsers) {
    let results;
    if (browser === 'electron') {
      results = [];
      for (const c of cases) if (!(selfCheck && c.expect === 'blur')) results.push((await inElectron(c, 'gl', selfCheck ? '&wrong=1' : '')).result);
    } else results = (await inBrowser(browser)).filter((r) => !only || r.name === only || r.name === 'page');
    console.log(`\n${browser}`);
    let caught = 0;
    for (const res of results) {
      const c = cases.find((k) => k.name === res.name);
      let m = res.error ? { error: res.error } : null;
      if (!m && c?.expect === 'blur') {
        console.log(`ok   ${res.name.padEnd(13)} fell back to ${res.blur}`);
        continue;
      }
      if (!m) {
        const got = nativeImage.createFromDataURL(res.image);
        writeFileSync(join(outDir, `${res.name}-${browser}.png`), got.toPNG());
        m = compare(refs[res.name], got, res);
      }
      if (m.error || !c) {
        failed++;
        console.log(`FAIL ${String(res.name).padEnd(13)} ${m.error}`);
        continue;
      }
      const lim = limits[res.name];
      const worst = (measured[res.name] ??= { mean: 0, rim: 0, outliers: 0 });
      for (const k of MEASURES) worst[k] = Math.max(worst[k], m[k]);
      const over = !lim ? ['no limits (pnpm test:web --calibrate)'] : MEASURES.filter((k) => m[k] > lim[k]).map((k) => `${k} ${m[k].toFixed(2)} > ${lim[k]}`);
      const ok = calibrate || !over.length;
      if (selfCheck) {
        if (over.length) caught++;
        console.log(`${over.length ? 'caught' : 'MISSED'} ${res.name.padEnd(13)} mean ${m.mean.toFixed(2)}  rim ${m.rim.toFixed(2)}  outliers ${m.outliers.toFixed(2)}%`);
        continue;
      }
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${res.name.padEnd(13)} mean ${m.mean.toFixed(2)}  rim ${m.rim.toFixed(2)}  outliers ${m.outliers.toFixed(2)}%${ok ? '' : `  ${over.join(', ')}`}`);
    }
    if (selfCheck) {
      console.log(`${caught} of ${results.length} cases caught the glass bent wrong`);
      if (caught < results.length) failed++;
    } else if (results.filter((r) => r.name !== 'page').length < cases.length) {
      failed++;
      console.log(`FAIL only ${results.length} of ${cases.length} cases came back`);
    }
  }
  server.close();
  if (calibrate && !failed) {
    for (const [name, m] of Object.entries(measured)) limits[name] = { mean: room(m.mean, 0.3), rim: room(m.rim, 0.3), outliers: room(m.outliers, 0.2) };
    writeFileSync(limitsFile, `${JSON.stringify(limits, null, 2)}\n`);
    console.log(`\nlimits written (${Object.keys(measured).length} cases, from ${browsers.join(', ')})`);
  }
  console.log(failed ? `\n${failed} failed (what each drew: test/web/out/)` : '\nall passed');
  app.exit(failed ? 1 : 0);
});
