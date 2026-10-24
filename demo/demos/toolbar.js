import { glass } from '../../dist/liquid-glass.js';
import { css, h, icon, photo, ready, sleep, tap } from './lib.js';

// A toolbar over a photo: buttons grouped on capsules of glass, as iOS 26 groups toolbar items; a segmented control
// with a sliding pill; a card whose chips sit in concentric corners.
export default {
  title: 'Toolbar',
  async render(stage) {
    css('toolbar');
    const img = photo('coast');
    const btn = (name) => h('button.tb-btn', { 'aria-label': name }, icon(name));
    const left = h('div.tb-group', {}, btn('back'), btn('forward'));
    const right = h('div.tb-group', {}, btn('share'), btn('plus'), btn('more'));
    const segButtons = ['Day', 'Week', 'Month'].map((t) => h('button', { text: t }));
    const pill = h('div.pill');
    const seg = h('div.seg', {}, pill, ...segButtons);
    segButtons.forEach((b, i) => b.addEventListener('click', () => (pill.style.translate = `${i * 104}px 0`)));
    const chips = ['Swim', 'Snorkel', 'Sail'].map((t) => h('div.chip', { text: t }));
    const card = h('div.card', {}, h('h3', { text: 'Zapata Peninsula' }), h('p', { text: 'Southern Cuba, from the International Space Station.' }), h('div.chips', {}, ...chips));
    stage.append(h('div.scene', {}, img, h('div.tb', {}, left, h('div.tb-title', { text: 'Coastline' }), right), seg, card));
    await ready(img);
    const handles = [glass(left, { shape: 'capsule', zRadius: 18 }), glass(right, { shape: 'capsule', zRadius: 18 }), glass(seg, { variant: 'regular', shape: 'capsule', blurAmount: 0.2 }),
      glass(card, { variant: 'regular', cornerRadius: 28 }), ...chips.map((c) => glass(c, { shape: 'concentric', refraction: 0.4, zRadius: 12, chromAberration: 0 }))];
    return () => handles.forEach((g) => g.destroy());
  },
  async play(stage) {
    const seg = [...stage.querySelectorAll('.seg button')];
    for (const i of [1, 2, 0]) {
      await tap(seg[i]);
      await sleep(700);
    }
  },
};
