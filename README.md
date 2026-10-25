# liquid-glass-electron

Liquid glass for Electron: Apple's Liquid Glass look, built from a primitive you can bend, fade, reshape and animate,
on any element of an Electron app.

<p align="center"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/ios.gif" alt="iOS 26's controls built with the library: a slider knob and a switch knob that turn to glass only while held, a glass lens sliding across a segmented control, a menu growing out of a blob of glass" width="760"></p>

Electron is Chromium, and Chromium's `backdrop-filter` accepts an SVG filter. An `feDisplacementMap` in that filter
bends whatever the compositor has already drawn behind the element, on the GPU. So the glass needs no copy of the page,
no WebGL and no render loop. Text, video, CSS animations and scrolling content bend through it as they change, and when
nothing on screen changes it costs nothing at all.

- **The optics are [liquidglass](https://github.com/ybouane/liquidglass)'s**, at the same option names and defaults: a
  quarter-circle bevel that bends light where it enters and where it leaves, slight magnification toward the middle,
  colour fringing at the rim, and its Fresnel, specular and edge light. At its defaults this library's glass differs
  from liquidglass's about as much as liquidglass differs from itself moved by one pixel (see
  [the comparison](#compared-with-liquidglass)).
- **Apple's knobs:** regular, clear and identity glass, the lens of iOS 26's small controls (measured from an
  iPhone), tints, interactive glass, capsules, circles, concentric and continuous ("squircle") corners, containers
  whose glass flows together, morphing, materializing, `.glass` and `.glassProminent` buttons, scroll edges, the
  system's Clear/Tinted setting, Reduce Transparency, Increase Contrast and Reduce Motion. [docs/APPLE.md](docs/APPLE.md) maps each part of Apple's API to this one.
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

`dist/` is committed, so there's nothing to build (`npm run bundle` rebuilds it; the script isn't called `build`,
because npm would then install the dev dependencies to prepare the package). To use it without a bundler, see
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

Custom properties inherit, so one set on `:root` reaches every glass element: give the page's own variables other
names. Libre Hub's earlier engine's short names work too (`--glass-bevel` for `zRadius`, `--glass-aberration`,
`--glass-edge`, `--glass-dome`, `--glass-blur`, `--glass-radius`), but its `--glass-tint`, a background colour, is
this library's `tint` option.

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

## If you are an AI agent

Read [docs/AGENTS.md](docs/AGENTS.md) (also in the installed package, `node_modules/liquid-glass-electron/docs/AGENTS.md`): the whole API on one page, recipes for what people build with glass, the rules
that silently break it, and which demo shows each one working. The demos in `demo/demos/` are reference code, the
iOS controls (`ios.js`) especially: glass that turns on for part of an animation, slides, swells and flows into menus.
The short version: this is a primitive, so you can build whatever you want with it. Any element, any shape, any
amount of glass, changed every frame.

## Options

liquidglass's options, with its defaults:

| Option | Default | What it does |
|---|---|---|
| `refraction` | 0.69 | How much the bevel bends what's behind it. 0 = no bending at all (light, fill and shadow only, which cost nothing per frame) |
| `zRadius` | 40 | The bevel's depth, px: how far in from the edge it curves |
| `bevelMode` | 0 | 0 = a pill with a bevelled rim; 1 = a dome that magnifies the whole element; 2 = Apple's lens (this library's): the rim magnifies toward the middle, most at the edge and fading out `zRadius` px in, and the middle is flat |
| `chromAberration` | 0.05 | Colour fringing at the rim. Two more passes per frame; 0 for less work |
| `blurAmount` | 0 | Frost: 1 ≈ a 7.6 px blur |
| `saturation`, `brightness` | 0, 0 | Boosts (0.5 = 1.5×), on top of `baseBrightness` |
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
| `baseBrightness` | 0.06 | The brightening liquidglass's glass always has (6%); 0 for none |
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

<table>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/toolbar.gif" alt="Toolbar: grouped buttons on capsules of glass"><br><b>Toolbar</b>: grouped buttons on capsules of glass (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/toolbar.mp4">MP4</a>, <code>demo/demos/toolbar.js</code>)</td><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/tabbar.gif" alt="Tab bar: a floating tab bar and a separate search button"><br><b>Tab bar</b>: a floating tab bar and a separate search button (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/tabbar.mp4">MP4</a>, <code>demo/demos/tabbar.js</code>)</td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/scroll.gif" alt="Over scrolling content: a bar floating over a scrolling page, with a soft scroll edge"><br><b>Over scrolling content</b>: a bar floating over a scrolling page, with a soft scroll edge (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/scroll.mp4">MP4</a>, <code>demo/demos/scroll.js</code>)</td><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/controls.gif" alt="Sliders and toggles: knobs that turn to glass while held"><br><b>Sliders and toggles</b>: knobs that turn to glass while held (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/controls.mp4">MP4</a>, <code>demo/demos/controls.js</code>)</td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/buttons.gif" alt="Buttons: glass and prominent glass buttons, interactive glass"><br><b>Buttons</b>: <code>.glass</code> and <code>.glassProminent</code>, interactive glass (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/buttons.mp4">MP4</a>, <code>demo/demos/buttons.js</code>)</td><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/toasts.gif" alt="Toasts: notifications materializing and leaving"><br><b>Toasts</b>: notifications materializing and leaving (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/toasts.mp4">MP4</a>, <code>demo/demos/toasts.js</code>)</td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/morph.gif" alt="Morphing: a button's glass flowing into a sheet and back"><br><b>Morphing</b>: a button's glass flowing into a sheet and back (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/morph.mp4">MP4</a>, <code>demo/demos/morph.js</code>)</td><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/container.gif" alt="Merging glass: shapes in a container flowing together and splitting"><br><b>Merging glass</b>: shapes in a container flowing together and splitting (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/container.mp4">MP4</a>, <code>demo/demos/container.js</code>)</td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/drag.gif" alt="Dragging: floating glass that stretches as it moves"><br><b>Dragging</b>: floating glass that stretches as it moves (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/drag.mp4">MP4</a>, <code>demo/demos/drag.js</code>)</td><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/dock.gif" alt="Dock: a dock of icons on one piece of glass"><br><b>Dock</b>: a dock of icons on one piece of glass (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/dock.mp4">MP4</a>, <code>demo/demos/dock.js</code>)</td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/video.gif" alt="Over video: glass bending a playing video"><br><b>Over video</b>: glass bending a playing video (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/video.mp4">MP4</a>, <code>demo/demos/video.js</code>)</td><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/magnifier.gif" alt="Magnifier: a dome lens"><br><b>Magnifier</b>: a dome lens (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/magnifier.mp4">MP4</a>, <code>demo/demos/magnifier.js</code>)</td></tr>
<tr><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/appearance.gif" alt="Clear, tinted, accessible: Clear/Tinted, Reduce Transparency, Increase Contrast, light and dark"><br><b>Clear, tinted, accessible</b>: Clear/Tinted, Reduce Transparency, Increase Contrast, light and dark (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/appearance.mp4">MP4</a>, <code>demo/demos/appearance.js</code>)</td><td width="50%"><img src="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/playground.gif" alt="Playground: every option, live, including any SVG path as the shape"><br><b>Playground</b>: every option, live, including any SVG path as the shape (<a href="https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/playground.mp4">MP4</a>, <code>demo/demos/playground.js</code>)</td></tr>
</table>

## Performance

Measured with `npm run bench` ([bench/run.mjs](bench/run.mjs)): every library below in the same scenes, in an Electron
window of 1180 × 800 on a second display, unfocused. The number is the CPU time of Chromium's GPU process (where backdrop
filters and WebGL are drawn), as Electron's `app.getAppMetrics()` reports it, in % of one core: over 8 seconds after a
2-second warm-up, three runs per library interleaved with the others, the median. The renderer process's time is in
[the results](bench/results/2026-10-24/results.md) too. Machine: AMD Ryzen 9 7950X, Radeon RX 7900 XTX (Mesa), Linux,
Electron 44.9.3 (Chromium 152), a 4K display at 1.25×.

The scenes, over a photo:

- **idle**: four panels of 300 × 160 px, nothing changing.
- **content**: the same, and a number on the page changing ten times a second.
- **move**: one of the four panels moving every frame.
- **scroll**: a page of text and photos scrolling under the four panels.
- **10 / 30 elements**: 10 or 30 capsules of 170 × 64 px while the page scrolls.

| GPU process, % of a core | idle | content | move | scroll | 10 elements | 30 elements |
|---|---|---|---|---|---|---|
| no glass | 0 | 0.9 | 0.2 | 4.4 | 4.1 | 4.1 |
| plain CSS `backdrop-filter: blur() saturate()` | 0.1 | 1.4 | 8.7 | 9.9 | 14.1 | 33.8 |
| **liquid-glass-electron**, defaults (colour fringing on) | **0.1** | **1.9** | **13.9** | **15.1** | **25.7** | **74.2** |
| **liquid-glass-electron**, `chromAberration: 0` | **0** | **1.5** | **9.2** | **10.4** | **15.5** | **36.6** |
| [@ybouane/liquidglass](https://github.com/ybouane/liquidglass) 1.0.3 (WebGL) | 11.1 | 12.2 | 15.5 | 27.0 | 50.1 | 111.0 |
| [liquidGL](https://liquidgl.naughtyduk.com) 3.0.0 (WebGL) | 17.7 | 18.5 | 22.5 | 19.2 | 63.4 | 141.0 * |
| [liquid-glass-react](https://www.npmjs.com/package/liquid-glass-react) 1.1.1 (SVG filter) | 0 | 11.5 | 65.1 | 68.1 | 79.2 | 67.7 |
| [apple-liquid-glass-webgl](https://github.com/Oliverrr2424/webgl-apple-liquid-glass) 2.6.0 (WebGL) | 16.9 | 19.0 | 24.6 | 28.2 | 59.3 | 95.6 |
| [simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass) 5.4.0 (SVG filter) | 0 | 1.1 | 6.7 | 6.9 | 9.6 | 20.6 |
| [@avenra/liquid-glass](https://github.com/DevSam7t3/liquid-glass) 1.2.0 (SVG filter) | 0 | 4.0 | 36.7 | 37.7 | 25.1 | 88.6 |

\* liquidGL failed with 30 elements (shader errors; the capsules drew black), so that number isn't comparable.

What this says:

- **Nothing changing costs nothing**, and neither does content changing under still glass, as with no glass at all.
  The WebGL libraries draw every frame regardless: 11–19% of a core while nothing happens.
- **Moving glass costs about what liquidglass costs, not much less**: 13.9% against 15.5%. The goal was 10 points
  below it; that wasn't reached. Chromium runs every glass's filter again on every frame anything changes, and colour
  fringing is three bending passes. Without fringing it's 9.2%, close to a plain CSS blur's 8.7%.
- **The cost grows with the number of glass elements on screen while anything moves.** 30 elements with fringing take
  74% of a core, twice a plain blur. Turn fringing off (37%, about a plain blur), put many shapes in one `container`
  (one filter for all of them), or leave glass at `strength: 0` while it isn't needed.
- simple-liquid-glass costs less: its filter is simpler, and it looks different (a mirrored distortion).

Every library was checked for drawing in each scene (`bench/results/<date>/shots/`, made by the run, not committed).

## Compared with liquidglass

`npm run compare` ([bench/compare/run.mjs](bench/compare/run.mjs)) draws the same scene with
[@ybouane/liquidglass](https://github.com/ybouane/liquidglass) (WebGL) and with this library, at the same options
(liquidglass's defaults) and a device scale factor of 1, and measures the mean difference per channel (0–255) in three
zones: the rim (within 40 px of the edge), the interior, and the shadow (25 px outside). As a yardstick it also
measures liquidglass against itself moved by one pixel: a difference that small is invisible, and it adds up to this
much.

| over | | rim | interior | shadow |
|---|---|---|---|---|
| a coast (NASA) | liquid-glass-electron | 3.2 | 1.8 | 0.2 |
| | Libre Hub's earlier engine | 3.9 | 1.4 | 0.5 |
| | liquidglass moved 1 px | 2.6 | 2.7 | |
| mountains (NASA) | liquid-glass-electron | 4.1 | 1.4 | 0.1 |
| | Libre Hub's earlier engine | 5.4 | 1.1 | 0.4 |
| | liquidglass moved 1 px | 4.1 | 2.2 | |

Inside the glass it's well within a pixel's shift of liquidglass; at the rim, within it over the mountains and a little
over it over the coast. Compared with the engine it grew from, the rim is closer to liquidglass and crisp (smoothing
before the bend, not a blur after it) and the interior a little further, still within the yardstick.

![liquidglass and liquid-glass-electron over the same photo, with the rim enlarged](https://raw.githubusercontent.com/CharlExMachina/liquid-glass-electron/media/compare-coast.jpg)

## Limitations

- **Chromium only.** Electron, Chrome and Edge bend the backdrop; Firefox and Safari accept the syntax but draw nothing,
  so there the glass is a plain blur with its light, fill and shadow (`globalThis.LIQUID_GLASS_FALLBACK = true` shows
  what that looks like).
- **Every glass costs something on every frame anything on the page changes**, even glass whose own backdrop didn't
  change: Chromium runs every backdrop filter again for each frame. Idle, it's nothing; while something animates or
  scrolls, it's roughly proportional to the number of glass elements on screen (see [Performance](#performance)). Glass
  at `strength` 0 has no filter and costs nothing; so does `refraction: 0` (light and fill only). A container draws
  all of its members with one filter.
- **Glass inside glass only sees the outer glass's own painting**, not what's behind it, and an ancestor with
  `opacity` below 1, a `filter`, a `mask`, `clip-path` or `mix-blend-mode` turns the bending off inside it. These are
  CSS's rules (the backdrop root). Apple's design rule is the same: don't stack glass on glass.
- **The page can't read the pixels behind an element**, so the glass can't switch between light and dark by itself, as
  Apple's small controls do over changing content. Set the theme (`data-glass-theme`, `setEnvironment({ dark })`).
- **A glass element's own border isn't drawn**: the light is a `border-image`. Its border width still lays out. Use
  `edgeHighlight` instead of a border.
- **Bending samples the nearest pixel** (that's Chromium's feDisplacementMap), so the backdrop is smoothed slightly
  first (σ ≈ 0.7 px), which softens fine detail under the glass a little. `smooth: false` turns it off, with grain
  where the rim squeezes the backdrop.
- **Specular highlights and strong edge light are laid over as white**, where liquidglass adds them to the colour: at
  high `specular` they're dimmer over mid-tones than liquidglass's. At its defaults (`specular` 0) it makes no
  visible difference.
- **Colour fringing follows Libre Hub's model**: each channel bent by its own share of the bevel's shift. At the
  default `chromAberration` it matches liquidglass (see the comparison); turned up, its fringes are about twice as wide
  at the rim as liquidglass's. A dome (`bevelMode` 1) uses liquidglass's exact fringe.
- **Maps are small**: a few thousand pixels, exact along straight edges thanks to their lookup tables, approximate in
  tight corners of large elements. They're drawn on the CPU when an element's size settles (a few ms), and stretched
  while it's changing; containers and morphs moving their shapes draw them every frame, at half the resolution.
- **Free shapes** (`path`) are rasterised to work out their distances, at most about 400 × 400, so very fine details of
  a large path are softened, and their magnification pulls toward the middle of the box, not of the shape.
- **The OS's Clear/Tinted setting can't be read** on any platform; offer it as the app's own setting. Reduce
  Transparency and Increase Contrast come from the page's media queries, which Chromium fills in on macOS and Windows;
  on Linux pass them from the main process ([docs/ELECTRON.md](docs/ELECTRON.md#the-systems-settings)).
- **Apple's lens (`bevelMode` 2) is measured from one control**, an iPhone's slider knob. Its rim folds back like thick
  glass, and Chromium's nearest-pixel sampling leaves a one-pixel stair along what it folds, where the iPhone's is
  smooth. The thin dark line around the iPhone's rim and the shading across its glass aren't part of the glass here;
  the iOS demo draws them in CSS (`demo/demos/ios.css`).
- Not done: Apple's shimmer on interactive glass, `backgroundExtensionEffect`, glass that thickens with its size.

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
