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
    glassOf: () => glassOf,
    morph: () => morph,
    refreshAll: () => refreshAll,
    setEnvironment: () => setEnvironment,
    unglass: () => unglass
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
:where([data-liquid-glass]) { background-color: var(--lg-fill, transparent); box-shadow: var(--lg-shadow, none); }
:where([data-liquid-glass][data-lg-pressable]) { cursor: pointer; -webkit-tap-highlight-color: transparent; transition: scale 0.32s cubic-bezier(0.3, 1.6, 0.5, 1); }
:where([data-liquid-glass][data-lg-interactive]) { background-image: radial-gradient(circle at var(--lg-x, 50%) var(--lg-y, 50%), rgb(255 255 255 / var(--lg-glow, 0)), transparent 70%); }
:where([data-liquid-glass][data-lg-floating]) { touch-action: none; cursor: grab; user-select: none; }
:where([data-liquid-glass][data-lg-floating][data-lg-dragging]) { cursor: grabbing; }
`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  function supportsSvgBackdrop() {
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
  function sdf(px, py, hx, hy, radii) {
    const r = py < 0 ? px < 0 ? radii[0] : radii[1] : px < 0 ? radii[3] : radii[2];
    const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  }
  var clampRadii = (radii, w, h) => radii.map((r) => clamp(r, 0, Math.min(w, h) / 2));
  function shiftAt(px, py, s, o) {
    const hx = s.w / 2, hy = s.h / 2;
    const r = s.radii;
    const zR = Math.max(o.bevel, 1);
    const d = -sdf(px, py, hx, hy, r);
    const depth = smoothstep(0, zR, d);
    if (o.dome) {
      const k2 = o.refraction * depth * 0.35;
      return [-px * k2, -py * k2];
    }
    const e = 2;
    let gx = (height(-sdf(px + e, py, hx, hy, r), zR) - height(-sdf(px - e, py, hx, hy, r), zR)) / (2 * e);
    let gy = (height(-sdf(px, py + e, hx, hy, r), zR) - height(-sdf(px, py - e, hx, hy, r), zR)) / (2 * e);
    if (o.monotone && d < 2) {
      const g = Math.hypot(gx, gy) || 1, peak = slope(2, zR) * (1 + 0.02 * (2 - d));
      gx = gx / g * peak;
      gy = gy / g * peak;
    }
    const k = (1 - 1 / IOR) * (2 + 0.5 * height(o.monotone ? Math.max(d, 2) : d, zR) / zR) * o.refraction * 30;
    const m = o.magnify ? o.refraction * 4 * depth : 0;
    return [gx * k - px / Math.max(hx, 1) * m, gy * k - py / Math.max(hy, 1) * m];
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
  function boxShadow(opacity, spread, offsetY) {
    if (opacity <= 0) return "none";
    const s = Math.max(spread, 1);
    const a = (k) => +(k * opacity).toFixed(3);
    return `0 ${offsetY}px ${+(s * Math.SQRT2).toFixed(2)}px rgb(0 0 0 / ${a(0.65)}), 0 ${offsetY}px ${+(s * 0.35).toFixed(2)}px rgb(0 0 0 / ${a(0.35)})`;
  }

  // src/maps.ts
  var LIGHT_MID = 32;
  function lightImage(radii, bevel, shortHalf, o, scale) {
    if (o.fresnel <= 0 && o.edge <= 0 && o.specular <= 0) return null;
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
        const a = lightAt(d, right ? -nx : nx, bottom ? -ny : ny, top(y), shortHalf, zR, o);
        const cover = Math.min(Math.max(d * scale + 0.5, 0), 1);
        const k = (j * px + i) * 4;
        data[k] = data[k + 1] = data[k + 2] = 255;
        data[k + 3] = Math.round(255 * cover * a);
      }
    }
    return { width: px, height: px, data, slice: Math.round(e * scale), edge: e };
  }
  function tableMap(s, o, scale, N = 256) {
    const opt = { ...o, monotone: true };
    const hx = s.w / 2, hy = s.h / 2;
    const zR = Math.min(Math.max(o.bevel, 1), hx, hy);
    const margin = Math.ceil(2 / scale);
    const edgeShift = (axis, d) => {
      const dd = Math.max(d, 0.01);
      return axis === 0 ? shiftAt(dd - hx, 0, s, opt)[0] : shiftAt(0, dd - hy, s, opt)[1];
    };
    const W0 = 0.12, K = 2048;
    const tables = [0, 1].map((axis) => {
      const prof = new Float64Array(K + 1);
      for (let i = 0; i <= K; i++) prof[i] = edgeShift(axis, zR - (zR + margin) * (i / K));
      for (let i = 1; i <= K; i++) prof[i] = Math.max(prof[i], prof[i - 1] + 1e-6 * (prof[K] + 1));
      const start = Math.max(prof[0], 1e-6);
      const forward = (w) => {
        if (w <= W0) return w / W0 * start;
        const f = (w - W0) / (1 - W0) * K, i = Math.min(Math.floor(f), K - 1);
        return prof[i] + (prof[i + 1] - prof[i]) * (f - i);
      };
      const inverse = (t) => {
        if (t <= start) return t / start * W0;
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
    const width = Math.max(2, Math.round((s.w + 2 * margin) * scale)), height2 = Math.max(2, Math.round((s.h + 2 * margin) * scale));
    const fx = (s.w + 2 * margin) / width, fy = (s.h + 2 * margin) / height2;
    const valueAt = (px, py) => {
      const [x, y] = shiftAt(px, py, s, opt);
      return [encode(0, x), encode(1, y)];
    };
    const data = new Uint8ClampedArray(width * height2 * 4);
    for (let j = 0; j < height2; j++) {
      for (let i = 0; i < width; i++) {
        const px = (i + 0.5) * fx - margin - hx, py = (j + 0.5) * fy - margin - hy;
        const d = -sdf(px, py, hx, hy, s.radii);
        let v;
        if (d >= 0.5) v = valueAt(px, py);
        else {
          const n = normal(px, py, hx, hy, s.radii);
          const a = valueAt(px - n[0] * (0.5 - d), py - n[1] * (0.5 - d));
          const b = valueAt(px - n[0] * (1.5 - d), py - n[1] * (1.5 - d));
          v = [a[0] + (a[0] - b[0]) * (0.5 - d), a[1] + (a[1] - b[1]) * (0.5 - d)];
        }
        const k = (j * width + i) * 4;
        data[k] = Math.round(Math.min(Math.max(v[0], 0), 1) * 255);
        data[k + 1] = Math.round(Math.min(Math.max(v[1], 0), 1) * 255);
        data[k + 2] = 128;
        data[k + 3] = 255;
      }
    }
    const table = (axis) => Array.from({ length: N }, (_, k) => {
      const v = k / (N - 1), t = Math.sign(2 * v - 1) * tables[axis].forward(Math.abs(2 * v - 1));
      return +Math.min(0.5 + 0.5 * t / rimPx + 1 / 255, 1).toFixed(5);
    });
    return { width, height: height2, data, tableX: table(0), tableY: table(1), rimPx, margin };
  }
  function normal(px, py, hx, hy, radii) {
    const e = 0.05;
    const gx = sdf(px + e, py, hx, hy, radii) - sdf(px - e, py, hx, hy, radii);
    const gy = sdf(px, py + e, hx, hy, radii) - sdf(px, py - e, hx, hy, radii);
    const l = Math.hypot(gx, gy) || 1;
    return [gx / l, gy / l];
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
    button: false,
    bevelMode: 0,
    variant: null,
    tint: null,
    fill: null,
    shape: "rect",
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
    "pressBulge"
  ];
  var BOOLEANS = ["floating", "button", "interactive", "smooth", "magnify", "adaptive"];
  var STRINGS = ["variant", "tint", "fill", "shape", "press"];
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
    if (BOOLEANS.includes(key)) return v === "" || v === "true" || v === "1" || v === "yes";
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
  var MAP_SCALE = 0.2;
  var MAP_BUDGET = 6144;
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
    mapImage = null;
    mapTable = null;
    mapShift = null;
    colour = null;
    passes = [];
    stash = false;
    bends = false;
    // geometry and the current map
    w = 0;
    h = 0;
    radii = [0, 0, 0, 0];
    rimPx = 0;
    margin = 0;
    mapKey = "";
    lightKey = "";
    settleTimer = 0;
    // the pointer
    strength = 1;
    tween = 0;
    hover = false;
    pressed = false;
    flat = false;
    saved = {};
    off = [];
    constructor(el, js, host2) {
      this.el = el;
      this.js = js;
      this.host = host2;
      el.dataset.liquidGlass = this.id;
      for (const p of ["backdrop-filter", "border-image", "border-style", "border-width", "border-radius", "scale", "translate"]) this.saved[p] = el.style.getPropertyValue(p);
      this.refresh();
    }
    /** Read the options again (CSS custom properties, data attributes, `js` on top) and rebuild. */
    refresh(js) {
      if (js) this.js = { ...this.js, ...js };
      this.options = resolve([fromCss(getComputedStyle(this.el)), fromData(this.el), this.js], this.host.env());
      this.build();
      this.measure();
      this.bindPointer();
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
      this.pre = this.main = this.mapImage = this.mapTable = this.mapShift = this.colour = null;
      this.passes = [];
      this.mapKey = "";
      this.bends = supportsSvgBackdrop() && o.refraction > 0 && o.variant !== "identity";
      const sigma = blurSigma(o.blurAmount);
      if (!this.bends) {
        const css = [sigma > 0.01 ? `blur(${sigma.toFixed(2)}px)` : "", `saturate(${1 + o.saturation})`, `brightness(${(1.06 + o.brightness).toFixed(3)})`];
        this.el.style.setProperty("backdrop-filter", o.variant === "identity" ? "none" : css.filter(Boolean).join(" "));
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
        first.append(svgEl("feGaussianBlur", { in: src, stdDeviation: sigma.toFixed(2), edgeMode: "duplicate", result: "smooth" }));
        src = "smooth";
      } else if (o.smooth) {
        first.append(svgEl("feConvolveMatrix", { in: src, order: 3, kernelMatrix: "1 2 1 2 4 2 1 2 1", divisor: 16, edgeMode: "duplicate", preserveAlpha: "true", result: "smooth" }));
        src = "smooth";
      }
      if (o.distortion > 0) {
        first.append(
          svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: 0.9, numOctaves: 1, seed: 7, result: "noise0" }),
          svgEl("feColorMatrix", { in: "noise0", type: "matrix", values: "1 0 0 0 0  0 1 0 0 0  0 0 0 0 0.5  0 0 0 0 1", result: "noise" }),
          svgEl("feDisplacementMap", { in: src, in2: "noise", scale: (o.distortion * 8).toFixed(2), xChannelSelector: "R", yChannelSelector: "G", result: "grain" })
        );
        src = "grain";
      }
      this.mapImage = svgEl("feImage", { preserveAspectRatio: "none", x: 0, y: 0, width: 1, height: 1, result: "map0" });
      this.mapTable = svgEl(
        "feComponentTransfer",
        { in: "map0", result: fringe ? "side" : "map" },
        svgEl("feFuncR", { type: "table", tableValues: "0 1" }),
        svgEl("feFuncG", { type: "table", tableValues: "0 1" })
      );
      first.append(this.mapImage, this.mapTable);
      if (fringe) {
        first.append(svgEl("feMerge", {}, svgEl("feMergeNode", { in: src }), svgEl("feMergeNode", { in: "side" })));
        this.mapShift = svgEl("feOffset", { in: "SourceGraphic", dx: 0, dy: 0, result: "map" });
        second.append(this.mapShift);
        src = "SourceGraphic";
      }
      const pass = (result, spread) => {
        const node = svgEl("feDisplacementMap", { in: src, in2: "map", xChannelSelector: "R", yChannelSelector: "G", result });
        this.passes.push({ node, spread });
        return node;
      };
      if (fringe) {
        const a = o.chromAberration * ABERRATION;
        ["r", "g", "b"].forEach((ch, k) => second.append(
          pass(`${ch}0`, 1 + (k - 1) * a),
          svgEl("feColorMatrix", { in: `${ch}0`, type: "matrix", values: KEEP[k], result: ch })
        ));
        second.append(
          svgEl("feComposite", { in: "r", in2: "g", operator: "lighter", result: "rg" }),
          svgEl("feComposite", { in: "rg", in2: "b", operator: "lighter", result: "bent" })
        );
      } else {
        second.append(pass("bent", 1));
      }
      if (o.opacity < 1) {
        second.append(svgEl("feComposite", { in: "bent", in2: src, operator: "arithmetic", k2: o.opacity, k3: 1 - o.opacity }));
      }
      const defs2 = filterDefs();
      if (fringe) {
        defs2.append(first, second);
        this.pre = first;
        this.main = second;
        this.el.style.setProperty("backdrop-filter", `url(#${first.id}) url(#${second.id})`);
      } else {
        defs2.append(first);
        this.main = first;
        this.el.style.setProperty("backdrop-filter", `url(#${first.id})`);
      }
    }
    /** The colour matrix: saturation, brightness (6% always, as liquidglass's glass is, plus a button's hover) and tint. */
    matrix() {
      const o = this.options;
      const gains = tintGains(o.tintStrength, o.tint ? tintRgb(o.tint) : void 0);
      const hover = this.hover && o.button && !this.pressed ? 0.2 : 0;
      return colorMatrix(o.saturation, 0.06 + o.brightness + hover, gains).map((v) => +v.toFixed(4));
    }
    // ---------------------------------------------------------------- size, map and light
    layout(now) {
      const { w, h } = this;
      if (!w || !h) return;
      const o = this.options;
      const [radii, own] = this.cornerRadii();
      this.radii = radii;
      const radiusCss = own ? this.saved["border-radius"] : radii.map((r) => `${+r.toFixed(2)}px`).join(" ");
      if (this.el.style.borderRadius !== radiusCss) this.el.style.borderRadius = radiusCss;
      this.place();
      const deeper = this.pressed && o.press === "flatten" ? 1.2 : 1;
      this.el.style.setProperty("--lg-shadow", boxShadow(o.shadowOpacity * o.opacity, o.shadowSpread * deeper, o.shadowOffsetY));
      if (o.fill) this.el.style.setProperty("--lg-fill", o.fill);
      else this.el.style.removeProperty("--lg-fill");
      clearTimeout(this.settleTimer);
      if (now || !this.mapKey) this.draw();
      else this.settleTimer = window.setTimeout(() => this.draw(), SETTLE);
    }
    /** Size the filters, and put the map where it goes: past the element by its margin, and beside it when stashed. */
    place() {
      const { w, h } = this, m = this.margin;
      for (const f of [this.pre, this.main]) if (f) setAttrs(f, { x: 0, y: 0, width: w, height: h });
      if (!this.mapImage) return;
      const side = this.stash ? Math.ceil(w + m) + 32 : 0;
      setAttrs(this.mapImage, { x: side - m, y: -m, width: w + 2 * m, height: h + 2 * m });
      const holder = this.stash ? this.pre : this.main;
      if (holder) setAttrs(holder, { x: -m, y: -m, width: side + w + 2 * m, height: h + 2 * m });
      if (this.mapShift) setAttrs(this.mapShift, { dx: -side });
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
    draw() {
      const o = this.options;
      const { w, h, radii } = this;
      const zR = Math.min(o.zRadius * (this.flat ? 0.8 : 1), Math.min(w, h) / 2);
      if (this.bends && this.mapImage) {
        const scale = Math.min(MAP_SCALE, Math.sqrt(MAP_BUDGET / (w * h)));
        const key = [w, h, ...radii, zR, o.refraction, o.bevelMode, +o.magnify, scale].map((v) => Math.round(v * 4) / 4).join(":");
        if (key !== this.mapKey) {
          this.mapKey = key;
          const hit = mapCache.get(key) ?? remember(mapCache, key, (() => {
            const m = tableMap({ w, h, radii }, { refraction: o.refraction, bevel: zR, dome: o.bevelMode === 1, magnify: o.magnify }, scale);
            return { url: toDataURL(m), rimPx: m.rimPx, margin: m.margin, tables: [m.tableX.join(" "), m.tableY.join(" ")] };
          })());
          const image = this.mapImage, table = this.mapTable;
          predecode(hit.url).then(() => {
            if (this.mapKey !== key) return;
            image.setAttribute("href", hit.url);
            table?.children[0].setAttribute("tableValues", hit.tables[0]);
            table?.children[1].setAttribute("tableValues", hit.tables[1]);
            this.rimPx = hit.rimPx;
            this.margin = hit.margin;
            this.place();
            this.applyStrength();
          });
        }
      }
      this.drawLight(zR);
    }
    drawLight(zR) {
      const o = this.options;
      const { w, h, radii } = this;
      const shortHalf = Math.min(w, h) / 2;
      const scale = Math.min(2, Math.ceil(devicePixelRatio || 1));
      const lighting = { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular };
      const key = [...radii, zR, shortHalf, lighting.fresnel, lighting.edge, lighting.specular, scale, o.opacity, o.variant === "identity" ? 1 : 0].map((v) => Math.round(v * 4) / 4).join(":");
      if (key === this.lightKey) return;
      this.lightKey = key;
      let hit = lightCache.get(key);
      if (hit === void 0) {
        const img = o.variant === "identity" ? null : lightImage(radii, zR, shortHalf, lighting, scale);
        if (img && o.opacity < 1) for (let i = 3; i < img.data.length; i += 4) img.data[i] *= o.opacity;
        hit = remember(lightCache, key, img ? { url: toDataURL(img), slice: img.slice, edge: img.edge } : null);
      }
      const light = hit;
      const apply = () => {
        if (this.lightKey !== key) return;
        if (!light) {
          this.el.style.setProperty("border-image", this.saved["border-image"] || "");
          return;
        }
        if (getComputedStyle(this.el).borderTopStyle === "none") {
          this.el.style.setProperty("border-style", "solid");
          this.el.style.setProperty("border-width", "0");
        }
        this.el.style.setProperty("border-image", `url(${light.url}) ${light.slice} fill / ${light.edge}px`);
      };
      if (light) predecode(light.url).then(apply);
      else apply();
    }
    // ---------------------------------------------------------------- strength, hover, press, drag
    applyStrength() {
      for (const { node, spread } of this.passes) node.setAttribute("scale", String(+(2 * this.rimPx * spread * this.strength).toFixed(3)));
    }
    tweenStrength(to) {
      cancelAnimationFrame(this.tween);
      if (this.host.env().reduceMotion) {
        this.strength = to;
        this.applyStrength();
        return;
      }
      const from = this.strength, t0 = performance.now(), ms = 180;
      const step = (now) => {
        const p = Math.min((now - t0) / ms, 1);
        this.strength = from + (to - from) * (1 - (1 - p) ** 3);
        this.applyStrength();
        if (p < 1) this.tween = requestAnimationFrame(step);
      };
      this.tween = requestAnimationFrame(step);
    }
    setPressed(down) {
      if (this.pressed === down) return;
      this.pressed = down;
      const o = this.options;
      if (o.press === "bulge") this.tweenStrength(down ? 1 + o.pressBulge : 1);
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
        const target = o.button || o.interactive ? el : el.closest('button, label, [role="button"]') ?? el;
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
        on(el, "pointerdown", (e) => {
          if (e.button !== 0) return;
          const [tx = 0, ty = 0] = (el.style.translate || "0px 0px").split(" ").map((v) => parseFloat(v) || 0);
          start = { x: e.clientX, y: e.clientY, tx, ty, id: e.pointerId };
          el.setPointerCapture(e.pointerId);
          el.toggleAttribute("data-lg-dragging", true);
        });
        on(el, "pointermove", (e) => {
          if (!start || e.pointerId !== start.id) return;
          el.style.translate = `${start.tx + e.clientX - start.x}px ${start.ty + e.clientY - start.y}px`;
        });
        const end = (e) => {
          if (!start || e.pointerId !== start.id) return;
          start = null;
          el.toggleAttribute("data-lg-dragging", false);
          el.dispatchEvent(new CustomEvent("glassmove", { bubbles: true }));
        };
        on(el, "pointerup", end);
        on(el, "pointercancel", end);
      }
    }
    destroy() {
      clearTimeout(this.settleTimer);
      cancelAnimationFrame(this.tween);
      for (const f of this.off) f();
      this.pre?.remove();
      this.main?.remove();
      for (const [p, v] of Object.entries(this.saved)) {
        if (v) this.el.style.setProperty(p, v);
        else this.el.style.removeProperty(p);
      }
      for (const p of ["--lg-shadow", "--lg-fill", "--lg-x", "--lg-y", "--lg-glow"]) this.el.style.removeProperty(p);
      delete this.el.dataset.liquidGlass;
      for (const a of ["data-lg-pressable", "data-lg-interactive", "data-lg-floating", "data-lg-dragging"]) this.el.removeAttribute(a);
    }
  };
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

  // src/morph.ts
  function morph(_from, _to, _options = {}) {
    return Promise.resolve();
  }

  // src/container.ts
  var GlassContainer = class {
    constructor(el, options = {}) {
      this.el = el;
      this.options = options;
    }
    el;
    options;
  };
  var container = (el, options = {}) => new GlassContainer(el, options);

  // src/index.ts
  var lenses = /* @__PURE__ */ new Map();
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
      refresh: () => l.refresh(),
      destroy: () => unglass(el)
    };
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
      const found = el.matches(selector) ? [el, ...el.querySelectorAll(selector)] : [...el.querySelectorAll(selector)];
      for (const f of found) if (!lenses.has(f)) glass(f, options);
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
      }
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-glass"] });
    add(root);
    return {
      stop() {
        mo.disconnect();
      }
    };
  }
  return __toCommonJS(index_exports);
})();
