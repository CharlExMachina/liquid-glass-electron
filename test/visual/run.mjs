// Visual regression tests: each case in cases.js, captured at a device scale factor of 1 and compared with
// baseline/<case>.png. npm run test:visual (-- --update to write the baselines, -- --case=name for one).
//
// Baselines are drawn by the GPU, so they belong to a machine: they were made on Linux with Mesa (AMD). On another
// setup, write your own with --update first, then the test catches changes from there.
import { app, BrowserWindow, nativeImage, nativeTheme, screen } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

app.commandLine.appendSwitch('force-device-scale-factor', '1');
// the same scheme everywhere, whatever the machine's
nativeTheme.themeSource = 'light';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const argv = process.argv.slice(2);
const update = argv.includes('--update');
const only = argv.find((a) => a.startsWith('--case='))?.slice(7);
const source = readFileSync(here('./cases.js'), 'utf8');
const names = [...source.matchAll(/^ {2}async (\w+)\(\)/gm)].map((m) => m[1]).filter((n) => !only || n === only);
// mean |difference| per channel, 0..255, and the share of pixels off by more than 48
const LIMITS = { mean: 1.5, outliers: 0.01 };

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const primary = screen.getPrimaryDisplay();
  const display = screen.getAllDisplays().find((d) => d.id !== primary.id) ?? primary;
  mkdirSync(here('./out'), { recursive: true });
  let failed = 0;
  for (const name of names) {
    const win = new BrowserWindow({
      width: 640, height: 400, useContentSize: true, show: false, focusable: false, x: display.bounds.x + 60, y: display.bounds.y + 60,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    const errors = [];
    win.webContents.on('console-message', (e) => { if (e.level === 'error' && !/construct 'URL'/.test(e.message)) errors.push(e.message); });
    try {
      await win.loadFile(here('./page.html'), { hash: name });
    } catch (e) {
      // a hash-only navigation can report ERR_ABORTED/ERR_FAILED although the page loads
      if (!/ERR_(ABORTED|FAILED)/.test(String(e))) throw e;
    }
    win.showInactive();
    for (let i = 0; i < 100 && !(await win.webContents.executeJavaScript('!!window.caseReady')); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    const shot = await win.webContents.capturePage();
    win.destroy();
    const file = here(`./baseline/${name}.png`);
    if (update || !existsSync(file)) {
      writeFileSync(file, shot.toPNG());
      console.log(`${name.padEnd(12)} baseline written`);
      continue;
    }
    const a = shot.toBitmap(), b = nativeImage.createFromPath(file).toBitmap();
    let sum = 0, out = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i += 4) {
      let px = 0;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a[i + c] - b[i + c]);
        sum += d;
        px = Math.max(px, d);
      }
      if (px > 48) out++;
    }
    const mean = sum / ((n / 4) * 3), outliers = out / (n / 4);
    const ok = a.length === b.length && mean <= LIMITS.mean && outliers <= LIMITS.outliers && errors.length === 0;
    if (!ok) {
      failed++;
      writeFileSync(here(`./out/${name}.png`), shot.toPNG());
    }
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(12)} mean ${mean.toFixed(2)}  outliers ${(outliers * 100).toFixed(2)}%${errors.length ? `  errors: ${errors.join(' | ')}` : ''}`);
  }
  console.log(failed ? `${failed} failed (captures in test/visual/out/)` : 'all passed');
  app.exit(failed ? 1 : 0);
});
