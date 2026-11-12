// What the shader computes, in JS: the shift it reads from a map (against the optics it stands for), and where a
// source's picture is (CSS's object-fit).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roundedRect } from '../../src/field.ts';
import { tableMap } from '../../src/maps.ts';
import { shiftAt, type Optics } from '../../src/optics.ts';
import { decodeShift, fitRect } from '../../src/webgl.ts';

/** The map's value at a point of the field, stretched over its rectangle as a texture is (bilinear, clamped). */
function sample(m: ReturnType<typeof tableMap>, x: number, y: number, channel: number) {
  const u = ((x - m.rect.x) / m.rect.w) * m.width - 0.5, v = ((y - m.rect.y) / m.rect.h) * m.height - 0.5;
  const at = (i: number, j: number) => m.data[(Math.min(Math.max(j, 0), m.height - 1) * m.width + Math.min(Math.max(i, 0), m.width - 1)) * 4 + channel] / 255;
  const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
  return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
}

test('the shift the shader reads from a map is the optics', () => {
  const f = roundedRect(300, 160, [28, 28, 28, 28]);
  const o: Optics = { refraction: 1, bevel: 40, dome: false, magnify: true };
  const m = tableMap(f, o, 0.5);
  // along the straight edges and across the middle; the tables keep the map exact there
  for (const [x, y] of [[4, 80], [12, 80], [30, 80], [150, 3], [150, 10], [150, 80], [296, 80], [150, 150], [100, 60], [220, 100]]) {
    const [sx, sy] = shiftAt(x, y, f, o);
    const dx = decodeShift(m.tableX, m.bias, m.rimPx, sample(m, x, y, 0)), dy = decodeShift(m.tableY, m.bias, m.rimPx, sample(m, x, y, 1));
    // to within 0.6 px, or 2% where the rim's shift is at its steepest (the map's bytes)
    const near = (got: number, want: number) => Math.abs(got - want) < Math.max(0.6, 0.02 * Math.abs(want));
    assert.ok(near(dx, sx) && near(dy, sy), `at ${x}, ${y}: the map's ${dx.toFixed(2)}, ${dy.toFixed(2)}; the optics' ${sx.toFixed(2)}, ${sy.toFixed(2)}`);
  }
});

test('a dome\'s map decodes to its shift too', () => {
  const f = roundedRect(200, 200, [100, 100, 100, 100]);
  const o: Optics = { refraction: 1.4, bevel: 40, dome: true, magnify: true };
  const m = tableMap(f, o, 0.5);
  for (const [x, y] of [[100, 100], [60, 100], [100, 40], [140, 150]]) {
    const [sx, sy] = shiftAt(x, y, f, o);
    const dx = decodeShift(m.tableX, m.bias, m.rimPx, sample(m, x, y, 0)), dy = decodeShift(m.tableY, m.bias, m.rimPx, sample(m, x, y, 1));
    assert.ok(Math.abs(dx - sx) < 0.6 && Math.abs(dy - sy) < 0.6, `at ${x}, ${y}: ${dx.toFixed(2)}, ${dy.toFixed(2)} for ${sx.toFixed(2)}, ${sy.toFixed(2)}`);
  }
});

test('no shift decodes to none', () => {
  const m = tableMap(roundedRect(300, 160, [28, 28, 28, 28]), { refraction: 1, bevel: 40, dome: false, magnify: false }, 0.5);
  assert.ok(Math.abs(decodeShift(m.tableX, m.bias, m.rimPx, 0.5)) < 0.05);
  assert.ok(Math.abs(decodeShift(m.tableY, m.bias, m.rimPx, 0.5)) < 0.05);
});

test('where a source\'s picture is: object-fit and object-position', () => {
  const box = { x: 10, y: 20, w: 400, h: 200 };
  assert.deepEqual(fitRect(box, 800, 800, 'fill', '50% 50%'), box);
  assert.deepEqual(fitRect(box, 800, 800, 'contain', '50% 50%'), { x: 110, y: 20, w: 200, h: 200 });
  assert.deepEqual(fitRect(box, 800, 800, 'cover', '50% 50%'), { x: 10, y: -80, w: 400, h: 400 });
  assert.deepEqual(fitRect(box, 800, 800, 'cover', '50% 0%'), { x: 10, y: 20, w: 400, h: 400 });
  assert.deepEqual(fitRect(box, 100, 50, 'none', '0% 100%'), { x: 10, y: 170, w: 100, h: 50 });
  assert.deepEqual(fitRect(box, 100, 50, 'scale-down', '100% 50%'), { x: 310, y: 95, w: 100, h: 50 });
  assert.deepEqual(fitRect(box, 800, 800, 'scale-down', '50% 50%'), { x: 110, y: 20, w: 200, h: 200 });
  assert.deepEqual(fitRect(box, 100, 50, 'none', '12px 8px'), { x: 22, y: 28, w: 100, h: 50 });
  // nothing to show yet: the box itself
  assert.deepEqual(fitRect(box, 0, 0, 'cover', '50% 50%'), box);
});
