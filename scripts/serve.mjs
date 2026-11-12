// pnpm demo:web: builds the library and serves the repository on localhost, for the page that shows the glass in any
// browser (demo/web/). Any static server does the same; this one answers range requests, which Safari's video needs.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webm': 'video/webm', '.svg': 'image/svg+xml' };
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'inherit' });

const server = createServer((req, res) => {
  let file = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (file.startsWith(ROOT) && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.statusCode = 404;
    return res.end('not found');
  }
  const data = readFileSync(file);
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.setHeader('accept-ranges', 'bytes');
  const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
  if (!range) return res.end(data);
  const from = +range[1], to = range[2] ? +range[2] : data.length - 1;
  res.statusCode = 206;
  res.setHeader('content-range', `bytes ${from}-${to}/${data.length}`);
  res.end(data.subarray(from, to + 1));
});
server.listen(Number(process.env.PORT ?? 4173), '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/demo/web/  (open it in Safari, Firefox or Chrome; Ctrl+C to stop)`));
