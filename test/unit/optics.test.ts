// The optics against liquidglass's shader formulas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundedRect } from '../../src/field.ts';
import { blurSigma, boxShadow, boxShadowAlpha, colorMatrix, fringeAt, height, shiftAt, slope, tintGains } from '../../src/optics.ts';

const near = (a: number, b: number, eps = 1e-6, msg?: string) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≉ ${b}`);
const defaults = { refraction: 0.69, bevel: 40, dome: false, magnify: true };

test('the bevel is a quarter circle of radius zR, flat beyond it', () => {
  near(height(0, 40), 0);
  near(height(40, 40), 40);
  near(height(100, 40), 40);
  near(height(20, 40), Math.sqrt(20 * 60));
  // its slope over ±2 px, as the shader takes it: finite at the edge, zero on the flat top
  near(slope(0, 40), Math.sqrt(2 * 78) / 4);
  near(slope(60, 40), 0);
});

test('a pill bends inward at the rim, by liquidglass\'s biconvex formula', () => {
  const f = roundedRect(420, 220, [40, 40, 40, 40]);
  // the middle of the left edge, 2 px in: shift = hGrad·(1 − 1/1.5)·(2 + 0.5·h/zR)·refraction·30 + magnification
  const [x, y] = shiftAt(2, 110, f, { ...defaults, magnify: false });
  const g = (height(4, 40) - height(0, 40)) / 4;
  near(x, g * (1 / 3) * (2 + 0.5 * height(2, 40) / 40) * 0.69 * 30, 1e-9);
  near(y, 0, 1e-9);
  assert.ok(x > 40, 'the rim moves samples far inward');
});

test('the shift is antisymmetric about the middle, and nothing at the middle', () => {
  const f = roundedRect(300, 160, [30, 30, 30, 30]);
  for (const [x, y] of [[3, 80], [20, 15], [150, 5], [60, 40]]) {
    const [a, b] = shiftAt(x, y, f, defaults);
    const [c, d] = shiftAt(300 - x, 160 - y, f, defaults);
    near(a, -c, 1e-9);
    near(b, -d, 1e-9);
  }
  const [mx, my] = shiftAt(150, 80, f, defaults);
  near(mx, 0, 1e-9);
  near(my, 0, 1e-9);
});

test('magnification pulls by refraction × 4 px at the edge of the flat top', () => {
  const f = roundedRect(400, 400, [20, 20, 20, 20]);
  // on the flat top (past the bevel), x = 100: pull (200 − 100)/200 = 0.5
  const [x] = shiftAt(100, 200, f, defaults);
  near(x, 0.5 * 0.69 * 4, 1e-9);
});

test('a dome moves every sample toward the middle by refraction × 0.35 × depth', () => {
  const f = roundedRect(400, 400, [200, 200, 200, 200]);
  const [x, y] = shiftAt(150, 200, f, { ...defaults, dome: true });
  near(x, 50 * 0.69 * 0.35, 1e-9);
  near(y, 0, 1e-9);
});

test('the colour fringe follows the bevel\'s normal and is nothing on the flat top', () => {
  const f = roundedRect(420, 220, [40, 40, 40, 40]);
  const [fx, fy] = fringeAt(1, 110, f, 40, 0.05);
  assert.ok(fx < 0 && Math.abs(fy) < 1e-9, 'outward at the left edge');
  // at the rim: chroma × 36 × (0.3 + 0.7 × edge) × |N.xy|, edge ≈ 1 there
  assert.ok(Math.abs(fx) > 1.5 && Math.abs(fx) < 1.8);
  const [ix, iy] = fringeAt(210, 110, f, 40, 0.05);
  near(ix, 0, 1e-9);
  near(iy, 0, 1e-9);
});

test('blurAmount is three passes of liquidglass\'s 9-tap blur, as one Gaussian', () => {
  near(blurSigma(0), 0);
  near(blurSigma(1), Math.sqrt(3) * 1.75 * 2.5);
  near(blurSigma(-1), 0);
});

test('the colour matrix is the identity with nothing set, and applies saturation, brightness and tint', () => {
  const id = colorMatrix(0, 0, [1, 1, 1]);
  assert.deepEqual(id.map((v) => +v.toFixed(12)), [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  // grey stays grey under saturation
  const sat = colorMatrix(0.8, 0, [1, 1, 1]);
  for (let r = 0; r < 3; r++) near(sat[r * 5] + sat[r * 5 + 1] + sat[r * 5 + 2], 1, 1e-9);
  // brightness scales
  near(colorMatrix(0, 0.2, [1, 1, 1])[0], 1.2);
  // liquidglass's cool tint at full strength
  assert.deepEqual(tintGains(1), [0.92, 0.95, 1.05]);
  assert.deepEqual(tintGains(0), [1, 1, 1]);
});

test('the shadow is liquidglass\'s, squared as its canvas draws it', () => {
  // at the edge (from 1 px out): (0.65 + 0.35) × opacity, squared
  near(boxShadowAlpha(-1, 0.3, 10), 0.09, 1e-12);
  near(boxShadowAlpha(-11, 0.3, 10), (0.3 * (0.65 * Math.exp(-1) + 0.35 * Math.exp(-2))) ** 2, 1e-12);
  assert.equal(boxShadow(0, 10, 1), 'none');
  assert.match(boxShadow(0.3, 10, 1), /^0 1px 9px 5px rgb\(0 0 0 \/ 0\.06\), 0 1px 13px -4px rgb\(0 0 0 \/ 0\.186\)$/);
});
