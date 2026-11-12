// bench:web's page: the scenes of the README's benchmark, over a backdrop the page names (an <img>, or a playing
// <video>), in any browser.
//   ?mode=glass   the library's glass with backdropSource: the shader outside Chromium, the compositor in it
//   ?mode=shader  the shader in Chromium too
//   ?mode=blur    the library's glass without a backdropSource: what Safari and Firefox get otherwise (a plain blur)
//   ?mode=none    the same elements, no glass
//   &scenes=idle,content,move,scroll,n10,n30,video   &still=1 (one frame of the first scene, for a screenshot)
// Each scene warms up, then posts its frames per second to the runner, which reads the browser's CPU time meanwhile.
import { glass, unglass } from '../../dist/liquid-glass.js';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'glass', browser = q.get('browser') ?? 'unknown', still = q.has('still');
const scenes = (q.get('scenes') ?? 'idle,content,move,scroll,n10,n30,video').split(',');
const WARM = +(q.get('warm') ?? 2000), RUN = +(q.get('run') ?? 6000);
if (mode === 'shader') globalThis.LIQUID_GLASS_WEBGL = true;
const $ = (id) => document.getElementById(id);
const root = $('root'), scroller = $('scroller'), hud = $('hud');

let panels = [];
async function build(rects, video) {
  for (const el of panels) {
    unglass(el);
    el.remove();
  }
  scroller.replaceChildren();
  scroller.scrollTop = 0;
  const back = video
    ? Object.assign(document.createElement('video'), { id: 'film', src: '../../demo/assets/orbit.webm', muted: true, loop: true, playsInline: true })
    : Object.assign(document.createElement('img'), { id: 'back', src: '../../demo/assets/coast.jpg', alt: '' });
  scroller.append(back);
  if (video) await back.play().catch(() => {});
  else await back.decode();
  panels = rects.map(([x, y, w, h, r], i) => {
    const el = Object.assign(document.createElement('div'), { className: 'panel', textContent: rects.length > 6 ? '' : `glass ${i + 1}` });
    Object.assign(el.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${r}px`, transform: `translate(${x}px, ${y}px)` });
    root.append(el);
    if (mode !== 'none') glass(el, mode === 'blur' ? { blurAmount: 0.4 } : { backdropSource: back });
    return el;
  });
  return back;
}

const FOUR = [[60, 60, 300, 160, 28], [420, 60, 300, 160, 28], [780, 60, 300, 160, 28], [420, 300, 300, 160, 28]];
const capsules = (n) => Array.from({ length: n }, (_, i) => [30 + (i % 6) * 190, 40 + Math.floor(i / 6) * 150, 170, 64, 32]);
const scroll = (t) => { scroller.scrollTop = (t * 0.3) % 2300; };
const SCENES = {
  idle: { rects: FOUR },
  content: { rects: FOUR, tick: (t) => { const v = String(Math.floor(t / 100)); if ($('counter').textContent !== v) $('counter').textContent = v; } },
  move: { rects: FOUR, tick: (t) => { panels[3].style.transform = `translate(${420 + Math.sin(t / 700) * 300}px, ${300 + Math.cos(t / 900) * 120}px)`; } },
  scroll: { rects: FOUR, tick: scroll },
  n10: { rects: capsules(10), tick: scroll },
  n30: { rects: capsules(30), tick: scroll },
  video: { rects: FOUR, video: true },
};

const post = (path, body) => fetch(path, { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
// frames drawn while `tick` runs; a scene with nothing to do isn't made to draw any (its cost is the browser's own)
const run = (ms, tick) => new Promise((done) => {
  if (!tick) return setTimeout(() => done(null), ms);
  const t0 = performance.now();
  let last = t0;
  const gaps = [];
  const step = (now) => {
    gaps.push(now - last);
    last = now;
    tick(now - t0);
    if (now - t0 < ms) requestAnimationFrame(step);
    else done(gaps.slice(1));
  };
  requestAnimationFrame(step);
});

if (still) {
  await build(SCENES[scenes[0]].rects, SCENES[scenes[0]].video);
  hud.remove();
  document.documentElement.dataset.ready = '1';
} else {
  await new Promise((r) => setTimeout(r, 1500));
  for (const name of scenes) {
    const s = SCENES[name];
    await build(s.rects, s.video);
    hud.textContent = `${mode} / ${name}`;
    await run(WARM, s.tick);
    await post('/mark', { browser, mode, scene: name, phase: 'start' });
    const gaps = await run(RUN, s.tick);
    const row = { browser, mode, scene: name, phase: 'end', dpr: devicePixelRatio, view: [innerWidth, innerHeight], ua: navigator.userAgent };
    if (gaps) {
      gaps.sort((a, b) => a - b);
      Object.assign(row, { fps: +((gaps.length * 1000) / gaps.reduce((a, b) => a + b, 0)).toFixed(1), p95: +gaps[Math.floor(gaps.length * 0.95)].toFixed(1) });
    }
    row.shader = !!document.querySelector('canvas[data-lg-layer="backdrop"]');
    await post('/mark', row);
  }
  await post('/done', { browser, mode });
  hud.textContent = 'done';
}
