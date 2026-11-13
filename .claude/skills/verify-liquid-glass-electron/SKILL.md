---
name: verify-liquid-glass-electron
description: Drive liquid-glass-electron the way its users see it and keep the evidence. Use to prove a change to the glass works, in Electron (Chromium's compositor) or in Safari and Firefox (the shader over a backdropSource).
---

# Verify liquid-glass-electron

The library draws glass on elements of a page. Its users see it in two places: an Electron (or Chrome) window, where
the compositor bends whatever is behind the glass, and Safari or Firefox, where a shader bends the picture named by
`backdropSource`. Both are checked by drawing real pages and comparing pixels. The feature map is in
[features/](features/README.md).

## Launch

```bash
pnpm install          # once; fetches Electron and esbuild
pnpm demo             # the gallery in Electron (builds dist/ first)
pnpm demo:web         # prints a localhost URL: the glass in any browser (builds dist/ first; Ctrl+C stops it)
```

Ready: the Electron window shows the gallery; for `demo:web`, the URL it prints answers and the bar on the page says
how the glass is bent ("bent by a shader…" in Safari and Firefox, "bent by the compositor" in Chromium).

## Doctor

```bash
pnpm typecheck && pnpm test     # types, and the optics, maps and options (node:test); no window needed
git status --short dist         # dist/ is committed: a change in src/ must come with its rebuilt dist/
```

`pnpm test:web` opens Safari and Firefox through `open`, which a sandboxed shell may not do; run it unsandboxed.
`--browsers=electron` needs neither. On Linux it starts `firefox` and WebKitGTK (`test/web/webkitgtk.py`: python,
PyGObject, GTK 4, WebKitGTK 6.0) itself; they need a display (`xvfb-run` does) and WebGL2.

## Drive

| What | Command | Passes when |
|---|---|---|
| The shader's glass against the compositor's, in Electron, Safari and Firefox (Linux: Firefox, WebKitGTK) | `pnpm test:web` | every case prints `ok`, then `all passed` |
| The same in a browser you open yourself (Edge, a phone, Windows) | `pnpm test:web --browsers=electron,edge --host=0.0.0.0` | open the address it prints; every case prints `ok` |
| That those cases would catch wrong glass | `pnpm test:web --self-check` | `27 of 27 cases caught the glass bent wrong` |
| Chromium's glass against saved captures | `pnpm test:visual` | `all passed` (the baselines belong to the machine that wrote them: on another, write yours from `main` with `--update` first, then compare the branch) |
| The variants against macOS's own glass | `pnpm test:native` | on a Mac whose macOS version, display gamut and scale match `test/native/reference/index.json`; it stops otherwise |
| Cost per frame in Chrome, Safari and Firefox | `pnpm bench:web` | read the table it prints: frames per second and CPU per scene |

Each takes `--case=<name>` (or a browser, mode and scene list for the bench; see the top of each `run.mjs`).

## Evidence

- `test/web/out/`: per case, what the compositor drew (`<case>-compositor.png`) and what each browser's shader drew
  (`<case>-<browser>.png`); the run's printed means are the differences between them.
- `test/visual/out/`: captures of the cases that failed.
- `bench/web/results/<date>.md` and `.json`: the bench's table and rows.

These folders are rewritten by the next run and are not committed (but for the bench's results); copy what a report
needs.

## Cleanup

The runners close what they open: Electron's windows, Firefox (a profile of its own, deleted after), and Safari's tab
(Safari itself only if the run started it). `pnpm demo:web` runs until stopped.

## Upkeep

When a feature is added or its recipe changes, add or correct its file in `features/` and drive it once.
