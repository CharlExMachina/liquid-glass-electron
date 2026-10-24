// liquidGL (liquid-gl): WebGPU or WebGL, the page rasterised by its own snapshotter; changing elements registered as
// dynamic. Its glass has to be position: fixed or sticky.
import liquidGL from '../../node_modules/liquid-gl/liquidGL.js';
export default async (els, { counter }) => {
  for (const el of els) {
    el.classList.add('liquidGL');
    el.style.position = 'fixed';
  }
  await new Promise((resolve) => {
    liquidGL({ target: '.liquidGL', snapshot: 'body', on: { init: resolve } });
    setTimeout(resolve, 8000);
  });
  liquidGL.registerDynamic?.([counter]);
};
