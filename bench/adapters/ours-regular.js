// liquid-glass-electron's Apple variant: variant 'regular'.
import { glass, setEnvironment } from '../../dist/liquid-glass.js';
export default async (els) => {
  for (const el of els) glass(el, { cornerRadius: Number(el.dataset.radius), variant: 'regular' });
  await new Promise((r) => setTimeout(r, 300));
};
