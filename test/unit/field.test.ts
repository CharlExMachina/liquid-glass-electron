import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rectSdf, roundedRect, union } from '../../src/field.ts';

test('a rounded rectangle\'s distance: negative inside, zero on the edge, per-corner radii', () => {
  const f = roundedRect(200, 100, [10, 20, 30, 40]);
  assert.ok(f.sdf(100, 50) < 0);
  assert.equal(f.sdf(0, 50), 0);
  assert.equal(f.sdf(100, 0), 0);
  // the top-left corner's arc, radius 10: its centre is (10, 10)
  assert.ok(Math.abs(f.sdf(10 - 10 / Math.SQRT2, 10 - 10 / Math.SQRT2)) < 1e-9);
  // the bottom-left one's, radius 40
  assert.ok(Math.abs(f.sdf(40 - 40 / Math.SQRT2, 60 + 40 / Math.SQRT2)) < 1e-9);
  assert.equal(rectSdf(0, 0, 10, 10, [0, 0, 0, 0]), -10);
});

test('shapes farther apart than the spacing stay apart; closer ones flow together', () => {
  const a = { x: 0, y: 0, w: 50, h: 50, radii: [25, 25, 25, 25] as [number, number, number, number] };
  const b = { ...a, x: 100 };
  const f = union(150, 50, [a, b], 10);
  // each edge stays where it was, and the gap between them isn't glass
  assert.equal(f.sdf(50, 25), 0);
  assert.equal(f.sdf(100, 25), 0);
  assert.ok(f.sdf(75, 25) > 0);
  // close enough to flow together: the gap between them is filled
  const g = union(110, 50, [a, { ...a, x: 56 }], 20);
  assert.ok(g.sdf(53, 25) < 0, 'the 6 px gap is glass');
  assert.ok(g.sdf(53, 2) > 0, 'with a waist');
});

test('in a union, each shape pulls the magnification toward its own middle', () => {
  const a = { x: 0, y: 0, w: 100, h: 100, radii: [10, 10, 10, 10] as [number, number, number, number] };
  const f = union(400, 100, [a, { ...a, x: 300 }], 8);
  const [px] = f.pull(20, 50);
  const [qx] = f.pull(380, 50);
  assert.ok(px > 0.5 && qx < -0.5);
});

test('signed distances from a mask: exact for a filled disc', async () => {
  const { signedDistance } = await import('../../src/field.ts');
  const n = 101, r = 30, mask = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mask[y * n + x] = Math.hypot(x - 50, y - 50) <= r ? 1 : 0;
  const d = signedDistance(mask, n, n);
  // the centre is about r deep, a point 20 px outside about 20 out, the edge about 0
  assert.ok(Math.abs(d[50 * n + 50] + r) < 1.2);
  assert.ok(Math.abs(d[50 * n + 100] - 20) < 1.2);
  assert.ok(Math.abs(d[50 * n + 80]) < 1);
});

test('a squircle\'s corners ease in: between a square\'s and a circle\'s', async () => {
  const { squircle } = await import('../../src/field.ts');
  const f = squircle(200, 200, 40);
  assert.ok(Math.abs(f.sdf(0, 100)) < 1e-6, 'straight edges where a rectangle\'s are');
  // along the corner's diagonal the edge sits further out than a circular corner of the same radius
  const t = (k: number) => f.sdf(k, k);
  let edge = 0;
  for (let k = 0; k < 60; k += 0.1) if (t(k) <= 0) { edge = k; break; }
  const circle = 40 - 40 / Math.SQRT2;
  assert.ok(edge < circle + 6 && edge > 2, `corner edge at ${edge.toFixed(2)}`);
});
