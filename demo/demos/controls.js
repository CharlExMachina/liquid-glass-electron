import { glass } from '../../dist/liquid-glass.js';
import { css, drag, h, icon, photo, ready, sleep, tap } from './lib.js';

// Sliders and toggles with knobs of clear glass, as iOS 26's: a knob bends what's under it (the track, its fill), and
// held, it bulges and bends more. A volume HUD whose level shows through frosted glass.
function slider(value, onChange) {
  const fill = h('i');
  const knob = h('div.knob');
  const el = h('div.slider', { role: 'slider', 'aria-valuemin': 0, 'aria-valuemax': 100, tabindex: 0 }, h('div.track', {}, fill), knob);
  const set = (v) => {
    value = Math.min(Math.max(v, 0), 100);
    fill.style.width = `${value}%`;
    knob.style.left = `${value}%`;
    el.setAttribute('aria-valuenow', Math.round(value));
    onChange?.(value);
  };
  const at = (e) => set(((e.clientX - el.getBoundingClientRect().left) / el.clientWidth) * 100);
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture?.(e.pointerId);
    at(e);
    const move = (m) => at(m);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
  });
  el.addEventListener('keydown', (e) => set(value + (e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0)));
  set(value);
  return { el, knob };
}

export default {
  title: 'Sliders and toggles',
  async render(stage) {
    css('controls');
    const img = photo('alps');
    const level = h('div.level');
    const hud = h('div.hud', {}, level, icon('volume', 24));
    const rows = [['sun', 62], ['volume', 40], ['music', 80]].map(([ic, v]) => {
      const out = h('span', { text: String(v) });
      const s = slider(v, (x) => {
        out.textContent = Math.round(x);
        if (ic === 'volume') level.style.height = `${x}%`;
      });
      return { row: h('div.ctl-row', {}, icon(ic), s.el, out), knob: s.knob };
    });
    const toggles = ['Wi‑Fi', 'Bluetooth', 'AirDrop'].map((t, i) => {
      const knob = h('div.knob');
      const tg = h('div.toggle', { role: 'switch', 'aria-checked': String(i !== 1), tabindex: 0, on: { click: () => tg.setAttribute('aria-checked', String(tg.getAttribute('aria-checked') !== 'true')) } }, knob);
      return { el: h('label.toggle-label', {}, tg, h('span', { text: t })), knob };
    });
    const panel = h('div.ctl-panel', {}, h('h3', { text: 'Control Center' }), ...rows.map((r) => r.row), h('div.toggles', {}, ...toggles.map((t) => t.el)));
    stage.append(h('div.scene', {}, img, panel, hud));
    await ready(img);
    // Knobs, as iOS 26's: solid white at rest; held, clear glass that bulges, bending the track under it (the slider or
    // switch around a knob takes the pointer).
    const solid = 'rgb(255 255 255 / 0.94)', clear = 'rgb(255 255 255 / 0.06)';
    const knob = { shape: 'capsule', zRadius: 9, refraction: 0.7, chromAberration: 0.06, press: 'bulge', pressBulge: 0.7, shadowOpacity: 0.4, shadowSpread: 4, shadowOffsetY: 1, fill: solid };
    const knobs = [...rows.map((r) => r.knob), ...toggles.map((t) => t.knob)];
    const handles = [glass(panel, { variant: 'regular', cornerRadius: 34, blurAmount: 1.2 }), glass(hud, { variant: 'regular', cornerRadius: 22, blurAmount: 1.5 }),
      ...knobs.map((k) => glass(k, knob))];
    const held = (k, on) => {
      handles[2 + knobs.indexOf(k)].update({ fill: on ? clear : solid });
      k.style.scale = on ? '1.25' : '';
    };
    const off = knobs.map((k) => {
      const control = k.closest('[role]');
      const down = () => {
        held(k, true);
        addEventListener('pointerup', () => held(k, false), { once: true });
      };
      control.addEventListener('pointerdown', down);
      return () => control.removeEventListener('pointerdown', down);
    });
    return () => {
      off.forEach((f) => f());
      handles.forEach((g) => g.destroy());
    };
  },
  async play(stage) {
    const sliders = [...stage.querySelectorAll('.slider')];
    await drag(sliders[1].querySelector('.knob'), 150, 0, 1100, sliders[1]);
    await sleep(300);
    for (const t of stage.querySelectorAll('.toggle')) {
      await tap(t, 180);
      await sleep(250);
    }
    await drag(sliders[0].querySelector('.knob'), -120, 0, 900, sliders[0]);
  },
};
