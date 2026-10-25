// liquid-glass-electron at its defaults, every glass element in one glassGroup (one backdrop filter bends them all).
import { glassGroup } from '../../dist/liquid-glass.js';
export default async (els) => {
  const g = glassGroup([]);
  for (const el of els) g.add(el, { cornerRadius: Number(el.dataset.radius) });
  await g.drawn();
  return { version: (await (await fetch('../package.json')).json()).version };
};
