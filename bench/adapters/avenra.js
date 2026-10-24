// @avenra/liquid-glass: an SVG displacement map (Snell's law) in backdrop-filter, with its stylesheet.
import { createLiquidGlass } from '../../node_modules/@avenra/liquid-glass/dist/liquid-glass.esm.js';
export default async (els) => {
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '../node_modules/@avenra/liquid-glass/styles/liquid-glass.css' }));
  window.instances = els.map((el) => createLiquidGlass(el, {}));
  await new Promise((r) => setTimeout(r, 800));
};
