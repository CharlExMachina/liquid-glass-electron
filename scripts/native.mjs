// Builds the native reference (native/*.swift and native/demos/*.swift: the gallery in SwiftUI, with Apple's own
// Liquid Glass) with the command line tools' swiftc, and runs it unless --build-only. Arguments go on to the app
// (--page=<name>, --theme=light|dark, --size=WxH). macOS 26 or later; `xcode-select --install` gives swiftc.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const build = `${root}native/.build`, bin = `${build}/playground`;
if (process.platform !== 'darwin') {
  console.error('The native reference is SwiftUI: it needs macOS 26 or later.');
  process.exit(1);
}
const sources = ['native', 'native/demos'].flatMap((dir) => readdirSync(`${root}${dir}`).filter((f) => f.endsWith('.swift')).map((f) => `${root}${dir}/${f}`));
mkdirSync(build, { recursive: true });
if (!existsSync(bin) || sources.some((s) => statSync(bin).mtimeMs < statSync(s).mtimeMs)) {
  execFileSync('swiftc', ['-O', '-parse-as-library', ...sources, '-o', bin], { stdio: 'inherit' });
}
// AVFoundation doesn't play WebM: the video demo's clip, as H.264, made once (with ffmpeg, if it's there)
const video = `${build}/orbit.mp4`;
if (!existsSync(video)) {
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-i', `${root}demo/assets/orbit.webm`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-an', video], { stdio: 'inherit' });
  } catch {
    console.warn('No ffmpeg: the native "Over video" page will have no video (brew install ffmpeg).');
  }
}
if (!process.argv.includes('--build-only')) spawn(bin, [`--assets=${root}demo/assets`, `--build=${build}`, ...process.argv.slice(2)], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
