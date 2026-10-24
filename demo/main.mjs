// The gallery: every demo, and the playground. npm run demo (or: npm run demo -- --page=playground).
//
// Sandboxed, context-isolated, no preload, and a strict Content-Security-Policy in the page: liquid-glass-electron
// works without loosening any of it.
//
// For screenshots and recordings (scripts/media.mjs makes the README's, with a faster recorder of its own):
//   --page=<name>         open that demo
//   --shot=<file.png>     capture the window once the page is ready, then quit
//   --record=<dir> --seconds=<n>   write every frame for n seconds as PNGs
//   --size=WxH            window content size (default 1180x760)
//   --theme=light|dark    force a theme
// LG_ASIDE=1 puts the window on the second display without focus (for test runs on a machine in use).
import { app, BrowserWindow, nativeTheme, screen } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const [W, H] = arg('size', '1180x760').split('x').map(Number);
const theme = arg('theme');
if (theme) nativeTheme.themeSource = theme;
// Hardware video decode crashes Chromium's GPU process on some Linux drivers (VA-API on Mesa here); the demo's video
// is small enough to decode in software.
if (process.platform === 'linux') app.commandLine.appendSwitch('disable-accelerated-video-decode');

app.whenReady().then(async () => {
  const aside = !!process.env.LG_ASIDE;
  let place = {};
  if (aside) {
    const primary = screen.getPrimaryDisplay();
    const d = screen.getAllDisplays().find((x) => x.id !== primary.id) ?? primary;
    place = { x: d.bounds.x + 60, y: d.bounds.y + 60, focusable: false };
  }
  const win = new BrowserWindow({
    width: W, height: H, useContentSize: true, show: false, backgroundColor: '#111',
    title: 'liquid-glass-electron', ...place,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning' || process.env.LG_VERBOSE) console.log(`[page ${e.level}]`, e.message);
  });
  const page = arg('page', 'gallery');
  await win.loadFile(fileURLToPath(new URL('./index.html', import.meta.url)), { hash: page });
  if (aside) {
    win.showInactive();
    win.setPosition(place.x, place.y);
  } else win.show();

  const shot = arg('shot'), record = arg('record');
  if (!shot && !record) return;
  for (let i = 0; i < 200 && !(await win.webContents.executeJavaScript('!!window.demoReady')); i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, Number(arg('wait', 800))));
  if (shot) {
    writeFileSync(shot, (await win.webContents.capturePage()).toPNG());
    app.quit();
    return;
  }
  // every frame the compositor draws, for `seconds`
  mkdirSync(record, { recursive: true });
  let n = 0;
  const t0 = Date.now(), seconds = Number(arg('seconds', 6));
  const stamps = [];
  win.webContents.beginFrameSubscription(false, (image) => {
    const t = Date.now() - t0;
    if (t > seconds * 1000) return;
    stamps.push(t);
    writeFileSync(`${record}/f${String(n++).padStart(5, '0')}.png`, image.toPNG());
  });
  await win.webContents.executeJavaScript('window.demoPlay?.()');
  await new Promise((r) => setTimeout(r, seconds * 1000 + 300));
  win.webContents.endFrameSubscription();
  writeFileSync(`${record}/times.json`, JSON.stringify(stamps));
  app.quit();
});
app.on('window-all-closed', () => app.quit());
