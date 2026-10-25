// ours-group without colour fringing.
import { glassGroup } from '../../dist/liquid-glass.js';
export default async (els) => {
  const g = glassGroup([], { chromAberration: 0 });
  for (const el of els) g.add(el, { cornerRadius: Number(el.dataset.radius) });
  await g.drawn();
};
