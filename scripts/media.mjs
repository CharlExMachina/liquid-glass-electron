// The README's media: a screenshot, an MP4 and a GIF of each demo, in docs/media/ (ignored here: they live on the
// repository's media branch, so that installing from GitHub doesn't download them). npm run media (needs ffmpeg).
//
//   node scripts/media.mjs [--only=toolbar,morph] [--seconds=n] [--recorder=fast|demo] [--no-shots] [--no-video]
//                          [--fps=30] [--gif-mb=4] [--out=docs/media] [--keep]
//
// Screenshots come from demo/main.mjs --shot. Recordings come, by default, from this file run as Electron's main
// script (the fast recorder): demo/main.mjs --record encodes a PNG inside the frame callback, which takes ~250 ms at
// 1480×950 and so captures only ~4 frames a second; here each frame is kept as a raw bitmap instead (~1 ms), which
// keeps up with the compositor. --recorder=demo uses demo/main.mjs --record anyway.
//
// Frames arrive only when something changes, so they are irregular: both recorders turn them into a constant frame
// rate (each output frame shows the latest frame drawn by then; the last is held half a second), into a lossless
// intermediate from which the MP4 and the GIF are cut. Electron always runs through scripts/electron.mjs with
// LG_ASIDE=1, which puts the window on the second display without focus.
import { spawn } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.includes('=') ? hit.slice(name.length + 3) : true;
};

const DEMOS = ['toolbar', 'tabbar', 'scroll', 'controls', 'buttons', 'toasts', 'morph', 'container', 'drag', 'dock', 'video', 'magnifier', 'appearance', 'playground', 'ios'];
// seconds recorded, for the demos that act out more than the usual 7
const LONG = { video: 10, scroll: 10, morph: 10, container: 10, ios: 16 };
const LIGHT = new Set(['toolbar', 'appearance']); // these also get a light screenshot
const MP4_WIDTH = 1180;
const GIF_WIDTH = 760;
const HOLD = 0.5; // seconds the last frame stays up

// no top-level await: in Electron that would hold up the main module (and app's ready) until recording ends
const run = process.versions.electron ? recorder : main;
run().catch((e) => {
  console.error(e);
  process.exit(1);
});

// ---------------------------------------------------------------------------------------------------------------------
// The fast recorder (runs inside Electron). Mirrors demo/main.mjs's window, then writes every frame for --seconds as
// raw BGRA into one file, keeping only the last frame of each 1/fps slot (the others would never be shown).
async function recorder() {
  const { app, BrowserWindow, nativeTheme, screen } = await import('electron');
  const out = arg('record-child'), page = arg('page', 'toolbar'), seconds = Number(arg('seconds', 7)), fps = Number(arg('fps', 30));
  const theme = arg('theme');
  if (theme) nativeTheme.themeSource = theme;
  if (process.platform === 'linux') app.commandLine.appendSwitch('disable-accelerated-video-decode'); // as demo/main.mjs
  await app.whenReady();
  let place = {};
  if (process.env.LG_ASIDE) {
    const primary = screen.getPrimaryDisplay();
    const d = screen.getAllDisplays().find((x) => x.id !== primary.id) ?? primary;
    place = { x: d.bounds.x + 60, y: d.bounds.y + 60, focusable: false };
  }
  const [W, H] = arg('size', '1180x760').split('x').map(Number);
  const win = new BrowserWindow({
    width: W, height: H, useContentSize: true, show: false, backgroundColor: '#111', title: 'liquid-glass-electron', ...place,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  const errors = [];
  win.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
  await win.loadFile(join(ROOT, 'demo/index.html'), { hash: page });
  if (process.env.LG_ASIDE) {
    win.showInactive();
    win.setPosition(place.x, place.y);
  } else win.show();
  for (let i = 0; i < 200 && !(await win.webContents.executeJavaScript('!!window.demoReady')); i++) await sleep(50);
  await sleep(Number(arg('wait', 1500)));

  mkdirSync(out, { recursive: true });
  const fd = openSync(join(out, 'frames.bgra'), 'w');
  const times = [];
  let size = null, pending = null, superseded = 0, odd = 0;
  const slot = (t) => Math.ceil((t * fps) / 1000);
  const flush = () => {
    if (!pending) return;
    writeSync(fd, pending.buf);
    times.push(pending.t);
    pending = null;
  };
  const t0 = performance.now();
  win.webContents.beginFrameSubscription(false, (image) => {
    const t = performance.now() - t0;
    if (t > seconds * 1000) return;
    const buf = image.toBitmap();
    const s = image.getSize();
    size ??= s;
    if (s.width !== size.width || s.height !== size.height || buf.length !== s.width * s.height * 4) return void odd++;
    if (pending && slot(pending.t) === slot(t)) superseded++;
    else flush();
    pending = { t, buf };
  });
  const playStart = performance.now() - t0;
  let playEnd = null;
  win.webContents.executeJavaScript('Promise.resolve(window.demoPlay?.()).then(() => true)')
    .then(() => (playEnd = performance.now() - t0), (e) => errors.push(`play(): ${e.message}`));
  await sleep(seconds * 1000 + 300);
  win.webContents.endFrameSubscription();
  flush();
  closeSync(fd);
  writeFileSync(join(out, 'meta.json'), JSON.stringify({ width: size?.width, height: size?.height, fps, times, playStart, playEnd, superseded, odd, errors }));
  app.quit();
}

// ---------------------------------------------------------------------------------------------------------------------
// The pipeline (runs in Node).
async function main() {
  const out = resolve(ROOT, arg('out', 'docs/media'));
  const fps = Number(arg('fps', 30));
  const gifMax = Number(arg('gif-mb', 4)) * 1024 * 1024;
  const fast = arg('recorder', 'fast') !== 'demo';
  const only = arg('only') ? String(arg('only')).split(',').map((s) => s.trim()).filter(Boolean) : DEMOS;
  const ids = only.filter((id) => {
    if (existsSync(join(ROOT, `demo/demos/${id}.js`))) return true;
    console.log(`skip ${id}: no demo/demos/${id}.js`);
    return false;
  });
  mkdirSync(out, { recursive: true });
  const made = [];
  const notes = [];

  for (const id of ids) {
    if (!arg('no-shots')) {
      for (const theme of LIGHT.has(id) ? ['dark', 'light'] : ['dark']) {
        const name = theme === 'dark' ? id : `${id}-${theme}`;
        const png = join(tmpdir(), `lg-shot-${name}.png`), file = join(out, `${name}.jpg`);
        console.log(`${id}: screenshot (${theme})`);
        await electron(['demo/main.mjs', `--page=${id}`, `--shot=${png}`, '--wait=1500', `--theme=${theme}`]);
        // a JPEG at high quality: a tenth of the PNG's size, for the README
        if (existsSync(png)) {
          await ffmpeg(['-i', png, '-q:v', '3', file]);
          rmSync(png);
        }
        if (existsSync(file)) made.push(file);
        else notes.push(`${id}: no ${theme} screenshot`);
      }
    }
    if (arg('no-video')) continue;

    const seconds = Number(arg('seconds', LONG[id] ?? 7));
    const tmp = mkdtempSync(join(tmpdir(), `lg-media-${id}-`));
    try {
      console.log(`${id}: recording ${seconds} s (${fast ? 'fast' : 'demo/main.mjs'} recorder)`);
      const cfr = join(tmp, 'cfr.mkv');
      const info = fast ? await recordFast(id, seconds, fps, tmp, cfr) : await recordDemo(id, seconds, fps, tmp, cfr);
      if (!info) {
        notes.push(`${id}: no frames recorded`);
        continue;
      }
      notes.push(`${id}: ${info}`);
      const mp4 = join(out, `${id}.mp4`), gif = join(out, `${id}.gif`);
      console.log(`${id}: encoding mp4`);
      await ffmpeg(['-i', cfr, '-vf', `scale=${MP4_WIDTH}:-2:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-r', String(fps),
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-movflags', '+faststart', '-an', mp4]);
      made.push(mp4);
      const used = await encodeGif(cfr, gif, gifMax, tmp);
      made.push(gif);
      if (used) notes.push(`${id}: gif ${used}`);
    } finally {
      if (arg('keep')) console.log(`${id}: kept ${tmp}`);
      else rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log(`\n${'file'.padEnd(39)}${'size'.padStart(10)}`);
  for (const f of made) console.log(relative(ROOT, f).padEnd(39) + kb(statSync(f).size).padStart(10));
  if (notes.length) console.log(`\n${notes.join('\n')}`);
}

// Fast recorder → constant frame rate: output frame k shows the latest frame drawn by k/fps (the first frame before
// that), piped raw into a lossless intermediate.
async function recordFast(id, seconds, fps, tmp, cfr) {
  await electron(['scripts/media.mjs', `--record-child=${tmp}`, `--page=${id}`, `--seconds=${seconds}`, `--fps=${fps}`, `--theme=${arg('theme', 'dark')}`, '--wait=1500']);
  if (!existsSync(join(tmp, 'meta.json'))) return null;
  const meta = JSON.parse(readFileSync(join(tmp, 'meta.json'), 'utf8'));
  const { width, height, times } = meta;
  if (!times.length) return null;
  const bytes = width * height * 4;
  const end = times.at(-1) + HOLD * 1000;
  const count = Math.ceil((end * fps) / 1000);
  const ff = spawn('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr0', '-s', `${width}x${height}`,
    '-r', String(fps), '-i', '-', '-c:v', 'ffv1', '-threads', '8', '-slices', '16', cfr], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = exited(ff, 'ffmpeg (intermediate)');
  const fd = openSync(join(tmp, 'frames.bgra'), 'r');
  const buf = Buffer.alloc(bytes);
  let i = 0;
  for (let k = 0; k < count; k++) {
    while (i + 1 < times.length && times[i + 1] <= (k * 1000) / fps) i++;
    readSync(fd, buf, 0, bytes, i * bytes);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  closeSync(fd);
  ff.stdin.end();
  await done;
  const gaps = times.slice(1).map((t, j) => t - times[j]);
  const before = times.filter((t) => t < meta.playStart).length;
  return [`${times.length} frames kept (${meta.superseded} superseded within a slot) over ${(times.at(-1) / 1000).toFixed(2)} s`,
    `→ ${count} frames at ${fps} fps (${(count / fps).toFixed(2)} s)`,
    `first frame ${times[0].toFixed(0)} ms, play() ${meta.playStart.toFixed(0)}–${meta.playEnd?.toFixed(0) ?? 'still running'} ms, ${before} frame(s) before play()`,
    `longest gap ${gaps.length ? Math.max(...gaps).toFixed(0) : 0} ms`,
    meta.odd ? `${meta.odd} frames of another size dropped` : '',
    meta.errors.length ? `page errors: ${[...new Set(meta.errors)].join(' | ')}` : '']
    .filter(Boolean).join('; ');
}

// demo/main.mjs --record → constant frame rate via an ffconcat list whose durations are the gaps between frames.
async function recordDemo(id, seconds, fps, tmp, cfr) {
  await electron(['demo/main.mjs', `--page=${id}`, `--record=${tmp}`, `--seconds=${seconds}`, `--theme=${arg('theme', 'dark')}`, '--wait=1500']);
  if (!existsSync(join(tmp, 'times.json'))) return null;
  const times = JSON.parse(readFileSync(join(tmp, 'times.json'), 'utf8'));
  if (!times.length) return null;
  const name = (i) => `f${String(i).padStart(5, '0')}.png`;
  const lines = ['ffconcat version 1.0'];
  times.forEach((t, i) => {
    const d = i + 1 < times.length ? (times[i + 1] - (i ? t : 0)) / 1000 : HOLD; // the first frame also covers 0…t0
    lines.push(`file '${name(i)}'`, `duration ${d.toFixed(4)}`);
  });
  lines.push(`file '${name(times.length - 1)}'`); // the concat demuxer ignores the last entry's duration
  writeFileSync(join(tmp, 'list.ffconcat'), `${lines.join('\n')}\n`);
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.ffconcat'), '-vf', `fps=${fps}`, '-c:v', 'ffv1', '-threads', '8', '-slices', '16', cfr]);
  const gaps = times.slice(1).map((t, j) => t - times[j]);
  return `${times.length} PNG frames over ${(times.at(-1) / 1000).toFixed(2)} s (≈${(times.length / Math.max(times.at(-1) / 1000, 0.001)).toFixed(1)} fps captured), longest gap ${gaps.length ? Math.max(...gaps) : 0} ms`;
}

// GIF: palettegen in diff mode, then paletteuse; step down until it fits.
async function encodeGif(src, gif, max, tmp) {
  const tries = [
    { fps: 15, width: GIF_WIDTH, dither: 'sierra2_4a' },
    { fps: 15, width: GIF_WIDTH, dither: 'bayer:bayer_scale=3' },
    { fps: 12, width: GIF_WIDTH, dither: 'bayer:bayer_scale=3' },
    { fps: 12, width: 680, dither: 'bayer:bayer_scale=3' },
    { fps: 10, width: 600, dither: 'bayer:bayer_scale=3' },
    { fps: 8, width: 520, dither: 'bayer:bayer_scale=3' },
  ];
  const palette = join(tmp, 'palette.png');
  for (const [n, t] of tries.entries()) {
    console.log(`${gif.split('/').at(-1)}: ${t.fps} fps, ${t.width} px, ${t.dither}`);
    const pre = `fps=${t.fps},scale=${t.width}:-2:flags=lanczos`;
    await ffmpeg(['-i', src, '-vf', `${pre},palettegen=stats_mode=diff`, palette]);
    const out = join(tmp, `try${n}.gif`);
    await ffmpeg(['-i', src, '-i', palette, '-lavfi', `${pre}[v];[v][1:v]paletteuse=dither=${t.dither}:diff_mode=rectangle`, '-loop', '0', out]);
    const size = statSync(out).size;
    if (size <= max || n === tries.length - 1) {
      copyFileSync(out, gif);
      if (size > max) console.log(`${gif}: still ${kb(size)} at the smallest setting`);
      return n ? `${t.fps} fps, ${t.width} px, ${t.dither} (first try was ${kb(statSync(join(tmp, 'try0.gif')).size)})` : '';
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
function electron(args) {
  const env = { ...process.env, LG_ASIDE: '1' };
  const child = spawn(process.execPath, [join(ROOT, 'scripts/electron.mjs'), ...args], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const timer = setTimeout(() => child.kill('SIGTERM'), 120_000);
  return exited(child, `electron ${args[0]}`).catch((e) => {
    console.log(log.split('\n').filter((l) => !/GetVSyncParametersIfAvailable/.test(l)).slice(-20).join('\n'));
    throw e;
  }).finally(() => clearTimeout(timer));
}

function ffmpeg(args) {
  return exited(spawn('/usr/bin/ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] }), 'ffmpeg');
}

function exited(child, what) {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => (code === 0 ? resolve() : reject(new Error(`${what} exited with ${code ?? signal}`))));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function kb(n) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(0)} KB`;
}
