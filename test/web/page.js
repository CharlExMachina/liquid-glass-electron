// test:web's page. ?mode=ref: the glass as Chromium's compositor draws it (the runner captures the window).
// ?mode=gl: as the shader draws it over the page's backdropSource; the glass's canvas is read back, in window.result
// (one case, &case=name) or posted to the runner (&run=all, every case in turn, for a browser the runner opened).
// &wrong=1 bends half as much again on purpose (the runner's --self-check).
import { getEnvironment, glass, setEnvironment, unglass } from '../../dist/liquid-glass.js';
import { CASES, LIGHT_OFF } from './cases.js';

const q = new URLSearchParams(location.search);
const mode = q.get('mode') ?? 'gl', wrong = q.has('wrong');
// in Chromium, the shader instead of the compositor
if (mode === 'gl') globalThis.LIQUID_GLASS_WEBGL = true;

const frames = (n) => new Promise((done) => {
  const step = () => (n-- > 0 ? requestAnimationFrame(step) : done());
  step();
});

// a surface's gain and offset: greys, lighter toward the top-left and a ring's worth of offset
function surfaceImages(w, h) {
  const make = (draw) => {
    const cv = Object.assign(document.createElement('canvas'), { width: w, height: h }), ctx = cv.getContext('2d');
    draw(ctx);
    return cv.toDataURL();
  };
  return [
    make((ctx) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, '#888');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
    make((ctx) => {
      ctx.fillStyle = 'rgb(128 128 128)';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
      g.addColorStop(0.5, 'rgb(128 128 128)');
      g.addColorStop(0.8, 'rgb(190 190 190)');
      g.addColorStop(1, 'rgb(90 90 90)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }),
  ];
}

async function show(c) {
  document.body.replaceChildren();
  setEnvironment({ dark: !!c.dark, wideGamut: false, appearance: 'clear', reduceTransparency: false, increaseContrast: false, reduceMotion: true });
  const img = Object.assign(document.createElement('img'), { id: 'back', alt: '' });
  if (c.fit) {
    img.src = `../../demo/assets/${c.photo}.jpg`;
    img.style.objectFit = c.fit;
    img.style.objectPosition = '30% 60%';
  } else if (c.foreign) {
    // the same server by its other name: another origin, and it sends no CORS headers
    img.src = `http://${location.hostname === 'localhost' ? '127.0.0.1' : 'localhost'}:${location.port}/backdrop/${c.photo}.png`;
  } else img.src = `/backdrop/${c.photo}.png`;
  document.body.append(img);
  await img.decode();
  const [x, y, w, h] = c.box;
  const el = Object.assign(document.createElement('div'), { className: 'g' });
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  document.body.append(el);
  const options = { ...c.options, ...LIGHT_OFF, group: false };
  if (c.surface) options.surface = surfaceImages(w, h);
  if (mode === 'gl' && c.source !== null) options.backdropSource = '#back';
  if (wrong) options.refraction = (options.refraction ?? (options.variant ? 0.9 : 0.69)) * 1.5;
  const handle = glass(el, options);
  await handle.drawn();
  await frames(4);
  // a surface's images load on their own
  if (c.surface) await new Promise((r) => setTimeout(r, 300));
  await frames(2);
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const out = { name: c.name, box: c.box, radius, free: options.shape === 'squircle' || options.shape === 'path', dpr: devicePixelRatio };
  if (mode === 'gl') {
    const canvas = el.querySelector('canvas[data-lg-layer="backdrop"]');
    if (c.expect === 'blur') {
      // no canvas, and a backdrop filter on the element as before
      const filter = getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter || 'none';
      if (canvas) out.error = 'a shader canvas, where the glass should have fallen back to the blur';
      else if (filter === 'none') out.error = 'no shader canvas, and no backdrop filter either';
      else out.blur = filter;
    } else if (!canvas) out.error = 'no shader canvas: the glass fell back';
    else out.image = canvas.toDataURL('image/png');
  }
  return { out, el };
}

if (q.has('run')) {
  const browser = q.get('browser') ?? 'unknown';
  const post = (path, body) => fetch(path, { method: 'POST', body: JSON.stringify({ browser, ...body }) });
  try {
    for (const c of CASES) {
      const { out, el } = await show(c);
      await post('/result', out);
      unglass(el);
    }
  } catch (e) {
    await post('/result', { name: 'page', error: String(e?.stack ?? e) });
  }
  await post('/done', { ua: navigator.userAgent, env: getEnvironment() });
  document.body.replaceChildren(Object.assign(document.createElement('p'), { textContent: 'test:web: done, this tab can be closed', style: 'color:#fff;font:16px system-ui;padding:20px' }));
} else {
  const c = CASES.find((k) => k.name === q.get('case'));
  try {
    window.result = (await show(c)).out;
  } catch (e) {
    window.result = { name: c?.name, error: String(e?.stack ?? e) };
  }
}
