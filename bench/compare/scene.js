// ?engine=ours|theirs&cfg=<liquidglass options as JSON>: the same options on both.
const q = new URLSearchParams(location.search);
const cfg = { cornerRadius: 40, ...JSON.parse(q.get('cfg') || '{}') };
const img = document.querySelector('.bg'), g = document.getElementById('g');
if (q.get('photo')) img.src = `../../demo/assets/${q.get('photo')}.jpg`;
await img.decode();
if (q.get('engine') === 'theirs') {
  const { LiquidGlass } = await import('../../node_modules/@ybouane/liquidglass/dist/index.js');
  g.dataset.config = JSON.stringify(cfg);
  window.instance = await LiquidGlass.init({ root: document.getElementById('root'), glassElements: [g] });
} else if (q.get('engine') === 'librehub') {
  // Libre Hub's engine before this library (its src/renderer/glass.js), given as ?file=, at liquidglass's defaults
  Object.assign(g.style, { border: '0 solid', backdropFilter: 'brightness(1.06) var(--glass-filter, )', boxShadow: '0 1px 10px rgb(0 0 0 / 0.2), 0 1px 2px rgb(0 0 0 / 0.1)' });
  (await import(q.get('file'))).startGlass('.glass');
} else {
  const { glass } = await import('../../dist/liquid-glass.js');
  glass(g, cfg);
}
await new Promise((r) => setTimeout(r, 900));
window.ready = true;
