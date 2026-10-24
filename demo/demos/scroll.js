import { glass, scrollEdge } from '../../dist/liquid-glass.js';
import { css, h, icon, ready, sleep } from './lib.js';

// A floating bar over a scrolling feed. The bar bends the posts as they pass under it, live; the scroll edge effect
// dissolves them into a blur at the top (soft) or ends them under a band (hard), as iOS 26 does under its bars.
const POSTS = [
  ['coast', 'Zapata Peninsula', 'Mangroves and reefs on Cuba’s southern coast.'], ['ponds', 'Lop Nur', 'Potash evaporation ponds in the Tarim Basin.'],
  ['alps', 'The Alps', 'Clouds over the peaks, looking south to Italy.'], ['night', 'Moscow at night', 'City lights, the aurora and the moon.'],
];
export default {
  title: 'Over scrolling content',
  async render(stage) {
    css('scroll');
    const posts = [];
    for (let i = 0; i < 24; i++) {
      const [img, title, text] = POSTS[i % POSTS.length];
      posts.push(h('article.post', {}, h('img', { src: `assets/${img}.jpg`, alt: '' }), h('div', {}, h('h4', { text: title }), h('p', { text }))));
    }
    const feed = h('div.feed', {}, h('div.feed-inner', {}, ...posts));
    const bar = h('div.floatbar', {}, h('b', { text: 'From orbit' }), h('button', { 'aria-label': 'Search' }, icon('search')), h('button', { 'aria-label': 'More' }, icon('more')));
    let style = 'soft', off = scrollEdge(feed, { style, size: 84 });
    const toggle = h('button.edge-toggle', { text: 'Edge: soft', on: { click: () => {
      style = style === 'soft' ? 'hard' : 'soft';
      off();
      off = scrollEdge(feed, { style, size: 84 });
      toggle.textContent = `Edge: ${style}`;
    } } });
    stage.append(h('div.scene', {}, feed, bar, toggle));
    await Promise.all([...feed.querySelectorAll('img')].slice(0, 4).map(ready));
    const handles = [glass(bar, { variant: 'regular', shape: 'capsule', zRadius: 22 }), glass(toggle, { variant: 'regular', shape: 'capsule', zRadius: 14 })];
    return () => {
      off();
      handles.forEach((g) => g.destroy());
    };
  },
  async play(stage) {
    const feed = stage.querySelector('.feed');
    const t0 = performance.now();
    await new Promise((done) => {
      const step = (now) => {
        const t = (now - t0) / 4200;
        feed.scrollTop = Math.sin(Math.min(t, 1) * Math.PI) * 520;
        if (t < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    await sleep(200);
  },
};
