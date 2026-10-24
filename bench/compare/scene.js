// ?engine=ours|theirs&cfg=<liquidglass options as JSON>: the same options on both.
const q = new URLSearchParams(location.search);
const cfg = { cornerRadius: 40, ...JSON.parse(q.get('cfg') || '{}') };
const img = document.querySelector('.bg'), g = document.getElementById('g');
await img.decode();
if (q.get('engine') === 'theirs') {
  const { LiquidGlass } = await import('../../node_modules/@ybouane/liquidglass/dist/index.js');
  g.dataset.config = JSON.stringify(cfg);
  window.instance = await LiquidGlass.init({ root: document.getElementById('root'), glassElements: [g] });
} else {
  const { glass } = await import('../../dist/liquid-glass.js');
  glass(g, cfg);
}
await new Promise((r) => setTimeout(r, 900));
window.ready = true;
