import { glass, morph } from '../../dist/liquid-glass.js';
import { css, h, icon, photo, ready, sleep, tap } from './lib.js';

// Morphing, as Apple's glassEffectID: the glass of a button flows into the menu or sheet it opens, and back.
export default {
  title: 'Morphing',
  async render(stage) {
    css('morph');
    const img = photo('alps');
    const fab = h('button.fab', { 'aria-label': 'Actions' }, icon('plus', 26));
    const items = [['camera', 'Take photo'], ['photo', 'Choose from library'], ['folder', 'Browse files'], ['map', 'Add location']];
    const menu = h('div.menu', { role: 'menu' }, ...items.map(([ic, t]) => h('button', { role: 'menuitem' }, icon(ic), h('span', { text: t }))));
    const pill = h('button.pill-btn', {}, icon('edit'), h('span', { text: 'Write a note' }));
    const close = h('button.close', { 'aria-label': 'Close' }, icon('close'));
    const sheet = h('div.sheet', { role: 'dialog' }, close, h('h3', { text: 'New note' }), h('p', { text: 'The button’s glass became this sheet. Close it and the sheet flows back into the button.' }));
    const root = h('div.morph-root', {}, fab, menu, pill, sheet, h('p.morph-note', { text: 'Tap the + or the pill. The glass travels with a spring, its corners going from the button’s to the panel’s.' }));
    stage.append(h('div.scene', {}, img, root));
    await ready(img);
    const opts = { variant: 'regular', blurAmount: 1.2 };
    const handles = [glass(fab, { ...opts, shape: 'circle', interactive: true }), glass(menu, { ...opts, cornerRadius: 30 }),
      glass(pill, { ...opts, shape: 'capsule', interactive: true }), glass(sheet, { ...opts, cornerRadius: 36 }), glass(close, { shape: 'circle', refraction: 0.4, zRadius: 14, fill: 'rgb(255 255 255 / 0.15)' })];
    let busy = false;
    const flow = async (a, b) => {
      if (busy) return;
      busy = true;
      await morph(a, b);
      busy = false;
    };
    fab.addEventListener('click', () => flow(fab, menu));
    menu.addEventListener('click', () => flow(menu, fab));
    pill.addEventListener('click', () => flow(pill, sheet));
    close.addEventListener('click', () => flow(sheet, pill));
    return () => handles.forEach((g) => g.destroy());
  },
  async play(stage) {
    const [fab, menu, pill, close] = ['.fab', '.menu button', '.pill-btn', '.close'].map((s) => stage.querySelector(s));
    await tap(fab, 120);
    await sleep(1300);
    await tap(menu, 120);
    await sleep(900);
    await tap(pill, 120);
    await sleep(1400);
    await tap(close, 120);
    await sleep(900);
  },
};
