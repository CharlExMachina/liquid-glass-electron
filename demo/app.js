// The gallery's shell: a sidebar of demos and a stage. Each demo is a module in demos/ with a render(stage) that
// returns a clean-up function, and an optional play() that acts it out for recordings.
import { autoGlass, setEnvironment } from '../dist/liquid-glass.js';

const DEMOS = [
  ['Bars', ['toolbar', 'tabbar', 'scroll']],
  ['Controls', ['controls', 'buttons', 'toasts']],
  ['Motion', ['morph', 'container', 'drag', 'dock']],
  ['Lenses', ['video', 'magnifier']],
  ['Look', ['appearance', 'compare', 'playground']],
];
const TITLES = {
  toolbar: 'Toolbar', tabbar: 'Tab bar', scroll: 'Over scrolling content', controls: 'Sliders and toggles', buttons: 'Buttons',
  toasts: 'Toasts', morph: 'Morphing', container: 'Merging glass', drag: 'Dragging', dock: 'Dock', video: 'Over video',
  magnifier: 'Magnifier', appearance: 'Clear, tinted, accessible', compare: 'Glass vs. blur', playground: 'Playground',
};
const modules = {};
const stage = document.getElementById('stage');
const nav = document.getElementById('nav');
let cleanup = null, current = null;

async function load(id) {
  modules[id] ??= (await import(`./demos/${id}.js`)).default;
  return modules[id];
}

async function show(id) {
  if (!DEMOS.some(([, ids]) => ids.includes(id))) id = 'toolbar';
  cleanup?.();
  stage.replaceChildren();
  stage.className = '';
  const demo = await load(id);
  current = demo;
  for (const a of nav.querySelectorAll('a')) a.toggleAttribute('aria-current', a.hash === `#${id}`);
  document.title = `${demo.title} · liquid-glass-electron`;
  cleanup = (await demo.render(stage)) ?? null;
  window.demoReady = true;
}

// the sidebar
for (const [group, ids] of DEMOS) {
  const h = document.createElement('h2');
  h.textContent = group;
  nav.append(h);
  for (const id of ids) {
    const a = document.createElement('a');
    a.href = `#${id}`;
    a.textContent = TITLES[id];
    nav.append(a);
  }
}

// light, dark and the Clear/Tinted setting
const dark = document.getElementById('dark'), tinted = document.getElementById('tinted');
const applyTheme = () => {
  document.documentElement.dataset.theme = dark.checked ? 'dark' : 'light';
  document.documentElement.dataset.glassTheme = dark.checked ? 'dark' : 'light';
  setEnvironment({ dark: dark.checked, appearance: tinted.checked ? 'tinted' : 'clear' });
};
dark.checked = matchMedia('(prefers-color-scheme: dark)').matches;
dark.addEventListener('change', applyTheme);
tinted.addEventListener('change', applyTheme);
applyTheme();

autoGlass();
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
window.demoPlay = () => current?.play?.(stage);
show(location.hash.slice(1) || 'toolbar');
