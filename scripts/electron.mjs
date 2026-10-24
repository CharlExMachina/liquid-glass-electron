// Runs Electron from this repo with the arguments given. Drops ELECTRON_RUN_AS_NODE (some shells inherit it, which
// turns Electron into plain Node) and, on Linux, asks for X11 when windows must be placed (LG_ASIDE) or captured at a
// fixed scale (--x11): under Wayland, Electron can neither place windows nor force the device scale factor.
import { spawn } from 'node:child_process';
import electron from 'electron';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const x11 = process.argv.includes('--x11');
const args = process.argv.slice(2).filter((a) => a !== '--x11');
if (process.platform === 'linux' && (x11 || env.LG_ASIDE)) args.unshift('--ozone-platform=x11');
spawn(electron, args, { stdio: 'inherit', env }).on('exit', (code) => process.exit(code ?? 0));
