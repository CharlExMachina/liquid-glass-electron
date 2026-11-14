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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the same server on another port: another origin, and it sends no CORS headers
const foreign = (photo) => `http://${location.hostname}:${q.get('foreign')}/backdrop/${photo}.png`;
const filterOf = (node) => {
  const cs = getComputedStyle(node);
  return cs.backdropFilter || cs.webkitBackdropFilter || 'none';
};
const shaderCanvas = (el) => el.querySelector('canvas[data-lg-layer="backdrop"]');
const until = async (test, ms = 4000) => {
  for (const end = performance.now() + ms; performance.now() < end; await sleep(50)) if (test()) return true;
  return false;
};

/** The page's picture: a photo of the runner's, or of demo/assets fitted by CSS. */
function picture(c, photo = c.photo) {
  const img = Object.assign(document.createElement('img'), { id: 'back', alt: '' });
  if (c.fit) {
    img.src = `../../demo/assets/${photo}.jpg`;
    img.style.objectFit = c.fit;
    img.style.objectPosition = '30% 60%';
  } else img.src = c.foreign ? foreign(photo) : `/backdrop/${photo}.png`;
  if (c.crop) Object.assign(img.style, { height: `${c.crop}px`, objectFit: 'none', objectPosition: '0 0' });
  return img;
}

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
  setEnvironment({ dark: !!c.dark, wideGamut: false, appearance: 'clear', reduceTransparency: false, increaseContrast: false, reduceMotion: true, active: false });
  // what happens to the source after glass(): only where the shader draws (the reference is over the picture as it ends up)
  const gl = mode === 'gl', late = gl && c.late, retry = gl && c.retry, replace = gl && c.replace;
  const img = picture(c, replace || c.photo);
  if (!late) {
    document.body.append(img);
    await img.decode();
  }
  const [x, y, w, h] = c.box;
  const el = Object.assign(document.createElement('div'), { className: 'g' });
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  document.body.append(el);
  const options = { ...c.options, ...LIGHT_OFF, group: false };
  if (c.surface) options.surface = surfaceImages(w, h);
  if (gl && c.source !== null) options.backdropSource = '#back';
  if (retry) {
    // first a picture the page may not read (not in the document: named as an element)
    options.backdropSource = Object.assign(new Image(), { src: foreign(c.photo) });
    await options.backdropSource.decode();
  }
  if (wrong) options.refraction = (options.refraction ?? (options.variant ? 0.9 : 0.69)) * 1.5;
  const handle = glass(el, options);
  await handle.drawn();
  const steps = [];
  if (late) {
    await sleep(300);
    if (shaderCanvas(el)) steps.push('a shader canvas before the source was in the document');
    document.body.prepend(img);
    await img.decode();
  }
  if (retry) {
    if (!(await until(() => !shaderCanvas(el) && filterOf(el) !== 'none'))) steps.push('no plain blur over the source that can\'t be read');
    handle.set({ backdropSource: '#back' });
  }
  if (replace) {
    await until(() => shaderCanvas(el));
    await frames(3);
    const next = picture(c);
    await next.decode();
    img.replaceWith(next);
  }
  if (late || retry || replace) {
    if (!(await until(() => shaderCanvas(el)))) steps.push('no shader canvas afterwards');
    await handle.drawn();
  }
  await frames(4);
  // a surface's images load on their own
  if (c.surface) await new Promise((r) => setTimeout(r, 300));
  await frames(2);
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  const out = { name: c.name, box: c.box, radius, free: options.shape === 'squircle' || options.shape === 'path', dpr: devicePixelRatio };
  if (gl) {
    const canvas = shaderCanvas(el);
    // the plain look under the canvas: only where the glass looks past its picture
    const under = canvas ? filterOf(canvas) : 'none';
    if (steps.length) out.error = steps.join('; ');
    else if (c.expect === 'under') {
      const data = canvas?.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      if (!canvas) out.error = 'no shader canvas: the glass fell back altogether';
      else if (data.some((v, i) => i % 4 === 3 && v)) out.error = 'the shader drew, where the glass sees none of its picture';
      else if (under === 'none') out.error = 'nothing under the glass past its picture: no backdrop filter on its canvas';
      else out.blur = under;
    } else if (!!c.under !== (under !== 'none')) out.error = c.under ? 'no plain look under the glass past its picture' : `a backdrop filter under glass that's all over its picture: ${under}`;
    else if (c.expect === 'blur') {
      // no canvas, and a backdrop filter on the element as before
      const filter = filterOf(el);
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
