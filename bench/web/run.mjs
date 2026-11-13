// bench:web: the glass over a named backdrop in the browsers on this Mac: frames per second (the page's own count)
// and the CPU time of every process of the browser, in % of one core, per scene of page.js.
//
//   pnpm bench:web                          Chrome, Safari and Firefox, every mode each has
//   pnpm bench:web safari,firefox           these browsers
//   pnpm bench:web chrome shader,none       these modes (page.js: glass, shader, blur, none)
//   pnpm bench:web safari glass idle,move   these scenes
//
// Each browser is opened in a window of its own, in front (a window behind others isn't drawn), with a profile of its
// own where the browser has one; Safari is quit afterwards only if this started it. Results: bench/web/results/.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const [browsersArg, modesArg, scenesArg] = process.argv.slice(2);
const browsers = (browsersArg ?? 'chrome,safari,firefox').split(',');
const SCENES = (scenesArg ?? 'idle,content,move,scroll,n10,n30,video').split(',');
// Chromium bends with its compositor (glass) or, to compare, the shader; the others with the shader, or blur without a source
const MODES = { chrome: ['none', 'glass', 'shader'], safari: ['none', 'blur', 'glass'], firefox: ['none', 'blur', 'glass'] };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webm': 'video/webm' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'inherit' });

/** CPU seconds used so far by a process and its descendants, or by every process whose command matches. */
function cpu(sel) {
  const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,time=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)).filter(Boolean)
    .map(([, pid, ppid, t, cmd]) => ({ pid: +pid, ppid: +ppid, cmd, s: t.split(':').reduce((a, v) => a * 60 + parseFloat(v), 0) }));
  let picked;
  if (sel.match) picked = rows.filter((r) => sel.match.test(r.cmd));
  else {
    const ids = new Set([sel.pid]);
    for (let grew = true; grew;) {
      grew = false;
      for (const r of rows) if (ids.has(r.ppid) && !ids.has(r.pid)) { ids.add(r.pid); grew = true; }
    }
    picked = rows.filter((r) => ids.has(r.pid));
  }
  return picked.reduce((a, r) => a + r.s, 0);
}

let current = null;
const results = [];
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const m = JSON.parse(body || '{}');
      if (current && url.pathname === '/mark') {
        if (m.phase === 'start') current.start = { t: Date.now(), cpu: cpu(current.sel) };
        else {
          const wall = (Date.now() - current.start.t) / 1000;
          const row = { ...m, cpu: +(((cpu(current.sel) - current.start.cpu) / wall) * 100).toFixed(1) };
          delete row.phase;
          results.push(row);
          console.log(`${m.browser.padEnd(8)} ${m.mode.padEnd(7)} ${m.scene.padEnd(8)} cpu ${String(row.cpu).padStart(6)}%  ${m.fps ? `${m.fps} fps, p95 ${m.p95} ms` : 'no frames asked for'}${m.mode === 'glass' || m.mode === 'shader' ? `  (${m.shader ? 'shader' : 'compositor'})` : ''}`);
        }
      }
      if (current && url.pathname === '/done') current.done();
      res.end('ok');
    });
    return;
  }
  const file = join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.statusCode = 404;
    return res.end();
  }
  const data = readFileSync(file);
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  // a video is asked for in ranges (Safari plays nothing otherwise)
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  if (range) {
    const from = +range[1], to = range[2] ? +range[2] : data.length - 1;
    res.statusCode = 206;
    res.setHeader('content-range', `bytes ${from}-${to}/${data.length}`);
    res.setHeader('accept-ranges', 'bytes');
    return res.end(data.subarray(from, to + 1));
  }
  res.end(data);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/bench/web/page.html`;

const LAUNCH = {
  chrome(url) {
    const dir = mkdtempSync(join(tmpdir(), 'lg-bench-chrome-'));
    const p = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [`--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--window-size=1300,1000', '--window-position=0,0', url], { stdio: 'ignore' });
    return { sel: { pid: p.pid }, close: () => { p.kill(); setTimeout(() => rmSync(dir, { recursive: true, force: true }), 1500); } };
  },
  firefox(url) {
    // through LaunchServices: started as a child of this process, Firefox finds no profile
    const dir = mkdtempSync(join(ROOT, 'bench/web/.firefox-'));
    writeFileSync(join(dir, 'user.js'), ['browser.shell.checkDefaultBrowser', 'browser.aboutwelcome.enabled', 'app.update.auto', 'app.update.enabled'].map((k) => `user_pref("${k}", false);`).join('\n')
      + '\nuser_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);\nuser_pref("termsofuse.bypassNotification", true);\nuser_pref("app.update.disabledForTesting", true);\n');
    execFileSync('open', ['-na', 'Firefox', '--args', '-profile', dir, '-no-remote', '-width', '1300', '-height', '1000', url]);
    return { sel: { match: new RegExp(dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }, close: () => { try { execFileSync('pkill', ['-f', dir]); } catch {} setTimeout(() => rmSync(dir, { recursive: true, force: true }), 1500); } };
  },
  safari(url) {
    let running = true;
    try { execFileSync('pgrep', ['-x', 'Safari']); } catch { running = false; }
    execFileSync('open', ['-a', 'Safari', url]);
    return {
      sel: { match: /Safari\.app\/|com\.apple\.WebKit\./ },
      close: () => {
        try {
          execFileSync('osascript', ['-e', running ? `tell application "Safari" to close (every tab of every window whose URL starts with "${base}")` : 'quit app "Safari"']);
        } catch {}
      },
    };
  },
};

for (const browser of browsers) {
  for (const mode of modesArg ? modesArg.split(',') : MODES[browser]) {
    const done = new Promise((r) => (current = { done: r }));
    const b = LAUNCH[browser](`${base}?mode=${mode}&browser=${browser}&scenes=${SCENES.join(',')}`);
    current.sel = b.sel;
    const ok = await Promise.race([done.then(() => true), sleep(30_000 + SCENES.length * 15_000).then(() => false)]);
    if (!ok) console.log(`${browser} ${mode}: didn't finish`);
    current = null;
    b.close();
    await sleep(3000);
  }
}
server.close();

// the results, and a table of them: a column per browser and mode, a row per scene
const date = new Date().toISOString().slice(0, 10), dir = join(ROOT, 'bench/web/results');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${date}.json`), `${JSON.stringify(results, null, 1)}\n`);
const columns = [...new Set(results.map((r) => `${r.browser} ${r.mode}`))];
const cell = (scene, column) => {
  const r = results.find((k) => k.scene === scene && `${k.browser} ${k.mode}` === column);
  return r ? `${r.cpu}${r.fps && r.fps < 58 ? ` (${r.fps} fps)` : ''}` : '';
};
const table = [`| scene | ${columns.join(' | ')} |`, `|${'---|'.repeat(columns.length + 1)}`, ...SCENES.map((s) => `| ${s} | ${columns.map((c) => cell(s, c)).join(' | ')} |`)].join('\n');
writeFileSync(join(dir, `${date}.md`), `CPU of every process of the browser, % of one core (frames per second where under 58).\n\n${table}\n`);
console.log(`\n${table}\n\nwritten to bench/web/results/${date}.md`);
