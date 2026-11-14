// One scene of the native comparison, drawn with this library: the same backdrop at 1:1 and the same glass as
// native/Glass.swift draws with SwiftUI. The runner calls window.show(scene) and waits for window.shown.
import { toOptions } from './scenes.js';

const q = new URLSearchParams(location.search);
// ?dpr=: the device scale the page is drawn at, where Electron's forced scale (capture.mjs --scale=1) draws at it but
// still says the display's
if (q.has('dpr')) Object.defineProperty(window, 'devicePixelRatio', { get: () => Number(q.get('dpr')) });
// ?gl=1: the shader's glass (Safari's and Firefox's) instead of the compositor's, over the backdrop as its source
const gl = q.has('gl');
if (gl) globalThis.LIQUID_GLASS_WEBGL = true;

// ?lib=old: the library as it was, built into .old/ (for a before and after)
const { glass, setEnvironment, VARIANTS } = await import(q.get('lib') === 'old' ? './.old/liquid-glass.js' : '../../dist/liquid-glass.js');

// ?mutate=: the glass drawn wrong on purpose, for run.mjs --self-check (each a difference that the test must see)
const MUTATE = {
  nolens: () => ({ refraction: 0.01 }),
  frost: (g) => ({ blurAmount: VARIANTS[g.variant ?? 'regular'].blurAmount * 0.7 }),
  colour: () => ({ saturation: 0.15 }),
  outline: () => ({ outline: 0, outlineTop: 0 }),
  nofringe: () => ({ chromAberration: 0 }),
};
const mutate = MUTATE[q.get('mutate')] ?? (() => ({}));

let handles = [];
window.show = async (scene) => {
  window.shown = false;
  for (const g of handles) g.destroy();
  handles = [];
  document.body.replaceChildren();
  Object.assign(document.body.style, { width: `${scene.width}px`, height: `${scene.height}px` });
  const dark = scene.appearance === 'dark';
  document.documentElement.dataset.glassTheme = dark ? 'dark' : 'light';
  // macOS's glass in a key window (the scene's `active`), or in one that isn't, as the references were captured
  setEnvironment({ dark, active: !!scene.active });
  const img = Object.assign(document.createElement('img'), { className: 'backdrop', src: `backdrops/${scene.backdrop}.png`, alt: '' });
  Object.assign(img.style, { width: `${scene.width}px`, height: `${scene.height}px` });
  document.body.append(img);
  await img.decode();
  for (const g of scene.glass) {
    const el = document.createElement('div');
    el.className = 'g';
    Object.assign(el.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
    document.body.append(el);
    handles.push(glass(el, { ...toOptions(g), ...mutate(g), ...(gl ? { backdropSource: img } : {}) }));
  }
  await Promise.all(handles.map((h) => h.drawn?.()));
  await new Promise((r) => setTimeout(r, 400));
  window.shown = true;
};
window.pageReady = true;
