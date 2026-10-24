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
  // polynomial smooth minimum: exact (the plain minimum) wherever the shapes are more than `spacing` apart
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
