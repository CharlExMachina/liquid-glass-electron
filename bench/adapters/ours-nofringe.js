// liquid-glass-electron without colour fringing (one bending pass instead of three).
import { glass } from '../../dist/liquid-glass.js';
export default async (els) => {
  for (const el of els) glass(el, { cornerRadius: Number(el.dataset.radius), chromAberration: 0 });
  await new Promise((r) => setTimeout(r, 300));
};
