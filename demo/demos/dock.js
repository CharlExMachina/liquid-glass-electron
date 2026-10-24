import { glass } from '../../dist/liquid-glass.js';
import { css, h, icon, photo, ready, sleep, sweep } from './lib.js';

// A dock: a shelf of glass under the apps, which magnify as the pointer passes; and a menu bar of glass along the
// top. The shelf bends the photo under it and the apps' reflections in it.
const APPS = [['home', '#0a84ff'], ['mail', '#30b0c7'], ['message', '#30d158'], ['photo', '#ff9f0a'], ['music', '#ff375f'], ['map', '#64d2ff'], ['camera', '#8e8e93'], ['gear', '#636366']];
export default {
  title: 'Dock',
  async render(stage) {
    css('dock');
    const img = photo('alps');
    const apps = APPS.map(([ic, c]) => {
      const a = h('div.app', {}, icon(ic));
      a.style.background = `linear-gradient(160deg, ${c}, color-mix(in srgb, ${c} 70%, #000))`;
      return a;
    });
    const dock = h('div.dock', {}, ...apps.slice(0, 6), h('div.dock-sep'), ...apps.slice(6));
    const magnify = (e) => {
      for (const a of apps) {
        const r = a.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2));
        const s = 1 + 0.55 * Math.max(0, 1 - d / 150) ** 2;
        a.style.scale = String(s);
        a.style.translate = `0 ${-(s - 1) * 14}px`;
      }
    };
    dock.addEventListener('pointermove', magnify);
    dock.addEventListener('pointerleave', () => apps.forEach((a) => {
      a.style.scale = '';
      a.style.translate = '';
    }));
    const clock = h('span', { text: '9:41' });
    const bar = h('div.menubar', {}, h('b', { text: 'Finder' }), h('span', { text: 'File' }), h('span', { text: 'Edit' }), h('span', { text: 'View' }), h('span', { text: 'Go' }), clock);
    stage.append(h('div.scene', {}, img, bar, h('div.dock-wrap', {}, dock)));
    await ready(img);
    const handles = [glass(dock, { variant: 'regular', cornerRadius: 26, zRadius: 22, blurAmount: 0.6 }), glass(bar, { variant: 'regular', cornerRadius: 0, zRadius: 10, refraction: 0.4 })];
    return () => handles.forEach((g) => g.destroy());
  },
  async play(stage) {
    const dock = stage.querySelector('.dock');
    const r = dock.getBoundingClientRect(), y = r.top + 40;
    await sweep(dock, [[r.left + 10, y], [r.right - 10, y], [r.left + r.width * 0.4, y]], 3200);
    dock.dispatchEvent(new PointerEvent('pointerleave'));
    await sleep(400);
  },
};
