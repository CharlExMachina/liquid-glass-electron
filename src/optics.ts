// The optics, in CSS px: liquidglass's shader (github.com/ybouane/liquidglass), worked out per point instead of
// per fragment, so the same settings give the same look. Pure functions, no DOM: the maps and the lighting are
// drawn from these, and the unit tests check them.

import type { Field } from './field.ts';

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
  /**
   * Apple's lens (bevelMode 2): the rim magnifies toward the middle, most at the edge and fading out over `bevel` px,
   * and the middle is flat
   */
  rim?: boolean;
  /**
   * Apple's switch lens (bevelMode 3): the glass shrinks what's behind it, every point sampling outward along the
   * edge's normal, and its outermost px fold back
   */
  minify?: boolean;
  /**
   * macOS's lens (bevelMode 4): every point samples inward along the edge's normal, by `amount` px at the edge, falling
   * off over a few × `height` px (see macLens)
   */
  mac?: { amount: number; height: number };
  /** the slight magnification toward the middle of a pill */
  magnify: boolean;
}

/**
 * Apple's switch lens, measured from an iOS 26 switch's knob held over lines of known places (a 58 × 37.5 capsule): the
 * shift outward along the edge's normal, as a share of half the shorter side, every 0.02 of the way from the edge (0)
 * to the middle (1). It shrinks what's behind the glass: about 5% at the middle (so a sliver along the middle line is
 * never seen; the two halves part there), rising to 20% a sixth of the way in, then falling through 0 to −28% at the
 * edge, where the glass folds back like thick glass and shows what's further in, mirrored.
 */
const SWITCH_LENS = [
  -0.2758, -0.1876, -0.1091, -0.0361, 0.0094, 0.0632, 0.0725, 0.1335, 0.1415, 0.1598, 0.175, 0.187, 0.1954, 0.201, 0.2042,
  0.2049, 0.2036, 0.2004, 0.1954, 0.1893, 0.1828, 0.1764, 0.1705, 0.1648, 0.1589, 0.1528, 0.1469, 0.1413, 0.1361, 0.1314,
  0.1269, 0.1222, 0.1176, 0.1132, 0.1089, 0.1047, 0.1009, 0.0971, 0.0927, 0.088, 0.0838, 0.0805, 0.0772, 0.0733, 0.0696,
  0.0663, 0.0628, 0.0594, 0.0567, 0.0554, 0.055,
];

/** The switch lens's shift outward, px, at `d` px in from the edge, for a glass whose shorter side is 2 × `half` px. */
export function switchLens(d: number, half: number) {
  const t = clamp(d / half, 0, 1) * (SWITCH_LENS.length - 1), i = Math.min(Math.floor(t), SWITCH_LENS.length - 2);
  return (SWITCH_LENS[i] + (SWITCH_LENS[i + 1] - SWITCH_LENS[i]) * (t - i)) * half;
}

/**
 * macOS 27's lens, measured from SwiftUI's glassEffect over ramps of known levels (test/native): the inward shift along
 * the edge's normal, as a share of the lens's amount, at these depths in units of its height. Glass of every size and
 * shape (a 44 pt capsule, a 340 × 200 panel, a circle, a 500 × 300 panel) falls on this one profile, scaled by the
 * amount and height macOS gives it, and around corners too: the shift follows the normal, never sideways.
 */
const MAC_LENS_T = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.25, 1.5, 2, 3];
const MAC_LENS = [0.95, 0.65, 0.55, 0.47, 0.41, 0.3, 0.235, 0.185, 0.14, 0.075, 0.04, 0.02, 0.015, 0, 0];

/** How far in macOS's lens reaches, in units of its height: nothing is moved deeper than this. */
export const MAC_LENS_REACH = 2;

/** macOS's lens: the inward shift, px, `d` px in from the edge. */
export function macLens(d: number, amount: number, height: number) {
  const t = Math.max(d, 0) / Math.max(height, 0.01);
  if (t >= MAC_LENS_T[MAC_LENS_T.length - 1]) return 0;
  let i = 0;
  while (MAC_LENS_T[i + 1] < t) i++;
  const u = (t - MAC_LENS_T[i]) / (MAC_LENS_T[i + 1] - MAC_LENS_T[i]);
  return (MAC_LENS[i] + (MAC_LENS[i + 1] - MAC_LENS[i]) * u) * amount;
}

/**
 * The lens macOS gives glass whose shorter side is `s` px (SwiftUI's glassBackground filter, read from its layers):
 * the amount is half the shorter side (0.65 of it for clear glass), at most 60 px; the height a quarter of it (0.36 for
 * clear), at most `height` (macOS: 20).
 */
export function macLensSize(s: number, clear: boolean, height: number) {
  return { amount: Math.min((clear ? 0.65 : 0.5) * s, 60), height: Math.min((clear ? 0.36 : 0.25) * s, height) };
}

/**
 * How much of the frost macOS gives glass whose shorter side is `s` px, against the frost it gives large glass: clear
 * glass's blur radius grows from 5 to 10 between 48 and 120 px; regular glass's blur is laid over less of the backdrop
 * below 160 px (from 40% at 64 px down), which measures as a narrower blur (under its blur fill, see lens.ts).
 */
export function macFrost(s: number, clear: boolean, dark: boolean) {
  if (clear) return clamp(5 + ((s - 48) * 5) / 72, 5, 10) / 10;
  const t = clamp((s - 64) / 96, 0, 1);
  return dark ? 0.583 + 0.489 * t : 0.466 + 0.534 * t;
}

/**
 * How bright dark regular glass gets, as a share of white luma: macOS caps it (0.45 for glass 104 px and larger, up to
 * 0.6 at 64 px and smaller), as fitted to what it draws, where a clamp applied to the luma of the coloured backdrop
 * keeps the hue.
 */
export function macMaxLuma(s: number) {
  return 0.158 + 0.833 * clamp(0.6 - 0.00375 * (s - 64), 0.45, 0.6);
}

/** The bevel's height gradient at (x, y), over ±2 px as liquidglass's shader takes it (inward), and the depth there. */
function gradient(f: Field, x: number, y: number, zR: number): [number, number, number] {
  const e = 2;
  const gx = (height(-f.sdf(x + e, y), zR) - height(-f.sdf(x - e, y), zR)) / (2 * e);
  const gy = (height(-f.sdf(x, y + e), zR) - height(-f.sdf(x, y - e), zR)) / (2 * e);
  return [gx, gy, -f.sdf(x, y)];
}

/**
 * Where the backdrop is sampled from, relative to the point (x, y) of the field's box: the bevel's refraction plus
 * the magnification, as liquidglass's shader computes them.
 */
export function shiftAt(x: number, y: number, f: Field, o: Optics): [number, number] {
  const zR = Math.max(o.bevel, 1);
  const [gx, gy, d] = gradient(f, x, y, zR);
  const depth = smoothstep(0, zR, d);
  if (o.dome) {
    const [tx, ty] = f.toward(x, y), k = o.refraction * depth * 0.35;
    return [tx * k, ty * k];
  }
  if (o.rim) {
    // (1 - t)²: falling fast near the edge, then slowly, so a line crossing the rim flares out like a trumpet (as
    // measured from an iPhone's slider); at refraction 1 the edge samples halfway to the middle. Like thick glass, the
    // outermost pixels fold back: they show what's further in, compressed and mirrored.
    const t = clamp(d / zR, 0, 1), k = o.refraction * 0.5 * (1 - t) ** 2;
    const [tx, ty] = f.toward(x, y);
    return [tx * k, ty * k];
  }
  if (o.mac) {
    // inward along the edge's normal, by the measured profile
    const e = 0.05;
    const nx = f.sdf(x + e, y) - f.sdf(x - e, y), ny = f.sdf(x, y + e) - f.sdf(x, y - e), l = Math.hypot(nx, ny) || 1;
    const p = macLens(d, o.mac.amount, o.mac.height) * o.refraction;
    return [(-nx / l) * p, (-ny / l) * p];
  }
  if (o.minify) {
    // Outward along the edge's normal, by the measured profile; and along the long side a little more, as the switch's
    // knob shrinks its middle sideways too: rising across the straight part to 4.9% of the half-side where the round
    // ends begin, and fading into them as the edge turns to face the long way (as the cube of the normal's other part).
    const half = f.shortHalf, e = 0.05;
    const nx = f.sdf(x + e, y) - f.sdf(x - e, y), ny = f.sdf(x, y + e) - f.sdf(x, y - e), l = Math.hypot(nx, ny) || 1;
    const p = switchLens(d, half) * o.refraction;
    const wide = f.w >= f.h, u = wide ? x - f.w / 2 : y - f.h / 2, straight = Math.max(f.w, f.h) / 2 - half;
    const across = Math.abs(wide ? ny / l : nx / l);
    const side = straight <= 0 ? 0 : Math.sign(u) * 0.0489 * half * Math.min(Math.abs(u) / straight, 1) * across ** 3 * o.refraction;
    return [(nx / l) * p + (wide ? side : 0), (ny / l) * p + (wide ? 0 : side)];
  }
  // Biconvex: light bends where it enters and where it leaves, a little more the thicker the glass.
  const k = (1 - 1 / IOR) * (2 + 0.5 * height(d, zR) / zR) * o.refraction * 30;
  const m = o.magnify ? o.refraction * 4 * depth : 0;
  const [px, py] = f.pull(x, y);
  return [gx * k + px * m, gy * k + py * m];
}

/**
 * liquidglass's colour fringe at a point: how far red is sampled from green (blue the same amount the other way), px,
 * along the surface normal: chromAberration × 36 × (0.3 + 0.7 × edge) × |N.xy|, outward. Nothing in the flat middle.
 */
export function fringeAt(x: number, y: number, f: Field, bevel: number, chroma: number): [number, number] {
  const [gx, gy, d] = gradient(f, x, y, Math.max(bevel, 1));
  const n = Math.hypot(gx, gy, 1);
  const edge = smoothstep(f.shortHalf * 0.35, 0, d);
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

/** liquidglass's shadow's opacity `-d` px outside the shape (d is the distance in, so negative outside). */
export function boxShadowAlpha(d: number, opacity: number, spread: number): number {
  const s = Math.max(spread, 1), out = Math.max(-d - 1, 0) / s;
  const a = (0.65 * Math.exp(-out * out) + 0.35 * Math.exp(-2 * out)) * opacity;
  return a * a;
}

/**
 * macOS's outline: a line one device pixel wide just outside the edge, black at `outline` opacity where the edge faces
 * sideways and `outlineTop` where it faces up or down (as measured, over grey and white, from SwiftUI's glass), times
 * `strength`. As box-shadows the size of the element moved a device pixel each way, so it follows the corners and is
 * painted once, like the shadow.
 */
export function outlineShadow(o: { outline: number; outlineTop: number }, strength = 1, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1): string {
  const side = o.outline * strength, top = o.outlineTop * strength, px = `${+(1 / Math.max(dpr, 1)).toFixed(3)}px`;
  const c = (a: number) => `rgb(0 0 0 / ${+a.toFixed(3)})`;
  return [side > 0 && `-${px} 0 0 0 ${c(side)}, ${px} 0 0 0 ${c(side)}`, top > 0 && `0 -${px} 0 0 ${c(top)}, 0 ${px} 0 0 ${c(top)}`].filter(Boolean).join(', ') || 'none';
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
