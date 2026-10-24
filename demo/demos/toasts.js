import { glass, glassButton, materialize } from '../../dist/liquid-glass.js';
import { css, h, icon, photo, ready, sleep, tap } from './lib.js';

// Notifications that materialize: their glass grows in as its bending strengthens, and fades away when dismissed
// (Apple's .materialize transition).
const MESSAGES = [['message', 'Messages', 'Landing at 6:40, see you at the gate'], ['mail', 'Mail', 'Your boarding pass is ready'], ['bell', 'Reminders', 'Pack the camera'], ['music', 'Music', 'Now playing: Clair de Lune']];
export default {
  title: 'Toasts',
  async render(stage) {
    css('toasts');
    const img = photo('night');
    const stack = h('div.toast-stack', { role: 'status' });
    let n = 0;
    const handles = new Map();
    const spawn = async () => {
      const [ic, title, text] = MESSAGES[n++ % MESSAGES.length];
      const t = h('div.toast', {}, h('div.ico', {}, icon(ic)), h('div', {}, h('b', { text: title }), h('span', { text })));
      stack.prepend(t);
      handles.set(t, glass(t, { variant: 'regular', cornerRadius: 24 }));
      await materialize(t, 'in');
      setTimeout(async () => {
        await materialize(t, 'out');
        handles.get(t)?.destroy();
        handles.delete(t);
        t.remove();
      }, 3200);
    };
    const button = h('button.toast-btn', { text: 'Notify me', on: { click: spawn } });
    stage.append(h('div.scene', {}, img, stack, button));
    await ready(img);
    const b = glassButton(button, 'prominent');
    return () => {
      b.destroy();
      for (const g of handles.values()) g.destroy();
    };
  },
  async play(stage) {
    const button = stage.querySelector('.toast-btn');
    for (let i = 0; i < 3; i++) {
      await tap(button, 140);
      await sleep(700);
    }
    await sleep(3400);
  },
};
