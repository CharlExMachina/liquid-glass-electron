// The native comparison's cases: scenes that macOS 27 draws with SwiftUI's glassEffect (reference/, captured by
// `pnpm test:native --update` on a Mac) and this library draws with glass(). Each covers a part of the glass: both
// variants, light and dark, a panel, capsules of two sizes, a circle, over photos (two of them were never fitted to:
// alps and night), over ramps that show the lens to a px, a grey for the tone, lines, and glass beside glass (an
// implicit group here).
//
// How far from macOS each may be is in limits.json (run.mjs's measures), written by `pnpm test:native --calibrate`
// from what the glass measures, with room for another GPU's rounding: a change that takes the glass further from
// macOS's fails, and `--self-check` makes sure that the limits are tight enough to catch one.
import { LAYOUTS, SIZE } from './scenes.js';

const one = (layout, variant, appearance, backdrop, extra = {}) => ({
  name: `${layout}-${variant}-${appearance}-${backdrop}`, ...SIZE, backdrop, appearance, glass: [{ ...LAYOUTS[layout], variant, ...extra }],
});

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
  // three capsules in a row, as toolbar buttons: glass beside glass
  {
    name: 'row-regular-light-coast', ...SIZE, backdrop: 'coast', appearance: 'light',
    glass: [130, 270, 410].map((x) => ({ x, y: 178, w: 100, h: 44, shape: 'capsule', variant: 'regular' })),
  },
];
