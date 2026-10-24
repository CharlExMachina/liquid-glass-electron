// npm run bench: builds the library, bundles the React adapter (liquid-glass-react needs React), runs bench/run.mjs.
import { build } from 'esbuild';
import { execFileSync, spawnSync } from 'node:child_process';
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
await build({ entryPoints: ['bench/adapters/lgreact.jsx'], bundle: true, format: 'esm', outfile: 'bench/adapters/lgreact.js', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning', jsx: 'automatic' });
const r = spawnSync(process.execPath, ['scripts/electron.mjs', 'bench/run.mjs', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, LG_ASIDE: process.env.LG_ASIDE ?? '1' } });
process.exit(r.status ?? 0);
