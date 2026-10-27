// Builds the native reference (native/Glass.swift: SwiftUI's own Liquid Glass) with the command line tools' swiftc,
// and runs its playground unless --build-only. macOS 26 or later; `xcode-select --install` gives swiftc.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}native/Glass.swift`, bin = `${root}native/.build/playground`;
if (process.platform !== 'darwin') {
  console.error('The native reference is SwiftUI: it needs macOS 26 or later.');
  process.exit(1);
}
if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(src).mtimeMs) {
  mkdirSync(`${root}native/.build`, { recursive: true });
  execFileSync('swiftc', ['-O', src, '-o', bin], { stdio: 'inherit' });
}
if (!process.argv.includes('--build-only')) spawn(bin, [`--assets=${root}demo/assets`, ...process.argv.slice(2)], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
