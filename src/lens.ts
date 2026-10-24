// One glass element: its filters, its maps, its light, and how it responds to the pointer.
//
// The bending is `backdrop-filter: url(#svg-filter)`: an feDisplacementMap there moves the pixels the compositor has
// already drawn behind the element, on the GPU. feDisplacementMap samples the nearest pixel, so where the rim squeezes
// the backdrop, the pixels turn to grain; the backdrop is smoothed first (a 3×3 kernel, or the frost blur when there
// is one). Smoothing before bending, not after, keeps the rim as crisp as liquidglass's.
//
// Chromium runs every node of every glass's filter again on every frame anything on the page changes, and a node read
// twice is computed twice (the filter graph is sent to the GPU process as a tree). Colour fringing bends each channel
// separately, three passes that all read the smoothed backdrop and the map; so with fringing there are two filters,
// chained: the first smooths the backdrop and draws the map beside it, and the second reads both from its input,
// which costs nothing to read again.
//
// The map is one small image of the whole element: per axis, a value laid out linearly in distance from the edge,
// which stretching reproduces exactly, and a lookup table (feComponentTransfer) that turns it into the bevel's steep
// shift (see tableMap). It's drawn again when the element's size settles; while it's changing, the old one stretches.
// Light doesn't bend: Fresnel, specular and edge light are a border-image, painted once and kept.
import { lightImage, tableMap } from './maps.ts';
import { ABERRATION, blurSigma, boxShadow, clampRadii, colorMatrix, tintGains, type Radii } from './optics.ts';
import { filterDefs, predecode, setAttrs, supportsSvgBackdrop, svgEl, toDataURL } from './dom.ts';
import { fromCss, fromData, resolve, type Environment, type GlassOptions } from './options.ts';

// Map pixels per CSS px, and at most this many pixels in a map: per-frame cost follows the map's bytes.
const MAP_SCALE = 0.2;
const MAP_BUDGET = 6144;
// How long a size has to hold before the map and light are drawn for it, ms.
const SETTLE = 120;
// Keeps the green channel only, and so on: the fringe's three passes are added up.
const KEEP = ['1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'];

let nextId = 0;
interface MapEntry { url: string; rimPx: number; margin: number; tables: [string, string] }
const mapCache = new Map<string, MapEntry>();
const lightCache = new Map<string, { url: string; slice: number; edge: number } | null>();
const remember = <K, V>(m: Map<K, V>, k: K, v: V) => {
  if (m.size > 200) m.delete(m.keys().next().value as K);
  m.set(k, v);
  return v;
};

export interface LensHost {
  env(): Environment;
}

export class Lens {
  readonly el: HTMLElement;
  readonly id = `lg${++nextId}`;
  options!: GlassOptions;
  private js: Partial<GlassOptions>;
  private host: LensHost;
  // the filters and the nodes that change
  private pre: SVGFilterElement | null = null;
  private main: SVGFilterElement | null = null;
  private mapImage: SVGFEImageElement | null = null;
  private mapTable: SVGFEComponentTransferElement | null = null;
  private mapShift: SVGFEOffsetElement | null = null;
  private colour: SVGFEColorMatrixElement | null = null;
  private passes: { node: SVGFEDisplacementMapElement; spread: number }[] = [];
  private stash = false;
  private bends = false;
  // geometry and the current map
  private w = 0;
  private h = 0;
  private radii: Radii = [0, 0, 0, 0];
  private rimPx = 0;
  private margin = 0;
  private mapKey = '';
  private lightKey = '';
  private settleTimer = 0;
  // the pointer
  private strength = 1;
  private tween = 0;
  private hover = false;
  private pressed = false;
  private flat = false;
  private saved: Record<string, string> = {};
  private off: (() => void)[] = [];

  constructor(el: HTMLElement, js: Partial<GlassOptions>, host: LensHost) {
    this.el = el;
    this.js = js;
    this.host = host;
    el.dataset.liquidGlass = this.id;
    for (const p of ['backdrop-filter', 'border-image', 'border-style', 'border-width', 'border-radius', 'scale', 'translate']) this.saved[p] = el.style.getPropertyValue(p);
    this.refresh();
  }

  /** Read the options again (CSS custom properties, data attributes, `js` on top) and rebuild. */
  refresh(js?: Partial<GlassOptions>) {
    if (js) this.js = { ...this.js, ...js };
    this.options = resolve([fromCss(getComputedStyle(this.el)), fromData(this.el), this.js], this.host.env());
    this.build();
    this.measure();
    this.bindPointer();
  }

  /** The border-box size, as the ResizeObserver reported it. */
  resize(w: number, h: number) {
    if (!w || !h || (Math.abs(w - this.w) < 0.01 && Math.abs(h - this.h) < 0.01)) return;
    this.w = w;
    this.h = h;
    this.layout(false);
  }

  private measure() {
    // the layout size, not the transformed one
    const r = this.el.getBoundingClientRect();
    this.w = this.el.offsetWidth || r.width;
    this.h = this.el.offsetHeight || r.height;
    this.layout(true);
  }

  // ---------------------------------------------------------------- the filters

  private build() {
    const o = this.options;
    this.pre?.remove();
    this.main?.remove();
    this.pre = this.main = this.mapImage = this.mapTable = this.mapShift = this.colour = null;
    this.passes = [];
    this.mapKey = '';
    this.bends = supportsSvgBackdrop() && o.refraction > 0 && o.variant !== 'identity';
    const sigma = blurSigma(o.blurAmount);

    if (!this.bends) {
      // No bending: the frost and colour as CSS functions (also what browsers other than Chromium get).
      const css = [sigma > 0.01 ? `blur(${sigma.toFixed(2)}px)` : '', `saturate(${1 + o.saturation})`, `brightness(${(1.06 + o.brightness).toFixed(3)})`];
      this.el.style.setProperty('backdrop-filter', o.variant === 'identity' ? 'none' : css.filter(Boolean).join(' '));
      return;
    }

    const region = { filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB', x: 0, y: 0, width: 1, height: 1 };
    const fringe = o.chromAberration > 0;
    this.stash = fringe;
    const first = svgEl('filter', { ...region, id: fringe ? `${this.id}a` : this.id });
    const second = fringe ? svgEl('filter', { ...region, id: this.id }) : first;

    // The backdrop: colour (free: Chromium folds it into the next node), smoothing or frost, and liquidglass's
    // micro-noise.
    this.colour = svgEl('feColorMatrix', { in: 'SourceGraphic', type: 'matrix', values: this.matrix().join(' '), result: 'coloured' });
    first.append(this.colour);
    let src = 'coloured';
    if (sigma >= 0.5) {
      first.append(svgEl('feGaussianBlur', { in: src, stdDeviation: sigma.toFixed(2), edgeMode: 'duplicate', result: 'smooth' }));
      src = 'smooth';
    } else if (o.smooth) {
      // a 3×3 binomial kernel: σ ≈ 0.7 px in one pass (a Gaussian takes two)
      first.append(svgEl('feConvolveMatrix', { in: src, order: 3, kernelMatrix: '1 2 1 2 4 2 1 2 1', divisor: 16, edgeMode: 'duplicate', preserveAlpha: 'true', result: 'smooth' }));
      src = 'smooth';
    }
    if (o.distortion > 0) {
      // each sample moved by up to ±2 × distortion px at random, as liquidglass's hash does
      first.append(
        svgEl('feTurbulence', { type: 'fractalNoise', baseFrequency: 0.9, numOctaves: 1, seed: 7, result: 'noise0' }),
        svgEl('feColorMatrix', { in: 'noise0', type: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 0 0 0.5  0 0 0 0 1', result: 'noise' }),
        svgEl('feDisplacementMap', { in: src, in2: 'noise', scale: (o.distortion * 8).toFixed(2), xChannelSelector: 'R', yChannelSelector: 'G', result: 'grain' }),
      );
      src = 'grain';
    }

    // The map: the image and its lookup tables.
    this.mapImage = svgEl('feImage', { preserveAspectRatio: 'none', x: 0, y: 0, width: 1, height: 1, result: 'map0' });
    this.mapTable = svgEl('feComponentTransfer', { in: 'map0', result: fringe ? 'side' : 'map' },
      svgEl('feFuncR', { type: 'table', tableValues: '0 1' }), svgEl('feFuncG', { type: 'table', tableValues: '0 1' }));
    first.append(this.mapImage, this.mapTable);
    if (fringe) {
      // beside the element, in filter 1's output; filter 2 reads it from there
      first.append(svgEl('feMerge', {}, svgEl('feMergeNode', { in: src }), svgEl('feMergeNode', { in: 'side' })));
      this.mapShift = svgEl('feOffset', { in: 'SourceGraphic', dx: 0, dy: 0, result: 'map' });
      second.append(this.mapShift);
      src = 'SourceGraphic';
    }

    const pass = (result: string, spread: number) => {
      const node = svgEl('feDisplacementMap', { in: src, in2: 'map', xChannelSelector: 'R', yChannelSelector: 'G', result });
      this.passes.push({ node, spread });
      return node;
    };
    if (fringe) {
      // Real glass bends blue further than red: each channel is bent by its own share of the shift, then they're
      // added up (an additive blend, the cheapest way Chromium has to add two images).
      const a = o.chromAberration * ABERRATION;
      ['r', 'g', 'b'].forEach((ch, k) => second.append(pass(`${ch}0`, 1 + (k - 1) * a),
        svgEl('feColorMatrix', { in: `${ch}0`, type: 'matrix', values: KEEP[k], result: ch })));
      second.append(svgEl('feComposite', { in: 'r', in2: 'g', operator: 'lighter', result: 'rg' }),
        svgEl('feComposite', { in: 'rg', in2: 'b', operator: 'lighter', result: 'bent' }));
    } else {
      second.append(pass('bent', 1));
    }
    if (o.opacity < 1) {
      // less glass: a mix with the (smoothed, coloured) backdrop
      second.append(svgEl('feComposite', { in: 'bent', in2: src, operator: 'arithmetic', k2: o.opacity, k3: 1 - o.opacity }));
    }

    const defs = filterDefs();
    if (fringe) {
      defs.append(first, second);
      this.pre = first;
      this.main = second;
      this.el.style.setProperty('backdrop-filter', `url(#${first.id}) url(#${second.id})`);
    } else {
      defs.append(first);
      this.main = first;
      this.el.style.setProperty('backdrop-filter', `url(#${first.id})`);
    }
  }

  /** The colour matrix: saturation, brightness (6% always, as liquidglass's glass is, plus a button's hover) and tint. */
  private matrix() {
    const o = this.options;
    const gains = tintGains(o.tintStrength, o.tint ? tintRgb(o.tint) : undefined);
    const hover = this.hover && o.button && !this.pressed ? 0.2 : 0;
    return colorMatrix(o.saturation, 0.06 + o.brightness + hover, gains).map((v) => +v.toFixed(4));
  }

  // ---------------------------------------------------------------- size, map and light

  private layout(now: boolean) {
    const { w, h } = this;
    if (!w || !h) return;
    const o = this.options;
    const [radii, own] = this.cornerRadii();
    this.radii = radii;
    // The corners are set on the element unless they're its own CSS ones already, so the page can still change those.
    const radiusCss = own ? this.saved['border-radius'] : radii.map((r) => `${+r.toFixed(2)}px`).join(' ');
    if (this.el.style.borderRadius !== radiusCss) this.el.style.borderRadius = radiusCss;
    this.place();
    const deeper = this.pressed && o.press === 'flatten' ? 1.2 : 1;
    this.el.style.setProperty('--lg-shadow', boxShadow(o.shadowOpacity * o.opacity, o.shadowSpread * deeper, o.shadowOffsetY));
    if (o.fill) this.el.style.setProperty('--lg-fill', o.fill);
    else this.el.style.removeProperty('--lg-fill');
    // The map and light are drawn for the settled size; meanwhile the old ones stretch.
    clearTimeout(this.settleTimer);
    if (now || !this.mapKey) this.draw();
    else this.settleTimer = window.setTimeout(() => this.draw(), SETTLE);
  }

  /** Size the filters, and put the map where it goes: past the element by its margin, and beside it when stashed. */
  private place() {
    const { w, h } = this, m = this.margin;
    for (const f of [this.pre, this.main]) if (f) setAttrs(f, { x: 0, y: 0, width: w, height: h });
    if (!this.mapImage) return;
    const side = this.stash ? Math.ceil(w + m) + 32 : 0;
    setAttrs(this.mapImage, { x: side - m, y: -m, width: w + 2 * m, height: h + 2 * m });
    // The image's rectangle is also its region, which Chromium clips to the filter's before fitting the image in it:
    // the filter that draws it reaches past the element by the margin too.
    const holder = this.stash ? this.pre : this.main;
    if (holder) setAttrs(holder, { x: -m, y: -m, width: side + w + 2 * m, height: h + 2 * m });
    if (this.mapShift) setAttrs(this.mapShift, { dx: -side });
  }

  /** The corner radii, and whether they're the element's own CSS ones (circular, in px). */
  private cornerRadii(): [Radii, boolean] {
    const o = this.options;
    const { w, h } = this;
    if (o.shape === 'capsule' || o.shape === 'circle') return [clampRadii([1e9, 1e9, 1e9, 1e9], w, h), false];
    if (o.shape === 'concentric') return [clampRadii(concentric(this.el), w, h), false];
    if (o.cornerRadius !== null) return [clampRadii([o.cornerRadius, o.cornerRadius, o.cornerRadius, o.cornerRadius], w, h), false];
    // The element's own border-radius; an elliptical or percentage corner is taken as circular, at its smaller radius.
    if (this.el.style.borderRadius !== this.saved['border-radius']) this.el.style.borderRadius = this.saved['border-radius'];
    const cs = getComputedStyle(this.el);
    let own = true;
    const corner = (v: string) => {
      const parts = v.split(' ');
      if (parts.length > 1 || v.endsWith('%')) own = false;
      return Math.min(...parts.map((p) => (p.endsWith('%') ? (parseFloat(p) / 100) * Math.min(w, h) : parseFloat(p) || 0)));
    };
    return [clampRadii([cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(corner), w, h), own];
  }

  private draw() {
    const o = this.options;
    const { w, h, radii } = this;
    const zR = Math.min(o.zRadius * (this.flat ? 0.8 : 1), Math.min(w, h) / 2);
    if (this.bends && this.mapImage) {
      const scale = Math.min(MAP_SCALE, Math.sqrt(MAP_BUDGET / (w * h)));
      const key = [w, h, ...radii, zR, o.refraction, o.bevelMode, +o.magnify, scale].map((v) => Math.round(v * 4) / 4).join(':');
      if (key !== this.mapKey) {
        this.mapKey = key;
        const hit = mapCache.get(key) ?? remember(mapCache, key, (() => {
          const m = tableMap({ w, h, radii }, { refraction: o.refraction, bevel: zR, dome: o.bevelMode === 1, magnify: o.magnify }, scale);
          return { url: toDataURL(m), rimPx: m.rimPx, margin: m.margin, tables: [m.tableX.join(' '), m.tableY.join(' ')] as [string, string] };
        })());
        const image = this.mapImage, table = this.mapTable;
        predecode(hit.url).then(() => {
          if (this.mapKey !== key) return;
          image.setAttribute('href', hit.url);
          table?.children[0].setAttribute('tableValues', hit.tables[0]);
          table?.children[1].setAttribute('tableValues', hit.tables[1]);
          this.rimPx = hit.rimPx;
          this.margin = hit.margin;
          this.place();
          this.applyStrength();
        });
      }
    }
    this.drawLight(zR);
  }

  private drawLight(zR: number) {
    const o = this.options;
    const { w, h, radii } = this;
    const shortHalf = Math.min(w, h) / 2;
    const scale = Math.min(2, Math.ceil(devicePixelRatio || 1));
    const lighting = { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular };
    const key = [...radii, zR, shortHalf, lighting.fresnel, lighting.edge, lighting.specular, scale, o.opacity, o.variant === 'identity' ? 1 : 0]
      .map((v) => Math.round(v * 4) / 4).join(':');
    if (key === this.lightKey) return;
    this.lightKey = key;
    let hit = lightCache.get(key);
    if (hit === undefined) {
      const img = o.variant === 'identity' ? null : lightImage(radii, zR, shortHalf, lighting, scale);
      if (img && o.opacity < 1) for (let i = 3; i < img.data.length; i += 4) img.data[i] *= o.opacity;
      hit = remember(lightCache, key, img ? { url: toDataURL(img), slice: img.slice, edge: img.edge } : null);
    }
    const light = hit;
    const apply = () => {
      if (this.lightKey !== key) return;
      if (!light) {
        this.el.style.setProperty('border-image', this.saved['border-image'] || '');
        return;
      }
      // border-image needs a border style to be drawn at all (any width, even 0); without a border of its own, the
      // element gets a solid one 0 px wide, so its layout doesn't move
      if (getComputedStyle(this.el).borderTopStyle === 'none') {
        this.el.style.setProperty('border-style', 'solid');
        this.el.style.setProperty('border-width', '0');
      }
      this.el.style.setProperty('border-image', `url(${light.url}) ${light.slice} fill / ${light.edge}px`);
    };
    if (light) predecode(light.url).then(apply);
    else apply();
  }

  // ---------------------------------------------------------------- strength, hover, press, drag

  private applyStrength() {
    for (const { node, spread } of this.passes) node.setAttribute('scale', String(+(2 * this.rimPx * spread * this.strength).toFixed(3)));
  }

  private tweenStrength(to: number) {
    cancelAnimationFrame(this.tween);
    if (this.host.env().reduceMotion) {
      this.strength = to;
      this.applyStrength();
      return;
    }
    const from = this.strength, t0 = performance.now(), ms = 180;
    const step = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      this.strength = from + (to - from) * (1 - (1 - p) ** 3);
      this.applyStrength();
      if (p < 1) this.tween = requestAnimationFrame(step);
    };
    this.tween = requestAnimationFrame(step);
  }

  private setPressed(down: boolean) {
    if (this.pressed === down) return;
    this.pressed = down;
    const o = this.options;
    // liquidglass's button: pressed, the bevel is 20% narrower and the shadow 20% wider; ours can bulge instead
    if (o.press === 'bulge') this.tweenStrength(down ? 1 + o.pressBulge : 1);
    if (o.press === 'flatten') {
      this.flat = down;
      this.layout(true);
    }
    if (o.interactive) {
      this.el.style.setProperty('scale', down && !this.host.env().reduceMotion ? '1.04' : this.saved.scale || '');
      this.el.style.setProperty('--lg-glow', down ? '0.35' : this.hover ? '0.12' : '0');
    }
    this.recolour();
  }

  private recolour() {
    this.colour?.setAttribute('values', this.matrix().join(' '));
  }

  private bindPointer() {
    for (const f of this.off) f();
    this.off = [];
    const el = this.el, o = this.options;
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      t.addEventListener(type, fn as EventListener);
      this.off.push(() => t.removeEventListener(type, fn as EventListener));
    };
    el.toggleAttribute('data-lg-pressable', o.button || o.interactive);
    el.toggleAttribute('data-lg-interactive', o.interactive);
    el.toggleAttribute('data-lg-floating', o.floating);
    if (o.button || o.interactive || (o.press !== null && o.press !== 'none')) {
      // A knob or lens doesn't take the pointer itself; the control around it does.
      const target = o.button || o.interactive ? el : (el.closest('button, label, [role="button"]') as HTMLElement | null) ?? el;
      on(target, 'pointerenter', () => {
        this.hover = true;
        if (o.interactive) el.style.setProperty('--lg-glow', '0.12');
        this.recolour();
      });
      on(target, 'pointerleave', () => {
        this.hover = false;
        el.style.removeProperty('--lg-glow');
        this.setPressed(false);
        this.recolour();
      });
      on(target, 'pointerdown', (e) => {
        if (e.button === 0) this.setPressed(true);
      });
      on(window, 'pointerup', () => this.setPressed(false));
      on(window, 'pointercancel', () => this.setPressed(false));
      on(target, 'keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') this.setPressed(true);
      });
      on(target, 'keyup', () => this.setPressed(false));
    }
    if (o.interactive) {
      // a light where the pointer is
      on(el, 'pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--lg-x', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty('--lg-y', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      });
    }
    if (o.floating) {
      let start: { x: number; y: number; tx: number; ty: number; id: number } | null = null;
      on(el, 'pointerdown', (e) => {
        if (e.button !== 0) return;
        const [tx = 0, ty = 0] = (el.style.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0);
        start = { x: e.clientX, y: e.clientY, tx, ty, id: e.pointerId };
        el.setPointerCapture(e.pointerId);
        el.toggleAttribute('data-lg-dragging', true);
      });
      on(el, 'pointermove', (e) => {
        if (!start || e.pointerId !== start.id) return;
        el.style.translate = `${start.tx + e.clientX - start.x}px ${start.ty + e.clientY - start.y}px`;
      });
      const end = (e: PointerEvent) => {
        if (!start || e.pointerId !== start.id) return;
        start = null;
        el.toggleAttribute('data-lg-dragging', false);
        el.dispatchEvent(new CustomEvent('glassmove', { bubbles: true }));
      };
      on(el, 'pointerup', end);
      on(el, 'pointercancel', end);
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
    for (const p of ['--lg-shadow', '--lg-fill', '--lg-x', '--lg-y', '--lg-glow']) this.el.style.removeProperty(p);
    delete this.el.dataset.liquidGlass;
    for (const a of ['data-lg-pressable', 'data-lg-interactive', 'data-lg-floating', 'data-lg-dragging']) this.el.removeAttribute(a);
  }
}

/** A CSS colour as RGB gains, scaled so its luma is 1 (a tint shouldn't darken or brighten the glass). */
function tintRgb(colour: string): [number, number, number] {
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillStyle = colour;
  const parsed = String(ctx.fillStyle);
  let rgb: number[];
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(parsed);
  if (hex) rgb = [hex[1], hex[2], hex[3]].map((x) => parseInt(x, 16) / 255);
  else {
    const fn = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(parsed);
    rgb = fn ? [+fn[1] / 255, +fn[2] / 255, +fn[3] / 255] : [1, 1, 1];
  }
  const luma = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] || 1;
  return rgb.map((c) => c / luma) as [number, number, number];
}

/**
 * Apple's concentric corners: the radius of the glass (or rounded box) this one sits in, less how far in it sits,
 * corner by corner; never below 4 px.
 */
function concentric(el: HTMLElement): number[] {
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
