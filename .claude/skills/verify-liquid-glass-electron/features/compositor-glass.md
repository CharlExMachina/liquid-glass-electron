# Glass in Electron and Chrome (the compositor)

## Sub-features

- The glass's optics, variants, shapes, groups, containers, morphing: see the README's Options and the demos.

## How to get to it (user POV)

`pnpm demo` (the gallery) or `pnpm playground` (every option, live), in Electron.

## Driving it with test:visual

```bash
pnpm test:visual                   # each case of test/visual/cases.js against test/visual/baseline/
pnpm test:visual --case=frosted
```

To show a change left Chromium's glass as it was, on a machine other than the baselines': build `main`'s `src/` into
`dist/liquid-glass.js`, run `node scripts/electron.mjs test/visual/run.mjs --update`, rebuild the branch
(`node scripts/build.mjs`), run `pnpm test:visual`, and restore the baselines (`git checkout test/visual/baseline`).

## Against macOS's own glass (test:native, on a Mac)

```bash
pnpm test:native                   # each case against SwiftUI's glassEffect (test/native/reference/)
pnpm test:native --self-check      # every mutation must be caught
node scripts/electron.mjs test/native/capture.mjs --native|--electron [--gl] [--scale=1] --set=<scenes.json> --out=<dir>
```

The capture script draws any scenes both ways, for measuring: `--scale=1` draws SwiftUI at 1× (a copy of its app that
asks for no Retina backing) and Electron at a forced 1×; a scene's `filter` sets inputs of macOS's glass filter
(`{"inputBlurRadius": 0}` turns its frost off, which shows its lens and how it samples).

## Gotchas

- The baselines are drawn by the GPU and belong to the machine that wrote them (Linux, Mesa).
- `pnpm test:native` stops unless macOS's version, the display's gamut and its scale match its references'.
- Electron forced to 1× on a Retina Mac draws at 1× but still says `devicePixelRatio` 2 (so the outline, half a CSS
  px there, rounds away): `capture.mjs --scale=1` tells the page (`?dpr=1`).
- Chromium bakes the map's lookup tables differently on screen (truncating, premultiplying in floating point) and off
  screen (rounding, in bytes): what "no shift" reads as differs by up to a pixel at the largest scales. The filter is
  fitted to on screen (what an app's users see); test:web's reference is drawn off screen.
- macOS draws its glass otherwise in the key window: `-active` cases (`active: true` in a scene) are captured from
  SwiftUI's window made key (`capture.mjs --active` makes every scene so), and the page sets `setEnvironment({ active })`.
  `GLASS_DUMP=1` makes the native app print its glass filter's inputs (on stderr) with whether the window is key.
- A sub-pixel question needs sharp content: under frost a pixel's shift hardly shows. Unfrost both (a scene's `filter`
  and the glass's `blurAmount: 0`) over a grid, and read where its lines land.
