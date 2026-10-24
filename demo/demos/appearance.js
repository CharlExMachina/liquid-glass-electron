import { glass, setEnvironment } from '../../dist/liquid-glass.js';
import { css, h, icon, photo, ready, sleep, tap } from './lib.js';

// The look, as Apple's: the glass variants (regular, clear, identity); the system's Clear/Tinted setting; and
// Reduce Transparency and Increase Contrast. Each follows the OS (prefers-reduced-transparency, prefers-contrast)
// unless the app says otherwise, as here, with setEnvironment().
export default {
  title: 'Clear, tinted, accessible',
  async render(stage) {
    css('appearance');
    const toggles = [['Tinted', 'appearance'], ['Reduce transparency', 'reduceTransparency'], ['Increase contrast', 'increaseContrast']].map(([label, key]) => {
      const input = h('input.switch', { type: 'checkbox' });
      input.addEventListener('change', () => setEnvironment({ [key]: key === 'appearance' ? (input.checked ? 'tinted' : 'clear') : input.checked }));
      return h('label', {}, input, h('span', { text: label }));
    });
    const head = h('div.ap-head', {}, ...toggles);
    const cells = [['regular', 'coast'], ['clear', 'coast'], ['identity', 'coast'], ['regular', 'night'], ['clear', 'night'], ['identity', 'night']].map(([variant, pic]) => {
      const bar = h('div.ap-bar', {}, icon('search'), h('span', { text: `.${variant}` }), icon('more'));
      return { cell: h('div.ap-cell', {}, photo(pic), h('h5', { text: pic === 'night' ? 'over a dark photo' : 'over a bright photo' }), bar), bar, variant };
    });
    stage.append(h('div.scene', {}, h('div.fill'), h('div.ap-grid', {}, head, ...cells.map((c) => c.cell))));
    await Promise.all([...stage.querySelectorAll('img')].map(ready));
    const handles = [glass(head, { variant: 'regular', shape: 'capsule', zRadius: 16 }), ...cells.map((c) => glass(c.bar, { variant: c.variant, shape: 'capsule', zRadius: 24 }))];
    return () => {
      setEnvironment({ appearance: undefined, reduceTransparency: undefined, increaseContrast: undefined });
      handles.forEach((g) => g.destroy());
    };
  },
  async play(stage) {
    const inputs = [...stage.querySelectorAll('.ap-head input')];
    for (const i of [0, 0, 1, 1, 2, 2]) {
      inputs[i].click();
      await sleep(1100);
    }
  },
};
