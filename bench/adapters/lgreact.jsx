// liquid-glass-react (rdev): React, an SVG displacement filter with a backdrop blur. Bundled with React by
// scripts/bench.mjs into vendor/lgreact.js, since React ships no browser module build. Each component sits in a
// wrapper where the glass element was (the moving scene moves the wrapper; the component centres itself in it).
import React from 'react';
import { createRoot } from 'react-dom/client';
import LiquidGlass from 'liquid-glass-react';

export default async (els) => {
  const host = document.createElement('div');
  els[0].parentElement.append(host);
  const items = els.map((el) => ({ id: el.id, style: el.getAttribute('style'), cls: el.className, radius: Number(el.dataset.radius), w: el.offsetWidth, h: el.offsetHeight }));
  for (const el of els) el.remove();
  const App = () => items.map((it, i) => React.createElement('div', {
    key: i, id: it.id || undefined, className: it.cls,
    ref: (node) => node && node.setAttribute('style', it.style),
  }, React.createElement(LiquidGlass, { cornerRadius: it.radius, padding: '0', style: { position: 'absolute', top: '50%', left: '50%' } },
    React.createElement('div', { style: { width: `${it.w}px`, height: `${it.h}px` } }))));
  createRoot(host).render(React.createElement(App));
  await new Promise((r) => setTimeout(r, 1000));
};
