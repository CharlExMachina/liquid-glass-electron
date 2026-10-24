# liquid-glass-electron, for AI agents

You can build whatever you want with this library. It's a primitive, not a set of widgets: any element can be glass;
the glass can have any shape, come and go within an animation, flow into other glass, and every visual parameter can
change every frame. The demos are working reference code for all of it; read them before inventing your own approach.

## The whole API

```js
import {
  glass, unglass, glassOf, autoGlass,            // glass on an element
  container, uncontainer, union,                  // several shapes as one piece of glass
  morph, materialize,                             // glass flowing from one element to another, appearing, leaving
  glassButton, scrollEdge,                        // Apple's button styles, scroll edges
  setEnvironment, getEnvironment, refreshAll,     // theme, Clear/Tinted, accessibility
  DEFAULTS, VARIANTS,
} from 'liquid-glass-electron';

const g = glass(el, { /* options */ });   // returns a handle
g.set({ strength: 0.4 });                 // any options; cheap enough for every frame (see "What's cheap")
await g.animate({ strength: 1, refraction: 1.2 }, { duration: 250, easing: 'cubic-bezier(.3,1.4,.5,1)' });
g.options;                                // what's in effect
g.destroy();                              // the element's own styles come back
```

Types: `dist/liquid-glass.d.ts`. Every option, with its default and meaning: the README's Options tables, or
`src/options.ts`.

Options can also come from data attributes (`data-glass-refraction="0.4"`, `data-glass='{"shape":"capsule"}'`,
`data-glass="regular"`) and CSS custom properties (`--glass-refraction: 0.4`), with `autoGlass()` applying glass to
`[data-glass]` elements as they appear. Precedence: defaults < variant < CSS < data attributes < `glass()` options.

## Recipes, and where each is shown working

| You want | Do this | See |
|---|---|---|
| A control that turns to glass only while touched (iOS 26 slider and switch knobs) | The element's own CSS background is the solid look; animate `strength` 0 → 1 (or transition `--glass-strength`) while fading that background out, and `scale` it up | `demo/demos/ios.js`, `demo/demos/controls.js` |
| Glass that comes and goes within any animation | `g.set({ strength })` each frame, `g.animate({ strength })`, or a CSS transition/keyframes on `--glass-strength` | `demo/demos/ios.js` |
| A lens that slides between positions (segmented control) | One glass element moved with `translate`; `strength` up while it moves, down when it lands | `demo/demos/ios.js` |
| A menu or sheet that grows out of its button | `await morph(button, menu)` (menu laid out, `visibility: hidden`); back: `morph(menu, button)` | `demo/demos/morph.js`, `demo/demos/ios.js` |
| Notifications, popovers appearing | `materialize(el, 'in')`, `materialize(el, 'out')` | `demo/demos/toasts.js` |
| Grouped buttons on one piece of glass | Make the group element glass (`shape: 'capsule'`), buttons plain inside | `demo/demos/toolbar.js` |
| Shapes that flow together like liquid, and split | `container(parent, { spacing })`; members are children with `data-glass-member`; move them with CSS (transitions are followed) | `demo/demos/container.js` |
| Any shape | `shape: 'path', path: 'M…Z', pathBox: '0 0 100 100'`; or `shape: 'squircle'`, `'capsule'`, `'circle'`, `'concentric'` | `demo/demos/playground.js` (shape menu) |
| A magnifier | `bevelMode: 1, refraction: 2–3, shape: 'circle'`, move it with `translate` | `demo/demos/magnifier.js` |
| Draggable glass that stretches as it moves | `floating: true, elasticity: 0.15` | `demo/demos/drag.js` |
| Bars over scrolling content | glass on a fixed/sticky bar; `scrollEdge(scroller, { style: 'soft' })` | `demo/demos/scroll.js` |
| Apple's button styles | `glassButton(el, 'glass' \| 'prominent')`; accent from `--glass-accent` | `demo/demos/buttons.js` |
| Glass over video, canvas, CSS animation | Nothing special: it bends whatever is drawn behind it, live | `demo/demos/video.js`, `demo/demos/drag.js` |
| Frosted vs clear | `variant: 'regular'` (frost) or `'clear'`; `blurAmount` for your own | `demo/demos/appearance.js` |
| Dark mode, Tinted, accessibility | `setEnvironment({ dark, appearance: 'tinted', reduceTransparency, increaseContrast, reduceMotion })` | `demo/demos/appearance.js` |
| Every knob at once | the playground: it prints the `glass()` call for what you set | `demo/demos/playground.js` |

## What's cheap, what isn't

- **Cheap, every frame:** `strength`, `refraction`, `chromAberration` (while it stays above 0), `blurAmount` (while it
  stays at or above ~0.07), `saturation`, `brightness`, `tint`, `tintStrength`, `opacity` (while below 1), shadow
  options; moving or scaling the element with CSS transforms; resizing it (the map stretches, then is redrawn when the
  size settles).
- **A new map (a few ms on the CPU; fine now and then, not every frame):** `zRadius`, `cornerRadius`, switching
  between `rect`, `capsule`, `circle`, `concentric`, a new `path`. Maps are cached, so going back and forth between two
  values is cheap after the first time.
- **A rebuild of the filter (the same):** fringe on or off (`chromAberration` 0 ↔ above 0), `bevelMode`, `distortion`
  on/off, `smooth`, `magnify`, `opacity` 1 ↔ below 1, `refraction` 0 ↔ above 0, a free shape (`squircle`, `path`) on or
  off, `backdrop`.
- **Per frame while anything on the page changes, every glass element costs a little** (Chromium re-runs every
  backdrop filter). Glass at `strength: 0` and `refraction: 0` costs nothing. For many shapes, one `container` is one
  filter.

## Rules that silently break glass

1. **No glass inside glass.** An element with a backdrop filter is its descendants' backdrop root: inner glass only
   sees the outer glass's own painting. Put controls on a glass bar as plain elements, or with `refraction: 0` (light
   and fill only).
2. **No `opacity` < 1, `filter`, `mask`, `clip-path` or `mix-blend-mode` on an ancestor** of glass: the bending turns
   off. Fade glass with its own `opacity` or `strength`.
3. **The element's own border isn't drawn** (the light is a `border-image`). Use `edgeHighlight`.
4. **Glass needs something behind it** to look like glass: photos, colour, text. Over a flat colour it's just a tint.
5. **Chromium only** for the bending (Electron is Chromium); elsewhere it falls back to a blur.
6. **CSP:** `img-src` must allow `data:`.

## Checking your work

Glass is drawn by the compositor, so check it visually: capture the window (`webContents.capturePage()`) or record
frames (`webContents.beginFrameSubscription`), as `demo/main.mjs --shot` and `--record` do, and look at the in-between
frames of animations.
