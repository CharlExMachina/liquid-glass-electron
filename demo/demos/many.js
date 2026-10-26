import { glass, glassGroup } from '../../dist/liquid-glass.js';
import { css, h, icon, ready, sleep, tap } from './lib.js';

// Lots of glass at once: 24 glass tiles over a scrolling feed, each glass() with a filter of its own (group: false),
// glass() as it is (siblings share one filter by themselves), or one glassGroup(). They look the same; a group bends all
// of them with one backdrop filter, which is most of what glass costs per frame. The readout counts the tiles' backdrop
// filters: hover or press a tile and it gets a filter of its own while it differs, then goes back into the group.
const POSTS = [
  ['coast', 'Zapata Peninsula', 'Mangroves and reefs on Cuba’s southern coast.'], ['ponds', 'Lop Nur', 'Potash evaporation ponds in the Tarim Basin.'],
  ['alps', 'The Alps', 'Clouds over the peaks, looking south to Italy.'], ['night', 'Moscow at night', 'City lights, the aurora and the moon.'],
];
const TILES = [['home', 'Home'], ['mail', 'Mail'], ['message', 'Messages'], ['photo', 'Photos'], ['music', 'Music'], ['map', 'Maps'],
  ['camera', 'Camera'], ['gear', 'Settings'], ['bell', 'Alerts'], ['search', 'Search'], ['folder', 'Files'], ['star', 'Starred'],
  ['heart', 'Health'], ['sun', 'Weather'], ['play', 'Videos'], ['volume', 'Sound'], ['edit', 'Notes'], ['pen', 'Sign'],
  ['share', 'Share'], ['trash', 'Trash'], ['check', 'Tasks'], ['plus', 'New'], ['back', 'Back'], ['forward', 'Forward']];
const OPTIONS = { variant: 'regular', cornerRadius: 26, zRadius: 20, button: true };

export default {
  title: 'Lots of glass',
  async render(stage) {
    css('scroll');
    css('many');
    const posts = [];
    for (let i = 0; i < 24; i++) {
      const [img, title, text] = POSTS[i % POSTS.length];
      posts.push(h('article.post', {}, h('img', { src: `assets/${img}.jpg`, alt: '' }), h('div', {}, h('h4', { text: title }), h('p', { text }))));
    }
    const feed = h('div.feed', {}, h('div.feed-inner', {}, ...posts));
    const tiles = TILES.map(([ic, label]) => h('button.tile', { 'aria-label': label }, icon(ic, 26), h('span', { text: label })));
    const grid = h('div.tiles', {}, ...tiles);
    // the tiles sit over the feed; the wheel over them scrolls it
    const overlay = h('div.many-overlay', { on: { wheel: (e) => feed.scrollBy(0, e.deltaY) } }, grid);

    let mode = 'group', group = null, handles = [];
    const count = h('b', { text: '–' }), noun = h('span', { text: ' backdrop filters' });
    const MODES = { separate: 'group: false', auto: 'glass()', group: 'glassGroup()' };
    const buttons = Object.entries(MODES).map(([m, label]) => h('button', { text: label, 'aria-pressed': String(m === mode), on: { click: () => use(m) } }));
    const panel = h('div.many-panel', {}, h('div.many-seg', {}, ...buttons), h('span', {}, count, noun));
    stage.append(h('div.scene', {}, feed, overlay, panel));

    function use(m) {
      group?.destroy();
      handles.forEach((g) => g.destroy());
      group = null;
      handles = [];
      mode = m;
      buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(Object.keys(MODES)[i] === m)));
      if (m === 'group') group = glassGroup(tiles, OPTIONS);
      else handles = tiles.map((t) => glass(t, { ...OPTIONS, group: m === 'auto' }));
    }
    // how many backdrop filters the tiles take: one each, or the group's layer and any tile changing on its own
    const filters = () => [...grid.children].filter((el) => getComputedStyle(el).backdropFilter !== 'none').length;
    const timer = setInterval(() => {
      const n = filters();
      count.textContent = String(n);
      noun.textContent = n === 1 ? ' backdrop filter' : ' backdrop filters';
    }, 150);

    await Promise.all([...feed.querySelectorAll('img')].slice(0, 6).map(ready));
    const own = glass(panel, { variant: 'regular', shape: 'capsule', zRadius: 14 });
    use(mode);
    return () => {
      clearInterval(timer);
      group?.destroy();
      handles.forEach((g) => g.destroy());
      own.destroy();
    };
  },
  async play(stage) {
    const feed = stage.querySelector('.feed'), tiles = stage.querySelectorAll('.tile');
    const scroll = (to, ms) => new Promise((done) => {
      const from = feed.scrollTop, t0 = performance.now();
      const step = (now) => {
        const p = Math.min((now - t0) / ms, 1);
        feed.scrollTop = from + (to - from) * (0.5 - 0.5 * Math.cos(p * Math.PI));
        if (p < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    await scroll(600, 2400);
    await tap(tiles[8], 500);
    await sleep(300);
    await scroll(0, 2400);
  },
};
