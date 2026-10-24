import { DEFAULTS, glass } from '../../dist/liquid-glass.js';
import { css, h, ready, sleep } from './lib.js';

// Every option, live. Drag the glass around; the code below is the glass() call for what's set (only what differs
// from the defaults).
const NUM = [
  ['Bending', [['refraction', 0, 2, 0.01], ['zRadius', 1, 120, 1], ['bevelMode', 0, 2, 1], ['chromAberration', 0, 0.4, 0.005], ['distortion', 0, 2, 0.05]]],
  ['Light', [['edgeHighlight', 0, 1, 0.01], ['fresnel', 0, 3, 0.05], ['specular', 0, 2, 0.05]]],
  ['Frost and colour', [['blurAmount', 0, 4, 0.05], ['saturation', -1, 2, 0.05], ['brightness', -0.5, 0.8, 0.02], ['tintStrength', 0, 1, 0.02], ['opacity', 0, 1, 0.02]]],
  ['Shadow', [['shadowOpacity', 0, 1, 0.02], ['shadowSpread', 1, 40, 1], ['shadowOffsetY', -10, 30, 1]]],
  ['Shape', [['cornerRadius', 0, 120, 1]]],
  ['Amount', [['strength', 0, 1, 0.01]]],
];
const CHOICES = [['variant', ['', 'regular', 'clear', 'identity']], ['shape', ['rect', 'capsule', 'circle', 'squircle', 'star', 'heart', 'blob']], ['press', ['', 'bulge', 'flatten', 'none']]];
// shapes given as paths, in a 100 × 100 box stretched over the element
const PATHS = {
  star: 'M50 2 L62 36 L98 37 L69 59 L80 95 L50 74 L20 95 L31 59 L2 37 L38 36 Z',
  heart: 'M50 90 C20 70 4 52 6 32 C8 14 30 6 50 26 C70 6 92 14 94 32 C96 52 80 70 50 90 Z',
  blob: 'M50 6 C78 2 98 22 94 48 C91 74 74 97 46 94 C20 91 2 72 6 46 C9 22 26 9 50 6 Z',
};
const FLAGS = ['interactive', 'button', 'floating', 'magnify', 'smooth'];
const COLOURS = [['tint', ''], ['fill', '']];

export default {
  title: 'Playground',
  async render(stage) {
    css('playground');
    const backdrops = {
      photo: () => h('img.photo', { src: 'assets/coast.jpg', alt: '' }),
      ponds: () => h('img.photo', { src: 'assets/ponds.jpg', alt: '' }),
      video: () => {
        const v = h('video', { src: 'assets/orbit.webm', muted: true, loop: true, autoplay: true });
        v.muted = true;
        return v;
      },
      text: () => h('div.pg-text', {}, ...['Liquid glass bends whatever is behind it.', 'Text, photos, video, canvas: the live page.', 'Drag the glass over this and watch the letters bend at the rim.'].map((t) => h('p', { text: t }))),
    };
    const back = h('div.fill');
    const el = h('div.pg-glass', { text: 'Drag me' });
    const pgStage = h('div.pg-stage', {}, back, el);
    const options = { ...DEFAULTS, cornerRadius: 40, floating: true };
    const code = h('pre.pg-code');
    let g = null;
    const apply = () => {
      const o = { ...options };
      for (const k of ['variant', 'press', 'tint', 'fill', 'path', 'pathBox']) if (!o[k]) o[k] = null;
      g?.update(o);
      const changed = Object.entries(o).filter(([k, v]) => v !== DEFAULTS[k] && !(k === 'floating' && v));
      code.textContent = `glass(el, {\n${changed.map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n')}\n});`;
    };
    const rows = [];
    const row = (label, input, out) => h('label.pg-row', {}, h('span', { text: label }), input, out);
    for (const [group, items] of NUM) {
      rows.push(h('h4', { text: group }));
      for (const [k, min, max, step] of items) {
        const out = h('output', { text: String(options[k] ?? 0) });
        const input = h('input', { type: 'range', min, max, step, value: options[k] ?? 0 });
        input.addEventListener('input', () => {
          options[k] = +input.value;
          out.textContent = input.value;
          apply();
        });
        rows.push(row(k, input, out));
      }
    }
    rows.push(h('h4', { text: 'Apple' }));
    for (const [k, list] of CHOICES) {
      const sel = h('select', {}, ...list.map((v) => h('option', { value: v, text: v || '(none)' })));
      sel.value = options[k] ?? '';
      sel.addEventListener('change', () => {
        options[k] = sel.value || null;
        if (k === 'shape') {
          const path = PATHS[sel.value];
          Object.assign(options, path ? { shape: 'path', path, pathBox: '0 0 100 100' } : { path: null, pathBox: null });
        }
        apply();
      });
      rows.push(row(k, sel));
    }
    for (const [k, v] of COLOURS) {
      const input = h('input', { type: 'text', placeholder: 'a CSS colour', value: v });
      input.addEventListener('change', () => {
        options[k] = input.value.trim() || null;
        apply();
      });
      rows.push(row(k, input));
    }
    for (const k of FLAGS) {
      const box = h('input', { type: 'checkbox' });
      box.checked = !!options[k];
      box.addEventListener('change', () => {
        options[k] = box.checked;
        apply();
      });
      rows.push(row(k, box));
    }
    const pick = h('select', {}, ...Object.keys(backdrops).map((k) => h('option', { value: k, text: k })));
    pick.addEventListener('change', () => back.replaceChildren(backdrops[pick.value]()));
    const copy = h('button', { text: 'Copy', on: { click: () => navigator.clipboard?.writeText(code.textContent) } });
    const panel = h('div.pg-panel', {}, row('backdrop', pick), ...rows, code, h('div.pg-actions', {}, copy));
    stage.append(h('div.scene', {}, h('div.pg', {}, pgStage, panel)));
    back.replaceChildren(backdrops.photo());
    await ready(back.firstChild);
    g = glass(el, options);
    apply();
    return () => g.destroy();
  },
  async play(stage) {
    const ranges = [...stage.querySelectorAll('.pg-panel input[type=range]')];
    const set = async (i, values) => {
      for (const v of values) {
        ranges[i].value = v;
        ranges[i].dispatchEvent(new Event('input'));
        await sleep(260);
      }
    };
    await set(0, [0.9, 1.2, 1.5, 0.69]);
    await set(3, [0.15, 0.3, 0.05]);
    await set(8, [1, 2, 0]);
  },
};
