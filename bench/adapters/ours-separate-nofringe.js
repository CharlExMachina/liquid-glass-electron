// liquid-glass-electron with every glass on its own filter (group: false) and no colour fringing.
import { glass } from '../../dist/liquid-glass.js';
export default async (els) => {
  for (const el of els) glass(el, { cornerRadius: Number(el.dataset.radius), group: false, chromAberration: 0 });
  await new Promise((r) => setTimeout(r, 300));
};
