// Builds dist/: an ES module, a classic script (window.LiquidGlass), minified versions of both, and the TypeScript
// declarations. No runtime dependencies; esbuild and typescript are dev dependencies only.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
const common = { entryPoints: ['src/index.ts'], bundle: true, target: 'chrome110', legalComments: 'none', logLevel: 'warning' };
await Promise.all([
  build({ ...common, format: 'esm', outfile: 'dist/liquid-glass.js' }),
  build({ ...common, format: 'esm', minify: true, outfile: 'dist/liquid-glass.min.js' }),
  build({ ...common, format: 'iife', globalName: 'LiquidGlass', outfile: 'dist/liquid-glass.iife.js' }),
  build({ ...common, format: 'iife', globalName: 'LiquidGlass', minify: true, outfile: 'dist/liquid-glass.iife.min.js' }),
]);
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.types.json'], { stdio: 'inherit' });
// the declarations import each other as .js, as consumers' module resolution expects
for (const f of readdirSync('dist/types')) {
  const p = `dist/types/${f}`;
  writeFileSync(p, readFileSync(p, 'utf8').replace(/(from '\.\/[\w-]+)\.ts'/g, "$1.js'"));
}
writeFileSync('dist/liquid-glass.d.ts', "export * from './types/index.js';\n");
