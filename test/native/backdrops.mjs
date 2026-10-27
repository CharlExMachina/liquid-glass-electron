// The backdrops the native comparison draws behind its glass: PNGs at the scenes' size in device pixels (2×), so both
// SwiftUI and Chromium draw them 1:1 and the pixels behind the glass are the same in both. Photos from demo/assets,
// and patterns that make one part of the glass measurable at a time (flat colours for its colour and light, lines for
// its bending, an edge for its frost). Made when they're missing (they're not in git: the photos are 1–2 MB each, and
// the same Electron makes the same pixels), by run.mjs, or in Electron (nativeImage writes the PNGs):
//   node scripts/electron.mjs test/native/backdrops.mjs [--force]
import { app, nativeImage } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const W = 1280, H = 800;
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** A pattern drawn by a function of the device pixel: [r, g, b] 0..255 (drawn when it's written). */
const pattern = (fn) => () => {
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fn(x, y), i = (y * W + x) * 4;
      buf[i] = b;
      buf[i + 1] = g;
      buf[i + 2] = r;
      buf[i + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: W, height: H });
};
const flat = (c) => pattern(() => c);

const PATTERNS = {
  white: flat([255, 255, 255]),
  black: flat([0, 0, 0]),
  grey: flat([128, 128, 128]),
  red: flat([200, 60, 60]),
  green: flat([60, 200, 60]),
  blue: flat([60, 60, 200]),
  // thin dark lines on white, 24 device px apart (1 px wide): vertical ones show the bending across, horizontal down
  linesv: pattern((x) => (x % 24 === 0 ? [0, 0, 0] : [255, 255, 255])),
  linesh: pattern((x, y) => (y % 24 === 0 ? [0, 0, 0] : [255, 255, 255])),
  // a grid of both, and stripes 10 px wide as the visual tests have
  grid: pattern((x, y) => (x % 40 === 0 || y % 40 === 0 ? [20, 20, 20] : [240, 240, 240])),
  stripes: pattern((x) => (Math.floor(x / 20) % 2 ? [17, 17, 17] : [255, 255, 255])),
  // black on the left, white on the right of x = 640: the frost spreads the edge
  edge: pattern((x) => (x < 640 ? [0, 0, 0] : [255, 255, 255])),
  // a dark band through the middle, for the shadow and the light against both
  half: pattern((x, y) => (y < 400 ? [235, 235, 235] : [30, 30, 30])),
  // the same black and white edge, across
  edgeh: pattern((x, y) => (y < 400 ? [0, 0, 0] : [255, 255, 255])),
};
// nine greys, for the tone curve
for (const v of [0, 32, 64, 96, 128, 160, 192, 224, 255]) PATTERNS[`g${String(v).padStart(3, '0')}`] = flat([v, v, v]);
// bars 48 px wide, black and white, at four phases 12 px apart, both ways: a symmetric blur leaves the edges' 50%
// crossings where they are, so where they show up under the glass says how far it moved them
for (const p of [0, 12, 24, 36]) {
  PATTERNS[`barsx${p}`] = pattern((x) => (Math.floor((x + p) / 48) % 2 ? [255, 255, 255] : [0, 0, 0]));
  PATTERNS[`barsy${p}`] = pattern((x, y) => (Math.floor((y + p) / 48) % 2 ? [255, 255, 255] : [0, 0, 0]));
}

// Ramps, 0 to 255 over 400 device px, from 100 px outside each layout's left and top edge inward: a symmetric blur
// leaves a linear ramp as it is, so the level under the glass says where it was sampled from (within a px)
const RIMS = { panel: [300, 200], capsule: [340, 320], small: [520, 356], circle: [440, 200], big: [140, 100] };
for (const [name, [x0, y0]] of Object.entries(RIMS)) {
  const ramp = (v) => { const c = Math.round(Math.min(Math.max(v / 400, 0), 1) * 255); return [c, c, c]; };
  PATTERNS[`rampx-${name}`] = pattern((x) => ramp(x - x0 + 100));
  PATTERNS[`rampy-${name}`] = pattern((x, y) => ramp(y - y0 + 100));
}

const photo = (name) => {
  const img = nativeImage.createFromPath(here(`../../demo/assets/${name}.jpg`));
  const { width, height } = img.getSize();
  const k = Math.max(W / width, H / height);
  const scaled = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' });
  const s = scaled.getSize();
  return scaled.crop({ x: Math.floor((s.width - W) / 2), y: Math.floor((s.height - H) / 2), width: W, height: H });
};

/** Writes the backdrops that are missing (all of them with `force`) into test/native/backdrops/. */
export function writeBackdrops({ force = false } = {}) {
  mkdirSync(here('./backdrops'), { recursive: true });
  const all = { ...PATTERNS, coast: () => photo('coast'), ponds: () => photo('ponds'), alps: () => photo('alps'), night: () => photo('night') };
  let n = 0;
  for (const [name, make] of Object.entries(all)) {
    const file = here(`./backdrops/${name}.png`);
    if (existsSync(file) && !force) continue;
    writeFileSync(file, make().toPNG());
    n++;
  }
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  app.whenReady().then(() => {
    console.log(`${writeBackdrops({ force: process.argv.includes('--force') })} backdrops written`);
    app.exit(0);
  });
}
