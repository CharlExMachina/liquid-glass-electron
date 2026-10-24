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
  async thinrim() {
    // a thin capsule bent hard, with fringing: its rim samples further past the edge than the map's margin
    await photo('coast');
    glass(box(120, 120, 180, 44, 'z22'), { shape: 'capsule', zRadius: 22, variant: 'regular' });
    glass(box(340, 120, 180, 44, 'r1.2'), { shape: 'capsule', zRadius: 16, refraction: 1.2, variant: 'regular' });
    glass(box(230, 230, 180, 44, 'z40'), { shape: 'capsule', zRadius: 40 });
  },
  async applelens() {
    // bevelMode 2 on a light page, at an iPhone's slider sizes: the track flares where it enters the knob
    document.body.style.background = 'rgb(243 243 243)';
    const track = at(h('div', 'track'), 60, 194, 520, 12);
    Object.assign(track.style, { position: 'absolute', borderRadius: '6px', background: 'linear-gradient(90deg, rgb(0 125 254) 50%, rgb(216 216 216) 50%)' });
    document.body.append(track);
    const knob = box(250, 158.5, 113, 83);
    knob.style.borderRadius = '41.5px';
    glass(knob, { bevelMode: 2, zRadius: 24, refraction: 1.15, chromAberration: 0, brightness: -0.057, edgeHighlight: 0, fresnel: 0, fill: 'rgb(255 255 255 / 0.05)' });
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
  async shapes() {
    await photo('ponds');
    glass(box(30, 90, 180, 180, 'squircle'), { shape: 'squircle', cornerRadius: 50 });
    glass(box(230, 90, 180, 180, 'star'), { shape: 'path', pathBox: '0 0 100 100', path: 'M50 2 L62 36 L98 37 L69 59 L80 95 L50 74 L20 95 L31 59 L2 37 L38 36 Z', zRadius: 20 });
    glass(box(430, 90, 180, 180, 'heart'), { shape: 'path', pathBox: '0 0 100 100', path: 'M50 90 C20 70 4 52 6 32 C8 14 30 6 50 26 C70 6 92 14 94 32 C96 52 80 70 50 90 Z', zRadius: 24 });
  },
  async strength() {
    await photo('coast');
    const hs = [40, 240, 440].map((x, i) => glass(box(x, 110, 160, 180, ['1', '0.5', '0'][i]), { variant: 'regular', cornerRadius: 30, fill: 'rgb(255 255 255 / 0.2)' }));
    await settle();
    hs[1].set({ strength: 0.5 });
    hs[2].set({ strength: 0 });
  },
  async fallback() {
    // what Firefox and Safari get: frost, light, fill and shadow, no bending
    globalThis.LIQUID_GLASS_FALLBACK = true;
    await photo('coast');
    glass(box(140, 90, 360, 200, 'fallback'), { variant: 'regular', cornerRadius: 40 });
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
