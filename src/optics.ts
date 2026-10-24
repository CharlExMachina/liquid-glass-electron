// The optics, in CSS px: liquidglass's shader (github.com/ybouane/liquidglass), worked out per point instead of
// per fragment, so the same settings give the same look. Pure functions, no DOM: the maps and the lighting are
// drawn from these, and the unit tests check them.

export const IOR = 1.5;
// liquidglass fringes by chromAberration × 18 × 2 px at the rim, where the bevel shifts by about 43 px (at its
// defaults). Here each channel is bent by its own share of the bevel's shift, red further and blue less: 1.7 per
// unit of aberration on either side, as Libre Hub's engine has it.
export const ABERRATION = 1.7;

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The height of the bevel `d` px in from the edge: a quarter circle of radius `zR`, flat beyond it. */
export const height = (d: number, zR: number) => (d <= 0 ? 0 : d >= zR ? zR : Math.sqrt(d * (2 * zR - d)));

/** Its slope, taken over ±2 px as the shader does (which keeps it finite at the edge). */
export const slope = (d: number, zR: number) => (height(d + 2, zR) - height(d - 2, zR)) / 4;

/** Corner radii in CSS order: top-left, top-right, bottom-right, bottom-left. */
export type Radii = [number, number, number, number];

/**
 * Signed distance from a rounded rectangle centred on the origin (half sizes hx, hy, a radius per corner); < 0 inside.
 * Each quadrant uses its own corner's radius, as CSS draws them.
 */
export function sdf(px: number, py: number, hx: number, hy: number, radii: Radii) {
  const r = py < 0 ? (px < 0 ? radii[0] : radii[1]) : px < 0 ? radii[3] : radii[2];
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

export interface Shape {
  /** width and height, px */
  w: number;
  h: number;
  /** corner radii, px, each at most half the shorter side */
  radii: Radii;
}

/** Radii clamped to half the shorter side, as a glass's corners are circular. */
export const clampRadii = (radii: number[], w: number, h: number): Radii =>
  radii.map((r) => clamp(r, 0, Math.min(w, h) / 2)) as Radii;

export interface Optics {
  /** how much the bevel bends the backdrop (liquidglass: refraction) */
  refraction: number;
  /** depth of the curved rim, px (zRadius) */
  bevel: number;
  /** a dome that magnifies the whole element instead of a pill with a bevelled rim (bevelMode 1) */
  dome: boolean;
  /** the slight magnification toward the middle of a pill */
  magnify: boolean;
  /** keep the bevel's slope at its peak (2 px in) all the way to the edge, so the profile only falls inward */
  monotone?: boolean;
}

/**
 * Where the backdrop is sampled from, relative to the point, for a point (px, py) measured from the element's centre
 * (y down): the bevel's refraction plus the magnification, as liquidglass's shader computes them.
 */
export function shiftAt(px: number, py: number, s: Shape, o: Optics): [number, number] {
  const hx = s.w / 2, hy = s.h / 2;
  const r = s.radii;
  const zR = Math.max(o.bevel, 1);
  const d = -sdf(px, py, hx, hy, r);
  const depth = smoothstep(0, zR, d);
  if (o.dome) {
    const k = o.refraction * depth * 0.35;
    return [-px * k, -py * k];
  }
  const e = 2;
  let gx = (height(-sdf(px + e, py, hx, hy, r), zR) - height(-sdf(px - e, py, hx, hy, r), zR)) / (2 * e);
  let gy = (height(-sdf(px, py + e, hx, hy, r), zR) - height(-sdf(px, py - e, hx, hy, r), zR)) / (2 * e);
  if (o.monotone && d < 2) {
    // the gradient's direction, at the peak's magnitude, rising 2% a px on toward the edge (so it keeps rising)
    const g = Math.hypot(gx, gy) || 1, peak = slope(2, zR) * (1 + 0.02 * (2 - d));
    gx = (gx / g) * peak;
    gy = (gy / g) * peak;
  }
  // Biconvex: light bends where it enters and where it leaves, a little more the thicker the glass.
  const k = (1 - 1 / IOR) * (2 + 0.5 * height(o.monotone ? Math.max(d, 2) : d, zR) / zR) * o.refraction * 30;
  const m = o.magnify ? o.refraction * 4 * depth : 0;
  return [gx * k - (px / Math.max(hx, 1)) * m, gy * k - (py / Math.max(hy, 1)) * m];
}

/**
 * liquidglass's colour fringe at a point: how far red is sampled from green (blue the same amount the other way), px,
 * along the surface normal: chromAberration × 36 × (0.3 + 0.7 × edge) × |N.xy|, outward. Nothing in the flat middle.
 */
export function fringeAt(px: number, py: number, s: Shape, bevel: number, chroma: number): [number, number] {
  const hx = s.w / 2, hy = s.h / 2, r = s.radii, zR = Math.max(bevel, 1), e = 2;
  const d = -sdf(px, py, hx, hy, r);
  const gx = (height(-sdf(px + e, py, hx, hy, r), zR) - height(-sdf(px - e, py, hx, hy, r), zR)) / (2 * e);
  const gy = (height(-sdf(px, py + e, hx, hy, r), zR) - height(-sdf(px, py - e, hx, hy, r), zR)) / (2 * e);
  const n = Math.hypot(gx, gy, 1);
  const edge = smoothstep(Math.min(hx, hy) * 0.35, 0, d);
  const k = chroma * 36 * (0.3 + 0.7 * edge);
  // N.xy = −grad / |(−grad, 1)|: outward
  return [(-gx / n) * k, (-gy / n) * k];
}

// ---------------------------------------------------------------- lighting

export interface Lighting {
  fresnel: number;
  edge: number;
  specular: number;
}

const unit = (x: number, y: number, z: number): [number, number, number] => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Its four lights, for Blinn-Phong highlights seen from straight above (y points down, as on screen).
const halfway = (l: number[]) => unit(l[0], l[1], l[2] + 1);
const H1 = halfway(unit(0.4, 0.7, 1)), H2 = halfway(unit(-0.3, -0.5, 1)), L3 = unit(0.1, 0.3, 1), H4 = halfway(unit(0, 0.9, 0.4));

/**
 * The light at a point `d` px in from the edge, with outward normal (nx, ny); `top` is 1 at the top of the element and
 * 0 at its bottom; `shortHalf` is half the element's shorter side. White light, returned as its strength (0..1).
 * liquidglass adds most of these terms to the colour and mixes toward white by the Fresnel term; laid over as white,
 * the result is the same to within a few percent. Light doesn't bend, so this is painted once, as a border-image.
 */
export function lightAt(d: number, nx: number, ny: number, top: number, shortHalf: number, zR: number, o: Lighting) {
  const s = d >= zR ? 0 : slope(d, zR);
  const N = unit(s * nx, s * ny, 1);
  const fres = (1 - Math.abs(N[2])) ** 4 * o.fresnel;
  const spec = (Math.max(dot(N, H1), 0) ** 90 + Math.max(dot(N, H2), 0) ** 50 * 0.3 + Math.max(dot(N, L3), 0) ** 6 * 0.1
    + Math.max(dot(N, H4), 0) ** 120 * 0.6) * o.specular;
  const stroke = smoothstep(-2.5, -1.5, -d) * (1 - smoothstep(-1, 0, -d)) * (0.4 + 0.6 * top);
  const rim = smoothstep(shortHalf * 0.35, 0, d) * o.edge * 0.22;
  const glow = smoothstep(5, 0, d) * o.edge * 0.15;
  const env = (N[1] * 0.5 + 0.5) * fres * 0.08;
  const added = clamp(spec + rim + glow + stroke * o.edge * 0.55 + env, 0, 1);
  return 1 - (1 - added) * (1 - fres * 0.2);
}

// ---------------------------------------------------------------- the rest of liquidglass's options, as CSS

/**
 * liquidglass blurs with three passes of a 9-tap Gaussian (σ ≈ 1.75 taps) spread 2.5 × blurAmount px apart, in each
 * direction: one Gaussian of σ = √3 × 1.75 × 2.5 × blurAmount px.
 */
export const blurSigma = (blurAmount: number) => Math.max(blurAmount, 0) * Math.sqrt(3) * 1.75 * 2.5;

/**
 * Its tint: a mix toward the colour multiplied by (0.92, 0.95, 1.05), a cool glass. With a tint colour of our own,
 * the mix is toward the colour multiplied by that. Returned as the diagonal of a colour matrix.
 */
export function tintGains(strength: number, rgb: [number, number, number] = [0.92, 0.95, 1.05]): [number, number, number] {
  return rgb.map((c) => 1 + (c - 1) * strength) as [number, number, number];
}

/**
 * A 4×5 colour matrix (feColorMatrix order) for saturation (liquidglass: mix from luma by 1 + saturation, Rec. 601),
 * brightness (× 1 + brightness) and the tint gains, in that order.
 */
export function colorMatrix(saturation: number, brightness: number, gains: [number, number, number]): number[] {
  const s = 1 + saturation, b = 1 + brightness;
  const lr = 0.299 * (1 - s), lg = 0.587 * (1 - s), lb = 0.114 * (1 - s);
  const rows = [
    [lr + s, lg, lb],
    [lr, lg + s, lb],
    [lr, lg, lb + s],
  ];
  const m: number[] = [];
  rows.forEach((row, i) => m.push(...row.map((v) => v * b * gains[i]), 0, 0));
  m.push(0, 0, 0, 1, 0);
  return m;
}

/**
 * liquidglass's shadow: 0.65 exp(−d²/s²) + 0.35 exp(−2d/s) from 1 px outside the shape (s = shadowSpread), times
 * shadowOpacity; then squared, as its canvas blends alpha with itself (SRC_ALPHA on a non-premultiplied canvas). As
 * two CSS box-shadows, a least-squares fit of their blurred edges to that falloff (mean error 0.0002).
 */
export function boxShadow(opacity: number, spread: number, offsetY: number): string {
  if (opacity <= 0) return 'none';
  const s = Math.max(spread, 1);
  const px = (v: number) => `${+v.toFixed(2)}px`;
  const a = (k: number) => +Math.min(k * opacity * opacity, 1).toFixed(3);
  return `0 ${px(offsetY)} ${px(0.9 * s)} ${px(1 + 0.4 * s)} rgb(0 0 0 / ${a(0.666)}), 0 ${px(offsetY)} ${px(1.3 * s)} ${px(1 - 0.5 * s)} rgb(0 0 0 / ${a(2.066)})`;
}
