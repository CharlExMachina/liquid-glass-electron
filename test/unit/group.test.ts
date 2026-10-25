// A group's geometry: the clip (each member's rounded box) and which maps can share an image.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, roundedBox } from '../../src/group.ts';

const radii = (tl: string, tr = tl, br = tl, bl = tl) => ({ borderTopLeftRadius: tl, borderTopRightRadius: tr, borderBottomRightRadius: br, borderBottomLeftRadius: bl });

test('a capsule is two half circles joined by straight sides, where its box is', () => {
  assert.equal(roundedBox(10, 20, 170, 64, radii('32px')), 'M42 20H148A32 32 0 0 1 180 52V52A32 32 0 0 1 148 84H42A32 32 0 0 1 10 52V52A32 32 0 0 1 42 20Z');
});

test('radii too big for the box shrink together, as CSS does', () => {
  // 9999px on a 100 × 40 box: each corner becomes 20 px (the height decides)
  assert.equal(roundedBox(0, 0, 100, 40, radii('9999px')), roundedBox(0, 0, 100, 40, radii('20px')));
});

test('percentages and elliptical corners are resolved against the box', () => {
  // 50% of a 200 × 100 box: ellipses 100 × 50 at every corner
  assert.equal(roundedBox(0, 0, 200, 100, radii('50%')), 'M100 0H100A100 50 0 0 1 200 50V50A100 50 0 0 1 100 100H100A100 50 0 0 1 0 50V50A100 50 0 0 1 100 0Z');
  assert.ok(roundedBox(0, 0, 200, 100, radii('10px 20px')).includes('A10 20 0 0 1'));
});

test('a square box has no arcs that bend', () => {
  assert.equal(roundedBox(0, 0, 10, 10, radii('0px')), 'M0 0H10A0 0 0 0 1 10 0V10A0 0 0 0 1 10 10H0A0 0 0 0 1 0 10V0A0 0 0 0 1 0 0Z');
});

test('maps share an image when they sit at whole map pixels from each other, with room between them', () => {
  const map = (x: number, y: number, k = 0.5) => ({ x, y, w: 178, h: 72, kx: k, ky: k });
  // a grid at 190 × 120 px, half a map pixel per px: 95 and 60 map pixels apart, one image
  assert.deepEqual(classify([map(-4, -4), map(186, -4), map(-4, 116), map(186, 116)]), [[0, 1, 2, 3]]);
  // 1 px off the grid: half a map pixel, an image of its own
  assert.deepEqual(classify([map(-4, -4), map(187, -4)]), [[0], [1]]);
  // another scale: another image
  assert.deepEqual(classify([map(-4, -4), map(186, -4, 0.25)]), [[0], [1]]);
  // touching maps (no map pixel between them) don't share
  assert.deepEqual(classify([map(0, 0), map(178, 0)]), [[0], [1]]);
  assert.deepEqual(classify([map(0, 0), map(182, 0)]), [[0, 1]]);
});
