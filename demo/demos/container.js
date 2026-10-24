import { container, glass } from '../../dist/liquid-glass.js';
import { css, drag, h, icon, photo, ready, sleep } from './lib.js';

// Apple's GlassEffectContainer: the shapes in it are one piece of glass. Where two come within the spacing, their
// edges flow together; drag them apart and the glass stretches and splits. One filter for all of them.
export default {
  title: 'Merging glass',
  async render(stage) {
    css('container');
    const img = photo('ponds');
    const spots = [[150, 160, 'heart'], [300, 190, 'star'], [520, 150, 'music', true], [260, 380, 'camera'], [470, 360, 'map']];
    const blobs = spots.map(([x, y, ic, wide]) => {
      const b = h(`div.blob${wide ? '.wide' : ''}`, { 'data-glass-member': '' }, icon(ic));
      Object.assign(b.style, { left: `${x}px`, top: `${y}px` });
      // drag by moving left/top: the container follows its members' boxes
      b.addEventListener('pointerdown', (e) => {
        b.setPointerCapture(e.pointerId);
        const sx = e.clientX - b.offsetLeft, sy = e.clientY - b.offsetTop;
        const move = (m) => Object.assign(b.style, { left: `${m.clientX - sx}px`, top: `${m.clientY - sy}px` });
        b.addEventListener('pointermove', move);
        b.addEventListener('pointerup', () => b.removeEventListener('pointermove', move), { once: true });
      });
      return b;
    });
    const out = h('b', { text: '28' });
    const range = h('input', { type: 'range', min: 0, max: 80, value: 28 });
    const ctl = h('div.spacing-ctl', {}, h('span', {}, 'Spacing ', out, ' px'), range);
    const root = h('div.blobs', {}, ...blobs);
    stage.append(h('div.scene', {}, img, root, ctl));
    await ready(img);
    const glassBlobs = container(root, { spacing: 28, variant: 'clear', zRadius: 30 });
    range.addEventListener('input', () => {
      out.textContent = range.value;
      glassBlobs.set({ spacing: +range.value });
    });
    const panel = glass(ctl, { variant: 'regular', cornerRadius: 22 });
    return () => {
      glassBlobs.destroy();
      panel.destroy();
    };
  },
  async play(stage) {
    const blobs = [...stage.querySelectorAll('.blob')];
    await drag(blobs[0], 90, 20, 1400);
    await sleep(300);
    await drag(blobs[0], -150, -40, 1400);
    await sleep(200);
    await drag(blobs[3], 120, -80, 1500);
    await sleep(300);
    await drag(blobs[3], -100, 90, 1200);
  },
};
