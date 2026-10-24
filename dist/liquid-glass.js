// src/dom.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var defs = null;
function filterDefs() {
  if (defs?.isConnected) return defs;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("data-liquid-glass-defs", "");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  defs = document.createElementNS(SVG_NS, "defs");
  svg.append(defs);
  document.body.append(svg);
  return defs;
}
function svgEl(tag, attrs2 = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  setAttrs(node, attrs2);
  node.append(...children);
  return node;
}
function setAttrs(node, attrs2) {
  for (const [k, v] of Object.entries(attrs2)) {
    const s = String(v);
    if (node.getAttribute(k) !== s) node.setAttribute(k, s);
  }
}
var canvas = null;
function toDataURL(p) {
  canvas ??= document.createElement("canvas");
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(p.data, p.width, p.height), 0, 0);
  return canvas.toDataURL();
}
var decoded = /* @__PURE__ */ new Set();
async function predecode(url) {
  if (decoded.has(url)) return;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
  }
  decoded.add(url);
  if (decoded.size > 512) decoded.clear();
}
var sheet = null;
function installStyles() {
  if (sheet) return;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(`
:where([data-liquid-glass]) { box-shadow: var(--lg-shadow, none); }
:where([data-liquid-glass][data-lg-pressable]) { cursor: pointer; -webkit-tap-highlight-color: transparent; transition: scale 0.32s cubic-bezier(0.3, 1.6, 0.5, 1); }
:where([data-liquid-glass][data-lg-interactive]) { background-image: radial-gradient(circle at var(--lg-x, 50%) var(--lg-y, 50%), rgb(255 255 255 / var(--lg-glow, 0)), transparent 70%); }
:where([data-liquid-glass][data-lg-floating]) { touch-action: none; cursor: grab; user-select: none; }
:where([data-liquid-glass][data-lg-floating][data-lg-dragging]) { cursor: grabbing; }
`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  try {
    CSS.registerProperty({ name: "--glass-strength", syntax: "<number>", inherits: false, initialValue: "1" });
  } catch {
  }
}
function supportsSvgBackdrop() {
  if (globalThis.LIQUID_GLASS_FALLBACK) return false;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const brands = navigator.userAgentData?.brands ?? [];
  if (brands.some((b) => /Chromium|Google Chrome|Microsoft Edge|Electron/.test(b.brand))) return true;
  return /\b(Chrome|Chromium|Electron)\//.test(ua) && !/\bEdge\//.test(ua);
}

// src/optics.ts
var IOR = 1.5;
var ABERRATION = 1.7;
var clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
var smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
var height = (d, zR) => d <= 0 ? 0 : d >= zR ? zR : Math.sqrt(d * (2 * zR - d));
var slope = (d, zR) => (height(d + 2, zR) - height(d - 2, zR)) / 4;
var clampRadii = (radii, w, h) => radii.map((r) => clamp(r, 0, Math.min(w, h) / 2));
function gradient(f, x, y, zR) {
  const e = 2;
  const gx = (height(-f.sdf(x + e, y), zR) - height(-f.sdf(x - e, y), zR)) / (2 * e);
  const gy = (height(-f.sdf(x, y + e), zR) - height(-f.sdf(x, y - e), zR)) / (2 * e);
  return [gx, gy, -f.sdf(x, y)];
}
function shiftAt(x, y, f, o) {
  const zR = Math.max(o.bevel, 1);
  let [gx, gy, d] = gradient(f, x, y, zR);
  const depth = smoothstep(0, zR, d);
  if (o.dome) {
    const [tx, ty] = f.toward(x, y), k2 = o.refraction * depth * 0.35;
    return [tx * k2, ty * k2];
  }
  if (o.monotone && d < 2) {
    const g = Math.hypot(gx, gy) || 1, peak = slope(2, zR) * (1 + 0.02 * (2 - d));
    gx = gx / g * peak;
    gy = gy / g * peak;
  }
  const k = (1 - 1 / IOR) * (2 + 0.5 * height(o.monotone ? Math.max(d, 2) : d, zR) / zR) * o.refraction * 30;
  const m = o.magnify ? o.refraction * 4 * depth : 0;
  const [px, py] = f.pull(x, y);
  return [gx * k + px * m, gy * k + py * m];
}
function fringeAt(x, y, f, bevel, chroma) {
  const [gx, gy, d] = gradient(f, x, y, Math.max(bevel, 1));
  const n = Math.hypot(gx, gy, 1);
  const edge = smoothstep(f.shortHalf * 0.35, 0, d);
  const k = chroma * 36 * (0.3 + 0.7 * edge);
  return [-gx / n * k, -gy / n * k];
}
var unit = (x, y, z) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
var halfway = (l) => unit(l[0], l[1], l[2] + 1);
var H1 = halfway(unit(0.4, 0.7, 1));
var H2 = halfway(unit(-0.3, -0.5, 1));
var L3 = unit(0.1, 0.3, 1);
var H4 = halfway(unit(0, 0.9, 0.4));
function lightAt(d, nx, ny, top, shortHalf, zR, o) {
  const s = d >= zR ? 0 : slope(d, zR);
  const N = unit(s * nx, s * ny, 1);
  const fres = (1 - Math.abs(N[2])) ** 4 * o.fresnel;
  const spec = (Math.max(dot(N, H1), 0) ** 90 + Math.max(dot(N, H2), 0) ** 50 * 0.3 + Math.max(dot(N, L3), 0) ** 6 * 0.1 + Math.max(dot(N, H4), 0) ** 120 * 0.6) * o.specular;
  const stroke = smoothstep(-2.5, -1.5, -d) * (1 - smoothstep(-1, 0, -d)) * (0.4 + 0.6 * top);
  const rim = smoothstep(shortHalf * 0.35, 0, d) * o.edge * 0.22;
  const glow = smoothstep(5, 0, d) * o.edge * 0.15;
  const env = (N[1] * 0.5 + 0.5) * fres * 0.08;
  const added = clamp(spec + rim + glow + stroke * o.edge * 0.55 + env, 0, 1);
  return 1 - (1 - added) * (1 - fres * 0.2);
}
var blurSigma = (blurAmount) => Math.max(blurAmount, 0) * Math.sqrt(3) * 1.75 * 2.5;
function tintGains(strength, rgb = [0.92, 0.95, 1.05]) {
  return rgb.map((c) => 1 + (c - 1) * strength);
}
function colorMatrix(saturation, brightness, gains) {
  const s = 1 + saturation, b = 1 + brightness;
  const lr = 0.299 * (1 - s), lg = 0.587 * (1 - s), lb = 0.114 * (1 - s);
  const rows = [
    [lr + s, lg, lb],
    [lr, lg + s, lb],
    [lr, lg, lb + s]
  ];
  const m = [];
  rows.forEach((row, i) => m.push(...row.map((v) => v * b * gains[i]), 0, 0));
  m.push(0, 0, 0, 1, 0);
  return m;
}
function boxShadowAlpha(d, opacity, spread) {
  const s = Math.max(spread, 1), out = Math.max(-d - 1, 0) / s;
  const a = (0.65 * Math.exp(-out * out) + 0.35 * Math.exp(-2 * out)) * opacity;
  return a * a;
}
function boxShadow(opacity, spread, offsetY) {
  if (opacity <= 0) return "none";
  const s = Math.max(spread, 1);
  const px = (v) => `${+v.toFixed(2)}px`;
  const a = (k) => +Math.min(k * opacity * opacity, 1).toFixed(3);
  return `0 ${px(offsetY)} ${px(0.9 * s)} ${px(1 + 0.4 * s)} rgb(0 0 0 / ${a(0.666)}), 0 ${px(offsetY)} ${px(1.3 * s)} ${px(1 - 0.5 * s)} rgb(0 0 0 / ${a(2.066)})`;
}

// src/field.ts
function rectSdf(px, py, hx, hy, radii) {
  const r = py < 0 ? px < 0 ? radii[0] : radii[1] : px < 0 ? radii[3] : radii[2];
  const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}
function roundedRect(w, h, radii) {
  const hx = w / 2, hy = h / 2;
  return {
    w,
    h,
    sdf: (x, y) => rectSdf(x - hx, y - hy, hx, hy, radii),
    pull: (x, y) => [-(x - hx) / Math.max(hx, 1), -(y - hy) / Math.max(hy, 1)],
    toward: (x, y) => [hx - x, hy - y],
    shortHalf: Math.min(hx, hy),
    probe: (axis, d) => axis === 0 ? [d, hy] : [hx, d]
  };
}
function union(w, h, members, spacing) {
  const k = Math.max(spacing, 0.01);
  const each = (x, y) => members.map((m) => rectSdf(x - m.x - m.w / 2, y - m.y - m.h / 2, m.w / 2, m.h / 2, m.radii));
  const smin = (a, b) => {
    const t = clamp((k - Math.abs(a - b)) / k, 0, 1);
    return Math.min(a, b) - t * t * k / 4;
  };
  const first = members[0] ?? { x: 0, y: 0, w, h, radii: [0, 0, 0, 0] };
  const blend = (x, y, of) => {
    const ds = each(x, y), lo = Math.min(...ds);
    let px = 0, py = 0, sum = 0;
    members.forEach((m, i) => {
      const wgt = Math.exp(-(ds[i] - lo) / (k / 4 + 1));
      const [a, b] = of(m);
      px += wgt * a;
      py += wgt * b;
      sum += wgt;
    });
    return sum ? [px / sum, py / sum] : [0, 0];
  };
  return {
    w,
    h,
    sdf: (x, y) => {
      const ds = each(x, y);
      return ds.length ? ds.reduce(smin) : 1e9;
    },
    pull: (x, y) => blend(x, y, (m) => [-(x - m.x - m.w / 2) / Math.max(m.w / 2, 1), -(y - m.y - m.h / 2) / Math.max(m.h / 2, 1)]),
    toward: (x, y) => blend(x, y, (m) => [m.x + m.w / 2 - x, m.y + m.h / 2 - y]),
    shortHalf: Math.min(...members.map((m) => Math.min(m.w, m.h) / 2), Math.min(w, h) / 2),
    probe: (axis, d) => axis === 0 ? [first.x + d, first.y + first.h / 2] : [first.x + first.w / 2, first.y + d]
  };
}
function squircle(w, h, radius, n = 5) {
  const hx = w / 2, hy = h / 2, r = Math.max(Math.min(radius * 1.25, hx, hy), 0.01);
  const level = (x, y) => {
    const qx = Math.abs(x - hx) - (hx - r), qy = Math.abs(y - hy) - (hy - r);
    if (qx <= 0 || qy <= 0) return Math.max(qx, qy) - r;
    return (qx ** n + qy ** n) ** (1 / n) - r;
  };
  const sdf = (x, y) => {
    const v = level(x, y), e = 0.01;
    const gx = (level(x + e, y) - level(x - e, y)) / (2 * e), gy = (level(x, y + e) - level(x, y - e)) / (2 * e);
    return v / Math.max(Math.hypot(gx, gy), 1e-6);
  };
  return {
    w,
    h,
    sdf,
    pull: (x, y) => [-(x - hx) / Math.max(hx, 1), -(y - hy) / Math.max(hy, 1)],
    toward: (x, y) => [hx - x, hy - y],
    shortHalf: Math.min(hx, hy),
    probe: (axis, d) => axis === 0 ? [d, hy] : [hx, d]
  };
}
function signedDistance(mask, gw, gh) {
  const INF = 1e20;
  const edt = (inside) => {
    const f = new Float64Array(gw * gh);
    for (let i = 0; i < f.length; i++) f[i] = mask[i] > 0 === inside ? 0 : INF;
    const line = (get, set, n) => {
      const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n);
      for (let q = 0; q < n; q++) g[q] = get(q);
      let k = 0;
      v[0] = 0;
      z[0] = -INF;
      z[1] = INF;
      for (let q = 1; q < n; q++) {
        let s = (g[q] + q * q - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) {
          k--;
          s = (g[q] + q * q - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        }
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < n; q++) {
        while (z[k + 1] < q) k++;
        d[q] = (q - v[k]) ** 2 + g[v[k]];
      }
      for (let q = 0; q < n; q++) set(q, d[q]);
    };
    for (let x = 0; x < gw; x++) line((y) => f[y * gw + x], (y, val) => f[y * gw + x] = val, gh);
    for (let y = 0; y < gh; y++) line((x) => f[y * gw + x], (x, val) => f[y * gw + x] = val, gw);
    return f;
  };
  const toOutside = edt(false), toInside = edt(true);
  const out = new Float32Array(gw * gh);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] > 0 ? -(Math.sqrt(toOutside[i]) - 0.5) : Math.sqrt(toInside[i]) - 0.5;
  return out;
}
function gridField(w, h, grid, gw, gh, scale) {
  const hx = w / 2, hy = h / 2;
  const at = (x, y) => {
    const fx = Math.min(Math.max(x * scale - 0.5, 0), gw - 1), fy = Math.min(Math.max(y * scale - 0.5, 0), gh - 1);
    const i0 = Math.floor(fx), j0 = Math.floor(fy), i1 = Math.min(i0 + 1, gw - 1), j1 = Math.min(j0 + 1, gh - 1), tx = fx - i0, ty = fy - j0;
    const g = (i, j) => grid[j * gw + i];
    const v = (g(i0, j0) * (1 - tx) + g(i1, j0) * tx) * (1 - ty) + (g(i0, j1) * (1 - tx) + g(i1, j1) * tx) * ty;
    const ox = Math.max(-x, x - w, 0), oy = Math.max(-y, y - h, 0);
    return v / scale + Math.hypot(ox, oy);
  };
  let deepest = 0;
  for (const v of grid) deepest = Math.max(deepest, -v / scale);
  return {
    w,
    h,
    sdf: at,
    pull: (x, y) => [-(x - hx) / Math.max(hx, 1), -(y - hy) / Math.max(hy, 1)],
    toward: (x, y) => [hx - x, hy - y],
    shortHalf: Math.max(deepest, 1),
    // a straight edge for the tables: from the deepest row's left end, as good a guess as any for a free shape
    probe: (axis, d) => axis === 0 ? [d, hy] : [hx, d]
  };
}

// src/maps.ts
var LIGHT_MID = 32;
function lightImage(radii, bevel, shortHalf, o, scale, fill = null) {
  const lit = o.fresnel > 0 || o.edge > 0 || o.specular > 0;
  if (!lit && !fill) return null;
  const zR = Math.max(Math.min(bevel, shortHalf), 1);
  const e = Math.ceil(Math.max(...radii, zR, shortHalf * 0.35));
  const size = 2 * e + LIGHT_MID;
  const px = Math.max(1, Math.round(size * scale));
  const data = new Uint8ClampedArray(px * px * 4);
  const corner = (x, y, r) => {
    const u = r - x, v = r - y;
    if (u > 0 && v > 0) {
      const len = Math.hypot(u, v);
      return len > r + 1 ? null : [r - len, -u / len, -v / len];
    }
    return u > v ? [x, -1, 0] : [y, 0, -1];
  };
  const top = (y) => y < e ? 1 : y > size - e ? 0 : 1 - (y - e) / LIGHT_MID;
  for (let j = 0; j < px; j++) {
    for (let i = 0; i < px; i++) {
      const x = (i + 0.5) / scale, y = (j + 0.5) / scale;
      const right = x > size / 2, bottom = y > size / 2;
      const lx = right ? size - x : x, ly = bottom ? size - y : y;
      const r = radii[bottom ? right ? 2 : 3 : right ? 1 : 0];
      const hit = lx >= e && ly >= e ? [Infinity, 0, 0] : lx >= e ? [ly, 0, -1] : ly >= e ? [lx, -1, 0] : corner(lx, ly, r);
      if (!hit) continue;
      const [d, nx, ny] = hit;
      const a = lit ? lightAt(d, right ? -nx : nx, bottom ? -ny : ny, top(y), shortHalf, zR, o) : 0;
      const cover = Math.min(Math.max(d * scale + 0.5, 0), 1);
      paint(data, (j * px + i) * 4, cover, a, fill);
    }
  }
  return { width: px, height: px, data, slice: Math.round(e * scale), edge: e };
}
function paint(data, k, cover, a, fill) {
  const fa = fill ? fill[3] * cover : 0, la = a * cover;
  const A = la + fa * (1 - la);
  if (A <= 0) return;
  for (let c = 0; c < 3; c++) data[k + c] = Math.round((255 * la + (fill ? fill[c] : 0) * fa * (1 - la)) / A);
  data[k + 3] = Math.round(255 * A);
}
function tableMap(f, o, scale, N = 256, fringe = 0, profile = f) {
  const opt = { ...o, monotone: true };
  const shift = (x, y) => {
    const [sx, sy] = shiftAt(x, y, f, opt);
    if (!fringe) return [sx, sy];
    const [fx, fy] = fringeAt(x, y, f, o.bevel, Math.abs(fringe));
    return [sx + Math.sign(fringe) * fx, sy + Math.sign(fringe) * fy];
  };
  const zR = Math.min(Math.max(o.bevel, 1), f.shortHalf);
  const margin = Math.ceil(2 / scale);
  if (o.dome) return smoothMap(f, shift, scale, margin, N);
  const edgeShift = (axis, d) => {
    const [x, y] = profile.probe(axis, Math.max(d, 0.01));
    return (profile === f ? shift(x, y) : shiftAt(x, y, profile, opt))[axis];
  };
  const K = 2048;
  const tables = [0, 1].map((axis) => {
    const prof = new Float64Array(K + 1);
    for (let i = 0; i <= K; i++) prof[i] = edgeShift(axis, zR - (zR + margin) * (i / K));
    for (let i = 1; i <= K; i++) prof[i] = Math.max(prof[i], prof[i - 1] + 1e-6 * (prof[K] + 1));
    const start = Math.max(prof[0], 1e-6), W0 = start > 0.25 ? 0.12 : 0;
    const forward = (w) => {
      if (w <= W0) return W0 ? w / W0 * start : 0;
      const t = (w - W0) / (1 - W0) * K, i = Math.min(Math.floor(t), K - 1);
      return prof[i] + (prof[i + 1] - prof[i]) * (t - i);
    };
    const inverse = (t) => {
      if (W0 && t <= start) return t / start * W0;
      if (t >= prof[K]) return 1;
      let lo = 0, hi = K;
      while (hi - lo > 1) {
        const m = lo + hi >> 1;
        if (prof[m] < t) lo = m;
        else hi = m;
      }
      return W0 + (lo + (t - prof[lo]) / (prof[hi] - prof[lo])) / K * (1 - W0);
    };
    return { forward, inverse, top: prof[K] };
  });
  const rimPx = Math.max(tables[0].top, tables[1].top, 1e-6);
  const encode = (axis, t) => 0.5 + 0.5 * Math.sign(t) * tables[axis].inverse(Math.abs(t));
  const valueAt = (x, y) => {
    const [sx, sy] = shift(x, y);
    return [encode(0, sx), encode(1, sy)];
  };
  const { width, height: height2, data } = sampleBox(f, scale, margin, (x, y, d) => {
    if (d >= 0.5) return valueAt(x, y);
    const n = normal(f, x, y);
    const a = valueAt(x - n[0] * (0.5 - d), y - n[1] * (0.5 - d));
    const b = valueAt(x - n[0] * (1.5 - d), y - n[1] * (1.5 - d));
    return [a[0] + (a[0] - b[0]) * (0.5 - d), a[1] + (a[1] - b[1]) * (0.5 - d)];
  }, (v) => Math.round(Math.min(Math.max(v, 0), 1) * 255));
  const table = (axis) => Array.from({ length: N }, (_, k) => {
    const v = k / (N - 1), t = Math.sign(2 * v - 1) * tables[axis].forward(Math.abs(2 * v - 1));
    return +Math.min(0.5 + 0.5 * t / rimPx + 1 / 255, 1).toFixed(5);
  });
  return { width, height: height2, data, tableX: table(0), tableY: table(1), tableB: SHAPE_TABLE, rimPx, margin };
}
var SHAPE_STEPS = 8;
var shapeByte = (d) => Math.round(Math.min(Math.max(128 + SHAPE_STEPS * d, 0), 255));
var SHAPE_TABLE = Array.from({ length: 256 }, (_, k) => +Math.min(Math.max((k - 128) / SHAPE_STEPS + 0.5, 0), 1).toFixed(4));
function sampleBox(f, scale, margin, value, byte) {
  const width = Math.max(2, Math.round((f.w + 2 * margin) * scale)), height2 = Math.max(2, Math.round((f.h + 2 * margin) * scale));
  const fx = (f.w + 2 * margin) / width, fy = (f.h + 2 * margin) / height2;
  const data = new Uint8ClampedArray(width * height2 * 4);
  for (let j = 0; j < height2; j++) {
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) * fx - margin, y = (j + 0.5) * fy - margin;
      const d = -f.sdf(x, y);
      const v = value(x, y, d);
      const k = (j * width + i) * 4;
      data[k] = byte(v[0]);
      data[k + 1] = byte(v[1]);
      data[k + 2] = shapeByte(d);
      data[k + 3] = 255;
    }
  }
  return { width, height: height2, data };
}
function smoothMap(f, shift, scale, margin, N) {
  const at = (x, y, d) => {
    if (d >= 0.5) return shift(x, y);
    const n = normal(f, x, y);
    return shift(x - n[0] * (0.5 - d), y - n[1] * (0.5 - d));
  };
  let rimPx = 1e-6;
  sampleBox(f, scale, margin, (x, y, d) => {
    const [sx, sy] = at(x, y, d);
    rimPx = Math.max(rimPx, Math.abs(sx), Math.abs(sy));
    return [0, 0];
  }, () => 0);
  const { width, height: height2, data } = sampleBox(f, scale, margin, (x, y, d) => {
    const [sx, sy] = at(x, y, d);
    return [128 + 127 * sx / rimPx, 128 + 127 * sy / rimPx];
  }, (v) => Math.round(Math.min(Math.max(v, 0), 255)));
  const identity = Array.from({ length: N }, (_, k) => +Math.min(k / (N - 1) + 0.5 / 255, 1).toFixed(5));
  return { width, height: height2, data, tableX: identity, tableY: identity, tableB: SHAPE_TABLE, rimPx, margin };
}
function normal(f, x, y) {
  const e = 0.05;
  const gx = f.sdf(x + e, y) - f.sdf(x - e, y);
  const gy = f.sdf(x, y + e) - f.sdf(x, y - e);
  const l = Math.hypot(gx, gy) || 1;
  return [gx / l, gy / l];
}
function fieldLight(f, bevel, o, shadow, scale, pad, fill = null) {
  const zR = Math.max(Math.min(bevel, f.shortHalf), 1);
  const reach = Math.max(zR, f.shortHalf * 0.35) + 2;
  const width = Math.max(1, Math.round((f.w + 2 * pad) * scale)), height2 = Math.max(1, Math.round((f.h + 2 * pad) * scale));
  const light = new Uint8ClampedArray(width * height2 * 4), shade = new Uint8ClampedArray(width * height2 * 4), mask = new Uint8ClampedArray(width * height2 * 4);
  const flat = lightAt(Infinity, 0, 0, 0.5, f.shortHalf, zR, o);
  const lit = o.fresnel > 0 || o.edge > 0 || o.specular > 0;
  for (let j = 0; j < height2; j++) {
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / scale - pad, y = (j + 0.5) / scale - pad;
      const d = -f.sdf(x, y);
      const k = (j * width + i) * 4;
      const cover = Math.min(Math.max(d * scale + 0.5, 0), 1);
      if (cover > 0) {
        mask[k + 3] = Math.round(255 * cover);
        if (lit || fill) {
          let a = lit ? flat : 0;
          if (lit && d < reach) {
            const [nx, ny] = normal(f, x, y);
            a = lightAt(Math.max(d, 0), nx, ny, 1 - Math.min(Math.max(y / f.h, 0), 1), f.shortHalf, zR, o);
          }
          paint(light, k, cover, a, fill);
        }
      }
      if (cover < 1 && shadow.opacity > 0) {
        shade[k + 3] = Math.round(255 * (1 - cover) * boxShadowAlpha(-f.sdf(x, y - shadow.offsetY), shadow.opacity, shadow.spread));
      }
    }
  }
  return { light: { width, height: height2, data: light }, shadow: { width, height: height2, data: shade }, mask: { width, height: height2, data: mask }, pad };
}

// src/options.ts
var DEFAULTS = {
  blurAmount: 0,
  refraction: 0.69,
  chromAberration: 0.05,
  edgeHighlight: 0.05,
  specular: 0,
  fresnel: 1,
  distortion: 0,
  cornerRadius: null,
  zRadius: 40,
  opacity: 1,
  saturation: 0,
  tintStrength: 0,
  brightness: 0,
  shadowOpacity: 0.3,
  shadowSpread: 10,
  shadowOffsetY: 1,
  floating: false,
  elasticity: 0.15,
  button: false,
  bevelMode: 0,
  strength: 1,
  variant: null,
  backdrop: null,
  tint: null,
  fill: null,
  shape: "rect",
  path: null,
  pathBox: null,
  interactive: false,
  press: null,
  pressBulge: 0.25,
  smooth: true,
  magnify: true,
  adaptive: true
};
var VARIANTS = {
  // frosted, saturated, a faint fill: legible over anything
  regular: { blurAmount: 0.5, saturation: 0.5, refraction: 0.69, fill: "auto" },
  // liquidglass's defaults: clear, sharp bending; wants a dim or simple backdrop for text
  clear: {},
  // no glass at all: for switching it off without changing the layout
  identity: { refraction: 0, chromAberration: 0, edgeHighlight: 0, fresnel: 0, specular: 0, shadowOpacity: 0 }
};
var NUMBERS = [
  "blurAmount",
  "refraction",
  "chromAberration",
  "edgeHighlight",
  "specular",
  "fresnel",
  "distortion",
  "cornerRadius",
  "zRadius",
  "opacity",
  "saturation",
  "tintStrength",
  "brightness",
  "shadowOpacity",
  "shadowSpread",
  "shadowOffsetY",
  "bevelMode",
  "pressBulge",
  "strength",
  "elasticity"
];
var BOOLEANS = ["floating", "button", "interactive", "smooth", "magnify", "adaptive"];
var STRINGS = ["variant", "tint", "fill", "shape", "press", "path", "pathBox", "backdrop"];
var ALL = [...NUMBERS, ...BOOLEANS, ...STRINGS];
var ALIASES = {
  bevel: "zRadius",
  aberration: "chromAberration",
  edge: "edgeHighlight",
  dome: "bevelMode",
  blur: "blurAmount",
  radius: "cornerRadius"
};
var kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
function coerce(key, raw) {
  const v = raw.trim();
  if (NUMBERS.includes(key)) {
    if (key === "cornerRadius" && (v === "" || v === "auto")) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : void 0;
  }
  if (BOOLEANS.includes(key)) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n > 0 : v === "" || v === "true" || v === "yes";
  }
  return v === "" || v === "none" || v === "null" ? null : v;
}
function fromCss(style) {
  const out = {};
  for (const key of ALL) {
    const raw = style.getPropertyValue(`--glass-${kebab(key)}`);
    if (raw.trim() !== "") {
      const v = coerce(key, raw);
      if (v !== void 0) out[key] = v;
    }
  }
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (key in out) continue;
    const raw = style.getPropertyValue(`--glass-${alias}`);
    if (raw.trim() === "") continue;
    const v = coerce(key, raw);
    if (v !== void 0) out[key] = v;
  }
  return out;
}
function fromData(el) {
  const out = {};
  const main = el.dataset.glass?.trim();
  if (main) {
    if (main.startsWith("{")) {
      try {
        Object.assign(out, JSON.parse(main));
      } catch {
        console.warn("liquid-glass-electron: data-glass is not valid JSON:", main);
      }
    } else if (main in VARIANTS) {
      out.variant = main;
    }
  }
  for (const key of [...ALL, ...Object.keys(ALIASES)]) {
    const attr = el.getAttribute(`data-glass-${kebab(key)}`);
    if (attr === null) continue;
    const name = ALIASES[key] ?? key;
    const v = coerce(name, attr);
    if (v !== void 0) out[name] = v;
  }
  return out;
}
function resolve(sources, env) {
  const merged = { ...DEFAULTS };
  const variant = sources.reduce((v, s) => s.variant !== void 0 ? s.variant : v, null);
  if (variant && VARIANTS[variant]) Object.assign(merged, VARIANTS[variant]);
  for (const s of sources) {
    for (const [k, v] of Object.entries(s)) if (v !== void 0) merged[k] = v;
  }
  merged.variant = variant;
  if (merged.button && merged.press === null) merged.press = "flatten";
  if (merged.interactive && merged.press === null) merged.press = "bulge";
  if (merged.variant === "identity" || !merged.adaptive) return finishFill(merged, env);
  if (env.appearance === "tinted") {
    merged.blurAmount = Math.max(merged.blurAmount, 0.8);
    merged.saturation = Math.max(merged.saturation, 0.3);
    merged.fill ??= "auto-tinted";
    if (merged.fill === "auto") merged.fill = "auto-tinted";
  }
  if (env.reduceTransparency) {
    merged.blurAmount = Math.max(merged.blurAmount, 2);
    merged.chromAberration = 0;
    merged.distortion = 0;
    merged.fill = merged.fill && !merged.fill.startsWith("auto") ? merged.fill : "auto-opaque";
  }
  if (env.increaseContrast) {
    merged.edgeHighlight = Math.max(merged.edgeHighlight, 0.6);
    merged.chromAberration = 0;
    if (!merged.fill || merged.fill === "auto") merged.fill = "auto-tinted";
  }
  return finishFill(merged, env);
}
function finishFill(o, env) {
  const fills = {
    auto: ["rgb(255 255 255 / 0.1)", "rgb(20 20 24 / 0.12)"],
    "auto-tinted": ["rgb(250 250 252 / 0.55)", "rgb(28 28 32 / 0.55)"],
    "auto-opaque": ["rgb(246 246 248 / 0.9)", "rgb(30 30 34 / 0.9)"]
  };
  if (o.fill && fills[o.fill]) o.fill = fills[o.fill][env.dark ? 1 : 0];
  return o;
}

// src/lens.ts
var MAP_PIXELS = 4096;
var mapScale = (w, h, moving) => Math.min(Math.max(Math.sqrt(MAP_PIXELS / (w * h)), 0.08), 0.5) / (moving ? 2 : 1);
var SETTLE = 120;
var KEEP = ["1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"];
var nextId = 0;
var mapCache = /* @__PURE__ */ new Map();
var lightCache = /* @__PURE__ */ new Map();
var remember = (m, k, v) => {
  if (m.size > 200) m.delete(m.keys().next().value);
  m.set(k, v);
  return v;
};
var Lens = class {
  el;
  id = `lg${++nextId}`;
  options;
  js;
  host;
  // the filters and the nodes that change
  pre = null;
  main = null;
  // One map, or with a dome's fringe three (red, green, blue: liquidglass's fringe doesn't follow the dome's shift)
  maps = [];
  colour = null;
  blurNode = null;
  mixNode = null;
  // what backdrop-filter is while there's glass, the filter's structure (rebuilt only when it changes), and whether
  // the maps are drawn for refraction 1 (the shift is linear in it, so a scale stands for it)
  filterCss = "none";
  structure = "";
  unitMaps = true;
  following = 0;
  lightUrl = null;
  passes = [];
  stash = false;
  bends = false;
  // geometry and the current map
  w = 0;
  h = 0;
  radii = [0, 0, 0, 0];
  margin = 0;
  region = { x: 0, y: 0, w: 0, h: 0 };
  mapKey = "";
  lightKey = "";
  settleTimer = 0;
  // the pointer
  bulge = 1;
  tween = 0;
  hover = false;
  pressed = false;
  flat = false;
  saved = {};
  off = [];
  shape;
  constructor(el, js, host2, shape = null) {
    this.el = el;
    this.js = js;
    this.host = host2;
    this.shape = shape;
    el.dataset.liquidGlass = this.id;
    for (const p of ["backdrop-filter", "border-image", "border-style", "border-width", "border-radius", "scale", "translate", "transition"]) this.saved[p] = el.style.getPropertyValue(p);
    const start = (e) => {
      if (e.target !== el) return;
      if (e instanceof TransitionEvent && !e.propertyName.startsWith("--glass")) return;
      this.follow();
    };
    el.addEventListener("transitionrun", start);
    el.addEventListener("animationstart", start);
    this.unlisten = () => {
      el.removeEventListener("transitionrun", start);
      el.removeEventListener("animationstart", start);
    };
    this.refresh();
  }
  unlisten;
  /**
   * Read the options again (CSS custom properties, data attributes, `js` on top). Only a change to the filter's
   * structure rebuilds it; strength, refraction, fringe, frost, colour, light and shadow are attributes and styles, cheap
   * enough to change every frame.
   */
  refresh(js) {
    if (js) this.js = { ...this.js, ...js };
    const prev = this.options;
    this.options = resolve([fromCss(getComputedStyle(this.el)), fromData(this.el), this.js], this.host.env());
    const structure = this.structureKey();
    if (!prev || structure !== this.structure) {
      this.structure = structure;
      this.build();
      this.measure();
      this.bindPointer();
      return;
    }
    this.live();
    const pointer = (o) => [o.floating, o.button, o.interactive, o.press].join();
    if (pointer(prev) !== pointer(this.options)) this.bindPointer();
  }
  /** What, in the options, decides which filter nodes there are. */
  structureKey() {
    const o = this.options;
    const bends = supportsSvgBackdrop() && o.refraction > 0 && o.variant !== "identity";
    return [bends, o.backdrop, o.chromAberration > 0, o.bevelMode, blurSigma(o.blurAmount) >= 0.5, o.smooth, o.distortion > 0, o.opacity < 1, o.variant === "identity", o.magnify, this.isFree()].join();
  }
  /** A shape the element's own (rounded) box can't clip: the filter masks itself, and light and shadow are an image. */
  isFree() {
    const o = this.options;
    return !this.shape && (o.shape === "squircle" || o.shape === "path" && !!o.path);
  }
  /** A free shape's field, for the element's size. */
  freeField(w, h) {
    const o = this.options;
    if (o.shape === "squircle") return squircle(w, h, o.cornerRadius ?? (parseFloat(getComputedStyle(this.el).borderTopLeftRadius) || Math.min(w, h) / 4));
    return pathField(o.path, o.pathBox, w, h);
  }
  /** Apply what changed without rebuilding: matrix, blur, fringe, strength, backdrop, light, shadow, size. */
  live() {
    const o = this.options, s = this.amount();
    if (!this.bends) {
      this.el.style.setProperty("backdrop-filter", o.variant === "identity" || s <= 0 ? "none" : this.cssBackdrop());
    } else {
      this.recolour();
      this.blurNode?.setAttribute("stdDeviation", (blurSigma(o.blurAmount) * s).toFixed(2));
      this.mixNode?.setAttribute("k2", String(o.opacity));
      this.mixNode?.setAttribute("k3", String(1 - o.opacity));
      if (this.passes.length === 3 && this.unitMaps) {
        const a = o.chromAberration * ABERRATION;
        this.passes.forEach((p, k) => p.spread = 1 + (k - 1) * a);
      }
      this.applyStrength();
      this.el.style.setProperty("backdrop-filter", s > 0 ? this.filterCss : "none");
    }
    this.layout(true);
  }
  /** The strength, 0..1. */
  amount() {
    return Math.min(Math.max(this.options.strength, 0), 1);
  }
  /** Follow running transitions and animations of --glass-* properties on the element, a frame at a time. */
  follow() {
    if (this.following) return;
    const tick = () => {
      this.refresh();
      const running = this.el.getAnimations().some((a) => a.playState === "running");
      this.following = running ? requestAnimationFrame(tick) : 0;
    };
    this.following = requestAnimationFrame(tick);
  }
  /** The frost and colour as CSS functions, scaled by the strength (glass that doesn't bend, and other browsers). */
  cssBackdrop() {
    const o = this.options, s = this.amount(), sigma = blurSigma(o.blurAmount) * s;
    return [o.backdrop ?? "", sigma > 0.01 ? `blur(${sigma.toFixed(2)}px)` : "", `saturate(${1 + o.saturation * s})`, `brightness(${(1 + (1.06 * (1 + o.brightness) - 1) * s).toFixed(3)})`].filter(Boolean).join(" ");
  }
  /** The border-box size, as the ResizeObserver reported it. */
  resize(w, h) {
    if (!w || !h || Math.abs(w - this.w) < 0.01 && Math.abs(h - this.h) < 0.01) return;
    this.w = w;
    this.h = h;
    this.layout(false);
  }
  measure() {
    const r = this.el.getBoundingClientRect();
    this.w = this.el.offsetWidth || r.width;
    this.h = this.el.offsetHeight || r.height;
    this.layout(true);
  }
  // ---------------------------------------------------------------- the filters
  build() {
    const o = this.options;
    this.pre?.remove();
    this.main?.remove();
    this.pre = this.main = this.colour = this.blurNode = this.mixNode = null;
    this.maps = [];
    this.passes = [];
    this.mapKey = "";
    this.bends = supportsSvgBackdrop() && o.refraction > 0 && o.variant !== "identity";
    const sigma = blurSigma(o.blurAmount);
    if (!this.bends) {
      this.filterCss = o.variant === "identity" ? "none" : this.cssBackdrop();
      this.el.style.setProperty("backdrop-filter", this.amount() > 0 ? this.filterCss : "none");
      return;
    }
    const region = { filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB", x: 0, y: 0, width: 1, height: 1 };
    const fringe = o.chromAberration > 0;
    this.stash = fringe;
    const first = svgEl("filter", { ...region, id: fringe ? `${this.id}a` : this.id });
    const second = fringe ? svgEl("filter", { ...region, id: this.id }) : first;
    this.colour = svgEl("feColorMatrix", { in: "SourceGraphic", type: "matrix", values: this.matrix().join(" "), result: "coloured" });
    first.append(this.colour);
    let src = "coloured";
    if (sigma >= 0.5) {
      this.blurNode = svgEl("feGaussianBlur", { in: src, stdDeviation: (sigma * this.amount()).toFixed(2), edgeMode: "duplicate", result: "smooth" });
      first.append(this.blurNode);
      src = "smooth";
    } else if (o.smooth) {
      first.append(svgEl("feConvolveMatrix", { in: src, order: 3, kernelMatrix: "1 2 1 2 4 2 1 2 1", divisor: 16, edgeMode: "duplicate", preserveAlpha: "true", result: "smooth" }));
      src = "smooth";
    }
    if (o.distortion > 0) {
      first.append(
        svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: 1.6, numOctaves: 1, seed: 7, result: "noise0" }),
        svgEl("feColorMatrix", { in: "noise0", type: "matrix", values: "1 0 0 0 0  0 1 0 0 0  0 0 0 0 0.5  0 0 0 0 1", result: "noise" }),
        svgEl("feDisplacementMap", { in: src, in2: "noise", scale: (o.distortion * 14).toFixed(2), xChannelSelector: "R", yChannelSelector: "G", result: "grain" })
      );
      src = "grain";
    }
    const perChannel = fringe && o.bevelMode === 1;
    this.unitMaps = !perChannel;
    const fringes = perChannel ? [1, 0, -1].map((k) => k * o.chromAberration) : [0];
    const mergeNodes = [svgEl("feMergeNode", { in: src })];
    fringes.forEach((f, i) => {
      const image = svgEl("feImage", { preserveAspectRatio: "none", x: 0, y: 0, width: 1, height: 1, result: `map${i}raw` });
      const table = svgEl(
        "feComponentTransfer",
        { in: `map${i}raw`, result: fringe ? `side${i}` : `map${i}` },
        svgEl("feFuncR", { type: "table", tableValues: "0 1" }),
        svgEl("feFuncG", { type: "table", tableValues: "0 1" }),
        ...this.isFree() ? [svgEl("feFuncB", { type: "table", tableValues: "0 1" })] : []
      );
      first.append(image, table);
      let shift = null;
      if (fringe) {
        mergeNodes.push(svgEl("feMergeNode", { in: `side${i}` }));
        shift = svgEl("feOffset", { in: "SourceGraphic", dx: 0, dy: 0, result: `map${i}` });
        second.append(shift);
      }
      this.maps.push({ image, table, shift, fringe: f, rimPx: 0 });
    });
    if (fringe) {
      first.append(svgEl("feMerge", {}, ...mergeNodes));
      src = "SourceGraphic";
    }
    const pass = (result, spread, map) => {
      const node = svgEl("feDisplacementMap", { in: src, in2: `map${map}`, xChannelSelector: "R", yChannelSelector: "G", result });
      this.passes.push({ node, spread, map });
      return node;
    };
    if (fringe) {
      const a = perChannel ? 0 : o.chromAberration * ABERRATION;
      ["r", "g", "b"].forEach((ch, k) => second.append(
        pass(`${ch}0`, 1 + (k - 1) * a, perChannel ? k : 0),
        svgEl("feColorMatrix", { in: `${ch}0`, type: "matrix", values: KEEP[k], result: ch })
      ));
      second.append(
        svgEl("feComposite", { in: "r", in2: "g", operator: "lighter", result: "rg" }),
        svgEl("feComposite", { in: "rg", in2: "b", operator: "lighter", result: "bent" })
      );
    } else {
      second.append(pass("bent", 1, 0));
    }
    if (o.opacity < 1) {
      this.mixNode = svgEl("feComposite", { in: "bent", in2: src, operator: "arithmetic", k2: o.opacity, k3: 1 - o.opacity, result: "mixed" });
      second.append(this.mixNode);
    }
    if (this.isFree()) {
      second.append(
        svgEl("feColorMatrix", { in: "map0", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0", result: "cover" }),
        svgEl("feComposite", { in: this.mixNode ? "mixed" : "bent", in2: "cover", operator: "in" })
      );
    }
    const defs2 = filterDefs();
    if (fringe) {
      defs2.append(first, second);
      this.pre = first;
      this.main = second;
      this.filterCss = `url(#${first.id}) url(#${second.id})`;
    } else {
      defs2.append(first);
      this.main = first;
      this.filterCss = `url(#${first.id})`;
    }
    if (o.backdrop) this.filterCss = `${o.backdrop} ${this.filterCss}`;
    this.el.style.setProperty("backdrop-filter", this.amount() > 0 ? this.filterCss : "none");
  }
  /** The colour matrix: saturation, brightness (6% always, as liquidglass's glass is, plus a button's hover) and tint. */
  matrix() {
    const o = this.options;
    const gains = tintGains(o.tintStrength, o.tint ? tintRgb(o.tint) : void 0);
    const hover = this.hover && o.button && !this.pressed ? 0.2 : 0;
    const m = colorMatrix(o.saturation, (1 + o.brightness + hover) * 1.06 - 1, gains), s = this.amount();
    const id = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    return m.map((v, i) => +(id[i] + (v - id[i]) * s).toFixed(4));
  }
  // ---------------------------------------------------------------- size, map and light
  /** The shape changed (a container's members moved): draw it again now. */
  reshape() {
    this.measure();
  }
  layout(now) {
    const { w, h } = this;
    if (!w || !h) return;
    const o = this.options;
    if (this.isFree()) {
      this.el.style.borderRadius = "0";
      this.el.style.setProperty("--lg-shadow", "none");
    } else if (!this.shape) {
      const [radii, own] = this.cornerRadii();
      this.radii = radii;
      const radiusCss = own ? this.saved["border-radius"] : radii.map((r) => `${+r.toFixed(2)}px`).join(" ");
      if (this.el.style.borderRadius !== radiusCss) this.el.style.borderRadius = radiusCss;
      const deeper = this.pressed && o.press === "flatten" ? 1.2 : 1;
      this.el.style.setProperty("--lg-shadow", boxShadow(o.shadowOpacity * o.opacity * this.amount(), o.shadowSpread * deeper, o.shadowOffsetY));
    }
    this.place();
    clearTimeout(this.settleTimer);
    if (now || !this.mapKey) this.draw();
    else this.settleTimer = window.setTimeout(() => this.draw(), SETTLE);
  }
  /** Size the filters, and put the maps where they go: past the element by their margin, and beside it when stashed. */
  place() {
    const { w, h } = this, m = this.margin;
    for (const f of [this.pre, this.main]) if (f) setAttrs(f, { x: 0, y: 0, width: w, height: h });
    if (!this.maps.length) return;
    const stashed = !!this.pre, slot = Math.ceil(w + m) + 32;
    const r = this.region.w ? this.region : { x: 0, y: 0, w, h };
    this.maps.forEach((map, i) => {
      const side = stashed ? slot * (i + 1) : 0;
      setAttrs(map.image, { x: side + r.x - m, y: r.y - m, width: r.w + 2 * m, height: r.h + 2 * m });
      if (map.shift) setAttrs(map.shift, { dx: -side });
    });
    setAttrs(this.pre ?? this.main, { x: -m, y: -m, width: (stashed ? slot * this.maps.length : 0) + w + 2 * m, height: h + 2 * m });
  }
  /** The corner radii, and whether they're the element's own CSS ones (circular, in px). */
  cornerRadii() {
    const o = this.options;
    const { w, h } = this;
    if (o.shape === "capsule" || o.shape === "circle") return [clampRadii([1e9, 1e9, 1e9, 1e9], w, h), false];
    if (o.shape === "concentric") return [clampRadii(concentric(this.el), w, h), false];
    if (o.cornerRadius !== null) return [clampRadii([o.cornerRadius, o.cornerRadius, o.cornerRadius, o.cornerRadius], w, h), false];
    if (this.el.style.borderRadius !== this.saved["border-radius"]) this.el.style.borderRadius = this.saved["border-radius"];
    const cs = getComputedStyle(this.el);
    let own = true;
    const corner = (v) => {
      const parts = v.split(" ");
      if (parts.length > 1 || v.endsWith("%")) own = false;
      return Math.min(...parts.map((p) => p.endsWith("%") ? parseFloat(p) / 100 * Math.min(w, h) : parseFloat(p) || 0));
    };
    return [clampRadii([cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(corner), w, h), own];
  }
  /** Resolves once the map and light asked for so far are on screen. */
  whenDrawn() {
    return Promise.all(this.drawing).then(() => void 0);
  }
  drawing = [];
  draw() {
    this.drawing = [];
    const o = this.options;
    const { w, h, radii } = this;
    const free = this.isFree();
    const field = this.shape ? this.shape.field(w, h) : free ? this.freeField(w, h) : roundedRect(w, h, radii);
    const moving = !!this.shape?.moving();
    const zR = Math.min(o.zRadius * (this.flat ? 0.8 : 1), field.shortHalf);
    const region = this.shape?.bounds() ?? { x: 0, y: 0, w, h };
    const sub = region.x || region.y || region.w !== w || region.h !== h ? within(field, region) : field;
    if (this.bends && this.maps.length) {
      const scale = mapScale(region.w / Math.sqrt(this.shape?.detail() ?? 1), region.h, moving);
      const refraction = this.unitMaps ? 1 : o.refraction;
      const key = [w, h, ...radii, zR, refraction, o.bevelMode, +o.magnify, scale, ...this.maps.map((m) => m.fringe)].map((v) => Math.round(v * 400) / 400).join(":") + (this.shape ? `|${this.shape.key()}` : "") + (free ? `|${o.shape}|${o.path}|${o.pathBox}|${o.cornerRadius}` : "");
      if (key !== this.mapKey) {
        this.mapKey = key;
        const entries = this.maps.map((map) => {
          const k = `${key}|${map.fringe}`;
          return mapCache.get(k) ?? remember(mapCache, k, (() => {
            const profile = free && o.shape === "path" ? roundedRect(w, h, [0, 0, 0, 0]) : sub;
            const m = tableMap(sub, { refraction, bevel: zR, dome: o.bevelMode === 1, magnify: o.magnify }, scale, moving ? 64 : 256, map.fringe, profile);
            return { url: toDataURL(m), rimPx: m.rimPx, margin: m.margin, tables: [m.tableX.join(" "), m.tableY.join(" "), m.tableB.join(" ")] };
          })());
        });
        const maps = this.maps;
        this.drawing.push(Promise.all(entries.map((e) => predecode(e.url))).then(() => {
          if (this.mapKey !== key || this.maps !== maps) return;
          entries.forEach((e, i) => {
            maps[i].image.setAttribute("href", e.url);
            maps[i].table.children[0].setAttribute("tableValues", e.tables[0]);
            maps[i].table.children[1].setAttribute("tableValues", e.tables[1]);
            maps[i].table.children[2]?.setAttribute("tableValues", e.tables[2]);
            maps[i].rimPx = e.rimPx;
          });
          this.margin = entries[0].margin;
          this.region = region;
          this.place();
          this.applyStrength();
        }));
      }
    }
    if (this.shape) this.drawFieldLight(field, zR, moving);
    else if (free) this.drawFreeLight(field, zR);
    else this.drawLight(zR);
  }
  /**
   * A free shape's light and shadow, as one image stretched over the element and past it (border-image-outset), so
   * the shadow can fall outside the box. Painted once, like a rounded rectangle's.
   */
  drawFreeLight(field, zR) {
    const o = this.options;
    const scale = Math.min(2, Math.ceil(devicePixelRatio || 1));
    const fill = o.fill ? parseColour(o.fill, o.opacity) : null;
    const pad = o.shadowOpacity > 0 ? Math.ceil(Math.max(o.shadowSpread, 1) * 3 + Math.abs(o.shadowOffsetY)) + 2 : 2;
    const key = `free|${this.mapKey}|${field.w}x${field.h}|${zR}|${o.fresnel}|${o.edgeHighlight}|${o.specular}|${o.shadowOpacity}|${o.shadowSpread}|${o.shadowOffsetY}|${o.opacity}|${scale}|${fill}|${o.shape}|${o.path}|${o.cornerRadius}`;
    if (key === this.lightKey) return this.applyLight();
    this.lightKey = key;
    const img = fieldLight(
      field,
      zR,
      { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular },
      { opacity: o.shadowOpacity * o.opacity, spread: o.shadowSpread, offsetY: o.shadowOffsetY },
      scale,
      pad,
      fill
    );
    const out = img.shadow.data;
    for (let i = 0; i < out.length; i += 4) {
      const la = img.light.data[i + 3] / 255 * (o.opacity < 1 ? o.opacity : 1), sa = out[i + 3] / 255;
      const a = la + sa * (1 - la);
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(img.light.data[i + c] * la / a);
      out[i + 3] = Math.round(a * 255);
    }
    const url = toDataURL(img.shadow);
    const empty = emptyImage(img.shadow.width, img.shadow.height);
    this.drawing.push(predecode(url).then(() => {
      if (this.lightKey !== key) return;
      this.lightUrl = { url, empty, free: pad };
      this.applyLight();
    }));
  }
  /** A shape's light, shadow and coverage, as images on the element (and its shadow layer). */
  drawFieldLight(field, zR, moving) {
    const o = this.options, shape = this.shape;
    const scale = moving ? 1 : Math.min(2, Math.ceil(devicePixelRatio || 1));
    const fill = o.fill ? parseColour(o.fill, o.opacity) : null;
    const key = `${shape.key()}|${zR}|${o.fresnel}|${o.edgeHighlight}|${o.specular}|${o.shadowOpacity}|${o.shadowSpread}|${o.shadowOffsetY}|${o.opacity}|${scale}|${fill}`;
    if (key === this.lightKey) return this.applyLight();
    this.lightKey = key;
    const img = fieldLight(
      field,
      zR,
      { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular },
      { opacity: o.shadowOpacity * o.opacity, spread: o.shadowSpread, offsetY: o.shadowOffsetY },
      scale,
      0,
      fill
    );
    if (o.opacity < 1) for (let i = 3; i < img.light.data.length; i += 4) img.light.data[i] *= o.opacity;
    const urls = [img.light, img.shadow, img.mask].map(toDataURL);
    const empty = emptyImage(img.light.width, img.light.height);
    this.drawing.push(Promise.all(urls.map(predecode)).then(() => {
      if (this.lightKey !== key) return;
      this.lightUrl = { url: urls[0], shadow: urls[1], empty, field: true };
      this.el.style.setProperty("mask-image", `url(${urls[2]})`);
      this.applyLight();
    }));
  }
  drawLight(zR) {
    const o = this.options;
    const { w, h, radii } = this;
    const shortHalf = Math.min(w, h) / 2;
    const scale = Math.min(2, Math.ceil(devicePixelRatio || 1));
    const lighting = { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular };
    const fill = o.fill ? parseColour(o.fill, o.opacity) : null;
    const key = [...radii, zR, shortHalf, lighting.fresnel, lighting.edge, lighting.specular, scale, o.opacity, o.variant === "identity" ? 1 : 0].map((v) => Math.round(v * 4) / 4).join(":") + `|${fill}`;
    if (key === this.lightKey) return this.applyLight();
    this.lightKey = key;
    let hit = lightCache.get(key);
    if (hit === void 0) {
      const img = o.variant === "identity" ? null : lightImage(radii, zR, shortHalf, lighting, scale, fill);
      if (img && o.opacity < 1) for (let i = 3; i < img.data.length; i += 4) img.data[i] *= o.opacity;
      hit = remember(lightCache, key, img ? { url: toDataURL(img), empty: emptyImage(img.width, img.height), slice: img.slice, edge: img.edge } : null);
    }
    const light = hit;
    const apply = () => {
      if (this.lightKey !== key) return;
      this.lightUrl = light;
      this.applyLight();
    };
    if (light) this.drawing.push(predecode(light.url).then(apply));
    else apply();
  }
  /**
   * The light at the current strength: the image cross-faded with a transparent one of the same size (so a 9-slice
   * still lines up), which is only a change of style, every frame if need be.
   */
  applyLight() {
    const light = this.lightUrl, s = this.amount();
    const image = (url, empty) => s >= 1 ? `url(${url})` : `-webkit-cross-fade(url(${empty}), url(${url}), ${+(s * 100).toFixed(2)}%)`;
    if (light?.field) {
      this.el.style.setProperty("background-image", image(light.url, light.empty));
      this.shape.shadowEl.style.setProperty("background-image", image(light.shadow, light.empty));
      return;
    }
    if (!light) {
      this.el.style.setProperty("border-image", this.saved["border-image"] || "");
      return;
    }
    if (getComputedStyle(this.el).borderTopStyle === "none") {
      this.el.style.setProperty("border-style", "solid");
      this.el.style.setProperty("border-width", "0");
    }
    this.el.style.setProperty("border-image", light.free !== void 0 ? `${image(light.url, light.empty)} 0 fill / 0 / ${light.free}px stretch` : `${image(light.url, light.empty)} ${light.slice} fill / ${light.edge}px`);
  }
  // ---------------------------------------------------------------- strength, hover, press, drag
  applyStrength() {
    const k = this.bulge * this.amount() * (this.unitMaps ? this.options.refraction : 1);
    for (const { node, spread, map } of this.passes) node.setAttribute("scale", String(+(2 * (this.maps[map]?.rimPx ?? 0) * spread * k).toFixed(3)));
  }
  tweenBulge(to) {
    cancelAnimationFrame(this.tween);
    if (this.host.env().reduceMotion) {
      this.bulge = to;
      this.applyStrength();
      return;
    }
    const from = this.bulge, t0 = performance.now(), ms = 180;
    const step = (now) => {
      const p = Math.min((now - t0) / ms, 1);
      this.bulge = from + (to - from) * (1 - (1 - p) ** 3);
      this.applyStrength();
      if (p < 1) this.tween = requestAnimationFrame(step);
    };
    this.tween = requestAnimationFrame(step);
  }
  setPressed(down) {
    if (this.pressed === down) return;
    this.pressed = down;
    const o = this.options;
    if (o.press === "bulge") this.tweenBulge(down ? 1 + o.pressBulge : 1);
    if (o.press === "flatten") {
      this.flat = down;
      this.layout(true);
    }
    if (o.interactive) {
      this.el.style.setProperty("scale", down && !this.host.env().reduceMotion ? "1.04" : this.saved.scale || "");
      this.el.style.setProperty("--lg-glow", down ? "0.35" : this.hover ? "0.12" : "0");
    }
    this.recolour();
  }
  recolour() {
    this.colour?.setAttribute("values", this.matrix().join(" "));
  }
  bindPointer() {
    for (const f of this.off) f();
    this.off = [];
    const el = this.el, o = this.options;
    const on = (t, type, fn) => {
      t.addEventListener(type, fn);
      this.off.push(() => t.removeEventListener(type, fn));
    };
    el.toggleAttribute("data-lg-pressable", o.button || o.interactive);
    el.toggleAttribute("data-lg-interactive", o.interactive);
    el.toggleAttribute("data-lg-floating", o.floating);
    if (o.button || o.interactive || o.press !== null && o.press !== "none") {
      const target = o.button || o.interactive ? el : el.closest('button, label, [role="button"], [role="slider"], [role="switch"]') ?? el;
      on(target, "pointerenter", () => {
        this.hover = true;
        if (o.interactive) el.style.setProperty("--lg-glow", "0.12");
        this.recolour();
      });
      on(target, "pointerleave", () => {
        this.hover = false;
        el.style.removeProperty("--lg-glow");
        this.setPressed(false);
        this.recolour();
      });
      on(target, "pointerdown", (e) => {
        if (e.button === 0) this.setPressed(true);
      });
      on(window, "pointerup", () => this.setPressed(false));
      on(window, "pointercancel", () => this.setPressed(false));
      on(target, "keydown", (e) => {
        if (e.key === " " || e.key === "Enter") this.setPressed(true);
      });
      on(target, "keyup", () => this.setPressed(false));
    }
    if (o.interactive) {
      on(el, "pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--lg-x", `${((e.clientX - r.left) / r.width * 100).toFixed(1)}%`);
        el.style.setProperty("--lg-y", `${((e.clientY - r.top) / r.height * 100).toFixed(1)}%`);
      });
    }
    if (o.floating) {
      let start = null;
      let last = { x: 0, y: 0, t: 0 }, vx = 0, vy = 0;
      const stretch = (sx, sy) => {
        if (o.elasticity <= 0 || this.host.env().reduceMotion) return;
        el.style.setProperty("scale", `${sx.toFixed(3)} ${sy.toFixed(3)}`);
      };
      on(el, "pointerdown", (e) => {
        if (e.button !== 0) return;
        const [tx = 0, ty = 0] = (el.style.translate || "0px 0px").split(" ").map((v) => parseFloat(v) || 0);
        start = { x: e.clientX, y: e.clientY, tx, ty, id: e.pointerId };
        last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        vx = vy = 0;
        el.setPointerCapture(e.pointerId);
        el.toggleAttribute("data-lg-dragging", true);
        el.style.setProperty("transition", "none");
      });
      on(el, "pointermove", (e) => {
        if (!start || e.pointerId !== start.id) return;
        el.style.translate = `${start.tx + e.clientX - start.x}px ${start.ty + e.clientY - start.y}px`;
        const dt = Math.max(e.timeStamp - last.t, 1);
        vx = vx * 0.7 + (e.clientX - last.x) / dt * 0.3;
        vy = vy * 0.7 + (e.clientY - last.y) / dt * 0.3;
        last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        const k = o.elasticity * 0.25, ax = Math.min(Math.abs(vx) * k, 0.35), ay = Math.min(Math.abs(vy) * k, 0.35);
        stretch((1 + ax) / (1 + ay * 0.5), (1 + ay) / (1 + ax * 0.5));
      });
      const end = (e) => {
        if (!start || e.pointerId !== start.id) return;
        start = null;
        el.toggleAttribute("data-lg-dragging", false);
        if (o.elasticity > 0) {
          el.style.setProperty("transition", "scale 0.45s cubic-bezier(0.3, 1.8, 0.5, 1)");
          el.style.setProperty("scale", this.saved.scale || "1");
          setTimeout(() => {
            if (!start) el.style.setProperty("transition", this.saved.transition || "");
          }, 480);
        } else el.style.setProperty("transition", this.saved.transition || "");
        el.dispatchEvent(new CustomEvent("glassmove", { bubbles: true }));
      };
      on(el, "pointerup", end);
      on(el, "pointercancel", end);
    }
  }
  destroy() {
    clearTimeout(this.settleTimer);
    cancelAnimationFrame(this.tween);
    cancelAnimationFrame(this.following);
    this.unlisten();
    for (const f of this.off) f();
    this.pre?.remove();
    this.main?.remove();
    for (const [p, v] of Object.entries(this.saved)) {
      if (v) this.el.style.setProperty(p, v);
      else this.el.style.removeProperty(p);
    }
    for (const p of ["--lg-shadow", "--lg-x", "--lg-y", "--lg-glow"]) this.el.style.removeProperty(p);
    delete this.el.dataset.liquidGlass;
    for (const a of ["data-lg-pressable", "data-lg-interactive", "data-lg-floating", "data-lg-dragging"]) this.el.removeAttribute(a);
  }
};
var paths = /* @__PURE__ */ new Map();
function pathField(d, box, w, h) {
  const k = `${d}|${box}|${Math.round(w)}x${Math.round(h)}`;
  const hit = paths.get(k);
  if (hit) return hit;
  const scale = Math.min(2, Math.sqrt(16e4 / (w * h)));
  const gw = Math.max(2, Math.ceil(w * scale)), gh = Math.max(2, Math.ceil(h * scale));
  const cv = document.createElement("canvas");
  cv.width = gw;
  cv.height = gh;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const [bx, by, bw, bh] = box ? box.trim().split(/[\s,]+/).map(Number) : [0, 0, w, h];
  ctx.scale(scale * w / bw, scale * h / bh);
  ctx.translate(-bx, -by);
  ctx.fill(new Path2D(d));
  const alpha = ctx.getImageData(0, 0, gw, gh).data;
  const mask = new Uint8Array(gw * gh);
  for (let i = 0; i < mask.length; i++) mask[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;
  return remember(paths, k, gridField(w, h, signedDistance(mask, gw, gh), gw, gh, scale));
}
var empties = /* @__PURE__ */ new Map();
function emptyImage(w, h) {
  const k = `${w}x${h}`;
  return empties.get(k) ?? remember(empties, k, toDataURL({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
}
function within(f, r) {
  return {
    w: r.w,
    h: r.h,
    shortHalf: f.shortHalf,
    sdf: (x, y) => f.sdf(x + r.x, y + r.y),
    pull: (x, y) => f.pull(x + r.x, y + r.y),
    toward: (x, y) => f.toward(x + r.x, y + r.y),
    probe: (axis, d) => {
      const [x, y] = f.probe(axis, d);
      return [x - r.x, y - r.y];
    }
  };
}
function parseColour(colour, opacity = 1) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255 * opacity];
}
function tintRgb(colour) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillStyle = colour;
  const parsed = String(ctx.fillStyle);
  let rgb;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(parsed);
  if (hex) rgb = [hex[1], hex[2], hex[3]].map((x) => parseInt(x, 16) / 255);
  else {
    const fn = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(parsed);
    rgb = fn ? [+fn[1] / 255, +fn[2] / 255, +fn[3] / 255] : [1, 1, 1];
  }
  const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] || 1;
  return rgb.map((c) => c / luma);
}
function concentric(el) {
  let p = el.parentElement;
  while (p && p !== document.body) {
    if (p.dataset.liquidGlass || parseFloat(getComputedStyle(p).borderTopLeftRadius) > 0) break;
    p = p.parentElement;
  }
  if (!p || p === document.body) return [8, 8, 8, 8];
  const a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
  const cs = getComputedStyle(p);
  const R = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => parseFloat(v) || 0);
  const l = a.left - b.left, t = a.top - b.top, r = b.right - a.right, btm = b.bottom - a.bottom;
  return [R[0] - Math.max(l, t), R[1] - Math.max(r, t), R[2] - Math.max(r, btm), R[3] - Math.max(l, btm)].map((v) => Math.max(v, 4));
}

// src/container.ts
var layerCss = "position:absolute;pointer-events:none;z-index:-1;margin:0;padding:0;border:0;";
var GlassContainer = class {
  el;
  options;
  lens;
  glassLayer;
  shadowLayer;
  members = [];
  key = "";
  pad;
  movingUntil = 0;
  running = 0;
  sizes;
  tree;
  saved = {};
  stopEvents;
  constructor(el, options, host2) {
    this.el = el;
    this.options = options;
    el.dataset.glassContainer ??= String(options.spacing ?? 16);
    for (const p of ["position", "isolation"]) this.saved[p] = el.style.getPropertyValue(p);
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.style.isolation = "isolate";
    const o = { ...options };
    this.pad = Math.ceil(Math.max(o.shadowSpread ?? 10, 1) * 3 + Math.abs(o.shadowOffsetY ?? 1)) + 2;
    this.shadowLayer = document.createElement("div");
    this.glassLayer = document.createElement("div");
    for (const layer of [this.shadowLayer, this.glassLayer]) {
      layer.setAttribute("aria-hidden", "true");
      layer.dataset.lgLayer = layer === this.glassLayer ? "glass" : "shadow";
      layer.style.cssText = `${layerCss}background-size:100% 100%;mask-size:100% 100%;`;
    }
    el.prepend(this.shadowLayer, this.glassLayer);
    this.measure();
    const self = this;
    this.lens = new Lens(this.glassLayer, { ...options, shadowOpacity: options.shadowOpacity ?? 0.3 }, host2, {
      field: (w, h) => union(w, h, self.members.map((m) => ({ ...m, x: m.x + self.pad, y: m.y + self.pad })), self.spacing()),
      key: () => self.key,
      shadowEl: this.shadowLayer,
      get pad() {
        return self.pad;
      },
      moving: () => performance.now() < self.movingUntil,
      // the members and room for the bevel's edge around them
      bounds: () => {
        if (!self.members.length) return { x: 0, y: 0, w: 1, h: 1 };
        const m = self.spacing() + 4;
        const x0 = Math.min(...self.members.map((b) => b.x)) - m, y0 = Math.min(...self.members.map((b) => b.y)) - m;
        const x1 = Math.max(...self.members.map((b) => b.x + b.w)) + m, y1 = Math.max(...self.members.map((b) => b.y + b.h)) + m;
        return { x: Math.max(x0 + self.pad, 0), y: Math.max(y0 + self.pad, 0), w: x1 - x0, h: y1 - y0 };
      },
      detail: () => Math.max(self.members.length, 1)
    });
    this.sizes = new ResizeObserver(() => this.update());
    this.sizes.observe(el);
    this.tree = new MutationObserver((records) => {
      if (records.some((r) => r.target !== this.glassLayer && r.target !== this.shadowLayer)) this.update();
    });
    this.tree.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-glass", "data-glass-member"] });
    const start = (e) => {
      if (e.target instanceof HTMLElement && this.isMember(e.target)) this.animate(1e4);
    };
    const end = () => {
      if (!this.el.getAnimations({ subtree: true }).some((a) => a.playState === "running")) this.animate(150);
    };
    for (const t of ["transitionrun", "animationstart"]) el.addEventListener(t, start);
    for (const t of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) el.addEventListener(t, end);
    this.stopEvents = () => {
      for (const t of ["transitionrun", "animationstart"]) el.removeEventListener(t, start);
      for (const t of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) el.removeEventListener(t, end);
    };
    this.update();
  }
  spacing() {
    return Number(this.el.dataset.glassContainer) || this.options.spacing || 16;
  }
  isMember(n) {
    return n !== this.glassLayer && n !== this.shadowLayer && n.matches(this.options.members ?? "[data-glass], [data-glass-member]") && n.closest("[data-glass-container]") === this.el;
  }
  /** Measure the members (their transformed boxes, so moving ones count) and lay the layers over the container. */
  measure() {
    const box = this.el.getBoundingClientRect();
    const sel = this.options.members ?? "[data-glass], [data-glass-member]";
    const found = [...this.el.querySelectorAll(sel)].filter((n) => this.isMember(n));
    this.members = found.map((n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      const shape = n.dataset.glassShape;
      const radius = (v) => v.endsWith("%") ? parseFloat(v) / 100 * Math.min(r.width, r.height) : parseFloat(v) || 0;
      const radii = shape === "capsule" || shape === "circle" ? [1e9, 1e9, 1e9, 1e9] : [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => radius(v.split(" ")[0]));
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, radii: clampRadii(radii, r.width, r.height) };
    });
    const w = this.el.clientWidth || box.width, h = this.el.clientHeight || box.height;
    const bl = this.el.clientLeft, bt = this.el.clientTop;
    for (const m of this.members) {
      m.x -= bl;
      m.y -= bt;
    }
    for (const layer of [this.shadowLayer, this.glassLayer]) {
      Object.assign(layer.style, { left: `${-this.pad}px`, top: `${-this.pad}px`, width: `${w + 2 * this.pad}px`, height: `${h + 2 * this.pad}px` });
    }
    this.key = this.members.map((m) => [m.x, m.y, m.w, m.h, ...m.radii].map((v) => Math.round(v * 2) / 2).join(",")).join(";") + `|${this.spacing()}`;
  }
  /** Measure the members again and redraw the glass if they moved. */
  update() {
    const before = this.key;
    this.measure();
    if (this.key !== before) this.lens?.reshape();
  }
  /** Follow the members every frame for `ms` (while they move in ways the container can't see coming). */
  animate(ms = 400) {
    this.movingUntil = Math.max(this.movingUntil, performance.now() + ms);
    if (this.running) return;
    const tick = () => {
      this.update();
      if (performance.now() < this.movingUntil) this.running = requestAnimationFrame(tick);
      else {
        this.running = 0;
        this.key = "";
        this.update();
      }
    };
    this.running = requestAnimationFrame(tick);
  }
  /** Change the glass's options (spacing too). */
  set(options) {
    Object.assign(this.options, options);
    if (options.spacing !== void 0) this.el.dataset.glassContainer = String(options.spacing);
    this.lens.refresh(options);
    this.key = "";
    this.update();
  }
  destroy() {
    cancelAnimationFrame(this.running);
    this.sizes.disconnect();
    this.tree.disconnect();
    this.stopEvents();
    this.lens.destroy();
    this.glassLayer.remove();
    this.shadowLayer.remove();
    for (const [p, v] of Object.entries(this.saved)) {
      if (v) this.el.style.setProperty(p, v);
      else this.el.style.removeProperty(p);
    }
    delete this.el.dataset.glassContainer;
  }
};

// src/morph.ts
var SPRING = "linear(0, 0.14 6%, 0.52 18%, 0.82 30%, 0.98 42%, 1.04 52%, 1.04 62%, 1.01 76%, 1)";
var hooks = {
  glass: null,
  optionsOf: (_el) => void 0,
  reduceMotion: () => false
};
var radiiOf = (el) => {
  const cs = getComputedStyle(el);
  return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => v.split(" ")[0]).join(" ");
};
async function morph(from, to, options = {}) {
  const duration = hooks.reduceMotion() ? 0 : options.duration ?? 420;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const glassOptions = { ...options.glass ?? hooks.optionsOf(to) ?? hooks.optionsOf(from) ?? {}, floating: false, interactive: false, button: false, strength: 1 };
  const proxy = document.createElement("div");
  proxy.setAttribute("aria-hidden", "true");
  proxy.style.cssText = `position:fixed;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;margin:0;pointer-events:none;z-index:2147483000;transform-origin:0 0;`;
  proxy.style.borderRadius = radiiOf(to);
  document.body.append(proxy);
  const g = hooks.glass(proxy, glassOptions);
  const start = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
  proxy.style.transform = start;
  await g.drawn();
  const fromVisibility = from.style.visibility;
  from.style.visibility = "hidden";
  to.style.visibility = "hidden";
  if (duration > 0) {
    await proxy.animate([{ transform: start }, { transform: "none" }], { duration, easing: options.easing ?? SPRING, fill: "forwards" }).finished;
  }
  const content = [...to.children].filter((c) => c instanceof HTMLElement && !c.dataset.lgLayer);
  for (const c of content) c.style.opacity = "0";
  to.style.visibility = "visible";
  from.style.visibility = fromVisibility === "visible" || !fromVisibility ? "hidden" : fromVisibility;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  g.destroy();
  proxy.remove();
  await Promise.all(content.map((c) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration ? 160 : 0, easing: "ease" }).finished.then(() => c.style.removeProperty("opacity"))));
}
async function materialize(el, direction, options = {}) {
  const duration = hooks.reduceMotion() || options.transition === "identity" ? 0 : options.duration ?? 320;
  const shown = { opacity: 1, scale: "1" }, hidden = { opacity: 0, scale: "0.9" };
  if (direction === "in") el.style.removeProperty("visibility");
  await el.animate(direction === "in" ? [hidden, shown] : [shown, hidden], { duration, easing: direction === "in" ? SPRING : "ease-in" }).finished;
  if (direction === "out") el.style.visibility = "hidden";
}

// src/edges.ts
function scrollEdge(scroller, options = {}) {
  const edges = options.edges ?? ["top"];
  const size = options.size ?? 56, blur = options.blur ?? 10, style = options.style ?? "soft";
  const dark = options.dark ?? matchMedia("(prefers-color-scheme: dark)").matches;
  const strips = edges.map((edge) => {
    const strip = document.createElement("div");
    strip.setAttribute("aria-hidden", "true");
    strip.dataset.lgScrollEdge = `${edge} ${style}`;
    const toward = edge === "top" ? "to bottom" : "to top";
    const tint = dark ? "0 0 0" : "255 255 255";
    strip.style.cssText = [
      `position:sticky;${edge}:0;height:${size}px;pointer-events:none;z-index:1;`,
      edge === "top" ? `margin-bottom:-${size}px;` : `margin-top:-${size}px;`,
      style === "soft" ? `backdrop-filter:blur(${blur}px) saturate(1.4);mask-image:linear-gradient(${toward}, #000 0%, rgb(0 0 0 / 0.75) 35%, transparent 100%);background:linear-gradient(${toward}, rgb(${tint} / ${dark ? 0.35 : 0.25}), transparent);` : `backdrop-filter:blur(${blur}px) saturate(1.2);background:rgb(${tint} / 0.82);box-shadow:0 ${edge === "top" ? 1 : -1}px 0 rgb(${dark ? "255 255 255 / 0.12" : "0 0 0 / 0.12"});`
    ].join("");
    if (edge === "top") scroller.prepend(strip);
    else scroller.append(strip);
    return strip;
  });
  return () => strips.forEach((s) => s.remove());
}

// src/index.ts
var lenses = /* @__PURE__ */ new Map();
var containers = /* @__PURE__ */ new Map();
var sizes = null;
var attrs = null;
var pending = /* @__PURE__ */ new Set();
var media = (q) => typeof matchMedia === "function" ? matchMedia(q) : null;
var queries = {
  dark: media("(prefers-color-scheme: dark)"),
  reduceTransparency: media("(prefers-reduced-transparency: reduce)"),
  increaseContrast: media("(prefers-contrast: more)"),
  reduceMotion: media("(prefers-reduced-motion: reduce)")
};
var overrides = {};
function getEnvironment() {
  const root = typeof document !== "undefined" ? document.documentElement.dataset : {};
  const theme = root.glassTheme;
  return {
    dark: overrides.dark ?? (theme ? theme === "dark" : !!queries.dark?.matches),
    appearance: overrides.appearance ?? (root.glassAppearance === "tinted" ? "tinted" : "clear"),
    reduceTransparency: overrides.reduceTransparency ?? !!queries.reduceTransparency?.matches,
    increaseContrast: overrides.increaseContrast ?? !!queries.increaseContrast?.matches,
    reduceMotion: overrides.reduceMotion ?? !!queries.reduceMotion?.matches
  };
}
function setEnvironment(env) {
  overrides = { ...overrides, ...env };
  for (const [k, v] of Object.entries(env)) if (v === void 0) delete overrides[k];
  refreshAll();
}
var host = { env: getEnvironment };
function refreshAll() {
  for (const lens of lenses.values()) lens.refresh();
  for (const c of containers.values()) c.set({});
}
var watching = false;
function watchEnvironment() {
  if (watching || typeof document === "undefined") return;
  watching = true;
  for (const q of Object.values(queries)) q?.addEventListener("change", refreshAll);
  new MutationObserver(refreshAll).observe(document.documentElement, { attributes: true, attributeFilter: ["data-glass-theme", "data-glass-appearance"] });
}
function observe(lens) {
  sizes ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize?.[0];
      lenses.get(e.target)?.resize(box ? box.inlineSize : e.contentRect.width, box ? box.blockSize : e.contentRect.height);
    }
  });
  attrs ??= new MutationObserver((records) => {
    for (const r of records) {
      const l = lenses.get(r.target);
      if (l) pending.add(l);
    }
    requestAnimationFrame(() => {
      const now = pending;
      pending = /* @__PURE__ */ new Set();
      for (const l of now) if (lenses.get(l.el) === l) l.refresh();
    });
  });
  sizes.observe(lens.el, { box: "border-box" });
  const filter = ["class", "data-glass", ...[...lens.el.attributes].map((a) => a.name).filter((n) => n.startsWith("data-glass-"))];
  attrs.observe(lens.el, { attributes: true, attributeFilter: filter });
}
function glass(el, options = {}) {
  installStyles();
  watchEnvironment();
  let lens = lenses.get(el);
  if (lens) lens.refresh(options);
  else {
    lens = new Lens(el, options, host);
    lenses.set(el, lens);
    observe(lens);
  }
  const l = lens;
  return {
    el,
    get options() {
      return l.options;
    },
    update: (o) => l.refresh(o),
    set: (o) => l.refresh(o),
    animate: (to, opts = {}) => tween(l, to, opts),
    refresh: () => l.refresh(),
    drawn: () => l.whenDrawn(),
    destroy: () => unglass(el)
  };
}
function container(el, options = {}) {
  installStyles();
  watchEnvironment();
  for (const member of el.querySelectorAll("[data-glass], [data-glass-member]")) unglass(member);
  const existing = containers.get(el);
  if (existing) {
    existing.set(options);
    return existing;
  }
  const c = new GlassContainer(el, { ...fromContainerData(el), ...options }, host);
  containers.set(el, c);
  return c;
}
function uncontainer(el) {
  containers.get(el)?.destroy();
  containers.delete(el);
}
function fromContainerData(el) {
  const spacing = parseFloat(el.dataset.glassContainer ?? "");
  return Number.isFinite(spacing) ? { spacing } : {};
}
function tween(l, to, { duration = 300, easing = "ease" }) {
  const keys = Object.keys(to).filter((k) => typeof to[k] === "number");
  const from = Object.fromEntries(keys.map((k) => [k, l.options[k]]));
  if (getEnvironment().reduceMotion) duration = 0;
  const probe = document.createElement("div").animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(duration, 1), easing, fill: "forwards" });
  probe.pause();
  const t0 = performance.now();
  return new Promise((done) => {
    const step = (now) => {
      const p = duration ? Math.min((now - t0) / duration, 1) : 1;
      probe.currentTime = p * Math.max(duration, 1);
      const e = Number(probe.effect.getComputedTiming().progress ?? p);
      const eased = Number.isFinite(e) ? e : p;
      l.refresh(Object.fromEntries(keys.map((k) => [k, from[k] + (to[k] - from[k]) * eased])));
      if (p < 1) requestAnimationFrame(step);
      else {
        l.refresh(Object.fromEntries(keys.map((k) => [k, to[k]])));
        done();
      }
    };
    requestAnimationFrame(step);
  });
}
function unglass(el) {
  const lens = lenses.get(el);
  if (!lens) return;
  sizes?.unobserve(el);
  lens.destroy();
  lenses.delete(el);
}
function glassOf(el) {
  return lenses.has(el) ? glass(el) : void 0;
}
function autoGlass(selector = "[data-glass]", options = {}, root = document.body) {
  const add = (node) => {
    if (node.nodeType !== 1) return;
    const el = node;
    const all = (sel) => el.matches(sel) ? [el, ...el.querySelectorAll(sel)] : [...el.querySelectorAll(sel)];
    for (const c of all("[data-glass-container]")) if (!containers.has(c)) container(c, options);
    for (const f of all(selector)) if (!lenses.has(f) && !f.closest("[data-glass-container]")) glass(f, options);
  };
  const mo = new MutationObserver((records) => {
    let removed = false;
    for (const r of records) {
      r.addedNodes.forEach(add);
      removed ||= r.removedNodes.length > 0;
      if (r.type === "attributes") {
        const el = r.target;
        if (el.matches(selector)) add(el);
        else if (lenses.has(el)) unglass(el);
      }
    }
    if (removed) {
      for (const el of [...lenses.keys()]) if (!el.isConnected) unglass(el);
      for (const el of [...containers.keys()]) if (!el.isConnected) uncontainer(el);
    }
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-glass", "data-glass-container"] });
  add(root);
  return {
    stop() {
      mo.disconnect();
    }
  };
}
hooks.glass = (el, options) => glass(el, options);
hooks.optionsOf = (el) => lenses.get(el)?.options;
hooks.reduceMotion = () => getEnvironment().reduceMotion;
function union2(elements, options = {}) {
  const parent = elements[0]?.parentElement;
  if (!parent) throw new Error("union: the elements need a parent");
  const rects = elements.map((e) => e.getBoundingClientRect());
  let gap = 0;
  rects.forEach((r, i) => {
    const near = Math.min(...rects.filter((_, j) => j !== i).map((q) => Math.max(q.left - r.right, r.left - q.right, q.top - r.bottom, r.top - q.bottom, 0)));
    if (Number.isFinite(near)) gap = Math.max(gap, near);
  });
  for (const e of elements) e.dataset.glassMember = "";
  return container(parent, { members: "[data-glass-member]", spacing: Math.max(gap * 2.5, 16), ...options });
}
function glassButton(el, style = "glass", options = {}) {
  const accent = getComputedStyle(el).getPropertyValue("--glass-accent").trim() || "rgb(0 122 255)";
  const base = { variant: "regular", shape: "capsule", interactive: true, zRadius: 24 };
  if (style === "prominent") {
    Object.assign(base, { fill: `color-mix(in srgb, ${accent} 82%, transparent)`, saturation: 0.6, chromAberration: 0 });
    el.style.color ||= "#fff";
  }
  return glass(el, { ...base, ...options });
}
export {
  DEFAULTS,
  GlassContainer,
  VARIANTS,
  autoGlass,
  container,
  getEnvironment,
  glass,
  glassButton,
  glassOf,
  materialize,
  morph,
  refreshAll,
  scrollEdge,
  setEnvironment,
  uncontainer,
  unglass,
  union2 as union
};
