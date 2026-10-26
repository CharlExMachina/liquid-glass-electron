"use strict";
var LiquidGlass = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    DEFAULTS: () => DEFAULTS,
    GlassContainer: () => GlassContainer,
    VARIANTS: () => VARIANTS,
    autoGlass: () => autoGlass,
    container: () => container,
    getEnvironment: () => getEnvironment,
    glass: () => glass,
    glassButton: () => glassButton,
    glassGroup: () => glassGroup,
    glassOf: () => glassOf,
    materialize: () => materialize,
    morph: () => morph,
    refreshAll: () => refreshAll,
    scrollEdge: () => scrollEdge,
    setEnvironment: () => setEnvironment,
    uncontainer: () => uncontainer,
    unglass: () => unglass,
    union: () => union2
  });

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
    const [gx, gy, d] = gradient(f, x, y, zR);
    const depth = smoothstep(0, zR, d);
    if (o.dome) {
      const [tx, ty] = f.toward(x, y), k2 = o.refraction * depth * 0.35;
      return [tx * k2, ty * k2];
    }
    if (o.rim) {
      const t = clamp(d / zR, 0, 1), k2 = o.refraction * 0.5 * (1 - t) ** 2;
      const [tx, ty] = f.toward(x, y);
      return [tx * k2, ty * k2];
    }
    const k = (1 - 1 / IOR) * (2 + 0.5 * height(d, zR) / zR) * o.refraction * 30;
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
  function ownGrid(w, h, scale, margin) {
    const width = Math.max(2, Math.round((w + 2 * margin) * scale)), height2 = Math.max(2, Math.round((h + 2 * margin) * scale));
    return { x: -margin, y: -margin, px: (w + 2 * margin) / width, py: (h + 2 * margin) / height2, width, height: height2 };
  }
  function tableMap(f, o, scale, N = 256, fringe = 0, profile = f, grid = null) {
    const shift = (x, y) => {
      const [sx, sy] = shiftAt(x, y, f, o);
      if (!fringe) return [sx, sy];
      const [fx, fy] = fringeAt(x, y, f, o.bevel, Math.abs(fringe));
      return [sx + Math.sign(fringe) * fx, sy + Math.sign(fringe) * fy];
    };
    const zR = Math.min(Math.max(o.bevel, 1), f.shortHalf);
    const margin = Math.ceil(2 / scale);
    const g = grid ?? ownGrid(f.w, f.h, scale, margin);
    if (o.dome || o.rim) return smoothMap(f, shift, g, margin, N);
    const edgeShift = (axis, d) => {
      const [x, y] = profile.probe(axis, Math.max(d, 0.01));
      return (profile === f ? shift(x, y) : shiftAt(x, y, profile, o))[axis];
    };
    const K = 2048, iEdge = Math.round(zR / (zR + margin) * K);
    const tables = [0, 1].map((axis) => {
      const prof = new Float64Array(K + 1);
      for (let i = 0; i <= K; i++) prof[i] = edgeShift(axis, zR - (zR + margin) * (i / K));
      let peak = 0;
      for (let i = 1; i <= K; i++) if (prof[i] > prof[peak]) peak = i;
      const eps = 1e-6 * (prof[peak] + 1);
      for (let i = 1; i <= peak; i++) prof[i] = Math.max(prof[i], prof[i - 1] + eps);
      for (let i = peak + 1; i <= iEdge; i++) prof[i] = Math.min(prof[i], prof[i - 1] - eps);
      const start = Math.max(prof[0], 1e-6), W0 = start > 0.25 ? 0.12 : 0;
      const toW = (i) => W0 + i / K * (1 - W0);
      const forward = (w) => {
        if (w <= W0) return W0 ? w / W0 * start : 0;
        const t = (w - W0) / (1 - W0) * K, i = Math.min(Math.floor(t), K - 1);
        return prof[i] + (prof[i + 1] - prof[i]) * (t - i);
      };
      const search = (t, lo, hi) => {
        const up = prof[hi] > prof[lo];
        while (hi - lo > 1) {
          const m = lo + hi >> 1;
          if (prof[m] < t === up) lo = m;
          else hi = m;
        }
        return toW(lo + (t - prof[lo]) / (prof[hi] - prof[lo]));
      };
      const inverse = (t, d) => {
        const rising = W0 && t <= start ? t / start * W0 : t >= prof[peak] ? toW(peak) : search(t, 0, peak);
        const own = (zR - d) / (zR + margin) * K;
        if (own <= peak || peak >= iEdge || t >= prof[peak] || t < prof[iEdge]) return rising;
        const falling = search(t, peak, iEdge);
        return Math.abs(falling - toW(own)) < Math.abs(rising - toW(own)) ? falling : rising;
      };
      return { forward, inverse, top: prof[peak] };
    });
    const rimPx = Math.max(tables[0].top, tables[1].top, 1e-6);
    const encode = (axis, t, d) => 0.5 + 0.5 * Math.sign(t) * tables[axis].inverse(Math.abs(t), d);
    const valueAt = (x, y) => {
      const [sx, sy] = shift(x, y), d = -f.sdf(x, y);
      return [encode(0, sx, d), encode(1, sy, d)];
    };
    const far = -(1.5 / scale + 1);
    const { width, height: height2, data } = sampleBox(f, g, (x, y, d) => {
      if (d >= 0.5) return valueAt(x, y);
      if (d < far) return [0.5, 0.5];
      const n = normal(f, x, y);
      const a = valueAt(x - n[0] * (0.5 - d), y - n[1] * (0.5 - d));
      const b = valueAt(x - n[0] * (1.5 - d), y - n[1] * (1.5 - d));
      return [a[0] + (a[0] - b[0]) * (0.5 - d), a[1] + (a[1] - b[1]) * (0.5 - d)];
    }, (v) => Math.round(Math.min(Math.max(v, 0), 1) * 255));
    const table = (axis) => Array.from({ length: N }, (_, k) => {
      const v = k / (N - 1), t = Math.sign(2 * v - 1) * tables[axis].forward(Math.abs(2 * v - 1));
      return +Math.min(0.5 + 0.5 * t / rimPx + 1 / 255, 1).toFixed(5);
    });
    return { width, height: height2, data, tableX: table(0), tableY: table(1), tableB: SHAPE_TABLE, rimPx, margin, rect: gridRect(g), grid: g };
  }
  var gridRect = (g) => ({ x: g.x, y: g.y, w: g.width * g.px, h: g.height * g.py });
  var SHAPE_STEPS = 8;
  var shapeByte = (d) => Math.round(Math.min(Math.max(128 + SHAPE_STEPS * d, 0), 255));
  var SHAPE_TABLE = Array.from({ length: 256 }, (_, k) => +Math.min(Math.max((k - 128) / SHAPE_STEPS + 0.5, 0), 1).toFixed(4));
  function sampleBox(f, g, value, byte) {
    const { width, height: height2 } = g;
    const data = new Uint8ClampedArray(width * height2 * 4);
    for (let j = 0; j < height2; j++) {
      for (let i = 0; i < width; i++) {
        const x = g.x + (i + 0.5) * g.px, y = g.y + (j + 0.5) * g.py;
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
  function smoothMap(f, shift, g, margin, N) {
    const at = (x, y, d) => {
      if (d >= 0.5) return shift(x, y);
      const n = normal(f, x, y);
      return shift(x - n[0] * (0.5 - d), y - n[1] * (0.5 - d));
    };
    let rimPx = 1e-6;
    sampleBox(f, g, (x, y, d) => {
      const [sx, sy] = at(x, y, d);
      rimPx = Math.max(rimPx, Math.abs(sx), Math.abs(sy));
      return [0, 0];
    }, () => 0);
    const { width, height: height2, data } = sampleBox(f, g, (x, y, d) => {
      const [sx, sy] = at(x, y, d);
      return [128 + 127 * sx / rimPx, 128 + 127 * sy / rimPx];
    }, (v) => Math.round(Math.min(Math.max(v, 0), 255)));
    const identity = Array.from({ length: N }, (_, k) => +Math.min(k / (N - 1) + 0.5 / 255, 1).toFixed(5));
    return { width, height: height2, data, tableX: identity, tableY: identity, tableB: SHAPE_TABLE, rimPx, margin, rect: gridRect(g), grid: g };
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
    const shadowReach = Math.max(shadow.spread, 1) * 3 + Math.abs(shadow.offsetY) + 2;
    const cell = 8, cw = Math.ceil(width / cell), ch = Math.ceil(height2 / cell);
    const near2 = Math.max(reach, shadowReach) + cell / scale * Math.SQRT2;
    for (let cj = 0; cj < ch; cj++) {
      for (let ci = 0; ci < cw; ci++) {
        const i0 = ci * cell, j0 = cj * cell, i1 = Math.min(i0 + cell, width), j1 = Math.min(j0 + cell, height2);
        const cx = (i0 + i1) / 2 / scale - pad, cy = (j0 + j1) / 2 / scale - pad;
        const dc = -f.sdf(cx, cy);
        if (dc < -near2) continue;
        const inside = dc > near2;
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++) {
            const k = (j * width + i) * 4;
            if (inside) {
              mask[k + 3] = 255;
              if (lit || fill) paint(light, k, 1, lit ? flat : 0, fill);
              continue;
            }
            const x = (i + 0.5) / scale - pad, y = (j + 0.5) / scale - pad;
            const d = -f.sdf(x, y);
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
            if (cover < 1 && shadow.opacity > 0 && d > -shadowReach) {
              shade[k + 3] = Math.round(255 * (1 - cover) * boxShadowAlpha(-f.sdf(x, y - shadow.offsetY), shadow.opacity, shadow.spread));
            }
          }
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
    baseBrightness: 0.06,
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
    adaptive: true,
    group: true
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
    "baseBrightness",
    "shadowOpacity",
    "shadowSpread",
    "shadowOffsetY",
    "bevelMode",
    "pressBulge",
    "strength",
    "elasticity"
  ];
  var BOOLEANS = ["floating", "button", "interactive", "smooth", "magnify", "adaptive", "group"];
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
  var EDGE = 2;
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
    // where the map is, in the element's px (relative to the shape's part of the box), and the grid a group drew it on
    mapRect = null;
    mapGrid = null;
    grid = null;
    // how far past the edge the rim samples the backdrop, px: the filters reach that far
    reach = 0;
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
        this.changed();
        return;
      }
      this.live();
      const pointer = (o) => [o.floating, o.button, o.interactive, o.press].join();
      if (pointer(prev) !== pointer(this.options)) this.bindPointer();
      this.changed();
    }
    // ---------------------------------------------------------------- groups (glassGroup)
    /** Set by a group: called whenever what the filter draws may have changed. */
    onChange = null;
    /** Counts the changes, so a group can tell whether anything changed since it last looked. */
    version = 0;
    // while a group draws this element's glass, the element's own backdrop-filter is off
    batched = false;
    wanted = "none";
    changed() {
      this.version++;
      this.onChange?.();
    }
    setBackdrop(v) {
      this.wanted = v;
      const css = this.batched ? "none" : v;
      if (this.el.style.getPropertyValue("backdrop-filter") !== css) this.el.style.setProperty("backdrop-filter", css);
    }
    /** A group draws (true) or stops drawing (false) this element's glass: its own filter goes off or back on, at once. */
    setBatched(on) {
      if (on === this.batched) return;
      this.batched = on;
      this.setBackdrop(this.wanted);
    }
    /**
     * What a group needs to draw this element's glass in a filter of its own, or null if it can't: glass that doesn't
     * bend, a free shape, a dome's per-channel maps, noise (it's in the filter's coordinates), CSS filters in front, or no
     * map yet. `filters` are the element's own filter elements (the group copies them), `image` its map, `side` how far
     * the map is stashed beside the element, `margin` how far the filters reach past it.
     */
    batchSource() {
      const o = this.options;
      if (!this.bends || this.maps.length !== 1 || this.isFree() || this.shape || o.backdrop || o.distortion > 0 || this.amount() <= 0 || !this.main) return null;
      const map = this.maps[0];
      if (!map.image.getAttribute("href") || !map.rimPx || !this.mapGrid) return null;
      const first = this.pre ?? this.main;
      return {
        filters: this.pre ? [this.pre, this.main] : [this.main],
        image: map.image,
        table: map.table,
        shift: map.shift,
        side: map.shift ? -Number(map.shift.getAttribute("dx")) : 0,
        margin: -Number(first.getAttribute("x")),
        grid: this.mapGrid,
        mapMargin: this.margin
      };
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
        this.setBackdrop(o.variant === "identity" || s <= 0 ? "none" : this.cssBackdrop());
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
        this.setBackdrop(s > 0 ? this.filterCss : "none");
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
      return [o.backdrop ?? "", sigma > 0.01 ? `blur(${sigma.toFixed(2)}px)` : "", `saturate(${1 + o.saturation * s})`, `brightness(${(1 + ((1 + o.baseBrightness) * (1 + o.brightness) - 1) * s).toFixed(3)})`].filter(Boolean).join(" ");
    }
    /** The border-box size, as the ResizeObserver reported it. */
    resize(w, h) {
      if (!w || !h || Math.abs(w - this.w) < 0.01 && Math.abs(h - this.h) < 0.01) return;
      this.w = w;
      this.h = h;
      this.grid = null;
      this.layout(false);
    }
    /**
     * Draw the map on a group's grid (or its own again, with null): glass of the same size on one grid, whole map pixels
     * apart, shares one image in the group. The element draws that same map itself, so it looks the same in the group or
     * out of it. Resolves once it's on screen.
     */
    setGrid(grid) {
      const same = (a, b) => a === b || !!a && !!b && Object.keys(a).every((k) => Math.abs(a[k] - b[k]) < 1e-6);
      if (!same(grid, this.grid) && !same(grid, this.mapGrid) && !this.shape && !this.isFree()) {
        this.grid = grid;
        this.draw();
      }
      return this.whenDrawn();
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
      this.reach = 0;
      this.mapKey = "";
      this.bends = supportsSvgBackdrop() && o.refraction > 0 && o.variant !== "identity";
      const sigma = blurSigma(o.blurAmount);
      if (!this.bends) {
        this.filterCss = o.variant === "identity" ? "none" : this.cssBackdrop();
        this.setBackdrop(this.amount() > 0 ? this.filterCss : "none");
        return;
      }
      const region = { filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB", x: 0, y: 0, width: 1, height: 1 };
      const fringe = o.chromAberration > 0;
      this.stash = fringe;
      const first = svgEl("filter", { ...region, id: fringe ? `${this.id}a` : this.id });
      const second = fringe ? svgEl("filter", { ...region, id: this.id }) : first;
      let src = "SourceGraphic";
      if (sigma >= 0.5) {
        this.blurNode = svgEl("feGaussianBlur", { in: src, stdDeviation: (sigma * this.amount()).toFixed(2), edgeMode: "duplicate", result: "smooth" });
        first.append(this.blurNode);
        src = "smooth";
      } else if (o.smooth) {
        first.append(svgEl("feConvolveMatrix", { in: src, order: 3, kernelMatrix: "1 2 1 2 4 2 1 2 1", divisor: 16, edgeMode: "none", preserveAlpha: "true", result: "smooth" }));
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
      this.colour = svgEl("feColorMatrix", { in: src, type: "matrix", values: this.matrix().join(" "), result: "coloured" });
      first.append(this.colour);
      src = "coloured";
      const perChannel = fringe && o.bevelMode === 1;
      this.unitMaps = !perChannel;
      const fringes = perChannel ? [1, 0, -1].map((k) => k * o.chromAberration) : [0];
      const mergeNodes = [svgEl("feMergeNode", { in: src })];
      fringes.forEach((f, i) => {
        const image2 = svgEl("feImage", { preserveAspectRatio: "none", x: 0, y: 0, width: 1, height: 1, result: `map${i}raw` });
        const table = svgEl(
          "feComponentTransfer",
          { in: `map${i}raw`, result: fringe ? `side${i}` : `map${i}` },
          svgEl("feFuncR", { type: "table", tableValues: "0 1" }),
          svgEl("feFuncG", { type: "table", tableValues: "0 1" }),
          ...this.isFree() ? [svgEl("feFuncB", { type: "table", tableValues: "0 1" })] : []
        );
        first.append(image2, table);
        let shift = null;
        if (fringe) {
          mergeNodes.push(svgEl("feMergeNode", { in: `side${i}` }));
          shift = svgEl("feOffset", { in: "SourceGraphic", dx: 0, dy: 0, result: `map${i}` });
          second.append(shift);
        }
        this.maps.push({ image: image2, table, shift, fringe: f, rimPx: 0 });
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
      this.setBackdrop(this.amount() > 0 ? this.filterCss : "none");
    }
    /** The colour matrix: saturation, brightness (baseBrightness, 6% as liquidglass's glass is, plus a button's hover) and tint. */
    matrix() {
      const o = this.options;
      const gains = tintGains(o.tintStrength, o.tint ? tintRgb(o.tint) : void 0);
      const hover = this.hover && o.button && !this.pressed ? 0.2 : 0;
      const m = colorMatrix(o.saturation, (1 + o.brightness + hover) * (1 + o.baseBrightness) - 1, gains), s = this.amount();
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
      const r = this.region.w ? this.region : { x: 0, y: 0, w, h };
      const rect = this.mapRect ?? { x: -m, y: -m, w: r.w + 2 * m, h: r.h + 2 * m };
      const left = Math.ceil(Math.max(m, -(r.x + rect.x)) - 1e-6), right = Math.ceil(Math.max(m, r.x + rect.x + rect.w - w) - 1e-6);
      const e = Math.ceil(Math.max(left, right, -(r.y + rect.y), r.y + rect.y + rect.h - h, this.reach) - 1e-6);
      if (this.pre) setAttrs(this.main, { x: -EDGE, y: -EDGE, width: w + 2 * EDGE, height: h + 2 * EDGE });
      const stashed = !!this.pre, slot = Math.ceil(w + left + e) + 8;
      this.maps.forEach((map, i) => {
        const side = stashed ? slot * (i + 1) : 0;
        setAttrs(map.image, { x: side + r.x + rect.x, y: r.y + rect.y, width: rect.w, height: rect.h });
        if (map.shift) setAttrs(map.shift, { dx: -side });
      });
      setAttrs(this.pre ?? this.main, { x: -e, y: -e, width: (stashed ? slot * this.maps.length : 0) + w + right + e, height: h + 2 * e });
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
      const applies = [];
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
        const grid = this.shape || free ? null : this.grid;
        const key = [w, h, ...radii, zR, refraction, o.bevelMode, +o.magnify, scale, ...this.maps.map((m) => m.fringe)].map((v) => Math.round(v * 400) / 400).join(":") + (this.shape ? `|${this.shape.key()}` : "") + (free ? `|${o.shape}|${o.path}|${o.pathBox}|${o.cornerRadius}` : "") + (grid ? `|${Object.values(grid).join(",")}` : "");
        if (key !== this.mapKey) {
          this.mapKey = key;
          const entries = this.maps.map((map) => {
            const k = `${key}|${map.fringe}`;
            return mapCache.get(k) ?? remember(mapCache, k, (() => {
              const profile = free && o.shape === "path" ? roundedRect(w, h, [0, 0, 0, 0]) : sub;
              const m = tableMap(sub, { refraction, bevel: zR, dome: o.bevelMode === 1, rim: o.bevelMode === 2, magnify: o.magnify }, scale, moving ? 64 : 256, map.fringe, profile, grid);
              return { url: toDataURL(m), rimPx: m.rimPx, margin: m.margin, rect: m.rect, grid: m.grid, tables: [m.tableX.join(" "), m.tableY.join(" "), m.tableB.join(" ")] };
            })());
          });
          const maps = this.maps;
          applies.push(Promise.all(entries.map((e) => predecode(e.url))).then(() => () => {
            if (this.mapKey !== key || this.maps !== maps) return;
            entries.forEach((e, i) => {
              maps[i].image.setAttribute("href", e.url);
              maps[i].table.children[0].setAttribute("tableValues", e.tables[0]);
              maps[i].table.children[1].setAttribute("tableValues", e.tables[1]);
              maps[i].table.children[2]?.setAttribute("tableValues", e.tables[2]);
              maps[i].rimPx = e.rimPx;
            });
            this.margin = entries[0].margin;
            this.mapRect = entries[0].rect;
            this.mapGrid = entries[0].grid;
            this.region = region;
            this.place();
            this.applyStrength();
          }));
        }
      }
      applies.push(this.shape ? this.drawFieldLight(field, zR, moving, region) : free ? this.drawFreeLight(field, zR) : this.drawLight(zR));
      this.drawing = [Promise.all(applies).then((fns) => fns.forEach((f) => f?.()))];
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
      if (key === this.lightKey) return Promise.resolve(() => this.applyLight());
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
      return predecode(url).then(() => () => {
        if (this.lightKey !== key) return;
        this.lightUrl = { url, empty, free: pad };
        this.applyLight();
      });
    }
    /**
     * A shape's light, shadow and coverage, as images on the element (and its shadow layer), over the part of the box
     * the shape is in and its shadow's reach (positioned there; the rest has no glass). While the shape moves, at half
     * the resolution.
     */
    drawFieldLight(field, zR, moving, region) {
      const o = this.options, shape = this.shape;
      const scale = moving ? 0.35 : Math.min(2, Math.ceil(devicePixelRatio || 1));
      const fill = o.fill ? parseColour(o.fill, o.opacity) : null;
      const key = `${shape.key()}|${zR}|${o.fresnel}|${o.edgeHighlight}|${o.specular}|${o.shadowOpacity}|${o.shadowSpread}|${o.shadowOffsetY}|${o.opacity}|${scale}|${fill}`;
      if (key === this.lightKey) return Promise.resolve(() => this.applyLight());
      this.lightKey = key;
      const reach = o.shadowOpacity > 0 ? Math.ceil(Math.max(o.shadowSpread, 1) * 3 + Math.abs(o.shadowOffsetY)) + 2 : 2;
      const x0 = Math.max(Math.floor(region.x - reach), 0), y0 = Math.max(Math.floor(region.y - reach), 0);
      const x1 = Math.min(Math.ceil(region.x + region.w + reach), field.w), y1 = Math.min(Math.ceil(region.y + region.h + reach), field.h);
      const box = { x: x0, y: y0, w: Math.max(x1 - x0, 1), h: Math.max(y1 - y0, 1) };
      const img = fieldLight(
        within(field, box),
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
      return Promise.all(urls.map(predecode)).then(() => () => {
        if (this.lightKey !== key) return;
        this.lightUrl = { url: urls[0], shadow: urls[1], mask: urls[2], empty, field: true, box };
        this.applyLight();
      });
    }
    drawLight(zR) {
      const o = this.options;
      const { w, h, radii } = this;
      const shortHalf = Math.min(w, h) / 2;
      const scale = Math.min(2, Math.ceil(devicePixelRatio || 1));
      const lighting = { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular };
      const fill = o.fill ? parseColour(o.fill, o.opacity) : null;
      const key = [...radii, zR, shortHalf, lighting.fresnel, lighting.edge, lighting.specular, scale, o.opacity, o.variant === "identity" ? 1 : 0].map((v) => Math.round(v * 4) / 4).join(":") + `|${fill}`;
      if (key === this.lightKey) return Promise.resolve(() => this.applyLight());
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
      return light ? predecode(light.url).then(() => apply) : Promise.resolve(apply);
    }
    /**
     * The light at the current strength: the image cross-faded with a transparent one of the same size (so a 9-slice
     * still lines up), which is only a change of style, every frame if need be.
     */
    applyLight() {
      const light = this.lightUrl, s = this.amount();
      const image2 = (url, empty) => s >= 1 ? `url(${url})` : `-webkit-cross-fade(url(${empty}), url(${url}), ${+(s * 100).toFixed(2)}%)`;
      if (light?.field) {
        const b = light.box, at = `${b.x}px ${b.y}px`, size = `${b.w}px ${b.h}px`;
        for (const [el, url] of [[this.el, light.url], [this.shape.shadowEl, light.shadow]]) {
          Object.assign(el.style, { backgroundImage: image2(url, light.empty), backgroundPosition: at, backgroundSize: size, backgroundRepeat: "no-repeat" });
        }
        Object.assign(this.el.style, { maskImage: `url(${light.mask})`, maskPosition: at, maskSize: size, maskRepeat: "no-repeat" });
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
      this.el.style.setProperty("border-image", light.free !== void 0 ? `${image2(light.url, light.empty)} 0 fill / 0 / ${light.free}px stretch` : `${image2(light.url, light.empty)} ${light.slice} fill / ${light.edge}px`);
    }
    // ---------------------------------------------------------------- strength, hover, press, drag
    applyStrength() {
      this.changed();
      const k = this.bulge * this.amount() * (this.unitMaps ? this.options.refraction : 1);
      let most2 = 0;
      for (const { node, spread, map } of this.passes) {
        const scale = 2 * (this.maps[map]?.rimPx ?? 0) * spread * k;
        node.setAttribute("scale", String(+scale.toFixed(3)));
        most2 = Math.max(most2, Math.abs(scale) / 2);
      }
      const reach = Math.ceil((most2 + 1) / 4) * 4;
      if (this.pre && reach > this.reach) {
        this.reach = reach;
        this.place();
      }
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
      this.changed();
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
    drawn = "";
    pending = false;
    settle = 0;
    /**
     * Measure the members again and redraw the glass if they moved. One redraw at a time: while one is being decoded,
     * the next waits, and then draws the latest shape (so a fast drag skips shapes rather than queueing them).
     */
    update() {
      this.measure();
      if (!this.lens || this.key === this.drawn) return;
      if (this.drawn) {
        this.movingUntil = Math.max(this.movingUntil, performance.now() + 200);
        clearTimeout(this.settle);
        this.settle = window.setTimeout(() => {
          this.drawn = "";
          this.update();
        }, 220);
      }
      if (this.pending) return;
      this.drawn = this.key;
      this.pending = true;
      this.lens.reshape();
      this.lens.whenDrawn().finally(() => {
        this.pending = false;
        if (this.key !== this.drawn) this.update();
      });
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
          this.drawn = "";
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
      this.drawn = "";
      this.update();
    }
    destroy() {
      cancelAnimationFrame(this.running);
      clearTimeout(this.settle);
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

  // src/group.ts
  var SETTLE2 = 120;
  var MAX_SPREAD = 3;
  var nextGroup = 0;
  var EVENTS = ["transitionrun", "transitionend", "transitioncancel", "animationstart", "animationend", "animationcancel"];
  var GlassGroup = class {
    id = `lgg${++nextGroup}`;
    layer;
    host;
    members = [];
    pre = null;
    main = null;
    atlas = null;
    key = "";
    rendered = "";
    batch = /* @__PURE__ */ new Set();
    queued = false;
    settleTimer = 0;
    building = null;
    // where each member that waits to join was last seen, and since when: the image is drawn again once one of them has
    // held still for SETTLE ms, with those that have
    moved = /* @__PURE__ */ new Map();
    // the members the layer could draw, when last looked at
    sharing = /* @__PURE__ */ new Set();
    sizes;
    parent = null;
    savedParentPosition = null;
    destroyed = false;
    // made by glass() for siblings, not asked for: see unobstructed() and canPosition()
    implicit;
    children = null;
    clip = "";
    filter = "";
    // anything may have changed (the window, the parent's size): every member is measured again
    onEvent = () => {
      for (const m of this.members) m.look = null;
      this.schedule();
    };
    constructor(host2, implicit2 = false) {
      this.host = host2;
      this.implicit = implicit2;
      this.layer = document.createElement("div");
      this.layer.setAttribute("aria-hidden", "true");
      this.layer.dataset.lgLayer = "group";
      this.layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;margin:0;padding:0;border:0;";
      this.sizes = new ResizeObserver(this.onEvent);
      addEventListener("resize", this.onEvent);
      if (implicit2) this.children = new MutationObserver(this.onEvent);
    }
    /** The members, in no particular order. */
    get elements() {
      return this.members.map((m) => m.el);
    }
    has(el) {
      return this.members.some((m) => m.el === el);
    }
    add(el) {
      const lens = this.host.lensOf(el);
      if (!lens || this.has(el)) return;
      const m = { el, lens, version: -1, source: null, look: null, saved: el.style.getPropertyValue("isolation"), observer: null, watching: null, touch: () => {
        m.look = null;
        if (this.batch.has(el)) this.schedule();
        else this.later();
      } };
      lens.onChange = m.touch;
      m.observer = new MutationObserver(m.touch);
      m.observer.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
      for (const t of EVENTS) el.addEventListener(t, m.touch);
      this.sizes.observe(el);
      this.members.push(m);
      this.schedule();
    }
    remove(el) {
      const i = this.members.findIndex((m2) => m2.el === el);
      if (i < 0) return;
      const [m] = this.members.splice(i, 1);
      this.release(m);
      this.batch.delete(el);
      this.schedule();
    }
    release(m) {
      this.watch(m, false);
      m.lens.onChange = null;
      m.lens.setBatched(false);
      m.observer.disconnect();
      for (const t of EVENTS) m.el.removeEventListener(t, m.touch);
      this.sizes.unobserve(m.el);
      if (m.saved) m.el.style.setProperty("isolation", m.saved);
      else m.el.style.removeProperty("isolation");
    }
    lazy = 0;
    waiting = 0;
    /** Look at the members again once nothing has changed for a moment. */
    later() {
      clearTimeout(this.lazy);
      this.lazy = window.setTimeout(() => {
        this.lazy = 0;
        this.schedule();
      }, SETTLE2);
    }
    /** Look at the members again after the next change, before the frame is drawn. */
    schedule() {
      if (this.queued || this.destroyed) return;
      this.queued = true;
      queueMicrotask(() => {
        this.queued = false;
        if (!this.destroyed) this.reconcile();
      });
    }
    /** Resolves once every member's map and light are on screen and the group's image has caught up. */
    async whenDrawn() {
      for (let i = 0; i < 100; i++) {
        await Promise.all(this.members.map((m) => m.lens.whenDrawn()));
        await new Promise((r) => requestAnimationFrame(r));
        if (this.building) await this.building;
        else if (!this.settleTimer && !this.lazy && !this.queued && !this.waiting) return;
        else await new Promise((r) => setTimeout(r, SETTLE2 / 2));
      }
    }
    destroy() {
      this.destroyed = true;
      clearTimeout(this.settleTimer);
      clearTimeout(this.lazy);
      for (const m of this.members) this.release(m);
      this.members = [];
      this.sizes.disconnect();
      this.children?.disconnect();
      removeEventListener("resize", this.onEvent);
      this.layer.remove();
      this.pre?.remove();
      this.main?.remove();
      if (this.parent && this.savedParentPosition !== null) this.parent.style.position = this.savedParentPosition;
    }
    // ---------------------------------------------------------------- which members the layer draws
    /** The key of what a member's filter does, everything but where its map is. */
    sourceOf(m) {
      if (m.version === m.lens.version && m.source) return m.source;
      m.version = m.lens.version;
      const src = m.lens.batchSource();
      if (!src) return m.source = null;
      const parts = [];
      for (const f of src.filters) {
        for (const n of f.querySelectorAll("*")) {
          parts.push(n.tagName);
          for (const a of n.attributes) {
            if (n === src.image && (a.name === "x" || a.name === "y" || a.name === "width" || a.name === "height" || a.name === "href")) continue;
            if (n === src.shift && a.name === "dx") continue;
            if (n.parentNode === src.table && a.name === "tableValues") continue;
            if (n.tagName === "feDisplacementMap" && a.name === "scale") {
              parts.push(`scale=${Number(a.value).toFixed(2)}`);
              continue;
            }
            parts.push(`${a.name}=${a.value}`);
          }
        }
        parts.push("|");
      }
      const num = (a) => Number(src.image.getAttribute(a));
      const tables = [...src.table.children].map((f) => f.getAttribute("tableValues")).join("|");
      return m.source = { key: parts.join(" "), tables, src, map: { x: num("x") - src.side, y: num("y"), w: num("width"), h: num("height") }, href: src.image.getAttribute("href") };
    }
    /**
     * Whether the layer can draw this member's glass for it: nothing on the element that the glass would be painted
     * through (opacity, filter, mask, clip-path, blending: those apply to an element's backdrop filter too), no running
     * animation or transition, no transform but a translation, a box of its own size, the same parent as the others.
     */
    eligible(el, cs, rect) {
      if (el.parentElement !== this.parent || !rect.width || !rect.height) return false;
      if (Math.abs(rect.width - el.offsetWidth) > 0.5 || Math.abs(rect.height - el.offsetHeight) > 0.5) return false;
      if (cs.position === "sticky" || cs.opacity !== "1" || cs.filter !== "none" || cs.mixBlendMode !== "normal" || cs.maskImage !== "none" || cs.clipPath !== "none") return false;
      if (cs.rotate !== "none" || cs.scale !== "none" && cs.scale !== "1") return false;
      if (cs.transform !== "none" && !/^matrix\(1, 0, 0, 1, [-\d.e]+, [-\d.e]+\)$/.test(cs.transform)) return false;
      if (cs.visibility !== "visible" || cs.display === "none" || cs.display === "contents") return false;
      return !el.getAnimations().some((a) => a.playState === "running");
    }
    reconcile() {
      const parent = this.members[0]?.el.parentElement ?? null;
      if (parent !== this.parent) {
        this.children?.disconnect();
        if (parent) this.children?.observe(parent, { childList: true });
      }
      this.parent = parent;
      if (!this.parent) return;
      const lr = this.layer.getBoundingClientRect();
      const look = this.members.map((m) => {
        const source = this.sourceOf(m);
        if (!source) return { m, source, ok: false, fixed: false, z: "", box: null, radii: null };
        if (!m.look || m.look.version !== m.version) {
          const cs = getComputedStyle(m.el), rect = m.el.getBoundingClientRect();
          const box = { x: rect.left - lr.left, y: rect.top - lr.top, w: rect.width, h: rect.height };
          const { borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius } = cs;
          m.look = {
            version: m.version,
            ok: m.lens.options.group && this.eligible(m.el, cs, rect),
            fixed: cs.position === "fixed",
            z: cs.zIndex,
            box,
            // its rounded box, as Chromium clips its backdrop filter
            radii: { borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius }
          };
        }
        return { m, source, ...m.look };
      });
      const counts = /* @__PURE__ */ new Map();
      for (const l of look) if (l.ok) counts.set(l.source.key, (counts.get(l.source.key) ?? 0) + 1);
      const key = most(counts, this.key);
      const first = look.find((l) => l.ok && l.source.key === key);
      const candidates = look.filter((l) => l.ok && l.source.key === key && l.fixed === first.fixed && l.z === first.z);
      const boxes = [];
      const apart = candidates.filter((l) => {
        const r = l.box;
        if (boxes.some((b) => r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h)) return false;
        boxes.push(r);
        return true;
      });
      const sharing = this.implicit ? this.unobstructed(apart, lr) : apart;
      this.sharing = new Set(sharing.map((l) => l.m.el));
      const atlas = this.atlas;
      const sig = (l) => placeSig(l.source, l.box);
      const inLayer = atlas && first && atlas.fixed === first.fixed ? sharing.filter((l) => atlas.placed.get(l.m.el) === sig(l)) : [];
      const waiting = sharing.filter((l) => !inLayer.includes(l));
      this.waiting = sharing.length > 1 ? waiting.length : 0;
      const now = performance.now();
      for (const l of waiting) {
        const at = boxKey(l.box);
        if (this.moved.get(l.m.el)?.at !== at) this.moved.set(l.m.el, { at, since: now });
      }
      for (const el of this.moved.keys()) if (!waiting.some((l) => l.m.el === el)) this.moved.delete(el);
      if (waiting.length && !this.building && sharing.length > 1) {
        const ready = Math.min(...waiting.map((l) => this.moved.get(l.m.el).since)) + SETTLE2;
        clearTimeout(this.settleTimer);
        this.settleTimer = window.setTimeout(() => {
          this.settleTimer = 0;
          this.building = this.build(key).finally(() => {
            this.building = null;
            for (const m of this.members) m.look = null;
            this.schedule();
          });
        }, Math.max(ready - now, 0));
      }
      const batch = inLayer.length > 1 ? inLayer : [];
      this.key = key;
      if (batch.length) {
        const src = batch[0].source.src, id = `${key}|${src.side}|${devicePixelRatio}|${this.atlasId(atlas)}`;
        if (id !== this.rendered) {
          this.rendered = id;
          this.render(src, atlas);
        }
      }
      this.apply(new Set(batch.map((l) => l.m.el)), batch.map((l) => roundedBox(l.box.x, l.box.y, l.box.w, l.box.h, l.radii)).join(" "));
    }
    /**
     * The members nothing is painted between: the layer goes just before the first of them, and paints the backdrop as it
     * is there, so something painted after it but before a member (a positioned sibling between them, or a stacking
     * context) would be bent by that member on its own but not by the layer. Content in flow is painted before both.
     */
    unobstructed(list, lr) {
      if (list.length < 2) return list;
      const members = new Set(this.members.map((m) => m.el));
      const inDomOrder = (a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      const ordered = [...list].sort((a, b) => inDomOrder(a.m.el, b.m.el));
      const kept = [];
      const between = [];
      let node = [...members].filter((el) => el.parentElement === this.parent).sort(inDomOrder)[0] ?? null;
      for (const l of ordered) {
        for (; node && node !== l.m.el; node = node.nextElementSibling) {
          if (members.has(node) || node === this.layer) continue;
          for (const r of paintedWithGlass(node)) between.push({ x: r.left - lr.left, y: r.top - lr.top, w: r.width, h: r.height });
        }
        node = l.m.el.nextElementSibling;
        const e = l.source.src.margin, b = l.box;
        const x = b.x - e, y = b.y - e, w = b.w + 2 * e, h = b.h + 2 * e;
        if (!between.some((r) => r.x < x + w && x < r.x + r.w && r.y < y + h && y < r.y + r.h)) kept.push(l);
      }
      return kept.length > 1 ? kept : [];
    }
    atlasIds = /* @__PURE__ */ new WeakMap();
    atlasId(a) {
      let n = this.atlasIds.get(a);
      if (n === void 0) this.atlasIds.set(a, n = ++atlasCount);
      return n;
    }
    /** Who the layer draws now: its clip, and the members' own filters off (or back on), in one go. */
    apply(now, path) {
      const layer = this.layer;
      for (const m of this.members) {
        const on = now.has(m.el);
        m.lens.setBatched(on);
        this.watch(m, on);
        const iso = on ? "isolate" : m.saved;
        if (m.el.style.getPropertyValue("isolation") !== iso) {
          if (iso) m.el.style.setProperty("isolation", iso);
          else m.el.style.removeProperty("isolation");
        }
      }
      this.batch = now;
      const filter = !now.size ? "none" : this.pre ? `url(#${this.pre.id}) url(#${this.main.id})` : `url(#${this.main.id})`;
      if (now.size && path !== this.clip) {
        this.clip = path;
        layer.style.clipPath = `path('${path}')`;
      }
      if (filter !== this.filter) {
        this.filter = filter;
        layer.style.backdropFilter = filter;
      }
    }
    /**
     * Watch where a member the layer draws is. Most moves come through its style, class, size or events, which the group
     * listens to; the rest (a stylesheet rule, a layout shift among its siblings, an animation from script) would leave
     * the layer's glass behind. An IntersectionObserver whose root box is the member's own box (as Floating UI watches
     * for layout shifts) fires as soon as it moves by a px, for nothing per frame meanwhile.
     */
    watch(m, on) {
      if (!on) {
        m.watching?.io.disconnect();
        m.watching = null;
        return;
      }
      if (m.watching && m.watching.look === m.look) return;
      const cs = getComputedStyle(m.el), r = m.el.getBoundingClientRect();
      const cb = cs.position === "absolute" ? m.el.offsetParent : cs.position === "fixed" ? null : m.el.parentElement;
      const root = cb && cb !== document.body && cb !== document.documentElement ? cb : null;
      const box = root ? root.getBoundingClientRect() : { left: 0, top: 0 };
      const rx = box.left + (root?.clientLeft ?? 0), ry = box.top + (root?.clientTop ?? 0);
      const rw = root ? root.clientWidth : document.documentElement.clientWidth, rh = root ? root.clientHeight : document.documentElement.clientHeight;
      const at = [r.left - rx, r.top - ry, r.right - rx, r.bottom - ry, rw, rh].map((v) => Math.round(v)).join(",");
      if (m.watching?.at === at && m.watching.io.root === root) {
        m.watching.look = m.look;
        return;
      }
      m.watching?.io.disconnect();
      const px = (v) => `${Math.floor(v) + 1}px`;
      let first = true;
      const io = new IntersectionObserver((entries) => {
        if (first) {
          first = false;
          return;
        }
        if (entries.some((e) => e.intersectionRatio < 1)) m.touch();
      }, { root, threshold: 1, rootMargin: [-(r.top - ry), -(rx + rw - r.right), -(ry + rh - r.bottom), -(r.left - rx)].map(px).join(" ") });
      io.observe(m.el);
      m.watching = { io, at, look: m.look };
    }
    // ---------------------------------------------------------------- the layer's image and filter
    /**
     * The members the layer could draw that have held still for SETTLE ms (or are in its image already), as they are
     * now. A member that changes on its own is looked at only once it stops, so one that has moved since it was last
     * looked at starts waiting again here.
     */
    sharers(key) {
      const lr = this.layer.getBoundingClientRect(), now = performance.now();
      const out = [];
      for (const m of this.members) {
        const source = this.sourceOf(m);
        if (!source || source.key !== key || !this.sharing.has(m.el) || !m.lens.options.group) continue;
        const cs = getComputedStyle(m.el), rect = m.el.getBoundingClientRect();
        if (!this.eligible(m.el, cs, rect)) continue;
        const box = { x: rect.left - lr.left, y: rect.top - lr.top, w: rect.width, h: rect.height }, at = boxKey(box);
        const seen = this.moved.get(m.el);
        if (seen && seen.at !== at) this.moved.set(m.el, { at, since: now });
        if (seen && (seen.at !== at || now - seen.since < SETTLE2 - 1)) continue;
        out.push({ m, source, cs, rect, box });
      }
      return out;
    }
    /**
     * Members of the same size draw their maps on one grid, whole map pixels apart (each on its own too: see
     * Lens.setGrid), so one image holds all of them. The grid's pixels are a whole number of px, as close to the maps'
     * own as can be, and it starts `mapMargin` px before the first member: on elements at whole px, every map's
     * rectangle is then at whole px too (Skia takes another pass for an image whose place and size both aren't).
     */
    async align(looks) {
      const grids = [];
      await Promise.all(looks.map((l) => {
        const s = l.source, g = s.src.grid, mm = s.src.mapMargin;
        const px = Math.max(1, Math.floor(g.px + 1e-6)), py = Math.max(1, Math.floor(g.py + 1e-6));
        let ref = grids.find((r) => r.tables === s.tables && r.px === px && r.py === py);
        if (!ref) grids.push(ref = { tables: s.tables, px, py, x: l.rect.left - mm, y: l.rect.top - mm });
        const ix = Math.floor((l.rect.left - mm - ref.x) / px + 1e-6), iy = Math.floor((l.rect.top - mm - ref.y) / py + 1e-6);
        const x = ref.x + ix * px, y = ref.y + iy * py;
        const grid = {
          x: x - l.rect.left,
          y: y - l.rect.top,
          px,
          py,
          width: Math.ceil((l.rect.right + mm - x) / px - 1e-6),
          height: Math.ceil((l.rect.bottom + mm - y) / py - 1e-6)
        };
        return l.m.lens.setGrid(grid);
      }));
    }
    /** Draw the members that share a filter into the group's image, and put the layer over them. */
    async build(key) {
      const parent = this.parent;
      if (!parent) return;
      if (this.sharers(key).length < 2) return;
      await this.align(this.sharers(key));
      if (this.destroyed) return;
      let looks = this.sharers(key);
      if (this.implicit) looks = near(looks);
      if (looks.length < 2) return;
      const atlas = this.atlas;
      if (atlas && looks.every((l) => atlas.placed.get(l.m.el) === placeSig(l.source, l.box))) return;
      const fixed = looks[0].cs.position === "fixed";
      const x0 = Math.min(...looks.map((l) => l.rect.left)), y0 = Math.min(...looks.map((l) => l.rect.top));
      const w = Math.max(...looks.map((l) => l.rect.right)) - x0, h = Math.max(...looks.map((l) => l.rect.bottom)) - y0;
      const imgs = await Promise.all(looks.map((l) => image(l.source.href)));
      if (this.destroyed) return;
      const items = looks.map((l, i) => {
        const map = l.source.map, img = imgs[i];
        return { img, x: l.rect.left - x0 + map.x, y: l.rect.top - y0 + map.y, w: map.w, h: map.h, kx: img.naturalWidth / map.w, ky: img.naturalHeight / map.h, tables: l.source.tables, table: l.source.src.table };
      });
      const classes = classify(items).map((idx) => ({ kx: items[idx[0]].kx, ky: items[idx[0]].ky, table: items[idx[0]].table.cloneNode(true), items: idx.map((i) => items[i]) }));
      const drawn = await Promise.all(classes.map(async (c) => {
        const left = Math.min(...c.items.map((i) => i.x)), top = Math.min(...c.items.map((i) => i.y));
        const cw = Math.round(Math.max(...c.items.map((i) => (i.x - left + i.w) * c.kx))), ch = Math.round(Math.max(...c.items.map((i) => (i.y - top + i.h) * c.ky)));
        const cv = document.createElement("canvas");
        cv.width = Math.max(cw, 1);
        cv.height = Math.max(ch, 1);
        const ctx = cv.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        for (const i of c.items) ctx.drawImage(i.img, Math.round((i.x - left) * c.kx), Math.round((i.y - top) * c.ky));
        const url = cv.toDataURL();
        await predecode(url);
        return { url, x: left, y: top, w: cv.width / c.kx, h: cv.height / c.ky, table: c.table };
      }));
      if (this.destroyed) return;
      const mapMargin = Math.max(...looks.map((l) => -l.source.map.y));
      if (!fixed && getComputedStyle(parent).position === "static" && looks.every((l) => l.cs.position === "static" || l.cs.position === "relative")) {
        if (this.implicit && this.savedParentPosition === null && !canPosition(parent, new Set(looks.map((l) => l.m.el)))) return;
        this.savedParentPosition ??= parent.style.position;
        parent.style.position = "relative";
      }
      const placed = /* @__PURE__ */ new Map();
      this.atlas = { w, h, fixed, placed, classes: drawn, mapMargin };
      this.placeLayer(looks[0].cs, fixed, x0, y0, w, h);
      const lr = this.layer.getBoundingClientRect();
      for (const l of looks) {
        const r = l.m.el.getBoundingClientRect();
        if (Math.abs(r.left - lr.left - (l.rect.left - x0)) > 0.01 || Math.abs(r.top - lr.top - (l.rect.top - y0)) > 0.01) continue;
        placed.set(l.m.el, placeSig(l.source, { x: r.left - lr.left, y: r.top - lr.top, w: r.width, h: r.height }));
      }
    }
    /** The layer: the previous sibling of the first member, as big as the members' bounds, positioned as they are. */
    placeLayer(cs, fixed, x, y, w, h) {
      const layer = this.layer, first = this.members.map((m) => m.el).filter((el) => el.parentElement === this.parent).sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)[0];
      if (first && layer.nextElementSibling !== first) first.before(layer);
      layer.style.position = fixed ? "fixed" : "absolute";
      layer.style.zIndex = cs.position === "static" ? "auto" : cs.zIndex;
      Object.assign(layer.style, { width: `${w}px`, height: `${h}px` });
      const r = layer.getBoundingClientRect();
      const cx = r.left - (parseFloat(layer.style.left) || 0), cy = r.top - (parseFloat(layer.style.top) || 0);
      Object.assign(layer.style, { left: `${x - cx}px`, top: `${y - cy}px` });
    }
    /** The layer's filter: the members' own, with the group's image in place of a member's map. */
    render(src, atlas) {
      const defs2 = filterDefs();
      const wantPre = src.filters.length === 2;
      const make = (id) => {
        const f = svgEl("filter", { id });
        defs2.append(f);
        return f;
      };
      this.main ??= make(this.id);
      if (wantPre && !this.pre) this.pre = make(`${this.id}a`);
      if (!wantPre && this.pre) {
        this.pre.remove();
        this.pre = null;
      }
      const filters = wantPre ? [this.pre, this.main] : [this.main];
      src.filters.forEach((own, i) => {
        const f = filters[i];
        for (const a of own.attributes) if (a.name !== "id") f.setAttribute(a.name, a.value);
        f.replaceChildren(...[...own.children].map((n) => n.cloneNode(true)));
      });
      const ext = (f) => Math.max(0, ...atlas.classes.map(f));
      const e = Math.ceil(Math.max(src.margin, ext((c) => -c.x), ext((c) => -c.y), ext((c) => c.y + c.h - atlas.h)) - 1e-6);
      const m = Math.ceil(Math.max(atlas.mapMargin, ext((c) => c.x + c.w - atlas.w)) - 1e-6);
      let side = 0;
      if (src.shift) {
        side = Math.ceil(atlas.w + m + e) + 8;
        const d = devicePixelRatio || 1;
        for (let k = 0; k < 64 && Math.abs(side * d - Math.round(side * d)) > 1e-4; k++) side++;
      }
      const first = filters[0];
      const at = [...src.filters[0].children].indexOf(src.image), tableAt = [...src.filters[0].children].indexOf(src.table);
      const image2 = first.children[at], table = first.children[tableAt];
      const raw = image2.getAttribute("result"), out = table.getAttribute("result");
      const nodes = [];
      const merge = svgEl("feMerge", { result: out });
      atlas.classes.forEach((c, i) => {
        const im = image2.cloneNode(true);
        setAttrs(im, { x: side + c.x, y: c.y, width: c.w, height: c.h, href: c.url, result: `${raw}_${i}` });
        const t = c.table.cloneNode(true);
        setAttrs(t, { in: `${raw}_${i}`, result: atlas.classes.length > 1 ? `${out}_${i}` : out });
        nodes.push(im, t);
        merge.append(svgEl("feMergeNode", { in: `${out}_${i}` }));
      });
      if (atlas.classes.length > 1) nodes.push(merge);
      table.remove();
      image2.replaceWith(...nodes);
      if (src.shift) {
        const shiftAt2 = [...src.filters[1].children].indexOf(src.shift);
        filters[1].children[shiftAt2].setAttribute("dx", String(-side));
      }
      if (wantPre) {
        const edge = -Number(src.filters[1].getAttribute("x"));
        setAttrs(this.main, { x: -edge, y: -edge, width: atlas.w + 2 * edge, height: atlas.h + 2 * edge });
        setAttrs(this.pre, { x: -e, y: -e, width: side + atlas.w + m + e, height: atlas.h + 2 * e });
      } else {
        setAttrs(this.main, { x: -e, y: -e, width: atlas.w + m + e, height: atlas.h + 2 * e });
      }
    }
  };
  var atlasCount = 0;
  function paintedWithGlass(el) {
    const own = (e) => {
      const cs = getComputedStyle(e);
      return cs.position !== "static" || cs.zIndex !== "auto" || cs.opacity !== "1" || cs.transform !== "none" || cs.filter !== "none" || cs.backdropFilter !== "none" || cs.isolation === "isolate" || cs.mixBlendMode !== "normal" || cs.willChange !== "auto" || cs.clipPath !== "none" || cs.maskImage !== "none" || /paint|strict|content/.test(cs.contain);
    };
    const inside = el.getElementsByTagName("*");
    if (inside.length > 64) return [el.getBoundingClientRect()];
    return [el, ...inside].filter(own).map((e) => e.getBoundingClientRect());
  }
  function canPosition(parent, members) {
    const walk = document.createTreeWalker(parent, NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => members.has(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    for (let e = walk.nextNode(); e; e = walk.nextNode()) {
      if (getComputedStyle(e).position !== "absolute") continue;
      let inside = false;
      for (let a = e.parentElement; a && a !== parent; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.position !== "static" || cs.transform !== "none" || cs.filter !== "none" || cs.backdropFilter !== "none" || cs.perspective !== "none" || /layout|paint|strict|content/.test(cs.contain)) {
          inside = true;
          break;
        }
      }
      if (!inside) return false;
    }
    return true;
  }
  function classify(items) {
    const near2 = (v) => Math.abs(v - Math.round(v)) < 1e-4;
    const classes = [];
    const apart = (a, b) => {
      const px = 1 / a.kx, py = 1 / a.ky;
      return a.x + a.w + px <= b.x - px || b.x + b.w + px <= a.x - px || a.y + a.h + py <= b.y - py || b.y + b.h + py <= a.y - py;
    };
    items.forEach((it, i) => {
      const c = classes.find((c2) => {
        const o = items[c2[0]];
        return o.tables === it.tables && Math.abs(o.kx - it.kx) < 1e-9 && Math.abs(o.ky - it.ky) < 1e-9 && near2((it.x - o.x) * it.kx) && near2((it.y - o.y) * it.ky) && c2.every((j) => apart(items[j], it));
      });
      if (c) c.push(i);
      else classes.push([i]);
    });
    return classes;
  }
  function near(list) {
    const kept = [...list];
    for (; ; ) {
      const x0 = Math.min(...kept.map((l) => l.rect.left)), y0 = Math.min(...kept.map((l) => l.rect.top));
      const x1 = Math.max(...kept.map((l) => l.rect.right)), y1 = Math.max(...kept.map((l) => l.rect.bottom));
      if (kept.length < 2 || (x1 - x0) * (y1 - y0) <= MAX_SPREAD * kept.reduce((a, l) => a + l.rect.width * l.rect.height, 0)) return kept;
      const area = (l) => l.rect.width * l.rect.height, total = kept.reduce((a, l) => a + area(l), 0);
      const cx = kept.reduce((a, l) => a + (l.rect.left + l.rect.width / 2) * area(l), 0) / total;
      const cy = kept.reduce((a, l) => a + (l.rect.top + l.rect.height / 2) * area(l), 0) / total;
      const d = (l) => Math.hypot(l.rect.left + l.rect.width / 2 - cx, l.rect.top + l.rect.height / 2 - cy);
      kept.splice(kept.indexOf(kept.reduce((a, b) => d(b) > d(a) ? b : a)), 1);
    }
  }
  var boxKey = (b) => `${b.x.toFixed(2)},${b.y.toFixed(2)},${b.w.toFixed(2)},${b.h.toFixed(2)}`;
  function placeSig(s, b) {
    return `${s.href}|${b.x.toFixed(2)},${b.y.toFixed(2)},${b.w.toFixed(2)},${b.h.toFixed(2)},${s.map.x},${s.map.y},${s.map.w},${s.map.h}`;
  }
  function most(counts, current) {
    let key = current, best = counts.get(current) ?? 0;
    for (const [k, n] of counts) if (n > best) [key, best] = [k, n];
    return key;
  }
  var images = /* @__PURE__ */ new Map();
  async function image(url) {
    let img = images.get(url);
    if (!img) {
      img = new Image();
      img.src = url;
      if (images.size > 64) images.delete(images.keys().next().value);
      images.set(url, img);
    }
    await img.decode().catch(() => void 0);
    return img;
  }
  function roundedBox(x, y, w, h, cs) {
    const corner = (v) => {
      const [a, b = a] = v.split(" ");
      const px = (s, of) => s.endsWith("%") ? parseFloat(s) / 100 * of : parseFloat(s) || 0;
      return [px(a, w), px(b, h)];
    };
    const [tl, tr, br, bl] = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(corner);
    const f = Math.min(1, w / (tl[0] + tr[0] || 1), w / (bl[0] + br[0] || 1), h / (tl[1] + bl[1] || 1), h / (tr[1] + br[1] || 1));
    for (const c of [tl, tr, br, bl]) {
      c[0] *= f;
      c[1] *= f;
    }
    const n = (v) => +v.toFixed(3);
    return `M${n(x + tl[0])} ${n(y)}H${n(x + w - tr[0])}A${n(tr[0])} ${n(tr[1])} 0 0 1 ${n(x + w)} ${n(y + tr[1])}V${n(y + h - br[1])}A${n(br[0])} ${n(br[1])} 0 0 1 ${n(x + w - br[0])} ${n(y + h)}H${n(x + bl[0])}A${n(bl[0])} ${n(bl[1])} 0 0 1 ${n(x)} ${n(y + h - bl[1])}V${n(y + tl[1])}A${n(tl[0])} ${n(tl[1])} 0 0 1 ${n(x + tl[0])} ${n(y)}Z`;
  }

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
      autoGroup(el);
    }
    const l = lens;
    return {
      el,
      get options() {
        return l.options;
      },
      update: (o) => l.refresh(o),
      set: (o) => l.refresh(o),
      animate: (to, opts = {}) => tween([l], to, opts),
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
  function tween(ls, to, { duration = 300, easing = "ease" }) {
    const keys = Object.keys(to).filter((k) => typeof to[k] === "number");
    const froms = ls.map((l) => Object.fromEntries(keys.map((k) => [k, l.options[k]])));
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
        ls.forEach((l, i) => l.refresh(Object.fromEntries(keys.map((k) => [k, froms[i][k] + (to[k] - froms[i][k]) * eased]))));
        if (p < 1) requestAnimationFrame(step);
        else {
          for (const l of ls) l.refresh(Object.fromEntries(keys.map((k) => [k, to[k]])));
          done();
        }
      };
      requestAnimationFrame(step);
    });
  }
  function unglass(el) {
    const lens = lenses.get(el);
    if (!lens) return;
    leaveGroup(el);
    sizes?.unobserve(el);
    lens.destroy();
    lenses.delete(el);
  }
  function glassOf(el) {
    return lenses.has(el) ? glass(el) : void 0;
  }
  function autoGlass(selector = "[data-glass]", options = {}, root = document.body) {
    const made = /* @__PURE__ */ new Set();
    const add = (node) => {
      if (node.nodeType !== 1) return;
      const el = node;
      const all = (sel) => el.matches(sel) ? [el, ...el.querySelectorAll(sel)] : [...el.querySelectorAll(sel)];
      for (const c of all("[data-glass-container]")) if (!containers.has(c)) container(c, options);
      for (const f of all(selector)) {
        if (lenses.has(f) || f.closest("[data-glass-container]")) continue;
        glass(f, options);
        made.add(f);
      }
    };
    const drop = (el) => {
      unglass(el);
      made.delete(el);
    };
    const mo = new MutationObserver((records) => {
      let removed = false;
      for (const r of records) {
        r.addedNodes.forEach(add);
        removed ||= r.removedNodes.length > 0;
        if (r.type === "attributes") {
          const el = r.target;
          if (el.matches(selector)) add(el);
          else if (made.has(el)) drop(el);
        }
      }
      if (removed) {
        for (const el of [...made]) if (!el.isConnected) drop(el);
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
  var groups = /* @__PURE__ */ new Map();
  var implicit = /* @__PURE__ */ new Map();
  function autoGroup(el) {
    const parent = el.parentElement;
    if (!parent || groups.has(el)) return;
    let group = implicit.get(parent);
    if (!group) {
      const siblings = [...parent.children].filter((c) => c !== el && c instanceof HTMLElement && lenses.has(c) && !groups.has(c));
      if (!siblings.length) return;
      group = new GlassGroup({ lensOf: (e) => lenses.get(e) }, true);
      implicit.set(parent, group);
      for (const s of siblings) {
        groups.set(s, group);
        group.add(s);
      }
    }
    groups.set(el, group);
    group.add(el);
  }
  function leaveGroup(el) {
    const group = groups.get(el);
    if (!group) return;
    group.remove(el);
    groups.delete(el);
    if (!group.implicit || group.elements.length > 1) return;
    for (const [parent, g] of implicit) if (g === group) implicit.delete(parent);
    for (const m of group.elements) groups.delete(m);
    group.destroy();
  }
  function glassGroup(target, options = {}) {
    const els = target instanceof HTMLElement ? [...target.children].filter((c) => c instanceof HTMLElement && c.matches("[data-glass], [data-glass-member]")) : [...target];
    const group = new GlassGroup({ lensOf: (el) => lenses.get(el) });
    const add = (el, o = {}) => {
      leaveGroup(el);
      groups.set(el, group);
      const handle = glass(el, { ...options, ...o });
      group.add(el);
      return handle;
    };
    for (const el of els) add(el);
    const lensList = () => group.elements.map((el) => lenses.get(el)).filter((l) => !!l);
    return {
      get elements() {
        return group.elements;
      },
      set: (o) => lensList().forEach((l) => l.refresh(o)),
      update: (o) => lensList().forEach((l) => l.refresh(o)),
      animate: (to, opts = {}) => tween(lensList(), to, opts),
      refresh: () => {
        lensList().forEach((l) => l.refresh());
        group.schedule();
      },
      drawn: () => group.whenDrawn(),
      add,
      remove: (el) => {
        group.remove(el);
        groups.delete(el);
      },
      destroy: () => {
        const members = group.elements;
        group.destroy();
        for (const el of members) {
          groups.delete(el);
          unglass(el);
        }
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
      const near2 = Math.min(...rects.filter((_, j) => j !== i).map((q) => Math.max(q.left - r.right, r.left - q.right, q.top - r.bottom, r.top - q.bottom, 0)));
      if (Number.isFinite(near2)) gap = Math.max(gap, near2);
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
  return __toCommonJS(index_exports);
})();
