// The visual comparison with @ybouane/liquidglass: the same scene and options on both, captured at a device scale
// factor of 1, and the mean |difference| (0..255, per channel) inside the panel, in three zones: the rim (within 40 px
// of the edge), the interior, and the shadow (within 25 px outside). Writes the captures, a ×3 difference image and
// zoomed crops of the rim to bench/compare/out/.
//
//   pnpm compare                         liquidglass's defaults, over the coast photo
//   pnpm compare --cfg='{"blurAmount":0.5}' --photo=alps
//   pnpm compare --engine=librehub --file=/abs/path/to/LibreHub/src/renderer/glass.js   (Libre Hub's old engine)
// It also measures liquidglass against itself moved by 1 px: how much a difference that small adds up to.
import { app, BrowserWindow, nativeImage, screen } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

app.commandLine.appendSwitch('force-device-scale-factor', '1');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const cfg = arg('cfg', '{}'), photo = arg('photo', 'coast'), engine = arg('engine', 'ours'), file = arg('file', '');
const out = fileURLToPath(new URL('./out/', import.meta.url));
const W = 900, H = 520, X = 240, Y = 110, PW = 420, PH = 220, R = 40;

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const primary = screen.getPrimaryDisplay();
  const display = screen.getAllDisplays().find((d) => d.id !== primary.id) ?? primary;
  mkdirSync(out, { recursive: true });
  const shoot = async (engine) => {
    // visible (on the second display, unfocused): liquidglass draws with requestAnimationFrame
    const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false, focusable: false, x: display.bounds.x + 40, y: display.bounds.y + 40 });
    await win.loadFile(fileURLToPath(new URL('./scene.html', import.meta.url)), { query: { engine, cfg, photo, file: file ? `file://${file}` : '' } });
    win.showInactive();
    for (let i = 0; i < 200 && !(await win.webContents.executeJavaScript('!!window.ready')); i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 600));
    const img = await win.webContents.capturePage();
    win.destroy();
    writeFileSync(`${out}${engine}-${photo}.png`, img.toPNG());
    return img;
  };
  const theirs = await shoot('theirs'), ours = await shoot(engine);
  const a = theirs.toBitmap(), b = ours.toBitmap(); // BGRA
  // signed distance to the panel's rounded rectangle, for the zones
  const sdf = (x, y) => {
    const px = x + 0.5 - (X + PW / 2), py = y + 0.5 - (Y + PH / 2);
    const qx = Math.abs(px) - (PW / 2 - R), qy = Math.abs(py) - (PH / 2 - R);
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - R;
  };
  const zones = { rim: [0, 0], interior: [0, 0], shadow: [0, 0] };
  const diff = Buffer.alloc(a.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      let d = 0;
      for (let c = 0; c < 3; c++) {
        const v = Math.abs(a[k + c] - b[k + c]);
        d += v;
        diff[k + c] = Math.min(255, v * 3);
      }
      diff[k + 3] = 255;
      d /= 3;
      const s = sdf(x, y);
      const zone = s < -40 ? 'interior' : s < -1 ? 'rim' : s > 0.5 && s < 25 ? 'shadow' : null;
      if (zone) {
        zones[zone][0] += d;
        zones[zone][1]++;
      }
    }
  }
  writeFileSync(`${out}difference-${engine}-${photo}.png`, nativeImage.createFromBitmap(diff, { width: W, height: H }).toPNG());
  // zoomed crops of the rim: a corner and an edge, ×4
  const crop = (img, r) => img.crop(r).resize({ width: r.width * 4, height: r.height * 4, quality: 'good' }).toPNG();
  for (const [name, r] of [['corner', { x: 236, y: 104, width: 94, height: 46 }], ['edge', { x: 560, y: 296, width: 104, height: 38 }]]) {
    writeFileSync(`${out}zoom-${name}-theirs-${photo}.png`, crop(theirs, r));
    writeFileSync(`${out}zoom-${name}-${engine}-${photo}.png`, crop(ours, r));
  }
  const m = Object.fromEntries(Object.entries(zones).map(([k, [s, n]]) => [k, +(s / n).toFixed(1)]));
  // the noise floor: liquidglass against itself, one pixel to the right
  const shifted = { rim: [0, 0], interior: [0, 0] };
  for (let y = 0; y < H; y++) {
    for (let x = 1; x < W; x++) {
      const s = sdf(x, y), zone = s < -40 ? 'interior' : s < -1 ? 'rim' : null;
      if (!zone) continue;
      const k = (y * W + x) * 4, k2 = k - 4;
      shifted[zone][0] += (Math.abs(a[k] - a[k2]) + Math.abs(a[k + 1] - a[k2 + 1]) + Math.abs(a[k + 2] - a[k2 + 2])) / 3;
      shifted[zone][1]++;
    }
  }
  m.floor = Object.fromEntries(Object.entries(shifted).map(([k, [s, n]]) => [k, +(s / n).toFixed(1)]));
  writeFileSync(`${out}metric-${engine}-${photo}.json`, JSON.stringify({ engine, photo, cfg: JSON.parse(cfg), ...m }, null, 2));
  console.log(`${engine} vs liquidglass over ${photo}, mean |difference| (0–255): rim ${m.rim}  interior ${m.interior}  shadow ${m.shadow}   (liquidglass moved 1 px: rim ${m.floor.rim}  interior ${m.floor.interior})`);
  app.exit(0);
});
