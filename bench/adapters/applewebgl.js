// apple-liquid-glass-webgl: WebGL2, repainting what is behind the glass itself (backgrounds, images, text).
import { LiquidGlass } from '../../node_modules/apple-liquid-glass-webgl/src/index.js';
export default async (els) => {
  els.forEach((el, i) => el.classList.add(`ag${i}`));
  window.instances = els.map((el) => new LiquidGlass(el));
  await new Promise((r) => setTimeout(r, 1000));
};
