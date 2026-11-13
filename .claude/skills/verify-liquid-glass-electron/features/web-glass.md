# Glass in Safari and Firefox (backdropSource)

## Sub-features

- Bending, fringe, frost, colour, opacity, strength, surface, free shapes: the same look as Chromium's.
- The source: an `<img>`, `<video>` or `<canvas>`, with `object-fit` and `object-position`.
- The fallback to a plain blur: no source, or one the page may not read (another origin without CORS); tried again
  when the source changes.
- A source named by a selector: looked up again when the document changes (added late, replaced).
- Glass across its picture's edge: the picture bent as far as it goes, the plain blur under the rest.
- Redrawing when the glass or the source moves, and only then.

## How to get to it (user POV)

A page calls `glass(el, { backdropSource: '#hero' })` (or sets `data-glass-backdrop-source`) and is opened in Safari
or Firefox. `pnpm demo:web` serves such a page: drag the lens and the panel, switch the source to the video.

## Driving it with test:web

```bash
pnpm test:web                      # 27 cases × Electron, Safari, Firefox, and the three fallbacks
pnpm test:web --case=regulardark   # one case
pnpm test:web --self-check         # must print: 27 of 27 cases caught the glass bent wrong
pnpm bench:web safari,firefox glass idle,move,scroll,n30,video
```

`ok   defaults  mean 1.89  rim 1.79  outliers 0.02%` means: inside the glass, the shader's pixels differ from the
compositor's by 1.89 levels of 255 on average, 1.79 within 10 px of the edge, and 0.02% of them by more than 48;
all within `test/web/limits.json`. After a change meant to move the glass, `--calibrate` writes the limits anew.

## Gotchas

- The reference is drawn off screen: on screen, Chromium converts the glass's maps into the display's colour profile,
  and on a display whose profile has another tone curve than sRGB's that moves what's under the glass.
- The page reads the glass's canvas back, which holds the bending only: the light, shadow and outline are off in the
  cases (they're CSS in both paths). To see the whole, open `pnpm demo:web`.
- At a device scale other than 1, pass `--scale=2`, so the reference is drawn at the browsers' scale.
- Firefox started as a child of a script reports its profile missing on a Mac; the runners start it through
  `open -na` there (on Linux, directly).
- The edge cases (`edge`, `edgefrost`) compare what the shader drew and count what it left clear (`clear` in
  cases.js): past the picture the compositor bends the page, which the shader hasn't got.
- WebKitGTK 2.54 gives an empty frame from an `OffscreenCanvas` WebGL2 context made with `antialias: false`; the
  renderer checks once that its frame arrives and makes the context another way if not. A browser that fails every
  way gets the blur: `no shader canvas` in every case.
