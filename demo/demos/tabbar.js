import { glass } from '../../dist/liquid-glass.js';
import { css, h, icon, photo, ready, sleep, tap } from './lib.js';

// iOS 26's tab bar: a floating capsule with the selected tab on a pill that slides between tabs, and a search button
// on its own circle of glass beside it.
export default {
  title: 'Tab bar',
  async render(stage) {
    css('tabbar');
    const img = photo('ponds');
    const names = [['home', 'Home'], ['photo', 'Photos'], ['music', 'Music'], ['gear', 'Settings']];
    const pill = h('div.tab-pill');
    const heading = h('h1', { text: 'Home' });
    const tabs = names.map(([ic, label], i) => h('button.tab', {
      role: 'tab', 'aria-selected': String(i === 0),
      on: { click: () => {
        tabs.forEach((t, j) => t.setAttribute('aria-selected', String(i === j)));
        pill.style.translate = `${i * 84}px 0`;
        heading.textContent = label;
      } },
    }, icon(ic), h('span', { text: label })));
    const bar = h('div.tabbar', { role: 'tablist' }, pill, ...tabs);
    const search = h('button.searchbtn', { 'aria-label': 'Search' }, icon('search', 24));
    stage.append(h('div.scene', {}, img, h('div.tab-content', {}, heading, h('p', { text: 'Lop Nur, Xinjiang, from Landsat 5.' })), h('div.tabbar-wrap', {}, bar, search)));
    await ready(img);
    const handles = [glass(bar, { variant: 'regular', shape: 'capsule', zRadius: 26 }), glass(search, { variant: 'regular', shape: 'circle', zRadius: 26, interactive: true })];
    return () => handles.forEach((g) => g.destroy());
  },
  async play(stage) {
    const tabs = [...stage.querySelectorAll('.tab')];
    for (const i of [1, 2, 3, 0]) {
      await tap(tabs[i], 160);
      await sleep(650);
    }
  },
};
