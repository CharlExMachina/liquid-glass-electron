// The benchmark: every library in every scene, measured by the CPU time of the renderer and of the GPU process (as
// Electron's app.getAppMetrics() reports it), as a % of one core, over `--seconds` after a warm-up. Runs are
// interleaved (every library once, then again) and the median is reported.
//
//   npm run bench                                   everything
//   npm run bench -- --libs=ours,liquidglass --scenes=move --reps=5 --seconds=10
//   ... --drawn                                     also the frames drawn per second (renderer / viz), after each run
//
// Windows go on the second display, never focused (WebGL libraries only render in a visible window).
import { app, BrowserWindow, contentTracing, screen } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus, release } from 'node:os';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const LIBS = arg('libs', 'none,css,ours,ours-nofringe,liquidglass,liquidgl,lgreact,applewebgl,simple,avenra').split(',');
const SCENES = arg('scenes', 'idle,content,move,scroll,many10,many30').split(',');
const REPS = Number(arg('reps', 3)), SECS = Number(arg('seconds', 8)), WARM = Number(arg('warmup', 2));
const DRAWN = process.argv.includes('--drawn');
const out = arg('out', fileURLToPath(new URL(`./results/${new Date().toISOString().slice(0, 10)}`, import.meta.url)));

const sceneQuery = (s) => (s.startsWith('many') ? { scene: 'many', n: s.slice(4) } : { scene: s, n: '4' });
const cpu = () => Object.fromEntries(app.getAppMetrics().filter((m) => m.type === 'GPU' || m.type === 'Tab').map((m) => [m.type, m.cpu.cumulativeCPUUsage]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const primary = screen.getPrimaryDisplay();
  const display = screen.getAllDisplays().find((d) => d.id !== primary.id) ?? primary;
  mkdirSync(`${out}/shots`, { recursive: true });
  const results = {};
  for (let rep = 0; rep < REPS; rep++) {
    for (const scene of SCENES) {
      for (const lib of rep % 2 ? [...LIBS].reverse() : LIBS) {
        const key = `${scene}|${lib}`;
        const win = new BrowserWindow({ width: 1180, height: 800, useContentSize: true, show: false, focusable: false, x: display.bounds.x + 40, y: display.bounds.y + 40 });
        const errors = [];
        win.webContents.on('console-message', (e) => { if (e.level === 'error' && !/construct 'URL'/.test(e.message)) errors.push(e.message.slice(0, 200)); });
        await win.loadFile(fileURLToPath(new URL('./page.html', import.meta.url)), { query: { lib, ...sceneQuery(scene) } }).catch(() => {});
        win.showInactive();
        let ready = false;
        for (let i = 0; i < 300 && !(ready = await win.webContents.executeJavaScript('!!window.benchReady').catch(() => false)); i++) await sleep(50);
        await sleep(WARM * 1000);
        const a = cpu(), t0 = Date.now();
        await sleep(SECS * 1000);
        const b = cpu(), s = (Date.now() - t0) / 1000;
        // --drawn: then, for 2 s, the frames the renderer's compositor drew and the frames viz drew (traced after the
        // CPU window, so tracing doesn't count). Less CPU can mean fewer frames.
        let frames = null;
        if (DRAWN) {
          await contentTracing.startRecording({ included_categories: ['viz', 'cc'], excluded_categories: ['*'] });
          const t1 = Date.now();
          await sleep(2000);
          const ev = JSON.parse(readFileSync(await contentTracing.stopRecording(), 'utf8')).traceEvents ?? [];
          const per = (name) => ev.filter((e) => e.name === name && e.ph !== 'E').length / ((Date.now() - t1) / 1000);
          frames = { renderer: per('ProxyImpl::ScheduledActionDraw'), viz: per('DirectRenderer::DrawFrame') };
        }
        if (rep === 0) writeFileSync(`${out}/shots/${scene}-${lib}.png`, (await win.webContents.capturePage()).toPNG());
        win.destroy();
        await sleep(600);
        (results[key] ??= { scene, lib, renderer: [], gpu: [], drawn: [], vizDrawn: [], errors: [] });
        if (frames) { results[key].drawn.push(frames.renderer); results[key].vizDrawn.push(frames.viz); }
        if (!ready || a.Tab === undefined || b.Tab === undefined) results[key].errors.push(ready ? 'no renderer metrics' : 'never ready');
        else {
          results[key].renderer.push(((b.Tab - a.Tab) / s) * 100);
          results[key].gpu.push(((b.GPU - a.GPU) / s) * 100);
        }
        results[key].errors.push(...errors);
        console.log(`${scene.padEnd(8)} ${lib.padEnd(14)} renderer ${results[key].renderer.at(-1)?.toFixed(1) ?? '–'}%  gpu ${results[key].gpu.at(-1)?.toFixed(1) ?? '–'}%${frames ? `  drawn ${frames.renderer.toFixed(0)}/s (viz ${frames.viz.toFixed(0)}/s)` : ''}${errors.length ? `  (${errors.length} errors)` : ''}`);
      }
    }
  }
  const median = (v) => (v.length ? [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)] : null);
  const rows = Object.values(results).map((r) => ({ ...r, rendererMedian: median(r.renderer), gpuMedian: median(r.gpu), drawnMedian: median(r.drawn), vizDrawnMedian: median(r.vizDrawn) }));
  const env = { electron: process.versions.electron, chrome: process.versions.chrome, os: `${process.platform} ${release()}`, cpu: cpus()[0]?.model, gpu: (await app.getGPUInfo('basic')).gpuDevice?.find((g) => g.active), reps: REPS, seconds: SECS, date: new Date().toISOString() };
  writeFileSync(`${out}/results.json`, JSON.stringify({ env, rows }, null, 2));
  // a table per scene: renderer / GPU process
  const fmt = (v) => (v == null ? '–' : v.toFixed(1));
  let md = `| scene | ${LIBS.join(' | ')} |\n|---|${LIBS.map(() => '---').join('|')}|\n`;
  for (const scene of SCENES) md += `| ${scene} | ${LIBS.map((l) => { const r = rows.find((x) => x.scene === scene && x.lib === l); return r ? `${fmt(r.rendererMedian)} / ${fmt(r.gpuMedian)}${r.drawnMedian != null ? ` @ ${r.drawnMedian.toFixed(0)}/${r.vizDrawnMedian.toFixed(0)} fps` : ''}` : '–'; }).join(' | ')} |\n`;
  md += `\nEach cell: renderer / GPU process, % of one core, median of ${REPS}${DRAWN ? '; @ frames drawn per second by the renderer / viz' : ''}.\n`;
  writeFileSync(`${out}/results.md`, md);
  console.log(`\n${md}\n(renderer / GPU process, % of one core, median of ${REPS})  → ${out}`);
  app.exit(0);
});
