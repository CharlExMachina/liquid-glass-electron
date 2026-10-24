// The images the glass is made of, as raw RGBA pixels: no DOM, so they can be tested and drawn anywhere.
import { lightAt, sdf, shiftAt, type Lighting, type Optics, type Radii, type Shape } from './optics.ts';

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface DisplacementMap extends Pixels {
  /** the largest shift in the map, px: the channel range 0..255 stands for −rimPx..+rimPx */
  rimPx: number;
}

/**
 * The displacement map of a whole element at `scale` map pixels per CSS px: red is the x shift, green the y shift
 * (128 = none). Each map pixel is the average of `ss`² samples: the map is stretched back up with bilinear filtering,
 * and an average keeps the steep part of the rim from aliasing into beads where a point sample would miss it.
 */
export function displacementMap(s: Shape, o: Optics, scale: number, ss = 4): DisplacementMap {
  const width = Math.max(1, Math.round(s.w * scale)), height = Math.max(1, Math.round(s.h * scale));
  const fx = s.w / width, fy = s.h / height;
  const sx = new Float32Array(width * height), sy = new Float32Array(width * height);
  let rim = 1e-6;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let ax = 0, ay = 0;
      for (let v = 0; v < ss; v++) {
        for (let u = 0; u < ss; u++) {
          const [x, y] = shiftAt((i + (u + 0.5) / ss) * fx - s.w / 2, (j + (v + 0.5) / ss) * fy - s.h / 2, s, o);
          ax += x;
          ay += y;
        }
      }
      ax /= ss * ss;
      ay /= ss * ss;
      sx[j * width + i] = ax;
      sy[j * width + i] = ay;
      rim = Math.max(rim, Math.abs(ax), Math.abs(ay));
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let n = 0; n < width * height; n++) {
    data[n * 4] = Math.round(128 + 127 * sx[n] / rim);
    data[n * 4 + 1] = Math.round(128 + 127 * sy[n] / rim);
    data[n * 4 + 2] = 128;
    data[n * 4 + 3] = 255;
  }
  return { width, height, data, rimPx: rim };
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
 * The light for border-image, at `scale` image pixels per CSS px: a box of 2e + LIGHT_MID, whose middle row and
 * column border-image stretches and whose middle pixel it stretches over the whole middle (so that has to be the flat
 * top's light). Its edges reach as far in as the glow does: e = max(largest corner, bevel, 0.35 × the shorter half).
 * Each corner is drawn with its own radius.
 */
export function lightImage(radii: Radii, bevel: number, shortHalf: number, o: Lighting, scale: number): LightImage | null {
  if (o.fresnel <= 0 && o.edge <= 0 && o.specular <= 0) return null;
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
      const a = lightAt(d, right ? -nx : nx, bottom ? -ny : ny, top(y), shortHalf, zR, o);
      const cover = Math.min(Math.max(d * scale + 0.5, 0), 1);
      const k = (j * px + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.round(255 * cover * a);
    }
  }
  return { width: px, height: px, data, slice: Math.round(e * scale), edge: e };
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
export function tableMap(s: Shape, o: Optics, scale: number, N = 256): TableMap {
  const opt = { ...o, monotone: true };
  const hx = s.w / 2, hy = s.h / 2;
  const zR = Math.min(Math.max(o.bevel, 1), hx, hy);
  const margin = Math.ceil(2 / scale);
  // Per axis: the shift along the middle of the left (top) edge, d px in, d from the bevel's end to `margin` outside.
  // Outside the element the shift stays what it is at the edge.
  const edgeShift = (axis: 0 | 1, d: number) => {
    const dd = Math.max(d, 0.01);
    return axis === 0 ? shiftAt(dd - hx, 0, s, opt)[0] : shiftAt(0, dd - hy, s, opt)[1];
  };
  // The table, per axis: w in [0, 1] (the channel's distance from 0.5, doubled) to a shift >= 0.
  // w in [0, W0]: linear up to the shift at the bevel's end (the middle, where only the magnification moves things);
  // w in [W0, 1]: the edge's profile, linear in d from the bevel's end (zR) to `margin` px outside.
  const W0 = 0.12, K = 2048;
  const tables = ([0, 1] as const).map((axis) => {
    const prof = new Float64Array(K + 1);
    for (let i = 0; i <= K; i++) prof[i] = edgeShift(axis, zR - (zR + margin) * (i / K));
    // strictly rising, so it can be inverted (the flat top gets the slightest slope)
    for (let i = 1; i <= K; i++) prof[i] = Math.max(prof[i], prof[i - 1] + 1e-6 * (prof[K] + 1));
    const start = Math.max(prof[0], 1e-6);
    const forward = (w: number) => {
      if (w <= W0) return (w / W0) * start;
      const f = ((w - W0) / (1 - W0)) * K, i = Math.min(Math.floor(f), K - 1);
      return prof[i] + (prof[i + 1] - prof[i]) * (f - i);
    };
    const inverse = (t: number) => {
      if (t <= start) return (t / start) * W0;
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
  // The map: inside, the value that gives the shift there; outside, the inside values carried on in a straight line.
  const width = Math.max(2, Math.round((s.w + 2 * margin) * scale)), height = Math.max(2, Math.round((s.h + 2 * margin) * scale));
  const fx = (s.w + 2 * margin) / width, fy = (s.h + 2 * margin) / height;
  const valueAt = (px: number, py: number): [number, number] => {
    const [x, y] = shiftAt(px, py, s, opt);
    return [encode(0, x), encode(1, y)];
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const px = (i + 0.5) * fx - margin - hx, py = (j + 0.5) * fy - margin - hy;
      const d = -sdf(px, py, hx, hy, s.radii);
      let v: [number, number];
      if (d >= 0.5) v = valueAt(px, py);
      else {
        // step in along the inward normal to 0.5 and 1.5 px, and carry the line on
        const n = normal(px, py, hx, hy, s.radii);
        const a = valueAt(px - n[0] * (0.5 - d), py - n[1] * (0.5 - d));
        const b = valueAt(px - n[0] * (1.5 - d), py - n[1] * (1.5 - d));
        v = [a[0] + (a[0] - b[0]) * (0.5 - d), a[1] + (a[1] - b[1]) * (0.5 - d)];
      }
      const k = (j * width + i) * 4;
      data[k] = Math.round(Math.min(Math.max(v[0], 0), 1) * 255);
      data[k + 1] = Math.round(Math.min(Math.max(v[1], 0), 1) * 255);
      data[k + 2] = 128;
      data[k + 3] = 255;
    }
  }
  // Chromium bakes the table into bytes by truncating, so each value carries a step more: it rounds instead, and no
  // shift comes out as 128, as in a map without a table.
  const table = (axis: 0 | 1) => Array.from({ length: N }, (_, k) => {
    const v = k / (N - 1), t = Math.sign(2 * v - 1) * tables[axis].forward(Math.abs(2 * v - 1));
    return +Math.min(0.5 + 0.5 * t / rimPx + 1 / 255, 1).toFixed(5);
  });
  return { width, height, data, tableX: table(0), tableY: table(1), rimPx, margin };
}

/** The outward normal of a rounded rectangle at (px, py), from the gradient of its distance. */
function normal(px: number, py: number, hx: number, hy: number, radii: Radii): [number, number] {
  const e = 0.05;
  const gx = sdf(px + e, py, hx, hy, radii) - sdf(px - e, py, hx, hy, radii);
  const gy = sdf(px, py + e, hx, hy, radii) - sdf(px, py - e, hx, hy, radii);
  const l = Math.hypot(gx, gy) || 1;
  return [gx / l, gy / l];
}
