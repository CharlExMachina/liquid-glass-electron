import { glass } from '../../dist/liquid-glass.js';
import { css, drag, h, sleep } from './lib.js';

// Floating glass (liquidglass's floating option): drag it around over live content. Text scrolling by, CSS
// animations: all of it bends through the glass as it moves, with no capture and nothing redrawn in script.
export default {
  title: 'Dragging',
  async render(stage) {
    css('drag');
    const words = 'Liquid glass bends the live page behind it · ';
    const line = (cls, top) => {
      const t = h(`div.ticker${cls}`, { text: words.repeat(8) });
      t.style.top = `${top}px`;
      return t;
    };
    const orbs = [['#ff375f', 80, 120], ['#30d158', 420, 360], ['#5e5ce6', 700, 80]].map(([c, x, y]) => {
      const o = h('div.orb');
      Object.assign(o.style, { background: c, left: `${x}px`, top: `${y}px` });
      return o;
    });
    const live = h('div.live', {}, ...orbs, line('', 90), line('.b', 260), line('.c', 430), line('', 600));
    const cards = [
      h('div.float', {}, h('b', { text: 'Drag me' }), h('small', { text: 'floating: true' })),
      h('div.float.round', {}, h('b', { text: 'Or me' })),
      h('div.float', {}, h('b', { text: 'Dome' }), h('small', { text: 'bevelMode: 1' })),
    ];
    [[340, 120], [720, 300], [420, 440]].forEach(([x, y], i) => Object.assign(cards[i].style, { left: `${x}px`, top: `${y}px` }));
    stage.append(h('div.scene', {}, live, ...cards));
    const handles = [glass(cards[0], { floating: true, cornerRadius: 32 }), glass(cards[1], { floating: true, shape: 'circle', zRadius: 50 }),
      glass(cards[2], { floating: true, cornerRadius: 32, bevelMode: 1, refraction: 0.5 })];
    return () => handles.forEach((g) => g.destroy());
  },
  async play(stage) {
    const cards = [...stage.querySelectorAll('.float')];
    await drag(cards[0], 260, 160, 1700);
    await sleep(200);
    await drag(cards[1], -320, -60, 1600);
    await sleep(200);
    await drag(cards[2], 240, -220, 1500);
    await sleep(600);
  },
};
