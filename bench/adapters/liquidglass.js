// @ybouane/liquidglass: WebGL, the page captured with html-to-image; elements marked data-dynamic are captured again
// every frame. Glass elements have to be direct children of the root.
import { LiquidGlass } from '../../node_modules/@ybouane/liquidglass/dist/index.js';
export default async (els, { root, scene }) => {
  for (const el of els) el.dataset.config = JSON.stringify({ cornerRadius: Number(el.dataset.radius) });
  // scrolling content: the article has to be captured again as it moves
  if (scene === 'scroll' || scene === 'many') root.querySelector('.article').dataset.dynamic = '';
  window.instance = await LiquidGlass.init({ root, glassElements: els });
};
