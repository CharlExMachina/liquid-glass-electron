import { glass, glassButton } from '../../dist/liquid-glass.js';
import { css, h, icon, photo, ready, sleep, tap } from './lib.js';

// Buttons, straight on the photo (glass on glass only sees the glass under it, not what's behind it): Apple's .glass
// and .glassProminent styles (interactive: a press scales
// the glass up and lights it where it's pressed); shapes, including corners concentric with what they sit in; liquidglass's button mode (hover
// brightens, a press flattens the bevel and deepens the shadow) next to the press that bulges.
export default {
  title: 'Buttons',
  async render(stage) {
    css('buttons');
    const img = photo('coast');
    const b = (text, cls = '', ic) => h(`button.gbtn${cls}`, {}, ic ? icon(ic) : null, text ? h('span', { text }) : null);
    const glassBtns = [b('Share', '', 'share'), b('', '.round', 'heart'), b('Edit', '', 'pen')];
    const prominent = [b('Continue'), b('', '.round', 'plus')];
    const shapes = [b('Capsule'), b('', '.round', 'camera'), b('', '.square', 'map')];
    const box = h('div.concentric-box', {}, b('Cancel'), b('Save'));
    const lgButton = b('Button mode'), bulge = b('Bulge');
    const cells = [
      h('div.btn-cell', {}, h('h4', { text: '.glass' }), h('div.btn-row', {}, ...glassBtns), h('p.btn-note', { text: 'Regular glass, interactive: pressed, it grows and lights up under the pointer.' })),
      h('div.btn-cell', {}, h('h4', { text: '.glassProminent' }), h('div.btn-row', {}, ...prominent), h('p.btn-note', { text: 'Tinted with the accent colour, for the primary action.' })),
      h('div.btn-cell', {}, h('h4', { text: 'Shapes' }), h('div.btn-row', {}, ...shapes, box), h('p.btn-note', { text: 'Capsule, circle, rounded rectangle; corners concentric with their container.' })),
      h('div.btn-cell', {}, h('h4', { text: 'Press' }), h('div.btn-row', {}, lgButton, bulge), h('p.btn-note', { text: 'liquidglass’s button mode flattens and deepens the shadow; the other bulges.' })),
    ];
    stage.append(h('div.scene', {}, img, h('div.btn-grid', {}, ...cells)));
    await ready(img);
    const handles = [
      ...glassBtns.map((x) => glassButton(x, 'glass')),
      ...prominent.map((x) => glassButton(x, 'prominent')),
      glassButton(shapes[0], 'glass'), glassButton(shapes[1], 'glass', { shape: 'circle' }), glassButton(shapes[2], 'glass', { shape: 'rect', cornerRadius: 18 }),
      glass(box, { variant: 'regular', cornerRadius: 32, refraction: 0.4 }),
      // inside glass, more glass would only see the card's own painting: these are light and fill only (no bending)
      ...[...box.children].map((x, i) => glass(x, { refraction: 0, shape: 'concentric', edgeHighlight: 0.3, fill: i ? 'rgb(10 132 255 / 0.9)' : 'rgb(255 255 255 / 0.2)', shadowOpacity: 0 })),
      glass(lgButton, { button: true, shape: 'capsule', zRadius: 22 }),
      glass(bulge, { shape: 'capsule', zRadius: 22, press: 'bulge', pressBulge: 0.5, interactive: true }),
    ];
    return () => handles.forEach((g) => g.destroy());
  },
  async play(stage) {
    const buttons = [...stage.querySelectorAll('.gbtn')];
    for (const i of [0, 3, 1, 10, 11, 8]) {
      await tap(buttons[i], 420);
      await sleep(260);
    }
  },
};
