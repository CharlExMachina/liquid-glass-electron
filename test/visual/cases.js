// The visual test cases: each a fixed scene, chosen by the page's hash. window.caseReady is set when it's drawn.
import { container, glass, glassButton, setEnvironment } from '../../dist/liquid-glass.js';

const h = (tag, cls, props = {}) => Object.assign(document.createElement(tag), { className: cls }, props);
const at = (el, x, y, w, ht) => {
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${ht}px` });
  return el;
};
const photo = async (name) => {
  const img = h('img', 'photo', { src: `../../demo/assets/${name}.jpg`, alt: '' });
  document.body.append(img, h('div', 'stripes'));
  await img.decode();
};
const box = (x, y, w, ht, text = '', tag = 'div') => {
  const el = at(h(tag, 'g', { textContent: text }), x, y, w, ht);
  document.body.append(el);
  return el;
};
const settle = () => new Promise((r) => setTimeout(r, 500));

const CASES = {
  async defaults() {
    await photo('coast');
    glass(box(140, 90, 360, 200, 'defaults'), { cornerRadius: 40 });
  },
  async capsule() {
    await photo('ponds');
    glass(box(170, 150, 300, 80, 'capsule'), { shape: 'capsule' });
  },
  async dome() {
    await photo('ponds');
    glass(box(220, 100, 200, 200), { shape: 'circle', bevelMode: 1, refraction: 1.4 });
  },
  async frosted() {
    await photo('alps');
    glass(box(120, 80, 400, 240, 'regular'), { variant: 'regular', cornerRadius: 32 });
  },
  async nofringe() {
    await photo('coast');
    glass(box(140, 90, 360, 200, 'no fringe'), { cornerRadius: 24, chromAberration: 0, zRadius: 24 });
  },
  async identity() {
    await photo('coast');
    glass(box(140, 90, 360, 200, 'identity'), { variant: 'identity', cornerRadius: 40 });
  },
  async container() {
    await photo('ponds');
    const c = box(60, 120, 520, 160);
    for (const [x, w] of [[20, 120], [150, 120], [330, 120]]) {
      const m = at(h('div', 'g'), x, 40, w, 80);
      m.dataset.glassMember = '';
      m.style.borderRadius = '40px';
      c.append(m);
    }
    container(c, { spacing: 24 });
  },
  async prominent() {
    await photo('coast');
    // a CSS reset (button { background: none }) mustn't take the fill away
    glassButton(box(220, 170, 200, 56, 'Continue', 'button'), 'prominent');
  },
  async tinted() {
    await photo('night');
    setEnvironment({ appearance: 'tinted', dark: true });
    glass(box(140, 120, 360, 160, 'tinted'), { cornerRadius: 36 });
  },
  async contrast() {
    await photo('coast');
    setEnvironment({ increaseContrast: true, reduceTransparency: true });
    glass(box(140, 120, 360, 160, 'accessible'), { cornerRadius: 36 });
  },
};

const name = location.hash.slice(1);
await CASES[name]();
await settle();
window.caseReady = true;
