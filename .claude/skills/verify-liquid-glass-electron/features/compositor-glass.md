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

## Gotchas

- The baselines are drawn by the GPU and belong to the machine that wrote them (Linux, Mesa).
- `pnpm test:native` stops unless macOS's version, the display's gamut and its scale match its references'.
