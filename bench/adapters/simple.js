// simple-liquid-glass, its <liquid-glass> web component (SVG backdrop displacement on Chromium).
import '../../node_modules/simple-liquid-glass/dist/web-component.esm.js';
export default async (els) => {
  for (const el of els) {
    const g = document.createElement('liquid-glass');
    g.setAttribute('radius', el.dataset.radius);
    g.style.cssText = el.style.cssText;
    g.style.display = 'block';
    g.className = el.className;
    if (el.id) g.id = el.id;
    el.replaceWith(g);
  }
  await new Promise((r) => setTimeout(r, 800));
};
