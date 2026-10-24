import { glass } from '../../dist/liquid-glass.js';
import { css, h, photo, ready, sleep, sweep } from './lib.js';

// A magnifier: a dome of glass (liquidglass's bevelMode 1) that follows the pointer and magnifies whatever is under
// it, the photo and the small print alike.
export default {
  title: 'Magnifier',
  async render(stage) {
    css('magnifier');
    const img = photo('ponds');
    const lens = h('div.mag');
    const text = h('div.mag-text', {}, h('b', { text: 'Lop Nur, Xinjiang' }), h('br'), 'Potash is mined from brine pumped into these evaporation ponds; the water evaporates and the salts crystallize. Each pond is a different colour because algae, salts and depth differ from one to the next. Small print, to read through the lens.');
    const scene = h('div.mag-scene', {}, img, text, lens);
    stage.append(h('div.scene', {}, scene));
    await ready(img);
    const place = (x, y) => (lens.style.translate = `${x - 95}px ${y - 95}px`);
    place(380, 260);
    scene.addEventListener('pointermove', (e) => {
      const r = scene.getBoundingClientRect();
      place(e.clientX - r.left, e.clientY - r.top);
    });
    const handle = glass(lens, { shape: 'circle', bevelMode: 1, refraction: 2.6, zRadius: 80, chromAberration: 0.03, fresnel: 1, edgeHighlight: 0.2, shadowOpacity: 0.5, shadowSpread: 14 });
    return () => handle.destroy();
  },
  async play(stage) {
    const scene = stage.querySelector('.mag-scene'), r = scene.getBoundingClientRect();
    const p = (x, y) => [r.left + x * r.width, r.top + y * r.height];
    await sweep(scene, [p(0.3, 0.35), p(0.55, 0.25), p(0.75, 0.55), p(0.4, 0.82), p(0.7, 0.85)], 5200);
    await sleep(200);
  },
};
