import { glass } from '../../dist/liquid-glass.js';
import { css, h, photo, ready, sleep } from './lib.js';

// The same card three ways: CSS backdrop-filter (a blur: the usual "glassmorphism"); liquid glass with the same frost;
// and clear liquid glass. Stripes run behind all three, so the bending shows.
export default {
  title: 'Glass vs. blur',
  async render(stage) {
    css('compare');
    const img = photo('coast');
    const cards = [['CSS backdrop-filter', 'blur, saturate'], ['Liquid glass, frosted', 'blurAmount 1.8'], ['Liquid glass, clear', 'liquidglass’s defaults']].map(([t, s], i) => {
      const c = h(`div.cmp-card${i === 0 ? '.css' : ''}`, {}, h('b', { text: t }), h('small', { text: s }));
      c.style.left = `${36 + i * 302}px`;
      return c;
    });
    stage.append(h('div.scene', {}, img, h('div.cmp', {}, h('div.cmp-strip'), ...cards)));
    await ready(img);
    const handles = [glass(cards[1], { blurAmount: 1.8, saturation: 0.6, cornerRadius: 34 }), glass(cards[2], { cornerRadius: 34 })];
    return () => handles.forEach((g) => g.destroy());
  },
  async play() {
    await sleep(2000);
  },
};
