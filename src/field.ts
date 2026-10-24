// Shapes of glass, as fields over their box (x right, y down, from the box's top-left corner, px): the signed
// distance to the edge, and the direction the magnification pulls in. A rounded rectangle is one; a container's
// glass, several rounded rectangles flowing into each other where they come close, is another.
import { clamp, type Radii } from './optics.ts';

export interface Field {
  /** the box, px */
  w: number;
  h: number;
  /** signed distance to the edge, px: < 0 inside */
  sdf(x: number, y: number): number;
  /** where the magnification pulls a point, per unit of magnification: (−1..1, −1..1), 0 in the middle */
  pull(x: number, y: number): [number, number];
  /** from the point to the middle, px (a dome magnifies by moving every sample toward it) */
  toward(x: number, y: number): [number, number];
  /** half the shorter side (how far in the edge's glow reaches) */
  shortHalf: number;
  /** a point d px in from a straight edge, per axis, for the map's lookup tables (x: a left edge, y: a top edge) */
  probe(axis: 0 | 1, d: number): [number, number];
}

/** Signed distance from a rounded rectangle centred on the origin, with a radius per corner (CSS order). */
export function rectSdf(px: number, py: number, hx: number, hy: number, radii: Radii) {
  const r = py < 0 ? (px < 0 ? radii[0] : radii[1]) : px < 0 ? radii[3] : radii[2];
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** A rounded rectangle filling its box. */
export function roundedRect(w: number, h: number, radii: Radii): Field {
  const hx = w / 2, hy = h / 2;
  return {
    w, h,
    sdf: (x, y) => rectSdf(x - hx, y - hy, hx, hy, radii),
    pull: (x, y) => [-(x - hx) / Math.max(hx, 1), -(y - hy) / Math.max(hy, 1)],
    toward: (x, y) => [hx - x, hy - y],
    shortHalf: Math.min(hx, hy),
    probe: (axis, d) => (axis === 0 ? [d, hy] : [hx, d]),
  };
}

export interface Member {
  /** position in the union's box, and size, px */
  x: number;
  y: number;
  w: number;
  h: number;
  radii: Radii;
}

/**
 * Rounded rectangles as one piece of glass: where two come within `spacing` px of each other, their edges flow
 * together (a smooth minimum of their distances), as Apple's glass in a GlassEffectContainer does. Each pulls its own
 * magnification toward its own middle, blended where they meet.
 */
export function union(w: number, h: number, members: Member[], spacing: number): Field {
  const k = Math.max(spacing, 0.01);
  const each = (x: number, y: number) => members.map((m) => rectSdf(x - m.x - m.w / 2, y - m.y - m.h / 2, m.w / 2, m.h / 2, m.radii));
  // polynomial smooth minimum: the plain minimum wherever the two distances differ by more than `spacing`, so shapes
  // farther apart than that keep their own edges
  const smin = (a: number, b: number) => {
    const t = clamp((k - Math.abs(a - b)) / k, 0, 1);
    return Math.min(a, b) - (t * t * k) / 4;
  };
  const first = members[0] ?? { x: 0, y: 0, w, h, radii: [0, 0, 0, 0] as Radii };
  // each member's say in a point's magnification: the nearer, the more, blended over a quarter of the spacing
  const blend = (x: number, y: number, of: (m: Member) => [number, number]): [number, number] => {
    const ds = each(x, y), lo = Math.min(...ds);
    let px = 0, py = 0, sum = 0;
    members.forEach((m, i) => {
      const wgt = Math.exp(-(ds[i] - lo) / (k / 4 + 1));
      const [a, b] = of(m);
      px += wgt * a;
      py += wgt * b;
      sum += wgt;
    });
    return sum ? [px / sum, py / sum] : [0, 0];
  };
  return {
    w, h,
    sdf: (x, y) => {
      const ds = each(x, y);
      return ds.length ? ds.reduce(smin) : 1e9;
    },
    pull: (x, y) => blend(x, y, (m) => [-(x - m.x - m.w / 2) / Math.max(m.w / 2, 1), -(y - m.y - m.h / 2) / Math.max(m.h / 2, 1)]),
    toward: (x, y) => blend(x, y, (m) => [m.x + m.w / 2 - x, m.y + m.h / 2 - y]),
    shortHalf: Math.min(...members.map((m) => Math.min(m.w, m.h) / 2), Math.min(w, h) / 2),
    probe: (axis, d) => (axis === 0 ? [first.x + d, first.y + first.h / 2] : [first.x + first.w / 2, first.y + d]),
  };
}

/**
 * A rectangle with continuous corners, as Apple draws them (a "squircle"): each corner a superellipse
 * |x|ⁿ + |y|ⁿ = rⁿ instead of a quarter circle, so the curvature eases in from the straight edges. Its distance is the
 * superellipse's level set divided by its gradient, exact on the edge and close near it, which is where the glass bends.
 */
export function squircle(w: number, h: number, radius: number, n = 5): Field {
  const hx = w / 2, hy = h / 2, r = Math.max(Math.min(radius * 1.25, hx, hy), 0.01);
  const level = (x: number, y: number) => {
    const qx = Math.abs(x - hx) - (hx - r), qy = Math.abs(y - hy) - (hy - r);
    if (qx <= 0 || qy <= 0) return Math.max(qx, qy) - r;
    return (qx ** n + qy ** n) ** (1 / n) - r;
  };
  const sdf = (x: number, y: number) => {
    const v = level(x, y), e = 0.01;
    const gx = (level(x + e, y) - level(x - e, y)) / (2 * e), gy = (level(x, y + e) - level(x, y - e)) / (2 * e);
    return v / Math.max(Math.hypot(gx, gy), 1e-6);
  };
  return {
    w, h, sdf,
    pull: (x, y) => [-(x - hx) / Math.max(hx, 1), -(y - hy) / Math.max(hy, 1)],
    toward: (x, y) => [hx - x, hy - y],
    shortHalf: Math.min(hx, hy),
    probe: (axis, d) => (axis === 0 ? [d, hy] : [hx, d]),
  };
}

/**
 * Signed distances from a coverage mask (1 inside, 0 outside), px of the grid: negative inside. Two exact Euclidean
 * distance transforms (Felzenszwalb and Huttenlocher), one to the outside and one to the inside, meeting at the edge.
 */
export function signedDistance(mask: Uint8Array, gw: number, gh: number): Float32Array {
  const INF = 1e20;
  const edt = (inside: boolean) => {
    const f = new Float64Array(gw * gh);
    for (let i = 0; i < f.length; i++) f[i] = (mask[i] > 0) === inside ? 0 : INF;
    const line = (get: (i: number) => number, set: (i: number, v: number) => void, n: number) => {
      const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n);
      for (let q = 0; q < n; q++) g[q] = get(q);
      let k = 0;
      v[0] = 0;
      z[0] = -INF;
      z[1] = INF;
      for (let q = 1; q < n; q++) {
        let s = (g[q] + q * q - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
          k--;
          s = (g[q] + q * q - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        d[q] = (q - v[k]) ** 2 + g[v[k]];
      }
      for (let q = 0; q < n; q++) set(q, d[q]);
    };
    for (let x = 0; x < gw; x++) line((y) => f[y * gw + x], (y, val) => (f[y * gw + x] = val), gh);
    for (let y = 0; y < gh; y++) line((x) => f[y * gw + x], (x, val) => (f[y * gw + x] = val), gw);
    return f;
  };
  const toOutside = edt(false), toInside = edt(true);
  const out = new Float32Array(gw * gh);
  // distance to the nearest pixel of the other kind, less half a pixel: the edge lies between them
  for (let i = 0; i < out.length; i++) out[i] = mask[i] > 0 ? -(Math.sqrt(toOutside[i]) - 0.5) : Math.sqrt(toInside[i]) - 0.5;
  return out;
}

/**
 * A shape given as a grid of signed distances (from a rasterised path) over a w × h box, `scale` grid pixels per px:
 * read with bilinear interpolation. The magnification pulls toward the middle of its box.
 */
export function gridField(w: number, h: number, grid: Float32Array, gw: number, gh: number, scale: number): Field {
  const hx = w / 2, hy = h / 2;
  const at = (x: number, y: number) => {
    const fx = Math.min(Math.max(x * scale - 0.5, 0), gw - 1), fy = Math.min(Math.max(y * scale - 0.5, 0), gh - 1);
    const i0 = Math.floor(fx), j0 = Math.floor(fy), i1 = Math.min(i0 + 1, gw - 1), j1 = Math.min(j0 + 1, gh - 1), tx = fx - i0, ty = fy - j0;
    const g = (i: number, j: number) => grid[j * gw + i];
    const v = (g(i0, j0) * (1 - tx) + g(i1, j0) * tx) * (1 - ty) + (g(i0, j1) * (1 - tx) + g(i1, j1) * tx) * ty;
    // past the grid, the distance keeps growing
    const ox = Math.max(-x, x - w, 0), oy = Math.max(-y, y - h, 0);
    return v / scale + Math.hypot(ox, oy);
  };
  // the widest inscribed half: the deepest point
  let deepest = 0;
  for (const v of grid) deepest = Math.max(deepest, -v / scale);
  return {
    w, h, sdf: at,
    pull: (x, y) => [-(x - hx) / Math.max(hx, 1), -(y - hy) / Math.max(hy, 1)],
    toward: (x, y) => [hx - x, hy - y],
    shortHalf: Math.max(deepest, 1),
    // a straight edge for the tables: from the deepest row's left end, as good a guess as any for a free shape
    probe: (axis, d) => (axis === 0 ? [d, hy] : [hx, d]),
  };
}
