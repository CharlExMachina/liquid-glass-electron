// Runs Electron from this repo with the arguments given. Drops ELECTRON_RUN_AS_NODE (some shells inherit it, which
// turns Electron into plain Node) and, on Linux under Wayland, asks for X11 so windows can be placed.
import { spawn } from 'node:child_process';
import electron from 'electron';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.platform === 'linux' && env.LG_ASIDE ? ['--ozone-platform=x11', ...process.argv.slice(2)] : process.argv.slice(2);
spawn(electron, args, { stdio: 'inherit', env }).on('exit', (code) => process.exit(code ?? 0));
