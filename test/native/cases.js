// The native comparison's cases: scenes that macOS 27 draws with SwiftUI's glassEffect (reference/, captured by
// `pnpm test:native --update` on a Mac) and this library draws with glass(). Each covers a part of the glass: both
// variants, light and dark, a panel, capsules of two sizes, a circle, over photos (two of them were never fitted to:
// alps and night), over ramps that show the lens to a px, a grey for the tone, lines, glass beside glass (an
// implicit group here), and macOS's colour fringe, which its glass doesn't use but its filter has.
//
// How far from macOS each may be is in limits.json (run.mjs's measures), written by `pnpm test:native --calibrate`
// from what the glass measures, with room for another GPU's rounding: a change that takes the glass further from
// macOS's fails, and `--self-check` makes sure that the limits are tight enough to catch one.
import { LAYOUTS, SIZE } from './scenes.js';

const one = (layout, variant, appearance, backdrop, extra = {}) => ({
  name: `${layout}-${variant}-${appearance}-${backdrop}`, ...SIZE, backdrop, appearance, glass: [{ ...LAYOUTS[layout], variant, ...extra }],
});

/**
 * A case with macOS's colour fringe: `points` of the glass filter's inputAberrationAmount, its height the lens's own and
 * blue sampled further across (native/Glass.swift), and here the chromAberration that gives the same. On glass in a
 * square box macOS moves red and blue 0.8 × the amount × its lens's profile either way of green (measured over ramps on
 * macOS 27.0.1; in a box of another shape it scales that by the shape, which this library doesn't). That profile is
 * 0.95 at the edge, and this library's fringe is chromAberration × FRINGE (36) px there.
 */
export const aberration = (points) => +((0.95 * 0.8 * points) / 36).toFixed(4);
const fringed = (c, points) => ({ ...c, name: `${c.name}-fringe`, aberration: points, glass: c.glass.map((g) => ({ ...g, chromAberration: aberration(points) })) });

export const CASES = [
  // regular glass
  one('panel', 'regular', 'light', 'coast'),
  one('panel', 'regular', 'dark', 'night'),
  one('capsule', 'regular', 'light', 'ponds'),
  one('small', 'regular', 'light', 'alps'),
  one('small', 'regular', 'dark', 'alps'),
  one('circle', 'regular', 'light', 'alps'),
  one('big', 'regular', 'light', 'ponds'),
  one('panel', 'regular', 'dark', 'g128'),
  // clear glass
  one('panel', 'clear', 'light', 'coast'),
  one('panel', 'clear', 'dark', 'night'),
  one('capsule', 'clear', 'light', 'ponds'),
  one('small', 'clear', 'dark', 'coast'),
  one('circle', 'clear', 'dark', 'ponds'),
  one('big', 'clear', 'light', 'alps'),
  // the lens: ramps, where a px of difference in the shift is a level or so, and bars under regular glass's frost
  one('panel', 'clear', 'light', 'rampx-panel'),
  one('small', 'regular', 'light', 'rampy-small'),
  one('panel', 'regular', 'light', 'barsy0'),
  // colour fringing: macOS's glass with its filter's aberration set (it leaves it unset), 20 points of
  // inputAberrationAmount, against this library's chromAberration for the same fringe (see aberration). On round glass
  // in a square box, where macOS's fringe isn't scaled by the box's shape: across, over a ramp (blue further in on the
  // left and right), down (red further in at the top and bottom), and over a photo
  fringed(one('circle', 'clear', 'light', 'rampx-circle'), 20),
  fringed(one('circle', 'clear', 'light', 'rampy-circle'), 20),
  fringed(one('circle', 'clear', 'light', 'coast'), 20),
  // three capsules in a row, as toolbar buttons: glass beside glass
  {
    name: 'row-regular-light-coast', ...SIZE, backdrop: 'coast', appearance: 'light',
    glass: [130, 270, 410].map((x) => ({ x, y: 178, w: 100, h: 44, shape: 'capsule', variant: 'regular' })),
  },
];
