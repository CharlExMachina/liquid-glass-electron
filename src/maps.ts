// The images the glass is made of, as raw RGBA pixels: no DOM, so they can be tested and drawn anywhere.
import type { Field } from './field.ts';
import { boxShadowAlpha, fringeAt, lightAt, shiftAt, type Lighting, type Optics, type Radii } from './optics.ts';

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// The lighting image's middle, which border-image stretches: tall enough for the edge stroke to fade smoothly from
// the top of the element to its bottom.
export const LIGHT_MID = 32;

export interface LightImage extends Pixels {
  /** border-image-slice, in image pixels */
  slice: number;
  /** border-image-width, CSS px */
  edge: number;
}

/**
 * The light of a rounded rectangle, for border-image, at `scale` image pixels per CSS px: a box of 2e + LIGHT_MID, whose middle row and
 * column border-image stretches and whose middle pixel it stretches over the whole middle (so that has to be the flat
 * top's light). Its edges reach as far in as the glow does: e = max(largest corner, bevel, 0.35 × the shorter half).
 * Each corner is drawn with its own radius.
 */
export function lightImage(radii: Radii, bevel: number, shortHalf: number, o: Lighting, scale: number, fill: RGBA | null = null): LightImage | null {
  const lit = o.fresnel > 0 || o.edge > 0 || o.specular > 0;
  if (!lit && !fill) return null;
  const zR = Math.max(Math.min(bevel, shortHalf), 1);
  const e = Math.ceil(Math.max(...radii, zR, shortHalf * 0.35));
  const size = 2 * e + LIGHT_MID;
  const px = Math.max(1, Math.round(size * scale));
  const data = new Uint8ClampedArray(px * px * 4);
  // A point (x, y) from a corner of radius r: its distance from the edge and the outward normal (as seen from the
  // top-left corner), or null outside the arc.
  const corner = (x: number, y: number, r: number): [number, number, number] | null => {
    const u = r - x, v = r - y;
    if (u > 0 && v > 0) {
      const len = Math.hypot(u, v);
      // just outside the arc still counts, for the light's antialiased edge
      return len > r + 1 ? null : [r - len, -u / len, -v / len];
    }
    return u > v ? [x, -1, 0] : [y, 0, -1];
  };
  // The edge stroke is brightest at the top of the element and fades to its bottom; stretched, the middle rows
  // stand for everything in between.
  const top = (y: number) => (y < e ? 1 : y > size - e ? 0 : 1 - (y - e) / LIGHT_MID);
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const x = (i + 0.5) / scale, y = (j + 0.5) / scale;
      const right = x > size / 2, bottom = y > size / 2;
      const lx = right ? size - x : x, ly = bottom ? size - y : y;
      const r = radii[bottom ? (right ? 2 : 3) : right ? 1 : 0];
      // as seen from the top-left corner (the middle row and column are straight edges), then mirrored
      const hit = lx >= e && ly >= e ? [Infinity, 0, 0] : lx >= e ? [ly, 0, -1] : ly >= e ? [lx, -1, 0] : corner(lx, ly, r);
      if (!hit) continue;
      const [d, nx, ny] = hit;
      const a = lit ? lightAt(d, right ? -nx : nx, bottom ? -ny : ny, top(y), shortHalf, zR, o) : 0;
      const cover = Math.min(Math.max(d * scale + 0.5, 0), 1);
      paint(data, (j * px + i) * 4, cover, a, fill);
    }
  }
  return { width: px, height: px, data, slice: Math.round(e * scale), edge: e };
}

/** A colour, 0..255, with its alpha 0..1. */
export type RGBA = [number, number, number, number];

/** White light of strength `a` over the fill colour, both covering `cover` of the pixel, into an RGBA pixel. */
function paint(data: Uint8ClampedArray, k: number, cover: number, a: number, fill: RGBA | null) {
  const fa = fill ? fill[3] * cover : 0, la = a * cover;
  const A = la + fa * (1 - la);
  if (A <= 0) return;
  for (let c = 0; c < 3; c++) data[k + c] = Math.round((255 * la + (fill ? fill[c] : 0) * fa * (1 - la)) / A);
  data[k + 3] = Math.round(255 * A);
}

export interface TableMap extends Pixels {
  /** feFuncR / feFuncG tableValues: the map's channel (0..1) to the displacement channel (0..1, 0.5 = none) */
  tableX: number[];
  tableY: number[];
  /** the largest shift, px: the displacement channel's range 0..1 stands for −rimPx..+rimPx */
  rimPx: number;
  /** how far the image reaches past the element on each side, px */
  margin: number;
}

/**
 * A displacement map that stays exact at a quarter of the resolution. The bevel's shift rises steeply within a few px
 * of the edge, which a small map stretched back up can't follow; but the distance from the edge is linear there, and
 * stretching reproduces a linear ramp exactly. So the map stores, per axis, where on a lookup table the shift is, laid
 * out linearly in distance from the edge (and in position across the middle), and feComponentTransfer's table turns it
 * back into the shift. Along the straight edges it's exact; in the corners, the stored value is what gives the right
 * shift through the same table, which varies smoothly too. The bevel's profile has to only fall inward for that
 * (`monotone`), which changes nothing visible. The image reaches `margin` px past the edge, so the outermost pixels
 * are interpolated rather than clamped.
 */
export function tableMap(f: Field, o: Optics, scale: number, N = 256, fringe = 0): TableMap {
  const opt = { ...o, monotone: true };
  // `fringe` ≠ 0: this channel's map, sampled liquidglass's colour fringe further out (red, > 0) or in (blue, < 0)
  const shift = (x: number, y: number): [number, number] => {
    const [sx, sy] = shiftAt(x, y, f, opt);
    if (!fringe) return [sx, sy];
    const [fx, fy] = fringeAt(x, y, f, o.bevel, Math.abs(fringe));
    return [sx + Math.sign(fringe) * fx, sy + Math.sign(fringe) * fy];
  };
  const zR = Math.min(Math.max(o.bevel, 1), f.shortHalf);
  const margin = Math.ceil(2 / scale);
  if (o.dome) return smoothMap(f, shift, scale, margin, N);
  // Per axis: the shift d px in from a straight edge (left, top), d from the bevel's end to `margin` outside.
  // Outside the element the shift stays what it is at the edge.
  const edgeShift = (axis: 0 | 1, d: number) => {
    const [x, y] = f.probe(axis, Math.max(d, 0.01));
    return shift(x, y)[axis];
  };
  // The table, per axis: w in [0, 1] (the channel's distance from 0.5, doubled) to a shift >= 0.
  // w in [0, W0]: linear up to the shift at the bevel's end (the middle, where only the magnification moves things);
  // w in [W0, 1]: the edge's profile, linear in d from the bevel's end (zR) to `margin` px outside.
  const K = 2048;
  const tables = ([0, 1] as const).map((axis) => {
    const prof = new Float64Array(K + 1);
    for (let i = 0; i <= K; i++) prof[i] = edgeShift(axis, zR - (zR + margin) * (i / K));
    // strictly rising, so it can be inverted (the flat top gets the slightest slope)
    for (let i = 1; i <= K; i++) prof[i] = Math.max(prof[i], prof[i - 1] + 1e-6 * (prof[K] + 1));
    // Where the bevel's end is the middle (a capsule's long axis), nothing is left for the middle's segment: the
    // profile starts from no shift, and takes the whole range.
    const start = Math.max(prof[0], 1e-6), W0 = start > 0.25 ? 0.12 : 0;
    const forward = (w: number) => {
      if (w <= W0) return W0 ? (w / W0) * start : 0;
      const t = ((w - W0) / (1 - W0)) * K, i = Math.min(Math.floor(t), K - 1);
      return prof[i] + (prof[i + 1] - prof[i]) * (t - i);
    };
    const inverse = (t: number) => {
      if (W0 && t <= start) return (t / start) * W0;
      if (t >= prof[K]) return 1;
      let lo = 0, hi = K;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (prof[m] < t) lo = m;
        else hi = m;
      }
      return W0 + ((lo + (t - prof[lo]) / (prof[hi] - prof[lo])) / K) * (1 - W0);
    };
    return { forward, inverse, top: prof[K] };
  });
  const rimPx = Math.max(tables[0].top, tables[1].top, 1e-6);
  const encode = (axis: 0 | 1, t: number) => 0.5 + 0.5 * Math.sign(t) * tables[axis].inverse(Math.abs(t));
  const valueAt = (x: number, y: number): [number, number] => {
    const [sx, sy] = shift(x, y);
    return [encode(0, sx), encode(1, sy)];
  };
  // The map: inside, the value that gives the shift there; outside, the inside values carried on in a straight line.
  const { width, height, data } = sampleBox(f, scale, margin, (x, y, d) => {
    if (d >= 0.5) return valueAt(x, y);
    // step in along the inward normal to 0.5 and 1.5 px, and carry the line on
    const n = normal(f, x, y);
    const a = valueAt(x - n[0] * (0.5 - d), y - n[1] * (0.5 - d));
    const b = valueAt(x - n[0] * (1.5 - d), y - n[1] * (1.5 - d));
    return [a[0] + (a[0] - b[0]) * (0.5 - d), a[1] + (a[1] - b[1]) * (0.5 - d)];
  }, (v) => Math.round(Math.min(Math.max(v, 0), 1) * 255));
  // Chromium bakes the table into bytes by truncating, so each value carries a step more: it rounds instead, and no
  // shift comes out as 128, as in a map without a table.
  const table = (axis: 0 | 1) => Array.from({ length: N }, (_, k) => {
    const v = k / (N - 1), t = Math.sign(2 * v - 1) * tables[axis].forward(Math.abs(2 * v - 1));
    return +Math.min(0.5 + 0.5 * t / rimPx + 1 / 255, 1).toFixed(5);
  });
  return { width, height, data, tableX: table(0), tableY: table(1), rimPx, margin };
}

/**
 * The map's pixels: the field's box and `margin` px around it, at `scale` pixels per px, red and green from
 * `value(x, y, d)` (d: distance in from the edge), blue 128, opaque.
 */
function sampleBox(f: Field, scale: number, margin: number, value: (x: number, y: number, d: number) => [number, number], byte: (v: number) => number): Pixels {
  const width = Math.max(2, Math.round((f.w + 2 * margin) * scale)), height = Math.max(2, Math.round((f.h + 2 * margin) * scale));
  const fx = (f.w + 2 * margin) / width, fy = (f.h + 2 * margin) / height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) * fx - margin, y = (j + 0.5) * fy - margin;
      const v = value(x, y, -f.sdf(x, y));
      const k = (j * width + i) * 4;
      data[k] = byte(v[0]);
      data[k + 1] = byte(v[1]);
      data[k + 2] = 128;
      data[k + 3] = 255;
    }
  }
  return { width, height, data };
}

/**
 * A dome's shift has no steep rim, so its map stores the shift as it is (with tables that change nothing), and
 * carries it on past the edge.
 */
function smoothMap(f: Field, shift: (x: number, y: number) => [number, number], scale: number, margin: number, N: number): TableMap {
  // outside, the value at the edge
  const at = (x: number, y: number, d: number): [number, number] => {
    if (d >= 0.5) return shift(x, y);
    const n = normal(f, x, y);
    return shift(x - n[0] * (0.5 - d), y - n[1] * (0.5 - d));
  };
  let rimPx = 1e-6;
  sampleBox(f, scale, margin, (x, y, d) => {
    const [sx, sy] = at(x, y, d);
    rimPx = Math.max(rimPx, Math.abs(sx), Math.abs(sy));
    return [0, 0];
  }, () => 0);
  const { width, height, data } = sampleBox(f, scale, margin, (x, y, d) => {
    const [sx, sy] = at(x, y, d);
    return [128 + 127 * sx / rimPx, 128 + 127 * sy / rimPx];
  }, (v) => Math.round(Math.min(Math.max(v, 0), 255)));
  // identity, with the same step as tableMap's (Chromium truncates when it bakes the table)
  const identity = Array.from({ length: N }, (_, k) => +Math.min(k / (N - 1) + 0.5 / 255, 1).toFixed(5));
  return { width, height, data, tableX: identity, tableY: identity, rimPx, margin };
}

/** The outward normal of a field's edge at (x, y), from the gradient of its distance. */
function normal(f: Field, x: number, y: number): [number, number] {
  const e = 0.05;
  const gx = f.sdf(x + e, y) - f.sdf(x - e, y);
  const gy = f.sdf(x, y + e) - f.sdf(x, y - e);
  const l = Math.hypot(gx, gy) || 1;
  return [gx / l, gy / l];
}

export interface FieldLight {
  /** the light inside the shape, its shadow outside it, and its coverage (for mask-image), all the same size */
  light: Pixels;
  shadow: Pixels;
  mask: Pixels;
  /** how far the images reach past the box on each side, px (for the shadow) */
  pad: number;
}

/**
 * The light of any shape (a container's merged glass), its shadow, and its coverage: whole images over the box and
 * `pad` px around it, at `scale` pixels per px. Light is worked out only near the edge, where it changes; the middle
 * is the flat top's light. A 9-slice border-image can't do a shape like this, so these are background and mask
 * images, drawn again when the shape changes.
 */
export function fieldLight(f: Field, bevel: number, o: Lighting, shadow: { opacity: number; spread: number; offsetY: number }, scale: number, pad: number, fill: RGBA | null = null): FieldLight {
  const zR = Math.max(Math.min(bevel, f.shortHalf), 1);
  const reach = Math.max(zR, f.shortHalf * 0.35) + 2;
  const width = Math.max(1, Math.round((f.w + 2 * pad) * scale)), height = Math.max(1, Math.round((f.h + 2 * pad) * scale));
  const light = new Uint8ClampedArray(width * height * 4), shade = new Uint8ClampedArray(width * height * 4), mask = new Uint8ClampedArray(width * height * 4);
  const flat = lightAt(Infinity, 0, 0, 0.5, f.shortHalf, zR, o);
  const lit = o.fresnel > 0 || o.edge > 0 || o.specular > 0;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / scale - pad, y = (j + 0.5) / scale - pad;
      const d = -f.sdf(x, y);
      const k = (j * width + i) * 4;
      const cover = Math.min(Math.max(d * scale + 0.5, 0), 1);
      if (cover > 0) {
        mask[k + 3] = Math.round(255 * cover);
        if (lit || fill) {
          let a = lit ? flat : 0;
          if (lit && d < reach) {
            const [nx, ny] = normal(f, x, y);
            a = lightAt(Math.max(d, 0), nx, ny, 1 - Math.min(Math.max(y / f.h, 0), 1), f.shortHalf, zR, o);
          }
          paint(light, k, cover, a, fill);
        }
      }
      if (cover < 1 && shadow.opacity > 0) {
        // the shadow, from the shape moved down by its offset, under what the shape doesn't cover
        shade[k + 3] = Math.round(255 * (1 - cover) * boxShadowAlpha(-f.sdf(x, y - shadow.offsetY), shadow.opacity, shadow.spread));
      }
    }
  }
  return { light: { width, height, data: light }, shadow: { width, height, data: shade }, mask: { width, height, data: mask }, pad };
}
