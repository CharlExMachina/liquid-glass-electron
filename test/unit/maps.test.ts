// The maps as Chromium uses them: an 8-bit image stretched bilinearly, through a 256-entry table baked into bytes by
// truncating. The table map has to come out close to the exact shift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundedRect, union } from '../../src/field.ts';
import { fieldLight, lightImage, ownGrid, tableMap } from '../../src/maps.ts';
import { shiftAt } from '../../src/optics.ts';

const optics = { refraction: 0.69, bevel: 40, dome: false, magnify: true };

function reconstruct(m: ReturnType<typeof tableMap>, w: number, h: number) {
  const sx = (w + 2 * m.margin) / m.width, sy = (h + 2 * m.margin) / m.height;
  const lut = (t: number[], v: number) => {
    const k = Math.floor(Math.round(v * 255) / 255 * (t.length - 1) * 1e6) / 1e6, i = Math.min(Math.floor(k), t.length - 2);
    return Math.floor((t[i] + (t[i + 1] - t[i]) * (k - i)) * 255) / 255;
  };
  return (x: number, y: number) => {
    const fx = Math.min(Math.max((x + m.margin) / sx - 0.5, 0), m.width - 1), fy = Math.min(Math.max((y + m.margin) / sy - 0.5, 0), m.height - 1);
    const i0 = Math.floor(fx), j0 = Math.floor(fy), i1 = Math.min(i0 + 1, m.width - 1), j1 = Math.min(j0 + 1, m.height - 1), tx = fx - i0, ty = fy - j0;
    const g = (i: number, j: number, c: number) => m.data[(j * m.width + i) * 4 + c] / 255;
    const bil = (c: number) => (g(i0, j0, c) * (1 - tx) + g(i1, j0, c) * tx) * (1 - ty) + (g(i0, j1, c) * (1 - tx) + g(i1, j1, c) * tx) * ty;
    // displacement: scale × (C − 0.5), scale = 2 × rimPx
    return [(lut(m.tableX, bil(0)) - 0.5) * 2 * m.rimPx, (lut(m.tableY, bil(1)) - 0.5) * 2 * m.rimPx];
  };
}

test('a table map at 0.2 px per px follows the exact shift along straight edges', () => {
  const f = roundedRect(420, 220, [40, 40, 40, 40]);
  const m = tableMap(f, optics, 0.2);
  const at = reconstruct(m, 420, 220);
  let err = 0, n = 0;
  for (let d = 0.5; d < 40; d += 0.5) {
    for (const y of [80, 110, 140]) {
      const [a] = shiftAt(d, y, f, optics);
      const [b] = at(d, y);
      err += Math.abs(a - b);
      n++;
    }
  }
  assert.ok(err / n < 0.9, `mean error ${(err / n).toFixed(2)} px along the left edge`);
  // the outermost px, where the shift falls off from its peak 2 px in (66 px) by about 10 px a px: a byte's step is
  // about 0.4 px there
  const [a] = shiftAt(0.5, 110, f, optics), [b] = at(0.5, 110);
  assert.ok(Math.abs(a - b) < 4, `${b.toFixed(1)} px at the edge, not ${a.toFixed(1)}`);
});

test('its tables rise from the middle to the peak 2 px in and fall from it to the edge, and no shift comes out as 128', () => {
  const m = tableMap(roundedRect(300, 160, [30, 30, 30, 30]), optics, 0.2);
  for (const t of [m.tableX, m.tableY]) {
    const peak = t.indexOf(Math.max(...t));
    assert.ok(peak < t.length - 1 && t[t.length - 1] < t[peak] - 0.05, 'the shift falls toward the edge');
    for (let i = t.length / 2 + 1; i <= peak; i++) assert.ok(t[i] >= t[i - 1] - 1e-9);
    for (let i = peak + 1; i < t.length; i++) assert.ok(t[i] <= t[i - 1] + 1e-9);
    assert.equal(Math.floor(t[127] * 255), 128 - (t[127] < 0.5 ? 1 : 0) || 128);
  }
});

test('a capsule\'s map has no step across its middle', () => {
  const f = roundedRect(200, 80, [40, 40, 40, 40]);
  const m = tableMap(f, optics, 0.2);
  const at = reconstruct(m, 200, 80);
  let worst = 0;
  for (let y = 30; y < 50; y += 0.5) worst = Math.max(worst, Math.abs(at(100, y + 0.5)[1] - at(100, y)[1]));
  assert.ok(worst < 1.5, `largest step ${worst.toFixed(2)} px`);
});

test('a dome\'s map stores the shift as it is', () => {
  const f = roundedRect(200, 200, [100, 100, 100, 100]);
  const m = tableMap(f, { ...optics, dome: true }, 0.3);
  assert.equal(m.tableX[0], +(0.5 / 255).toFixed(5));
  const at = reconstruct(m, 200, 200);
  const [a] = shiftAt(60, 100, f, { ...optics, dome: true });
  assert.ok(Math.abs(at(60, 100)[0] - a) < 1);
});

test('a map on its own grid is the map drawn without one', () => {
  const f = roundedRect(300, 160, [40, 40, 40, 40]);
  const a = tableMap(f, optics, 0.29), g = ownGrid(300, 160, 0.29, a.margin);
  const b = tableMap(f, optics, 0.29, 256, 0, f, g);
  assert.deepEqual(b.data, a.data);
  assert.deepEqual(b.rect, { x: -a.margin, y: -a.margin, w: 300 + 2 * a.margin, h: 160 + 2 * a.margin });
});

test('a map on a group\'s grid covers the glass and its margin, and is the same wherever its grid lines fall the same', () => {
  // a 300 × 160 panel 380 px right of the grid's start, 7 px before the first panel: the grid line at or before its own
  // margin is 2 px further out than the margin
  const f = roundedRect(300, 160, [40, 40, 40, 40]);
  const own = tableMap(f, optics, 0.29);
  const grid = { x: -7 + 126 * 3 - 380, y: -7, px: 3, py: 3, width: Math.ceil((300 + 7 + 9) / 3), height: Math.ceil((160 + 14) / 3) };
  const m = tableMap(f, optics, 0.29, 256, 0, f, grid);
  assert.equal(m.rect.x, -9);
  assert.ok(m.rect.x <= -own.margin && m.rect.x + m.rect.w >= 300 + own.margin && m.rect.y + m.rect.h >= 160 + own.margin);
  // the same grid lines relative to the glass (a panel 3 grid pixels further on): the same map
  const later = tableMap(f, optics, 0.29, 256, 0, f, { ...grid });
  assert.deepEqual(later.data, m.data);
  assert.deepEqual([m.tableX, m.tableY], [own.tableX, own.tableY]);
});

test('the light is a 9-slice image with a uniform middle, and a fill is painted under it', () => {
  const img = lightImage([20, 20, 20, 20], 20, 50, { fresnel: 1, edge: 0.05, specular: 0 }, 2, [10, 132, 255, 0.5])!;
  assert.equal(img.width, img.height);
  assert.equal(img.slice, img.edge * 2);
  const mid = (img.height / 2) * img.width + img.width / 2, k = Math.floor(mid) * 4;
  const k2 = (Math.floor(img.height / 2) * img.width + Math.floor(img.width / 2) + 1) * 4;
  assert.deepEqual([...img.data.slice(k, k + 4)], [...img.data.slice(k2, k2 + 4)]);
  assert.ok(img.data[k + 2] > img.data[k], 'the fill is blue');
  assert.equal(lightImage([20, 20, 20, 20], 20, 50, { fresnel: 0, edge: 0, specular: 0 }, 1), null);
});

test('a union\'s light covers its shape, and its shadow is outside it', () => {
  const a = { x: 40, y: 40, w: 60, h: 60, radii: [30, 30, 30, 30] as [number, number, number, number] };
  const f = union(240, 140, [a, { ...a, x: 110 }], 20);
  const out = fieldLight(f, 20, { fresnel: 1, edge: 0.05, specular: 0 }, { opacity: 0.3, spread: 10, offsetY: 1 }, 1, 0);
  const alpha = (img: { data: Uint8ClampedArray; width: number }, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];
  assert.equal(alpha(out.mask, 70, 70), 255);
  assert.equal(alpha(out.mask, 5, 5), 0);
  assert.ok(alpha(out.shadow, 70, 103) > 0, 'shadow just below');
  assert.equal(alpha(out.shadow, 70, 70), 0, 'none under the glass');
});
