// Small helpers for the demos: building elements (no inline style attributes: the page's CSP forbids them), icons,
// and acting out pointer input for recordings.
const SVG = 'http://www.w3.org/2000/svg';

/** h('div.class#id', { attr: value, style: {...}, on: { click } }, ...children) */
export function h(spec, props = {}, ...children) {
  const [, tag = 'div', rest = ''] = /^([a-z0-9-]*)(.*)$/i.exec(spec);
  const el = document.createElement(tag || 'div');
  for (const part of rest.match(/[.#][^.#]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k === 'style') Object.assign(el.style, v);
    else if (k === 'on') for (const [t, fn] of Object.entries(v)) el.addEventListener(t, fn);
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  el.append(...children.flat().filter((c) => c != null));
  return el;
}

const PATHS = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4.2-4.2',
  home: 'M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z',
  photo: 'M4 6h16v12H4zM4 15l4-4 4 4 3-3 5 5',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  star: 'M12 3l2.7 5.6 6.2.9-4.5 4.4 1 6.1L12 17.1 6.6 20l1-6.1L3.1 9.5l6.2-.9z',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM14 4h4v16h-4z',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11',
  sun: 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  message: 'M21 12a8 8 0 01-11.9 7L3 21l2-6A8 8 0 1121 12z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  map: 'M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 100 7 3.5 3.5 0 000-7z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
};

/** An icon, drawn with strokes in the current text colour. */
export function icon(name, size = 20) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', PATHS[name] ?? PATHS.more);
  svg.append(path);
  return svg;
}

/** A full-bleed photo. */
export const photo = (name) => h('img.photo', { src: `assets/${name}.jpg`, alt: '', decoding: 'sync' });

/** Wait for an image or video to be ready to draw. */
export const ready = (media) => new Promise((r) => {
  if (media instanceof HTMLImageElement) media.complete ? r() : media.addEventListener('load', r, { once: true });
  else media.readyState >= 2 ? r() : media.addEventListener('loadeddata', r, { once: true });
});

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- acting out pointer input (for recordings: these are what a user's pointer would send)

const centre = (el) => {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
};
const fire = (target, type, x, y, extra = {}) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: type !== 'pointerenter' && type !== 'pointerleave', clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...extra }));

/** Hover, press and release an element, as a click. */
export async function tap(el, hold = 260) {
  const [x, y] = centre(el);
  fire(el, 'pointerenter', x, y, { buttons: 0 });
  await sleep(120);
  fire(el, 'pointerdown', x, y);
  await sleep(hold);
  fire(el, 'pointerup', x, y);
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
  await sleep(80);
  fire(el, 'pointerleave', x, y, { buttons: 0 });
}

/** Drag an element by (dx, dy) over `ms`, frame by frame. */
export async function drag(el, dx, dy, ms = 900, target = el) {
  const [x, y] = centre(el);
  fire(target, 'pointerdown', x, y);
  const t0 = performance.now();
  await new Promise((done) => {
    const step = (now) => {
      const p = Math.min((now - t0) / ms, 1), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      fire(target, 'pointermove', x + dx * e, y + dy * e);
      if (p < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
  fire(target, 'pointerup', x + dx, y + dy);
}

/** Move a pointer along a path of points over `ms`, sending pointermove to `target`. */
export async function sweep(target, points, ms) {
  const t0 = performance.now();
  await new Promise((done) => {
    const step = (now) => {
      const p = Math.min((now - t0) / ms, 1), f = p * (points.length - 1), i = Math.min(Math.floor(f), points.length - 2), t = f - i;
      const x = points[i][0] + (points[i + 1][0] - points[i][0]) * t, y = points[i][1] + (points[i + 1][1] - points[i][1]) * t;
      const under = document.elementFromPoint(x, y) ?? target;
      fire(under, 'pointermove', x, y, { buttons: 0 });
      if (p < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
}

/** Load a demo's stylesheet (demos/<name>.css) once. */
export function css(name) {
  if (document.querySelector(`link[data-demo="${name}"]`)) return;
  document.head.append(h('link', { rel: 'stylesheet', href: `demos/${name}.css`, 'data-demo': name }));
}
