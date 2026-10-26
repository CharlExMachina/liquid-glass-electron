// The scenes of the native comparison: a backdrop (test/native/backdrops/) and glass on it, in CSS px / points, in a
// window of 640 × 400. SwiftUI draws each with glassEffect (native/Glass.swift), this library with glass() (page.js),
// both at 2×.

/** Where the glass goes: the shapes and sizes Apple's glass comes in, from a panel to a control's capsule. */
export const LAYOUTS = {
  panel: { x: 150, y: 100, w: 340, h: 200, shape: 'rect', radius: 40 },
  capsule: { x: 170, y: 160, w: 300, h: 80, shape: 'capsule' },
  circle: { x: 220, y: 100, w: 200, h: 200, shape: 'circle' },
  small: { x: 260, y: 178, w: 120, h: 44, shape: 'capsule' },
  big: { x: 70, y: 50, w: 500, h: 300, shape: 'rect', radius: 24 },
};
// capsules of more sizes, three times as wide as tall, centred: for checking how macOS sizes its glass between those
for (const s of [28, 60, 64, 104, 120, 160]) LAYOUTS[`c${s}`] = { x: 320 - (3 * s) / 2, y: 200 - s / 2, w: 3 * s, h: s, shape: 'capsule' };

export const SIZE = { width: 640, height: 400 };

const scene = (name, backdrop, glass, appearance = 'light') => ({ name, ...SIZE, backdrop, appearance, glass });

/** Every layout × variant × appearance × backdrop: what the measurements are taken from. */
export function measureScenes({ layouts = Object.keys(LAYOUTS), variants = ['regular', 'clear'], appearances = ['light', 'dark'], backdrops } = {}) {
  const out = [];
  for (const b of backdrops) out.push(scene(`none-${b}`, b, []));
  for (const l of layouts) for (const v of variants) for (const a of appearances) for (const b of backdrops) out.push(scene(`${l}-${v}-${a}-${b}`, b, [{ ...LAYOUTS[l], variant: v }], a));
  return out;
}

/** A glass of a scene as this library's options. */
export function toOptions(g) {
  // variant 'none': no variant at all (liquidglass's glass), with the glass's own options (`options`)
  const o = g.variant === 'none' ? { ...g.options } : { variant: g.variant ?? 'regular' };
  if (g.shape === 'capsule' || g.shape === 'circle') o.shape = g.shape;
  else if (g.shape === 'squircle') Object.assign(o, { shape: 'squircle', cornerRadius: g.radius ?? 0 });
  else o.cornerRadius = g.radius ?? 0;
  if (g.tint) o.fill = g.tint;
  return o;
}
