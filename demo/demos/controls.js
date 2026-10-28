import { glass } from '../../dist/liquid-glass.js';
import { css, drag, h, icon, photo, ready, sleep, tap } from './lib.js';

// Sliders and toggles on a panel of glass, as macOS 26's own (native/demos/Controls.swift draws them with SwiftUI's
// Slider and Toggle): a knob is solid at rest and turns to clear glass while it's held, bending what's under it (the
// track, its fill, the glass of the panel), which glass inside glass sees as it does on macOS. A slider's knob grows by
// a third into a lens with a narrow rim (bevelMode 2): the track keeps its width through it and flares where it enters.
// A switch's grows 1.6× into Apple's switch lens (bevelMode 3), which shrinks what's behind it. Sizes, colours, the
// lenses' surfaces (over a white, a black and a grey backdrop) and the timing of a press are measured from macOS's
// controls, light and dark, as the iOS controls page's are from iOS's. A volume HUD whose level shows through frosted
// glass.

const KNOB_W = 24; // the resting slider knob's width (see controls.css)

/**
 * A lens's surface, which doesn't bend: what macOS draws over the glass of a held knob, measured over a white, a black
 * and a grey backdrop and fitted (to 1.6 levels). Inside, it changes what the glass shows by a gain and an offset, as
 * no blend can: a white fill from a pixel in and a dark band across the upper half toward the middle (a gain and an
 * offset, as a layer laid over would), a line of light inside the edge, top and bottom (added), and the hairline at the
 * edge (taken away: it darkens grey as much as white). The glass applies it (its `surface`: a gain and an offset).
 * Outside, the shadow: the shape moved down and grown, blurred, a layer laid over the backdrop. Data URLs: the
 * surface's two for the knob's box, the shadow for it and 16 px around, at `k` pixels per px. `p` is the fit for the
 * lens: its parts' strengths, and where they are, px in from the edge ([top, bottom, sides] where they differ).
 */
function surface(w, h, k, p) {
  const PAD = 16, r = h / 2, half = w / 2 - r;
  const smooth = (t) => t * t * (3 - 2 * t), clamp01 = (t) => Math.min(Math.max(t, 0), 1);
  // `n` images, each pixel `pixel` of the point's distance in from the edge, the edge's normal (y) and where it is
  const draw = (pad, n, pixel) => {
    const W = Math.round((w + 2 * pad) * k), H = Math.round((h + 2 * pad) * k), imgs = Array.from({ length: n }, () => new ImageData(W, H));
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = (i + 0.5) / k - pad - w / 2, y = (j + 0.5) / k - pad - h / 2;
        const qx = Math.max(Math.abs(x) - half, 0), len = Math.hypot(qx, y) || 1e-9;
        pixel(r - len, y / len, qx, y).forEach((rgba, m) => imgs[m].data.set(rgba, (j * W + i) * 4));
      }
    }
    return imgs.map((img) => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.getContext('2d').putImageData(img, 0, 0);
      return canvas.toDataURL();
    });
  };
  const grey = (v) => [v, v, v, 255];
  const inside = draw(0, 2, (d, ny) => {
    if (d <= 0) return [grey(255), grey(128)];
    // by the edge's normal: the top's value, the bottom's, or the sides'
    const by = ([top, bottom, side]) => (ny < 0 ? top * -ny : bottom * ny) + side * (1 - Math.abs(ny));
    const white = p.fill * smooth(clamp01((d - p.fillFrom + 0.25) / 0.5));
    const dark = ny < 0 ? p.band * Math.exp(-(((d - p.bandAt) / p.bandWidth) ** 2)) : 0;
    const light = by(p.light) * Math.exp(-(((d - by(p.lightAt)) / p.lightWidth) ** 2));
    const line = by(p.line) * smooth(clamp01(d / 0.25)) * (1 - smooth(clamp01((d - p.lineTo + 0.15) / 0.3)));
    // black under white, then the light and the line: out = gain × glass + offset
    const gain = (1 - dark) * (1 - white), offset = white + light - line;
    return [grey(Math.round(255 * gain)), grey(Math.round(255 * clamp01(offset + 0.5)))];
  });
  const [shadow] = draw(PAD, 1, (d, ny, qx, y) => {
    if (d > 0) return [[0, 0, 0, 0]];
    const below = r + p.grow - Math.hypot(qx, y - p.drop);
    return [[0, 0, 0, Math.round((255 * p.shadow) / (1 + Math.exp((-1.702 * below) / p.sigma)))]];
  });
  return { inside, shadow };
}

// The fits, for the dark appearance and the light
const SURFACES = {
  slider: {
    dark: { fill: 0.102, fillFrom: 1.35, band: 0.189, bandAt: 10, bandWidth: 3.53, shadow: 0.2, grow: 0.74, drop: 8.38, sigma: 2.19,
      light: [0.163, 0.283, 0], lightAt: [1.82, 1.1, 0.39], lightWidth: 0.46, line: [0.17, 0.25, 0.403], lineTo: 1.14 },
    light: { fill: 0.102, fillFrom: 1.35, band: 0.078, bandAt: 10, bandWidth: 3.11, shadow: 0.077, grow: 0.53, drop: 8.5, sigma: 2.3,
      light: [0.163, 0.27, 0], lightAt: [1.82, 1.12, 0.37], lightWidth: 0.48, line: [0.178, 0.221, 0.376], lineTo: 1.09 },
  },
  toggle: {
    dark: { fill: 0.023, fillFrom: 1.02, band: 0, bandAt: 13, bandWidth: 2.45, shadow: 0.048, grow: 0.61, drop: 8.58, sigma: 1.99,
      light: [0.129, 0.27, 0], lightAt: [1.95, 1.17, 0.71], lightWidth: 0.41, line: [0.178, 0.204, 0.234], lineTo: 1.39 },
    light: { fill: 0.012, fillFrom: 0.94, band: 0, bandAt: 13, bandWidth: 2.45, shadow: 0.048, grow: 0.61, drop: 8.58, sigma: 1.99,
      light: [0.143, 0.292, 0], lightAt: [1.9, 1.18, 0.68], lightWidth: 0.38, line: [0.178, 0.202, 0.329], lineTo: 1.39 },
  },
};

/** A slider: held, the knob grows and turns to glass, bending the track under it. */
function slider(value, onChange) {
  const fill = h('i');
  const knob = h('div.knob');
  const el = h('div.slider', { role: 'slider', tabindex: 0, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div.track', {}, fill), knob);
  const set = (v) => {
    value = Math.min(Math.max(v, 0), 100);
    // the knob's edges reach the track's ends; the fill reaches the knob's centre
    const at = `calc(${KNOB_W / 2}px + (100% - ${KNOB_W}px) * ${value / 100})`;
    fill.style.width = at;
    knob.style.left = at;
    el.setAttribute('aria-valuenow', Math.round(value));
    onChange?.(value);
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic pointer (the demo's play()) can't be captured
    }
    const r = el.getBoundingClientRect(), span = r.width - KNOB_W;
    // pressed off the knob, it jumps there first
    if (Math.abs(e.clientX - (r.left + KNOB_W / 2 + (span * value) / 100)) > KNOB_W / 2) set(((e.clientX - r.left - KNOB_W / 2) / span) * 100);
    const base = value, x0 = e.clientX;
    el.classList.add('held');
    const move = (m) => set(base + ((m.clientX - x0) / span) * 100);
    const up = () => {
      el.classList.remove('held');
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  });
  el.addEventListener('keydown', (e) => set(value + (e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0)));
  set(value);
  return { el, knob };
}

/**
 * A switch: pressed, the knob turns into a lens on the same spot; it toggles on release, and the lens frosts, slides
 * and shrinks back to white. A release sooner than the press's spring settles (a quick click) waits for it, and the
 * lens stretches along the way it slides meanwhile.
 */
function toggle(on) {
  const SETTLE = 200;
  const knob = h('div.knob');
  const el = h('div.toggle', { role: 'switch', tabindex: 0, 'aria-checked': String(on) }, knob);
  let timer = 0, pressedAt = -1e9;
  const release = () => {
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove('held', 'stretch'), Math.max(0, SETTLE - (performance.now() - pressedAt)));
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    clearTimeout(timer);
    pressedAt = performance.now();
    el.classList.add('held');
    addEventListener('pointerup', release, { once: true });
  });
  el.addEventListener('click', () => {
    el.setAttribute('aria-checked', String(el.getAttribute('aria-checked') !== 'true'));
    if (!el.classList.contains('held')) pressedAt = performance.now();
    if (performance.now() - pressedAt < SETTLE) el.classList.add('stretch');
    // it stays glass while it slides
    el.classList.add('held');
    release();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      el.click();
    }
  });
  return { el, knob };
}

export default {
  title: 'Sliders and toggles',
  async render(stage) {
    css('controls');
    const img = photo('alps');
    const level = h('div.level');
    const hud = h('div.hud', {}, level, icon('volume', 24));
    const sliders = [['sun', 62], ['volume', 40], ['music', 80]].map(([ic, v]) => {
      const out = h('span', { text: String(v) });
      const s = slider(v, (x) => {
        out.textContent = Math.round(x);
        if (ic === 'volume') level.style.height = `${x}%`;
      });
      return { row: h('div.ctl-row', {}, icon(ic), s.el, out), knob: s.knob };
    });
    const toggles = ['Wi‑Fi', 'Bluetooth', 'AirDrop'].map((t, i) => {
      const tg = toggle(i !== 1);
      return { el: h('label.toggle-label', {}, tg.el, h('span', { text: t })), knob: tg.knob };
    });
    const panel = h('div.ctl-panel', {}, h('h3', { text: 'Control Center' }), ...sliders.map((r) => r.row), h('div.toggles', {}, ...toggles.map((t) => t.el)));
    stage.append(h('div.scene', {}, img, panel, hud));
    await ready(img);
    // The knobs: clear glass with none of the glass's own light or fill, bent as macOS's are, with macOS's surface
    // (surface(), for dark and light: controls.css picks one, as --glass-surface); inside the panel's glass, they see
    // through it.
    const k = Math.max(devicePixelRatio, 2);
    for (const [kind, size, knobs] of [['slider', [32, 27], sliders], ['toggle', [61, 39], toggles]]) {
      for (const look of ['dark', 'light']) {
        const { inside, shadow } = surface(...size, k, SURFACES[kind][look]);
        for (const { knob: el } of knobs) {
          el.style.setProperty(`--surface-${look}`, inside.map((url) => `url(${url})`).join(' '));
          el.style.setProperty(`--shadow-${look}`, `url(${shadow})`);
        }
      }
    }
    const knob = { refraction: 1, chromAberration: 0, baseBrightness: 0, edgeHighlight: 0, fresnel: 0, specular: 0, shadowOpacity: 0 };
    const sliderKnob = { ...knob, bevelMode: 2, zRadius: 4, refraction: 1.4 };
    const switchKnob = { ...knob, bevelMode: 3 };
    const handles = [glass(panel, { variant: 'regular', cornerRadius: 34 }), glass(hud, { variant: 'regular', cornerRadius: 22 }),
      ...sliders.map((s) => glass(s.knob, sliderKnob)), ...toggles.map((t) => glass(t.knob, switchKnob))];
    return () => handles.forEach((g) => g.destroy());
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
