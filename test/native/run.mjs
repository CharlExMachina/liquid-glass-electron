// The native comparison: each case in cases.js drawn by this library in Electron and compared with macOS's own glass
// (SwiftUI's glassEffect) drawing the same scene, captured into reference/ on a Mac. Both are captured the same way
// (screencapture of the window, at 2×, in the display's colour space), so where there's no glass they match to a
// level, and the difference inside the glass is the glass's.
//
//   pnpm test:native               compare (writes test/native/out/report.html: macOS, this library, the difference)
//   pnpm test:native --update      capture macOS's references again (macOS 26+, the command line tools' swiftc)
//   pnpm test:native --self-check  draw the glass wrong on purpose (no lens, less frost, other colour, no outline) and
//                                  check that the cases catch each: a test that can't fail proves nothing
//   pnpm test:native --calibrate   write limits.json from what the glass measures now, with room for rounding
//   pnpm test:native --case=<regex>
//
// It needs a Mac (the references are a Mac's glass, in its display's colour space) and Screen Recording permission for
// the terminal (screencapture). The references hold macOS's version and the display they were made on; on another
// version or display the comparison would measure that, not the glass, so it stops (--force to compare anyway).
import { app, nativeImage, screen } from 'electron';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeBackdrops } from './backdrops.mjs';
import { captureElectron, captureNative } from './capture.mjs';
import { CASES } from './cases.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const argv = process.argv.slice(2);
const update = argv.includes('--update'), selfCheck = argv.includes('--self-check'), force = argv.includes('--force'), calibrate = argv.includes('--calibrate');
const LIMITS = here('./limits.json');
const limits = existsSync(LIMITS) ? JSON.parse(readFileSync(LIMITS, 'utf8')) : {};
// the room calibrate leaves: a quarter more and a little (p95 is in whole levels); near is fixed, enough to see a shadow
const room = { inside: (v) => v * 1.25 + 0.3, rim: (v) => v * 1.25 + 0.3, edge: (v) => v * 1.25 + 0.5, near: () => 1, p95: (v) => v * 1.25 + 1, bias: (v) => Math.abs(v) + 0.75 };
const only = argv.find((a) => a.startsWith('--case='))?.slice(7);
const cases = CASES.filter((c) => !only || new RegExp(only).test(c.name));
// past the glass, CSS px: what's kept of each capture around it
const MARGIN = 32, S = 2;
// The zones, device px from the edge (negative inside): the rim, its outermost 24 px; the edge, ±2 px (macOS's outline
// is just outside it); near, 2 to 40 px outside (where a shadow would be); far, past that, where nothing of the glass
// reaches: there the capture must match the backdrop it was made from, or the capture went wrong, not the glass.
const RIM = 24, EDGE = 2, NEAR = 40, FAR = 1;
// the measures a case's limits can hold: mean |difference| per channel in each zone, its 95th percentile inside, and
// the mean signed difference inside (too bright or too dark overall)
const MEASURES = ['inside', 'rim', 'edge', 'near', 'p95', 'bias'];
// what --self-check breaks, as options on top of each glass's (page.js), and how many cases must catch it
const MUTATIONS = { nolens: 3, frost: 3, colour: 3, outline: 1 };

/** The part of the window kept: the glass's box and MARGIN around it, device px. */
function crop(c) {
  const x0 = Math.min(...c.glass.map((g) => g.x)) - MARGIN, y0 = Math.min(...c.glass.map((g) => g.y)) - MARGIN;
  const x1 = Math.max(...c.glass.map((g) => g.x + g.w)) + MARGIN, y1 = Math.max(...c.glass.map((g) => g.y + g.h)) + MARGIN;
  const x = Math.max(x0, 0) * S, y = Math.max(y0, 0) * S;
  return { x, y, width: Math.min(x1, c.width) * S - x, height: Math.min(y1, c.height) * S - y };
}

/** Signed distance to the nearest glass's edge at a device px of the crop (negative inside), device px. */
function distances(c, r) {
  const shapes = c.glass.map((g) => {
    const rad = g.shape === 'capsule' || g.shape === 'circle' ? Math.min(g.w, g.h) / 2 : Math.min(g.radius ?? 0, g.w / 2, g.h / 2);
    return { cx: (g.x + g.w / 2) * S, cy: (g.y + g.h / 2) * S, hx: (g.w / 2) * S, hy: (g.h / 2) * S, r: rad * S };
  });
  const d = new Float32Array(r.width * r.height);
  for (let j = 0; j < r.height; j++) {
    for (let i = 0; i < r.width; i++) {
      const px = r.x + i + 0.5, py = r.y + j + 0.5;
      let best = Infinity;
      for (const s of shapes) {
        const qx = Math.abs(px - s.cx) - s.hx + s.r, qy = Math.abs(py - s.cy) - s.hy + s.r;
        best = Math.min(best, Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - s.r);
      }
      d[j * r.width + i] = best;
    }
  }
  return d;
}

/** The measures (MEASURES, and far) of one capture against its reference; and a picture of the difference (4×, red past 32). */
function compare(a, b, d, width, height) {
  const zone = { inside: [0, 0], rim: [0, 0], edge: [0, 0], near: [0, 0], far: [0, 0] };
  const hist = new Uint32Array(256);
  let signed = 0;
  const heat = Buffer.alloc(width * height * 4);
  for (let k = 0; k < width * height; k++) {
    const i = k * 4;
    const diff = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    const dist = d[k], add = (z) => { z[0] += diff; z[1]++; };
    if (dist < 0) {
      add(zone.inside);
      hist[Math.min(Math.round(diff), 255)]++;
      signed += (a[i] - b[i] + a[i + 1] - b[i + 1] + a[i + 2] - b[i + 2]) / 3;
      if (dist > -RIM) add(zone.rim);
    }
    if (dist >= -EDGE && dist < EDGE) add(zone.edge);
    else if (dist >= EDGE && dist < NEAR) add(zone.near);
    else if (dist >= NEAR) add(zone.far);
    const v = Math.min(diff * 4, 255);
    heat[i] = v > 128 ? 0 : v; // BGRA: past 32 levels, red
    heat[i + 1] = v > 128 ? 0 : v;
    heat[i + 2] = v;
    heat[i + 3] = 255;
  }
  const mean = (z) => (z[1] ? z[0] / z[1] : 0);
  let p95 = 0;
  for (let n = 0, want = zone.inside[1] * 0.95; p95 < 255 && (n += hist[p95]) < want; p95++);
  return {
    inside: mean(zone.inside), rim: mean(zone.rim), edge: mean(zone.edge), near: mean(zone.near), far: mean(zone.far), p95,
    bias: zone.inside[1] ? signed / zone.inside[1] : 0, heat: nativeImage.createFromBitmap(heat, { width, height }),
  };
}

/** Each case drawn by this library (with `mutate`, wrong on purpose) and measured against its reference. */
async function measure(cases, raw, ref, mutate) {
  await captureElectron(cases, raw, { mutate });
  return cases.map((c) => {
    const r = crop(c);
    const mine = nativeImage.createFromPath(`${raw}/${c.name}.png`).crop(r), theirs = nativeImage.createFromPath(`${ref}/${c.name}.png`);
    const { width, height } = theirs.getSize();
    const res = compare(mine.toBitmap(), theirs.toBitmap(), distances(c, r), width, height);
    const lim = limits[c.name] ?? {};
    const over = calibrate ? [] : MEASURES.filter((k) => lim[k] !== undefined && Math.abs(res[k]) > lim[k]).map((k) => `${k} ${res[k].toFixed(2)} > ${lim[k]}`);
    if (!calibrate && !limits[c.name]) over.push('no limits (pnpm test:native --calibrate)');
    // the capture, not the glass: a covered window, a stale frame, a backdrop other than the reference's
    const broken = res.far > FAR ? `far outside ${res.far.toFixed(2)} (the capture, not the glass: is the window covered, or the backdrop not the reference's?)` : null;
    return { c, res, mine, bad: broken ? [broken] : over, broken };
  });
}

const fmt = (res) => MEASURES.map((k) => `${k} ${res[k].toFixed(2).padStart(5)}`).join('  ');

const macos = () => execFileSync('sw_vers', ['-productVersion']).toString().trim();
// the display the windows are on: its gamut (Chromium composites in its colour space) and scale (the crops are 2×)
const display = () => {
  const d = screen.getPrimaryDisplay();
  return { gamut: /primaries:P3/.test(d.colorSpace ?? '') ? 'p3' : 'srgb', scale: d.scaleFactor, label: d.label, colorSpace: d.colorSpace };
};

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  if (process.platform !== 'darwin') {
    console.log('The native comparison needs a Mac: its references are macOS\'s own glass.');
    app.exit(0);
    return;
  }
  writeBackdrops();
  const ref = here('./reference'), out = here('./out'), raw = `${out}/raw`;
  rmSync(raw, { recursive: true, force: true });
  mkdirSync(raw, { recursive: true });
  try {
    if (update) {
      // (Electron's own binary, as Node)
      const built = spawnSync(process.execPath, [here('../../scripts/native.mjs'), '--build-only'], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      if (built.status) throw new Error('the native app did not build');
      if (display().scale !== S) throw new Error(`the references are captured at ${S}×; this display is ${display().scale}×`);
      await captureNative(cases, raw, { tint: 0 });
      mkdirSync(ref, { recursive: true });
      for (const c of cases) writeFileSync(`${ref}/${c.name}.png`, nativeImage.createFromPath(`${raw}/${c.name}.png`).crop(crop(c)).toPNG());
      const { gamut, scale, label, colorSpace } = display();
      writeFileSync(`${ref}/index.json`, `${JSON.stringify({ macos: macos(), display: gamut, scale, label, colorSpace, tint: 0, captured: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
      console.log(`${cases.length} references written (macOS ${macos()}, ${label}, ${gamut}, ${scale}×)`);
      app.exit(0);
      return;
    }
    if (!existsSync(`${ref}/index.json`)) throw new Error('no references: pnpm test:native --update captures them (on a Mac)');
    const index = JSON.parse(readFileSync(`${ref}/index.json`, 'utf8'));
    const here_ = { macos: macos(), ...display() };
    const differs = [index.macos !== here_.macos && `macOS ${index.macos}, this is ${here_.macos}`, index.display !== here_.gamut && `a ${index.display} display, this is ${here_.gamut}`,
      index.scale !== here_.scale && `${index.scale}×, this display is ${here_.scale}×`].filter(Boolean);
    if (differs.length && !force) {
      console.log(`The references were made on ${differs.join('; ')}: the comparison would measure that, not the glass. Capture references here (--update), or --force.`);
      app.exit(2);
      return;
    }
    if (selfCheck) {
      // each mutation, every case: how many fail
      let ok = true;
      for (const [mutate, need] of Object.entries(MUTATIONS)) {
        const rows = await measure(cases, raw, ref, mutate);
        if (rows.some((r) => r.broken)) throw new Error(`a capture went wrong during --self-check (${mutate})`);
        const caught = rows.filter((r) => r.bad.length);
        if (caught.length < need) ok = false;
        console.log(`${caught.length >= need ? 'ok  ' : 'FAIL'} ${mutate.padEnd(8)} caught by ${caught.length} of ${rows.length} (at least ${need}): ${caught.map((r) => r.c.name).join(', ') || 'none'}`);
      }
      console.log(ok ? 'every mutation is caught' : 'a mutation got through: the limits are too loose');
      app.exit(ok ? 0 : 1);
      return;
    }
    const rows = await measure(cases, raw, ref);
    let failed = 0;
    for (const { c, res, mine, bad } of rows) {
      if (bad.length) failed++;
      writeFileSync(`${out}/${c.name}.png`, mine.toPNG());
      writeFileSync(`${out}/${c.name}-diff.png`, res.heat.toPNG());
      console.log(`${bad.length ? 'FAIL' : 'ok  '} ${c.name.padEnd(30)} ${fmt(res)}${bad.length ? `  ${bad.join('; ')}` : ''}`);
    }
    writeFileSync(`${out}/report.html`, report(rows, index));
    writeFileSync(`${out}/results.json`, `${JSON.stringify(Object.fromEntries(rows.map(({ c, res }) => [c.name, Object.fromEntries(MEASURES.map((k) => [k, +res[k].toFixed(3)]))])), null, 1)}\n`);
    if (calibrate) {
      const next = { ...limits };
      for (const { c, res } of rows) if (!rows.find((r) => r.c === c).broken) next[c.name] = Object.fromEntries(MEASURES.map((k) => [k, Math.ceil(room[k](res[k]) * 10) / 10]));
      writeFileSync(LIMITS, `${JSON.stringify(next, null, 1)}\n`);
      console.log(`limits written for ${rows.length} cases (test/native/limits.json)`);
    }
    console.log(failed ? `${failed} failed (test/native/out/report.html)` : 'all within macOS\'s glass (test/native/out/report.html)');
    app.exit(failed ? 1 : 0);
  } catch (e) {
    console.error(String(e?.message ?? e));
    if (/screencapture|could not create image/i.test(String(e))) console.error('screencapture needs Screen Recording permission for this terminal (System Settings › Privacy & Security).');
    app.exit(2);
  }
});

function report(rows, index) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const fig = (src, cap) => `<figure><img src="${src}" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>`;
  return `<!doctype html><meta charset="utf-8"><title>Native comparison</title>
<style>body{font:14px system-ui;margin:24px;background:#1b1b1d;color:#eee}h2{font-size:15px;margin:28px 0 8px}.row{display:flex;gap:12px;flex-wrap:wrap}
figure{margin:0}img{max-width:420px;display:block;border-radius:6px}figcaption{color:#aaa;font-size:12px;margin-top:4px}.bad{color:#ff6b6b}</style>
<h1>This library's glass against macOS ${esc(index.macos)}'s</h1>
<p>Mean difference per channel, 0..255, inside the glass, in its outermost 24 device px (rim), within 2 px of its edge, and 2–40 px outside it (near); the 95th percentile and the mean signed difference inside. The references were captured ${esc(index.captured)} on ${esc(index.label)} (${esc(index.display)}, ${esc(index.scale)}×). The difference is 4× brighter, red past 32 levels.</p>
${rows.map(({ c, res, bad }) => `<h2 class="${bad.length ? 'bad' : ''}">${esc(c.name)}: ${esc(fmt(res))}${bad.length ? ` (${esc(bad.join('; '))})` : ''}</h2>
<div class="row">${fig(`../reference/${c.name}.png`, 'macOS (SwiftUI glassEffect)')}${fig(`${c.name}.png`, 'liquid-glass-electron')}${fig(`${c.name}-diff.png`, 'difference')}</div>`).join('\n')}`;
}
