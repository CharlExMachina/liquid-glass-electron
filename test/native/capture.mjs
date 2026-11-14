// Captures scenes as SwiftUI draws them (native/Glass.swift --scenes) or as this library does (page.html), each window
// with `screencapture -l`, so both go through the same capture: the window's own pixels at 2×, in the display's
// colour space. The test (run.mjs) uses it; so do the measurements behind the variants, from the command line:
//   node scripts/electron.mjs test/native/capture.mjs --native|--electron --out=<dir> [--set=measure] [--only=<regex>]
//     --set=measure --layouts=panel,small --variants=clear --appearances=dark --backdrops=coast,g128   (scenes.js)
//     --set=<file>.json   the scenes in that file
//     --scale=1           both at 1× (see SCALE)
//     --active            SwiftUI's window key and its app active, as an app in use (clear glass is hardly frosted then)
//     --srgb              Chromium composites in sRGB, not the display's colour space
//     --gl                this library's shader (Safari's and Firefox's glass) instead of Chromium's compositor
//     --lib=old           this library as built into test/native/.old/ (a before and after)
//     --mutate=<name>     the glass drawn wrong on purpose (page.js), as run.mjs --self-check does
//     --tint=<0..1>       macOS's Liquid Glass tint (System Settings › Appearance): 0, the Clear end, by default
import { app, BrowserWindow, nativeTheme } from 'electron';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureScenes } from './scenes.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => process.argv.includes(`--${name}`);
// where the windows go on screen (top left, px): each only samples its own content, but a window that's covered stops
// being painted (Chromium's) or drawn, so the native one and Electron's go side by side, never on top of each other
const AT = [40, 60], AT_ELECTRON = [720, 60];
// a covered or unfocused window keeps drawing
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// --scale=1: both drawn at 1× (SwiftUI by a copy of the app that asks for no Retina backing, Electron at a forced
// scale), over backdrops at 1×; the window server doubles each pixel, so the captures are still 2×'s size
export const SCALE = Number(arg('scale', '2'));
if (SCALE !== 2) app.commandLine.appendSwitch('force-device-scale-factor', String(SCALE));
if (flag('srgb')) app.commandLine.appendSwitch('force-color-profile', 'srgb');
const backdropName = (b) => (SCALE === 1 ? `${b}@1x` : b);

export async function sceneList(set) {
  // a file of scenes, as JSON
  if (set.endsWith('.json')) return JSON.parse((await import('node:fs')).readFileSync(set, 'utf8'));
  if (set === 'measure') {
    const backdrops = arg('backdrops', 'white,black,grey,red,green,blue,linesv,linesh,grid,stripes,edge,half,coast,ponds').split(',');
    return measureScenes({ backdrops, layouts: arg('layouts')?.split(','), variants: arg('variants')?.split(','), appearances: arg('appearances')?.split(',') });
  }
  return (await import('./cases.js')).CASES;
}

/** A window's pixels, as the window server has them, into a PNG (needs Screen Recording permission). */
export const shoot = (id, file) => execFileSync('screencapture', ['-x', '-o', `-l${id}`, file]);

/**
 * SwiftUI's glass: one app for all the scenes, a scene per line on its stdin; scenes with `active` (or all, with
 * --active) from another, whose window is key and the app active, as an app in use (macOS draws its glass otherwise
 * there).
 */
export async function captureNative(scenes, out, { tint = arg('tint', '0') } = {}) {
  mkdirSync(out, { recursive: true });
  const bin = here(SCALE === 1 ? '../../native/.build/Low.app/Contents/MacOS/playground' : '../../native/.build/playground');
  if (!existsSync(bin)) throw new Error('build the native app first: node scripts/native.mjs');
  const all = flag('active');
  for (const active of [false, true]) {
    const group = scenes.filter((s) => all || !!s.active === active);
    if (!group.length || (all && !active)) continue;
    const child = spawn(bin, ['--scenes', `--at=${AT.join(',')}`, ...(active ? ['--activate'] : []), '-NSGlassTintAmount', String(tint)], { stdio: ['pipe', 'pipe', 'inherit'] });
    const lines = createInterface({ input: child.stdout });
    const waiting = [];
    lines.on('line', (l) => waiting.shift()?.(l));
    const next = () => new Promise((r) => waiting.push(r));
    if ((await next()) !== 'LISTENING') throw new Error('native app did not start');
    for (const s of group) {
      child.stdin.write(`${JSON.stringify({ ...s, backdrop: here(`./backdrops/${backdropName(s.backdrop)}.png`) })}\n`);
      const reply = await next();
      const m = /^READY (\S+) (\d+)$/.exec(reply);
      if (!m) throw new Error(`native: ${reply}`);
      shoot(m[2], `${out}/${s.name}.png`);
      process.stdout.write('.');
    }
    child.stdin.write('quit\n');
    await new Promise((r) => child.on('exit', r));
  }
  console.log(`\n${scenes.length} native captures in ${out}`);
}

/** This library's glass, in a frameless window of the same size. */
export async function captureElectron(scenes, out, { lib = arg('lib'), mutate = arg('mutate'), gl = flag('gl') } = {}) {
  mkdirSync(out, { recursive: true });
  nativeTheme.themeSource = 'light';
  let win = null;
  for (const s of scenes) {
    if (!win || win.getContentSize().join() !== [s.width, s.height].join()) {
      win?.destroy();
      win = new BrowserWindow({
        width: s.width, height: s.height, useContentSize: true, x: AT_ELECTRON[0], y: AT_ELECTRON[1], frame: false, roundedCorners: false, hasShadow: false,
        show: false, focusable: false, backgroundColor: '#000', webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
      });
      win.webContents.on('console-message', (e) => { if (e.level === 'error') console.log('[page]', e.message); });
      await win.loadFile(here('./page.html'), { query: { ...(lib ? { lib } : {}), ...(mutate ? { mutate } : {}), ...(gl ? { gl: '1' } : {}), ...(SCALE !== 2 ? { dpr: String(SCALE) } : {}) } });
      win.showInactive();
      for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('!!window.pageReady')); i++) await new Promise((r) => setTimeout(r, 50));
    }
    nativeTheme.themeSource = s.appearance === 'dark' ? 'dark' : 'light';
    await win.webContents.executeJavaScript(`window.show(${JSON.stringify({ ...s, backdrop: backdropName(s.backdrop) })})`);
    await new Promise((r) => setTimeout(r, 250));
    const id = win.getMediaSourceId().split(':')[1];
    shoot(id, `${out}/${s.name}.png`);
    process.stdout.write('.');
  }
  win?.destroy();
  console.log(`\n${scenes.length} electron captures in ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  app.on('window-all-closed', () => {});
  app.whenReady().then(async () => {
    const out = arg('out', here('./out/capture'));
    mkdirSync(out, { recursive: true });
    const only = arg('only') && new RegExp(arg('only'));
    const scenes = (await sceneList(arg('set', 'test'))).filter((s) => !only || only.test(s.name));
    try {
      if (flag('native')) await captureNative(scenes, out);
      else await captureElectron(scenes, out);
      app.exit(0);
    } catch (e) {
      console.error(e);
      app.exit(1);
    }
  });
}
