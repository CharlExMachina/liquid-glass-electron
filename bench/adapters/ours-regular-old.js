// liquid-glass-electron's Apple variant: variant 'regular', as it was before the native comparison.
// The library as it was, built from main into test/native/.old/ (not in git):
//   git archive main src | tar -x -C /tmp/lg-old && npx esbuild /tmp/lg-old/src/index.ts --bundle --format=esm --outfile=test/native/.old/liquid-glass.js
import { glass, setEnvironment } from '../../test/native/.old/liquid-glass.js';
export default async (els) => {
  for (const el of els) glass(el, { cornerRadius: Number(el.dataset.radius), variant: 'regular' });
  await new Promise((r) => setTimeout(r, 300));
};
