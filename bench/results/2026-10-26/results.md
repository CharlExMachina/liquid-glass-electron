# Apple's variants before and after the native comparison

Apple M4 Max (40-core GPU), macOS 27.0.1, the built-in Liquid Retina XDR display (Display P3, 2×), Electron 44.9.3.
`pnpm bench --libs=none,css,ours-old,ours,ours-regular-old,ours-regular,ours-clear-old,ours-clear,ours-regular-dark-old,ours-regular-dark --reps=5 --seconds=8 --drawn`

`-old` is the library as it was before (main, built into test/native/.old/: see the adapters). `ours` and `ours-old`
are liquidglass's defaults, whose code didn't change: the difference between those two columns is the run-to-run
noise on this machine (up to 5 points of the GPU process, 1.5 of the renderer). `ours-regular-dark` is variant
regular in the dark (its brightness cap). The machine was in use during the runs.

| scene | none | css | ours-old | ours | ours-regular-old | ours-regular | ours-clear-old | ours-clear | ours-regular-dark-old | ours-regular-dark |
|---|---|---|---|---|---|---|---|---|---|---|
| idle | 0.0 / 0.1 @ 0/0 fps | 0.0 / 0.4 @ 0/0 fps | 0.0 / 0.5 @ 0/0 fps | 0.0 / 0.5 @ 0/0 fps | 0.0 / 0.5 @ 0/0 fps | 0.0 / 0.4 @ 0/0 fps | 0.0 / 0.5 @ 0/0 fps | 0.0 / 0.3 @ 0/0 fps | 0.0 / 0.4 @ 0/0 fps | 0.0 / 0.4 @ 0/0 fps |
| content | 2.6 / 5.2 @ 10/10 fps | 2.6 / 6.3 @ 10/10 fps | 3.3 / 8.3 @ 10/10 fps | 3.1 / 7.8 @ 10/10 fps | 2.6 / 6.6 @ 10/10 fps | 3.2 / 8.1 @ 10/10 fps | 3.4 / 8.1 @ 10/10 fps | 3.3 / 7.7 @ 10/10 fps | 3.3 / 8.4 @ 10/10 fps | 3.3 / 8.4 @ 10/10 fps |
| move | 7.2 / 2.5 @ 0/0 fps | 13.9 / 36.6 @ 106/106 fps | 16.7 / 51.0 @ 106/106 fps | 15.4 / 45.8 @ 106/106 fps | 16.9 / 51.8 @ 105/105 fps | 14.5 / 49.2 @ 106/106 fps | 17.2 / 49.9 @ 105/105 fps | 17.3 / 46.1 @ 106/106 fps | 14.8 / 47.0 @ 106/105 fps | 16.5 / 53.2 @ 105/105 fps |
| scroll | 12.4 / 11.0 @ 103/104 fps | 12.8 / 47.1 @ 104/104 fps | 16.0 / 44.4 @ 104/104 fps | 16.0 / 45.0 @ 103/104 fps | 16.2 / 45.9 @ 104/104 fps | 15.9 / 45.3 @ 104/104 fps | 16.1 / 44.5 @ 104/104 fps | 17.1 / 43.4 @ 104/104 fps | 16.0 / 45.0 @ 104/104 fps | 16.1 / 46.2 @ 104/104 fps |
| many10 | 12.4 / 11.2 @ 104/104 fps | 7.0 / 56.9 @ 104/104 fps | 17.4 / 45.4 @ 104/104 fps | 17.3 / 44.6 @ 104/104 fps | 17.0 / 45.1 @ 104/104 fps | 17.1 / 44.9 @ 104/104 fps | 17.2 / 44.8 @ 104/104 fps | 19.4 / 42.9 @ 104/104 fps | 17.2 / 45.7 @ 104/104 fps | 17.4 / 44.9 @ 104/104 fps |
| many30 | 12.6 / 11.0 @ 104/104 fps | 3.9 / 65.6 @ 105/105 fps | 22.7 / 37.8 @ 104/104 fps | 23.9 / 40.7 @ 104/104 fps | 24.9 / 41.9 @ 104/104 fps | 25.1 / 41.8 @ 104/104 fps | 23.4 / 39.8 @ 104/104 fps | 26.1 / 38.8 @ 104/104 fps | 25.1 / 42.0 @ 104/104 fps | 25.2 / 40.0 @ 104/104 fps |

Each cell: renderer / GPU process, % of one core, median of 5; @ frames drawn per second by the renderer / viz.
