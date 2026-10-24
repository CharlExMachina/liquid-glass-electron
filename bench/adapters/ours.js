// liquid-glass-electron at its defaults (liquidglass's, colour fringing on).
import { glass } from '../../dist/liquid-glass.js';
export default async (els) => {
  for (const el of els) glass(el, { cornerRadius: Number(el.dataset.radius) });
  await new Promise((r) => setTimeout(r, 300));
  return { version: (await (await fetch('../package.json')).json()).version };
};
