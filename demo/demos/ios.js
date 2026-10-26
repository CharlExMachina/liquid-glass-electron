import { glass } from '../../dist/liquid-glass.js';
import { css, drag, h, icon, photo, ready, sleep, tap } from './lib.js';

// iOS 26's controls, after a screen recording: knobs and pills that are solid at rest and turn to clear glass only
// while they're touched. The glass is a primitive here: each knob's own white is a layer that fades out while its
// --glass-strength goes 0 → 1 (a CSS transition the glass follows frame by frame), and it grows with `scale`. On
// release the frost comes up first, then the white, so the in-between frames are frosted, as Apple's are.

const SVG = 'http://www.w3.org/2000/svg';
const KNOB_W = 77; // the resting knob's width (see ios.css)

/** The up-and-down chevrons of a pop-up button. */
function chevrons() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon', 'ios-chevrons');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M8 9.5l4-4 4 4M8 14.5l4 4 4-4');
  svg.append(path);
  return svg;
}

/** A slider: held, the knob grows and turns to glass, bending the track under it. */
function slider(value) {
  const fill = h('div.ios-fill');
  const knob = h('div.ios-knob');
  const el = h('div.ios-slider', { role: 'slider', tabindex: 0, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('div.ios-track', {}, fill), knob);
  const set = (v) => {
    value = Math.min(Math.max(v, 0), 100);
    const at = `calc(${KNOB_W / 2}px + (100% - ${KNOB_W}px) * ${value / 100})`;
    fill.style.width = at;
    knob.style.left = at;
    el.setAttribute('aria-valuenow', Math.round(value));
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
 * The switch lens's surface, drawn once (it doesn't bend), as measured from iOS's switch over a white and a dark
 * backdrop: inside, a dark band that follows the outline (3.3 px in at the sides, 9.8 at the top, none where the edge
 * faces down) and white along the top and bottom rim; outside, a hairline of dark and the shadow (the shape grown
 * 2.4 px, 8.1 px down, blurred σ 1.8 px: seen only outside the glass). Light mode has the same, the band, hairline and
 * shadow fainter. A data URL for the knob's box and 16 px around it, at `k` pixels per px.
 */
function surface(w, h, k, light) {
  const PAD = 16, W = Math.round((w + 2 * PAD) * k), H = Math.round((h + 2 * PAD) * k), r = h / 2, half = w / 2 - r;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H), px = img.data;
  const smooth = (t) => t * t * (3 - 2 * t), clamp01 = (t) => Math.min(Math.max(t, 0), 1);
  const [band, sides, ends, shadow] = light ? [0.45, 0.32, 0.05, 0.074] : [1, 0.23, 0.57, 0.174];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / k - PAD - w / 2, y = (j + 0.5) / k - PAD - h / 2;
      const qx = Math.max(Math.abs(x) - half, 0), len = Math.hypot(qx, y) || 1e-9, d = r - len;
      const ny = y / len, up = Math.max(0, -ny);
      let dark = 0, white = 0;
      if (d > 0) {
        const t = clamp01((ny + 0.056) / 1.159), c = 3.344 + 6.478 * up, sg = 5.46 - 0.631 * up;
        dark = band * (0.202 * (1 - smooth(t)) * Math.exp(-(((d - c) / sg) ** 2)) + 0.079 * up * Math.exp(-d / 3.878));
      } else {
        // the hairline, flat from 0.12 to 0.95 px out (darkest at the sides), and the shadow
        const line = (ends + sides * (1 - ny * ny)) * smooth(clamp01((d + 1.1) / 0.15)) * (1 - smooth(clamp01((d + 0.12) / 0.12)));
        const below = r + 2.42 - Math.hypot(qx, y - 8.14);
        dark = 1 - (1 - line) * (1 - shadow / (1 + Math.exp((-1.702 * below) / 1.76)));
      }
      if (d > -0.33) white = ny * ny * (0.5 * Math.exp(-Math.max(d, 0) / 0.4) + 0.06 * Math.exp(-Math.max(d, 0) / 2.2)) * clamp01((d + 0.33) / 0.12);
      // black under white: the alpha and colour of the one layer they make
      const a = 1 - (1 - dark) * (1 - white), o = (j * W + i) * 4;
      px[o] = px[o + 1] = px[o + 2] = a > 0 ? Math.round((255 * white) / a) : 0;
      px[o + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/**
 * A switch, as iOS 26's: pressed, the knob turns into a lens on the same spot; it toggles on release, and the lens
 * frosts, slides and shrinks back to white. A release sooner than the press's spring settles (a quick click) waits for
 * it, and the lens stretches along the way it slides meanwhile.
 */
function toggle(on) {
  const SETTLE = 200;
  const knob = h('div.ios-knob');
  const el = h('div.ios-switch', { role: 'switch', tabindex: 0, 'aria-checked': String(on) }, knob);
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

/** A segmented control: the solid pill gives way to a glass lens that slides to the new segment, then solidifies. */
function segmented(labels, index) {
  const pill = h('div.ios-seg-pill');
  const lens = h('div.ios-seg-lens');
  const buttons = labels.map((t) => h('button', { text: t, role: 'radio' }));
  const el = h('div.ios-seg', { role: 'radiogroup' }, pill, lens, ...buttons);
  let timer = 0;
  const select = (i) => {
    index = i;
    buttons.forEach((b, k) => b.setAttribute('aria-checked', String(k === i)));
    for (const x of [pill, lens]) x.style.setProperty('--i', String(i));
  };
  buttons.forEach((b, i) =>
    b.addEventListener('click', () => {
      if (i === index) return;
      el.classList.add('lensing');
      select(i);
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('lensing'), 440);
    }),
  );
  select(index);
  return { el, lens };
}

export default {
  title: 'iOS controls',
  async render(stage) {
    css('ios');
    // ---- the controls, on dark cards over a grid, as in the recording
    const size = slider(38);
    const enabled = toggle(true);
    const mode = segmented(['A', 'B', 'C'], 0);

    const value = h('span', { text: 'Option 1' });
    const field = h('button.ios-field-value', { 'aria-haspopup': 'menu' }, value, chevrons());
    const options = ['Option 1', 'Option 2', 'Option 3'];
    const items = options.map((t) => h('button.ios-item', { role: 'menuitemradio', 'aria-checked': String(t === 'Option 1') }, icon('check', 16), h('span', { text: t })));
    const menu = h('div.ios-menu', { role: 'menu' }, ...items);

    const img = photo('coast');
    const tapMe = h('button.ios-btn.ios-prominent', { text: 'Tap Me' });
    const plain = h('button.ios-btn', { text: 'Button' });

    const left = h('div.ios-col.ios-left', {},
      h('div.ios-card', {}, h('div.ios-label', { text: 'Size' }), h('div.ios-slider-row', {}, h('span', { text: 'Small' }), size.el, h('span', { text: 'Large' }))),
      h('div.ios-card.ios-row', {}, h('span', { text: 'Enabled' }), enabled.el),
      h('div.ios-card', {}, h('div.ios-label', { text: 'Mode' }), mode.el),
      h('p.ios-note', { text: 'Solid at rest, glass while touched. Each knob is glass whose --glass-strength is 0 until it’s pressed: a CSS transition takes it to 1 while the knob’s own white fades out and it grows; on release the frost comes back first, then the white. The slider’s knob is Apple’s lens (bevelMode 2): the rim magnifies toward the middle, so the track flares where it enters. The switch’s is Apple’s switch lens (bevelMode 3), measured from iOS’s: it shrinks what’s behind it.' }),
    );
    const right = h('div.ios-col.ios-right', {},
      h('div.ios-card.ios-field', {}, h('div.ios-label', { text: 'Options' }), field),
      h('div.ios-card.ios-photo', {}, img, h('div.ios-buttons', {}, tapMe, plain)),
      menu,
    );
    stage.append(h('div.scene.ios-scene', {}, h('div.ios-area', {}, h('h2.ios-title', { text: 'Liquid Glass controls' }), left, right)));
    await ready(img);

    // ---- the glass. Strength and frost come from CSS (ios.css) so transitions drive them; the rest is set here.
    // The slider's knob is Apple's lens (bevelMode 2): the rim magnifies toward the middle, so the track flares out where it
    // enters the knob, and the middle is flat. No brightening (baseBrightness 0: liquidglass's 6% would turn a light page white) and none
    // of the glass's own light: the knob's rim and shading are CSS (.ios-knob::after), as measured from an iPhone.
    const knob = { bevelMode: 2, zRadius: 24, refraction: 1.15, chromAberration: 0, baseBrightness: 0, edgeHighlight: 0, fresnel: 0, specular: 0, fill: 'rgb(255 255 255 / 0.05)', shadowOpacity: 0.25, shadowSpread: 8, shadowOffsetY: 3 };
    // The switch's knob is Apple's switch lens (bevelMode 3), with its 10% white fill; its surface and shadow are an
    // image (surface()), and it's saturated in CSS (.ios-switch.held .ios-knob)
    enabled.knob.style.setProperty('--ios-surface', `url(${surface(58, 37.5, Math.max(devicePixelRatio, 2), false)})`);
    enabled.knob.style.setProperty('--ios-surface-light', `url(${surface(58, 37.5, Math.max(devicePixelRatio, 2), true)})`);
    const handles = [
      glass(size.knob, knob),
      glass(enabled.knob, { bevelMode: 3, refraction: 1, chromAberration: 0, baseBrightness: 0, edgeHighlight: 0, fresnel: 0, specular: 0, fill: 'rgb(255 255 255 / 0.102)', shadowOpacity: 0 }),
      glass(mode.lens, { shape: 'capsule', zRadius: 12, refraction: 0.6, chromAberration: 0, edgeHighlight: 0.2, fresnel: 0.6, shadowOpacity: 0.45, shadowSpread: 8, shadowOffsetY: 2 }),
      glass(menu, { variant: 'regular', cornerRadius: 26, blurAmount: 1.6, saturation: 0.6, refraction: 0.55, zRadius: 22, shadowOpacity: 0.5, shadowSpread: 18, shadowOffsetY: 6 }),
    ];
    const buttonGlass = { shape: 'capsule', zRadius: 12, refraction: 0.8, chromAberration: 0, press: 'bulge', pressBulge: 0.5, shadowOpacity: 0.35, shadowSpread: 8 };
    const tapGlass = glass(tapMe, { ...buttonGlass, blurAmount: 0.12 });
    const plainGlass = glass(plain, { ...buttonGlass, blurAmount: 0.3, saturation: 0.5, fill: 'rgb(255 255 255 / 0.1)' });
    handles.push(tapGlass, plainGlass);

    // ---- buttons: a press springs the capsule up (CSS scale) and brightens the glass (animate(), every frame).
    const offs = [];
    for (const [btn, g] of [[tapMe, tapGlass], [plain, plainGlass]]) {
      const down = (e) => {
        if (e.button !== 0) return;
        btn.toggleAttribute('data-pressed', true);
        g.animate({ brightness: 0.18 }, { duration: 160, easing: 'ease-out' });
        addEventListener('pointerup', () => {
          btn.toggleAttribute('data-pressed', false);
          g.animate({ brightness: 0 }, { duration: 420, easing: 'ease-in-out' });
        }, { once: true });
      };
      btn.addEventListener('pointerdown', down);
      offs.push(() => btn.removeEventListener('pointerdown', down));
    }

    // ---- the pop-up menu: a blob of glass grows out of the field into the menu, and shrinks back into it. The menu's
    // own glass does it: scaled from a small blob with a spring (the lens is in the element's space, so it follows
    // the transform), its strength tweened with animate(), its content faded in after it.
    const menuGlass = handles[3];
    const BLOB = { scale: '0.38 0.17', translate: '0 -4px' }, FULL = { scale: '1 1', translate: '0 0' };
    const SPRING = getComputedStyle(stage.querySelector('.ios-scene')).getPropertyValue('--ios-spring').trim();
    let open = false, busy = false;
    const settle = (anims) => Promise.all(anims.map((a) => a.finished)).then(() => anims.forEach((a) => a.cancel()));
    const show = async () => {
      if (open || busy) return;
      busy = true;
      menuGlass.set({ strength: 0.45 });
      menu.style.visibility = 'visible';
      const anims = [
        menu.animate([BLOB, FULL], { duration: 480, easing: SPRING }),
        menu.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }),
        value.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(5px)' }], { duration: 180, easing: 'ease-out', fill: 'forwards' }),
        ...items.map((it, i) => it.animate([{ opacity: 0, translate: '0 -6px' }, { opacity: 1, translate: '0 0' }], { duration: 240, delay: 150 + i * 35, easing: 'ease-out', fill: 'backwards' })),
      ];
      await Promise.all([menuGlass.animate({ strength: 1 }, { duration: 300, easing: 'ease-out' }), ...anims.slice(0, 2).map((a) => a.finished), ...anims.slice(3).map((a) => a.finished)]);
      anims.forEach((a, i) => i !== 2 && a.cancel());
      open = true;
      busy = false;
    };
    const hide = async (choice) => {
      if (!open || busy) return;
      busy = true;
      if (choice) {
        value.textContent = choice;
        items.forEach((it) => it.setAttribute('aria-checked', String(it.textContent === choice)));
      }
      const fadeItems = items.map((it) => it.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-in', fill: 'forwards' }));
      const anims = [
        menu.animate([FULL, BLOB], { duration: 360, easing: 'cubic-bezier(0.45, 0, 0.7, 0.2)', fill: 'forwards' }),
        menu.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, delay: 230, easing: 'ease-in', fill: 'forwards' }),
      ];
      // the field's value comes back out of the blob as it lands
      value.getAnimations().forEach((a) => a.cancel());
      const back = value.animate([{ opacity: 0, filter: 'blur(5px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 220, delay: 220, easing: 'ease-out', fill: 'backwards' });
      await Promise.all([menuGlass.animate({ strength: 0 }, { duration: 360, easing: 'ease-in' }), ...anims.map((a) => a.finished)]);
      menu.style.visibility = 'hidden';
      [...fadeItems, ...anims].forEach((a) => a.cancel());
      await settle([back]);
      open = false;
      busy = false;
    };
    field.addEventListener('click', show);
    items.forEach((it, i) => it.addEventListener('click', () => hide(options[i])));
    const outside = (e) => {
      if (open && !menu.contains(e.target)) hide(null);
    };
    stage.addEventListener('pointerdown', outside);
    offs.push(() => stage.removeEventListener('pointerdown', outside));

    return () => {
      offs.forEach((f) => f());
      handles.forEach((g) => g.destroy());
    };
  },

  async play(stage) {
    const $ = (s) => stage.querySelector(s);
    const slide = $('.ios-slider');
    await sleep(200);
    // the slider: held, dragged right, released; then a short drag back
    await drag(slide.querySelector('.ios-knob'), 150, 0, 1100, slide);
    await sleep(650);
    await drag(slide.querySelector('.ios-knob'), -90, 0, 800, slide);
    await sleep(700);
    // the switch, off and on again
    const sw = $('.ios-switch');
    await tap(sw, 200);
    await sleep(800);
    await tap(sw, 200);
    await sleep(800);
    // the segments: B, C, A
    const segs = [...stage.querySelectorAll('.ios-seg button')];
    for (const i of [1, 2, 0]) {
      await tap(segs[i], 140);
      await sleep(750);
    }
    // the menu: open, pick Option 2 (it closes)
    await tap($('.ios-field-value'), 120);
    await sleep(1100);
    await tap(stage.querySelectorAll('.ios-item')[1], 120);
    await sleep(900);
    // the buttons
    await tap($('.ios-prominent'), 320);
    await sleep(600);
    await tap(stage.querySelectorAll('.ios-btn')[1], 320);
    await sleep(600);
  },
};
