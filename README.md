# liquid-glass-electron

Liquid glass for Electron: Apple's Liquid Glass look, built from a primitive you can bend, fade, reshape and animate,
on any element of an Electron app.

<!-- MEDIA:hero -->

Electron is Chromium, and Chromium's `backdrop-filter` accepts an SVG filter. An `feDisplacementMap` in that filter
bends whatever the compositor has already drawn behind the element, on the GPU. So the glass needs no copy of the page,
no WebGL and no render loop. Text, video, CSS animations and scrolling content bend through it as they change, and when
nothing on screen changes it costs nothing at all.

- **The optics are [liquidglass](https://github.com/ybouane/liquidglass)'s**, at the same option names and defaults: a
  quarter-circle bevel that bends light where it enters and where it leaves, slight magnification toward the middle,
  colour fringing at the rim, and its Fresnel, specular and edge light. At its defaults this library's glass is within
  the difference liquidglass has with itself moved by one pixel (see [the comparison](#compared-with-liquidglass)).
- **Apple's knobs:** regular, clear and identity glass, tints, interactive glass, capsules, circles, concentric and
  continuous ("squircle") corners, containers whose glass flows together, morphing, materializing, `.glass` and
  `.glassProminent` buttons, scroll edges, the system's Clear/Tinted setting, Reduce Transparency, Increase Contrast and
  Reduce Motion. [docs/APPLE.md](docs/APPLE.md) maps each part of Apple's API to this one.
- **A primitive, not a widget set.** Every visual parameter can change every frame without rebuilding the filter:
  `strength` takes glass from nothing to full and back within an animation, the way iOS 26 turns a slider's knob into
  glass only while it's held. Any shape works, including any SVG path.
- **Easy to drop in:** `glass(el)`, or `data-glass` on an element; options as data attributes or CSS custom properties.
  One ES module, TypeScript types, no dependencies. It runs in sandboxed, context-isolated renderers under a strict
  Content-Security-Policy, and falls back to a plain blur outside Chromium.

## Install

From GitHub (not on npm yet):

```bash
npm install github:CharlExMachina/liquid-glass-electron
```

`dist/` is committed, so there's nothing to build. To use it without a bundler, see
[docs/ELECTRON.md](docs/ELECTRON.md#loading-it).

## Use

```js
import { glass } from 'liquid-glass-electron';

const toolbar = glass(document.querySelector('.toolbar'), { variant: 'regular', shape: 'capsule' });
toolbar.set({ strength: 0.5 });           // cheap enough for every frame
await toolbar.animate({ strength: 1 }, { duration: 250, easing: 'ease-out' });
toolbar.destroy();                        // the element's own styles come back
```

Declaratively, for every element with `data-glass`, now and as they're added:

```js
import { autoGlass } from 'liquid-glass-electron';
autoGlass();
```

```html
<nav data-glass="regular" data-glass-shape="capsule">…</nav>
<div data-glass data-glass-refraction="0.4" data-glass-floating>drag me</div>
<div data-glass='{"bevelMode": 1, "refraction": 1.4}'>a magnifier</div>
```

Or in CSS: every option is a custom property, `--glass-` and its name in kebab case. Changes to the element's class or
data attributes are picked up, and a transition or animation of a `--glass-*` property is followed a frame at a time:

```css
.knob { --glass-strength: 0; background: white; transition: --glass-strength 0.25s, background 0.25s, scale 0.3s; }
.knob:active { --glass-strength: 1; background: transparent; scale: 1.4; }   /* white at rest, glass while held */
```

(`--glass-strength` is registered as a number so it interpolates; register others with `@property` to transition
them.)

The rest of the API:

| | |
|---|---|
| `container(el, { spacing })`, `data-glass-container="16"` | Apple's GlassEffectContainer: the glass shapes inside (`data-glass` or `data-glass-member`) are one piece of glass, flowing together where they come within `spacing` px |
| `union([a, b], options)` | Apple's glassEffectUnion: separate elements as one piece of glass |
| `morph(from, to)` | the glass of one element flows into another (Apple's glassEffectID) |
| `materialize(el, 'in' \| 'out')` | glass grows in or fades away in place |
| `glassButton(el, 'glass' \| 'prominent')` | Apple's `.glass` and `.glassProminent` button styles |
| `scrollEdge(scroller, { style: 'soft' \| 'hard' })` | content dissolving into a blur under a bar |
| `setEnvironment({ dark, appearance, reduceTransparency, increaseContrast, reduceMotion })` | what the glass adapts to, if not the page's media queries |
| `unglass(el)`, `glassOf(el)`, `refreshAll()` | |

## Options

liquidglass's options, with its defaults:

| Option | Default | What it does |
|---|---|---|
| `refraction` | 0.69 | How much the bevel bends what's behind it. 0 = no bending at all (light, fill and shadow only, which cost nothing per frame) |
| `zRadius` | 40 | The bevel's depth, px: how far in from the edge it curves |
| `bevelMode` | 0 | 0 = a pill with a bevelled rim; 1 = a dome that magnifies the whole element |
| `chromAberration` | 0.05 | Colour fringing at the rim. Two more passes per frame; 0 for less work |
| `blurAmount` | 0 | Frost: 1 ≈ a 7.6 px blur |
| `saturation`, `brightness` | 0, 0 | Boosts (0.5 = 1.5×). The glass is always 6% brighter, as liquidglass's is |
| `tintStrength` | 0 | A tint toward liquidglass's cool glass, or toward `tint` |
| `edgeHighlight`, `fresnel`, `specular` | 0.05, 1, 0 | The light: the edge's stroke and glow, reflection at grazing angles, highlights from four lights |
| `distortion` | 0 | Micro-noise in the bending, like textured glass |
| `cornerRadius` | the element's own `border-radius` | px |
| `opacity` | 1 | How much of the glass shows over the plain backdrop |
| `shadowOpacity`, `shadowSpread`, `shadowOffsetY` | 0.3, 10, 1 | liquidglass's shadow |
| `floating` | false | Drag to move |
| `button` | false | Hover brightens, a press flattens the bevel and deepens the shadow |

And this library's:

| Option | Default | What it does |
|---|---|---|
| `strength` | 1 | How much glass there is, 0..1: bending, fringe, frost, colour, light, fill and shadow together. Cheap to change every frame; at 0 there's no filter |
| `variant` | none | `regular` (frosted, saturated, a faint fill), `clear` (liquidglass's defaults), `identity` (no glass) |
| `shape` | `rect` | `rect`, `capsule`, `circle`, `concentric` (the radius of the glass it sits in, less the inset), `squircle` (continuous corners), `path` |
| `path`, `pathBox` | – | For `shape: 'path'`: SVG path data, in the element's px or in a viewBox (`"0 0 100 100"`) stretched over it |
| `fill` | – | A colour over the glass (Apple's tinted glass, prominent buttons). Painted with the light, so a CSS reset can't remove it |
| `tint` | – | The colour `tintStrength` multiplies toward |
| `backdrop` | – | CSS filter functions applied before the glass, as written (`blur(2px) saturate(1.4)`), for a look already written in CSS |
| `interactive` | false | Apple's `.interactive()`: a press grows the glass, bends it more and lights it where it's pressed |
| `press`, `pressBulge` | –, 0.25 | What a press does: `bulge` (bend more), `flatten` (button mode), `none` |
| `elasticity` | 0.15 | Floating glass stretches along the way it's dragged, by how fast, and springs back. 0 = rigid |
| `smooth`, `magnify` | true, true | The smoothing that keeps the rim free of grain; the slight magnification of a pill |
| `adaptive` | true | Follow Clear/Tinted, Reduce Transparency and Increase Contrast |

## How it works

Each glass element gets an SVG filter of its own, used as `backdrop-filter: url(#…)`. The filter smooths the backdrop
slightly (Chromium's displacement samples the nearest pixel, so where the rim squeezes the backdrop, unsmoothed pixels
turn to grain; smoothing before the bend, not after, keeps the rim crisp), then bends it through a displacement map.

**The map** is one small image of the whole element, a few thousand pixels for most elements. The bevel's shift rises
steeply in the outer few pixels, which a small map stretched back up couldn't follow; but the distance from the edge is
linear there, and stretching reproduces a linear ramp exactly. So the map stores, per axis, a value laid out linearly in
distance from the edge, and a lookup table (`feComponentTransfer`) turns it into the steep shift. Along straight edges
it's exact. Its third channel is the distance to the shape's edge, which cuts free shapes out of the box.

**Per frame**, Chromium runs every node of every glass's filter again whenever anything on the page changes, and a node
that's read twice is computed twice (the filter graph reaches the GPU process as a tree). Colour fringing bends each
channel separately, three passes that all read the map; so with fringing there are two filters, chained: the first
draws the map beside the element, in its own output, and the second reads it from there, which costs nothing to read
again.

**Light doesn't bend**, so Fresnel, specular, edge light, the fill and (for free shapes) the shadow are a `border-image`,
painted once and kept. A rounded rectangle's is a 9-slice, so a resize only moves it.

`strength`, refraction, fringe, frost, colour, light and shadow are attributes and styles on nodes that already exist,
so changing them, even every frame, rebuilds nothing.

## The demos

```bash
npm run demo          # the gallery
npm run playground    # every option, live
```

The gallery runs sandboxed, context-isolated and under a strict Content-Security-Policy. Photos and video are NASA's
([credits](demo/assets/CREDITS.md)).

<!-- MEDIA:gallery -->

## Performance

<!-- BENCH -->

## Compared with liquidglass

<!-- COMPARE -->

## Limitations

<!-- LIMITS -->

## Tests

```bash
npm test               # the optics, fields, maps and options (node:test)
npm run test:visual    # screenshots in Electron against test/visual/baseline/
npm run typecheck
```

The visual baselines are drawn by the GPU, so they belong to a machine (these are from Linux, Mesa, AMD). On another,
write your own first with `npm run test:visual -- --update`, then the test catches changes from there.

## Credits

The optics are [liquidglass](https://github.com/ybouane/liquidglass)'s (MIT), by [ybouane](https://github.com/ybouane). The engine grew out of
[Libre Hub](https://github.com/CharlExMachina/LibreHub)'s. Apple's Liquid Glass is the reference for the API's knobs.
Photos and video: NASA.

MIT license.
