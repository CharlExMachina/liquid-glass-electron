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
import { gridField, roundedRect, signedDistance, squircle, type Field } from './field.ts';
import { fieldLight, lightImage, tableMap, type MapGrid, type RGBA } from './maps.ts';
import { ABERRATION, blurSigma, boxShadow, clampRadii, colorMatrix, MAC_LENS_REACH, macFrost, macLensSize, macMaxLuma, outlineShadow, tintGains, type Radii } from './optics.ts';
import { encodeTables, filterDefs, greyDataURL, mapNodes, predecode, setAttrs, stashNodes, supportsSvgBackdrop, svgEl, toDataURL } from './dom.ts';
import { fromCss, fromData, MACOS_COLOUR, MACOS_SMALL_DARK, resolve, type Environment, type GlassOptions } from './options.ts';

// Map pixels per CSS px: about this many pixels in a map (per-frame cost follows its bytes), between 0.08 and 0.5 per
// px. Small glass gets a finer map, which is cheap, and its corners are most of it. The switch lens (bevelMode 3) has
// no tables to keep a coarse map exact, and folds within 3 px of its edge: it gets a pixel per device pixel (at least
// 2 per px), from a larger budget (it's only ever small).
const MAP_PIXELS = 4096, FINE_MAP_PIXELS = 65536;
const mapScale = (w: number, h: number, moving: boolean, fine = false) =>
  Math.min(Math.max(Math.sqrt((fine ? FINE_MAP_PIXELS : MAP_PIXELS) / (w * h)), 0.08), fine ? Math.max(devicePixelRatio, 2) : 0.5) / (moving ? 2 : 1);
// How far filter 2's region reaches past the element, px (less than any map's margin: see place())
const EDGE = 2;
// macOS's blur fill: its radius (8) as a Gaussian here, px, and its opacity (see filled)
const MAC_FILL_SIGMA = 15.6, MAC_FILL_OPACITY = 0.675;
const fillAlpha = (s: number) => `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${+(MAC_FILL_OPACITY * s).toFixed(4)} 0`;
// How long a size has to hold before the map and light are drawn for it, ms.
const SETTLE = 120;
// Keeps the green channel only, and so on: the fringe's three passes are added up.
const KEEP = ['1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'];

let nextId = 0;
interface MapEntry { urls: string[]; rimPx: number; margin: number; rect: { x: number; y: number; w: number; h: number }; grid: MapGrid; tables: { down: string; across: string; cover: string } }
const mapCache = new Map<string, MapEntry>();
const lightCache = new Map<string, { url: string; empty: string; slice: number; edge: number } | null>();
const remember = <K, V>(m: Map<K, V>, k: K, v: V) => {
  if (m.size > 200) m.delete(m.keys().next().value as K);
  m.set(k, v);
  return v;
};

export interface LensHost {
  env(): Environment;
}

/**
 * A shape other than the element's own rounded rectangle (a container's merged glass): the field for the element's
 * size, a key that changes when the shape does, and where its shadow goes. Its light and coverage are images.
 */
export interface ShapeSource {
  field(w: number, h: number): Field;
  key(): string;
  shadowEl: HTMLElement;
  /** how far the element reaches past the shape's box on each side, px (room for the shadow) */
  pad: number;
  /** while the shape moves: cheaper maps and light, drawn every frame */
  moving(): boolean;
  /** the part of the box the shape is in (the map covers only that), px */
  bounds(): { x: number; y: number; w: number; h: number };
  /** how many elements' worth of map pixels the shape gets (a container is one filter for all its members) */
  detail(): number;
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
  // One map, or with a dome's fringe three (red, green, blue: liquidglass's fringe doesn't follow the dome's shift)
  private maps: { images: SVGFEImageElement[]; tables: [SVGFEComponentTransferElement, SVGFEComponentTransferElement]; cover: SVGFEComponentTransferElement | null; shifts: SVGFEOffsetElement[]; fringe: number; rimPx: number }[] = [];
  private colour: SVGFEColorMatrixElement | null = null;
  // macOS's cap on dark glass's brightness: a table from the luma (in the colour's alpha) to how much it's dimmed
  private capNode: SVGFEComponentTransferElement | null = null;
  // macOS's blur fill: the wider blur, and its opacity
  private fillBlur: SVGFEGaussianBlurElement | null = null;
  private fillAlpha: SVGFEColorMatrixElement | null = null;
  private blurNode: SVGFEGaussianBlurElement | null = null;
  private mixNode: SVGFECompositeElement | null = null;
  // what backdrop-filter is while there's glass, the filter's structure (rebuilt only when it changes), and whether
  // the maps are drawn for refraction 1 (the shift is linear in it, so a scale stands for it)
  private filterCss = 'none';
  private structure = '';
  private unitMaps = true;
  private following = 0;
  private lightUrl: { url: string; empty: string; shadow?: string; mask?: string; box?: { x: number; y: number; w: number; h: number }; slice?: number; edge?: number; field?: boolean; free?: number } | null = null;
  private passes: { node: SVGFEDisplacementMapElement; source: SVGFEOffsetElement; spread: number; map: number }[] = [];
  private stash = false;
  private bends = false;
  // geometry and the current map
  private w = 0;
  private h = 0;
  private radii: Radii = [0, 0, 0, 0];
  private margin = 0;
  // where the map is, in the element's px (relative to the shape's part of the box), and the grid a group drew it on
  private mapRect: { x: number; y: number; w: number; h: number } | null = null;
  private mapGrid: MapGrid | null = null;
  private grid: MapGrid | null = null;
  // how far past the edge the rim samples the backdrop, px: the filters reach that far
  private reach = 0;
  private region = { x: 0, y: 0, w: 0, h: 0 };
  private mapKey = '';
  private lightKey = '';
  private settleTimer = 0;
  // the pointer
  private bulge = 1;
  private tween = 0;
  private hover = false;
  private pressed = false;
  private flat = false;
  private saved: Record<string, string> = {};
  private off: (() => void)[] = [];

  private shape: ShapeSource | null;

  constructor(el: HTMLElement, js: Partial<GlassOptions>, host: LensHost, shape: ShapeSource | null = null) {
    this.el = el;
    this.js = js;
    this.host = host;
    this.shape = shape;
    el.dataset.liquidGlass = this.id;
    for (const p of ['backdrop-filter', 'border-image', 'border-style', 'border-width', 'border-radius', 'scale', 'translate', 'transition']) this.saved[p] = el.style.getPropertyValue(p);
    // a CSS transition or animation of a --glass-* property: followed a frame at a time
    const start = (e: Event) => {
      if (e.target !== el) return;
      if (e instanceof TransitionEvent && !e.propertyName.startsWith('--glass')) return;
      this.follow();
    };
    el.addEventListener('transitionrun', start);
    el.addEventListener('animationstart', start);
    this.unlisten = () => {
      el.removeEventListener('transitionrun', start);
      el.removeEventListener('animationstart', start);
    };
    this.refresh();
  }

  private unlisten: () => void;

  /**
   * Read the options again (CSS custom properties, data attributes, `js` on top). Only a change to the filter's
   * structure rebuilds it; strength, refraction, fringe, frost, colour, light and shadow are attributes and styles, cheap
   * enough to change every frame.
   */
  refresh(js?: Partial<GlassOptions>) {
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
    const pointer = (o: GlassOptions) => [o.floating, o.button, o.interactive, o.press].join();
    if (pointer(prev) !== pointer(this.options)) this.bindPointer();
    this.changed();
  }

  // ---------------------------------------------------------------- groups (glassGroup)

  /** Set by a group: called whenever what the filter draws may have changed. */
  onChange: (() => void) | null = null;
  /** Counts the changes, so a group can tell whether anything changed since it last looked. */
  version = 0;
  // while a group draws this element's glass, the element's own backdrop-filter is off
  private batched = false;
  private wanted = 'none';

  private changed() {
    this.version++;
    this.onChange?.();
  }

  private setBackdrop(v: string) {
    this.wanted = v;
    const css = this.batched ? 'none' : v;
    if (this.el.style.getPropertyValue('backdrop-filter') !== css) this.el.style.setProperty('backdrop-filter', css);
  }

  /** A group draws (true) or stops drawing (false) this element's glass: its own filter goes off or back on, at once. */
  setBatched(on: boolean) {
    if (on === this.batched) return;
    this.batched = on;
    this.setBackdrop(this.wanted);
  }

  /**
   * What a group needs to draw this element's glass in a filter of its own, or null if it can't: glass that doesn't
   * bend, a free shape, a dome's per-channel maps, noise (it's in the filter's coordinates), CSS filters in front, or no
   * map yet. `filters` are the element's own filter elements (the group copies them), `images` its map's (a grey per
   * channel), `side` how far the map is stashed beside the element, `margin` how far the filters reach past it (and
   * `right`, past its right side, which can be further).
   */
  batchSource(): { filters: SVGFilterElement[]; images: SVGFEImageElement[]; tables: [SVGFEComponentTransferElement, SVGFEComponentTransferElement]; shifts: SVGFEOffsetElement[]; side: number; margin: number; right: number; grid: MapGrid; mapMargin: number } | null {
    const o = this.options;
    if (!this.bends || this.maps.length !== 1 || this.isFree() || this.shape || o.backdrop || o.distortion > 0 || this.amount() <= 0 || !this.main) return null;
    const map = this.maps[0];
    if (!map.images[0].getAttribute('href') || !map.rimPx || !this.mapGrid) return null;
    const first = this.pre ?? this.main;
    return {
      filters: this.pre ? [this.pre, this.main] : [this.main],
      images: map.images, tables: map.tables, shifts: map.shifts,
      side: map.shifts.length ? -Number(map.shifts[0].getAttribute('dx')) : 0,
      margin: -Number(first.getAttribute('x')),
      right: Number(first.getAttribute('width')) - this.w + Number(first.getAttribute('x')),
      grid: this.mapGrid, mapMargin: this.margin,
    };
  }

  /** What, in the options, decides which filter nodes there are. */
  private structureKey() {
    const o = this.options;
    const bends = supportsSvgBackdrop() && o.refraction > 0 && o.variant !== 'identity';
    return [bends, o.backdrop, o.chromAberration > 0, o.bevelMode, o.blurAmount > 0, o.smooth, o.distortion > 0, o.opacity < 1, o.variant === 'identity', o.magnify, this.isFree(), this.capped(), this.filled() ? (this.host.env().dark ? 'darken' : 'lighten') : ''].join();
  }

  /** A shape the element's own (rounded) box can't clip: the filter masks itself, and light and shadow are an image. */
  private isFree() {
    const o = this.options;
    return !this.shape && (o.shape === 'squircle' || (o.shape === 'path' && !!o.path));
  }

  /** A free shape's field, for the element's size. */
  private freeField(w: number, h: number): Field {
    const o = this.options;
    if (o.shape === 'squircle') return squircle(w, h, o.cornerRadius ?? (parseFloat(getComputedStyle(this.el).borderTopLeftRadius) || Math.min(w, h) / 4));
    return pathField(o.path!, o.pathBox, w, h);
  }

  /** Apply what changed without rebuilding: matrix, blur, fringe, strength, backdrop, light, shadow, size. */
  private live() {
    const o = this.options, s = this.amount();
    if (!this.bends) {
      this.setBackdrop(o.variant === 'identity' || s <= 0 ? 'none' : this.cssBackdrop());
    } else {
      this.recolour();
      this.blurNode?.setAttribute('stdDeviation', (this.frost() * s).toFixed(2));
      this.fillBlur?.setAttribute('stdDeviation', (MAC_FILL_SIGMA * s).toFixed(2));
      this.fillAlpha?.setAttribute('values', fillAlpha(s));
      this.mixNode?.setAttribute('k2', String(o.opacity));
      this.mixNode?.setAttribute('k3', String(1 - o.opacity));
      if (this.passes.length === 3 && this.unitMaps) {
        const a = o.chromAberration * ABERRATION;
        this.passes.forEach((p, k) => (p.spread = 1 + (k - 1) * a));
      }
      this.applyStrength();
      this.setBackdrop(s > 0 ? this.filterCss : 'none');
    }
    this.layout(true);
  }

  /** The strength, 0..1. */
  private amount() {
    return Math.min(Math.max(this.options.strength, 0), 1);
  }

  /** Follow running transitions and animations of --glass-* properties on the element, a frame at a time. */
  private follow() {
    if (this.following) return;
    const tick = () => {
      this.refresh();
      const running = this.el.getAnimations().some((a) => a.playState === 'running');
      this.following = running ? requestAnimationFrame(tick) : 0;
    };
    this.following = requestAnimationFrame(tick);
  }

  /** The frost and colour as CSS functions, scaled by the strength (glass that doesn't bend, and other browsers). */
  private cssBackdrop() {
    const o = this.options, s = this.amount(), sigma = this.frost() * s;
    const fns = [o.backdrop ?? '', sigma > 0.01 ? `blur(${sigma.toFixed(2)}px)` : '', `saturate(${1 + o.saturation * s})`, `brightness(${(1 + ((1 + o.baseBrightness) * (1 + o.brightness) - 1) * s).toFixed(3)})`];
    const m = Array.isArray(o.colorMatrix) ? o.colorMatrix : null;
    if (m) {
      // the colour matrix as near as CSS's functions get: its gain and offset for greys (contrast, then brightness:
      // b·(c·(x − ½) + ½)) and its saturation (a CSS saturate matrix's trace is 1 + 2s, times the gain)
      const g = (m[0] + m[1] + m[2] + m[4] + m[5] + m[6] + m[8] + m[9] + m[10]) / 3, off = (m[3] + m[7] + m[11]) / 3;
      const b = g + 2 * off, c = g / b, sat = ((m[0] + m[5] + m[10]) / g - 1) / 2;
      const mix = (v: number) => +(1 + (v - 1) * s).toFixed(3);
      fns.push(`saturate(${mix(sat)})`, `contrast(${mix(c)})`, `brightness(${mix(b)})`);
    }
    return fns.filter(Boolean).join(' ');
  }

  /** The border-box size, as the ResizeObserver reported it. */
  resize(w: number, h: number) {
    if (!w || !h || (Math.abs(w - this.w) < 0.01 && Math.abs(h - this.h) < 0.01)) return;
    this.w = w;
    this.h = h;
    // a group's grid was for the old size
    this.grid = null;
    this.layout(false);
  }

  /**
   * Draw the map on a group's grid (or its own again, with null): glass of the same size on one grid, whole map pixels
   * apart, shares one image in the group. The element draws that same map itself, so it looks the same in the group or
   * out of it. Resolves once it's on screen.
   */
  setGrid(grid: MapGrid | null): Promise<void> {
    const same = (a: MapGrid | null, b: MapGrid | null) => a === b || (!!a && !!b && (Object.keys(a) as (keyof MapGrid)[]).every((k) => Math.abs(a[k] - b[k]) < 1e-6));
    if (!same(grid, this.grid) && !same(grid, this.mapGrid) && !this.shape && !this.isFree()) {
      this.grid = grid;
      this.draw();
    }
    return this.whenDrawn();
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
    this.pre = this.main = this.colour = this.blurNode = this.mixNode = this.capNode = this.fillBlur = this.fillAlpha = null;
    this.maps = [];
    this.passes = [];
    this.reach = 0;
    this.mapKey = '';
    this.bends = supportsSvgBackdrop() && o.refraction > 0 && o.variant !== 'identity';
    const sigma = this.frost();

    if (!this.bends) {
      // No bending: the frost and colour as CSS functions (also what browsers other than Chromium get).
      this.filterCss = o.variant === 'identity' ? 'none' : this.cssBackdrop();
      this.setBackdrop(this.amount() > 0 ? this.filterCss : 'none');
      return;
    }

    const region = { filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB', x: 0, y: 0, width: 1, height: 1 };
    const fringe = o.chromAberration > 0;
    this.stash = fringe;
    const first = svgEl('filter', { ...region, id: fringe ? `${this.id}a` : this.id });
    const second = fringe ? svgEl('filter', { ...region, id: this.id }) : first;

    // The backdrop: smoothing or frost, liquidglass's micro-noise, and colour. The colour comes last: Skia folds a
    // colour matrix into the next node that samples once per pixel (the bend, the merge), but in front of a kernel that
    // samples nine times it draws it on its own first. (Smoothing and colour are both linear: in this order they give
    // the same, but for rounding, and for the brightest pixels, which the matrix clips.)
    let src = 'SourceGraphic';
    // Frost of any amount is a Gaussian, so that a transition of it (to frost glass as it goes, say) never changes the
    // filter's structure, which costs a frame or more; none at all is the 3×3 smoothing.
    if (o.blurAmount > 0) {
      this.blurNode = svgEl('feGaussianBlur', { in: src, stdDeviation: (sigma * this.amount()).toFixed(2), edgeMode: 'duplicate', result: 'smooth' });
      first.append(this.blurNode);
      if (this.filled()) {
        // macOS's blur fill (regular glass): a wider blur of the backdrop, laid over the frost at 0.675 by darken in
        // the dark, lighten in the light (its glassBackground's inputBlurFill*). With the wider blur's alpha at that
        // opacity, one blend is the mix: (1 − a) × frost + a × min(frost, wide) (or max).
        this.fillBlur = svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: (MAC_FILL_SIGMA * this.amount()).toFixed(2), edgeMode: 'duplicate', result: 'wide0' });
        this.fillAlpha = svgEl('feColorMatrix', { in: 'wide0', type: 'matrix', values: fillAlpha(this.amount()), result: 'wide' });
        first.append(this.fillBlur, this.fillAlpha, svgEl('feBlend', { in: 'wide', in2: 'smooth', mode: this.host.env().dark ? 'darken' : 'lighten', result: 'filled' }));
        src = 'filled';
      } else {
        src = 'smooth';
      }
    } else if (o.smooth) {
      // a 3×3 binomial kernel: σ ≈ 0.7 px in one pass (a Gaussian takes two). Its edge is left transparent: duplicating
      // it makes Skia draw the backdrop once more first, to clamp it, every frame. The bend reads that far out only for
      // a few corner pixels of glass without fringing, which change by 16/255 at most.
      first.append(svgEl('feConvolveMatrix', { in: src, order: 3, kernelMatrix: '1 2 1 2 4 2 1 2 1', divisor: 16, edgeMode: 'none', preserveAlpha: 'true', result: 'smooth' }));
      src = 'smooth';
    }
    if (o.distortion > 0) {
      // each sample moved by up to ±2 × distortion px at random, as liquidglass's hash does: noise fine enough to
      // differ from pixel to pixel, and strong enough that its spread matches
      first.append(
        svgEl('feTurbulence', { type: 'fractalNoise', baseFrequency: 1.6, numOctaves: 1, seed: 7, result: 'noise0' }),
        svgEl('feColorMatrix', { in: 'noise0', type: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 0 0 0.5  0 0 0 0 1', result: 'noise' }),
        svgEl('feDisplacementMap', { in: src, in2: 'noise', scale: (o.distortion * 14).toFixed(2), xChannelSelector: 'R', yChannelSelector: 'G', result: 'grain' }),
      );
      src = 'grain';
    }
    this.colour = svgEl('feColorMatrix', { in: src, type: 'matrix', values: this.matrix().join(' '), result: 'coloured' });
    first.append(this.colour);
    src = 'coloured';
    if (this.capped()) {
      // macOS keeps dark glass from getting bright, by the luma, keeping the hue: the colour matrix puts 0.5 + luma / 2
      // in alpha (never so small that the colour, premultiplied by it, loses its precision), a table turns that into
      // how much to dim, min(1, cap / luma), and laid over black the colour is multiplied by it. Skia folds the matrix
      // and the table into one colour filter, drawn with the composite.
      this.capNode = svgEl('feComponentTransfer', { in: src, result: 'dimmed' }, svgEl('feFuncA', { type: 'table', tableValues: this.capTable() }));
      first.append(this.capNode, svgEl('feFlood', { 'flood-color': '#000', 'flood-opacity': 1, result: 'black' }),
        svgEl('feComposite', { in: 'dimmed', in2: 'black', operator: 'over', result: 'capped0' }),
        // where the backdrop is transparent (a transparent or vibrant window's), the glass stays so
        svgEl('feComposite', { in: 'capped0', in2: 'SourceGraphic', operator: 'in', result: 'capped' }));
      src = 'capped';
    }

    // The map: the image and its lookup tables; with fringing, beside the element in filter 1's output, which
    // filter 2 reads from there.
    const perChannel = fringe && o.bevelMode === 1;
    this.unitMaps = !perChannel;
    const fringes = perChannel ? [1, 0, -1].map((k) => k * o.chromAberration) : [0];
    const mergeNodes = [svgEl('feMergeNode', { in: src })];
    fringes.forEach((f, i) => {
      const { images, nodes, tables, cover } = mapNodes(`map${i}raw`, fringe ? `side${i}` : `map${i}`, this.isFree() ? 3 : 2, fringe);
      first.append(...nodes);
      let shifts: SVGFEOffsetElement[] = [];
      if (fringe) {
        images.forEach((_, c) => mergeNodes.push(svgEl('feMergeNode', { in: `side${i}_${c}` })));
        const stashed = stashNodes(`map${i}`, images.length as 2 | 3);
        shifts = stashed.shifts;
        second.append(...stashed.nodes);
      }
      this.maps.push({ images, tables, cover, shifts, fringe: f, rimPx: 0 });
    });
    if (fringe) {
      first.append(svgEl('feMerge', {}, ...mergeNodes));
      src = 'SourceGraphic';
    }

    // a displacement, and its source moved by the quarter of its scale that the map's across channel starts from (see
    // mapNodes)
    const pass = (result: string, spread: number, map: number) => {
      const source = svgEl('feOffset', { in: src, dx: 0, dy: 0, result: `${result}in` });
      const node = svgEl('feDisplacementMap', { in: `${result}in`, in2: `map${map}`, xChannelSelector: 'A', yChannelSelector: 'R', result });
      this.passes.push({ node, source, spread, map });
      return [source, node];
    };
    if (fringe) {
      // Real glass bends blue further than red: each channel is bent by its own amount, then they're added up (an
      // additive blend, the cheapest way Chromium has to add two images). A pill's channels share one map, bent by
      // its own share of the shift each; a dome's have a map each, with liquidglass's fringe in it.
      const a = perChannel ? 0 : o.chromAberration * ABERRATION;
      ['r', 'g', 'b'].forEach((ch, k) => second.append(...pass(`${ch}0`, 1 + (k - 1) * a, perChannel ? k : 0),
        svgEl('feColorMatrix', { in: `${ch}0`, type: 'matrix', values: KEEP[k], result: ch })));
      second.append(svgEl('feComposite', { in: 'r', in2: 'g', operator: 'lighter', result: 'rg' }),
        svgEl('feComposite', { in: 'rg', in2: 'b', operator: 'lighter', result: 'bent' }));
    } else {
      second.append(...pass('bent', 1, 0));
    }
    if (o.opacity < 1) {
      // less glass: a mix with the (smoothed, coloured) backdrop
      this.mixNode = svgEl('feComposite', { in: 'bent', in2: src, operator: 'arithmetic', k2: o.opacity, k3: 1 - o.opacity, result: 'mixed' });
      second.append(this.mixNode);
    }
    if (this.isFree()) {
      // the shape: the map's blue channel is the distance to its edge, its table turned it into coverage; as alpha, it
      // cuts the glass to the shape (the backdrop shows through outside it, as if there were no element)
      second.append(svgEl('feComposite', { in: this.mixNode ? 'mixed' : 'bent', in2: 'map0_cover', operator: 'in' }));
    }

    const defs = filterDefs();
    if (fringe) {
      defs.append(first, second);
      this.pre = first;
      this.main = second;
      this.filterCss = `url(#${first.id}) url(#${second.id})`;
    } else {
      defs.append(first);
      this.main = first;
      this.filterCss = `url(#${first.id})`;
    }
    if (o.backdrop) this.filterCss = `${o.backdrop} ${this.filterCss}`;
    // at strength 0 there's no filter at all, so glass that's off costs nothing
    this.setBackdrop(this.amount() > 0 ? this.filterCss : 'none');
  }

  /**
   * The colour matrix: saturation, brightness (baseBrightness, 6% as liquidglass's glass is, plus a button's hover) and
   * tint, after `colorMatrix` if there is one; with macOS's cap on brightness, the luma in alpha too (see build).
   */
  private matrix() {
    const o = this.options;
    const gains = tintGains(o.tintStrength, o.tint ? tintRgb(o.tint) : undefined);
    const hover = this.hover && o.button && !this.pressed ? 0.2 : 0;
    let m = colorMatrix(o.saturation, (1 + o.brightness + hover) * (1 + o.baseBrightness) - 1, gains);
    let base = Array.isArray(o.colorMatrix) ? o.colorMatrix : null;
    const env = this.host.env(), gamut = env.wideGamut === false ? 'srgb' : 'p3';
    if (base && base === MACOS_COLOUR.regular[gamut][1] && o.bevelMode === 4 && this.w) {
      // macOS's own dark regular colour: small glass's below 104 px (from 64 px down, all of it)
      const t = Math.min(Math.max((Math.min(this.w, this.h) - 64) / 40, 0), 1), small = MACOS_SMALL_DARK[gamut], large = base;
      base = small.map((v, i) => v + (large[i] - v) * t);
    }
    if (base) {
      // m after base: each of m's rows of the base's rows, and its offset of their offsets
      const row = (r: number) => [0, 1, 2, 3].map((j) => m[r * 5] * base[j] + m[r * 5 + 1] * base[4 + j] + m[r * 5 + 2] * base[8 + j] + (j === 3 ? m[r * 5 + 4] : 0));
      m = [0, 1, 2].flatMap((r) => { const [a, b2, c, d] = row(r); return [a, b2, c, 0, d]; }).concat([0, 0, 0, 1, 0]);
    }
    const s = this.amount();
    const id = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    const out = m.map((v, i) => id[i] + (v - id[i]) * s);
    if (this.capped()) {
      const L = [0.2126, 0.7152, 0.0722];
      for (const j of [0, 1, 2, 4]) out[15 + j] = 0.5 * (L[0] * out[j] + L[1] * out[5 + j] + L[2] * out[10 + j]) + (j === 4 ? 0.5 : 0);
      out[18] = 0;
    }
    return out.map((v) => +v.toFixed(4));
  }

  /** Whether macOS's blur fill applies (regular glass, bevelMode 4). */
  private filled() {
    const o = this.options;
    return o.bevelMode === 4 && o.variant === 'regular' && o.blurAmount > 0;
  }

  /** Whether macOS's cap on dark regular glass's brightness applies. */
  private capped() {
    const o = this.options;
    return o.bevelMode === 4 && o.variant === 'regular' && this.host.env().dark;
  }

  /** The cap's table: from 0.5 + luma / 2 (in alpha) to the share of the colour kept, at the current strength. */
  private capTable() {
    const cap = 1 + (macMaxLuma(Math.min(this.w, this.h)) - 1) * this.amount();
    return Array.from({ length: 33 }, (_, k) => {
      const l = 2 * (k / 32) - 1;
      return +(l <= cap ? 1 : cap / l).toFixed(4);
    }).join(' ');
  }

  /** The frost, σ px: blurAmount's, and for macOS's glass (bevelMode 4) sized by the element as macOS sizes it. */
  private frost() {
    const o = this.options, sigma = blurSigma(o.blurAmount);
    if (o.bevelMode !== 4 || !this.w) return sigma;
    return sigma * macFrost(Math.min(this.w, this.h), o.variant === 'clear', this.host.env().dark);
  }

  // ---------------------------------------------------------------- size, map and light

  /** The shape changed (a container's members moved): draw it again now. */
  reshape() {
    this.measure();
  }

  private layout(now: boolean) {
    const { w, h } = this;
    if (!w || !h) return;
    const o = this.options;
    if (this.isFree()) {
      // the filter cuts the shape; the box's own corners mustn't cut into it
      this.el.style.borderRadius = '0';
      this.el.style.setProperty('--lg-shadow', 'none');
    } else if (!this.shape) {
      const [radii, own] = this.cornerRadii();
      this.radii = radii;
      // The corners are set on the element unless they're its own CSS ones already, so the page can still change those.
      const radiusCss = own ? this.saved['border-radius'] : radii.map((r) => `${+r.toFixed(2)}px`).join(' ');
      if (this.el.style.borderRadius !== radiusCss) this.el.style.borderRadius = radiusCss;
      const deeper = this.pressed && o.press === 'flatten' ? 1.2 : 1;
      const shadow = boxShadow(o.shadowOpacity * o.opacity * this.amount(), o.shadowSpread * deeper, o.shadowOffsetY), line = outlineShadow(o, this.amount());
      this.el.style.setProperty('--lg-shadow', [shadow, line].filter((v) => v !== 'none').join(', ') || 'none');
    }
    this.place();
    // macOS's frost and cap follow the size (and a group's copy of the filter has to follow them)
    if (o.bevelMode === 4) {
      if (!this.bends) this.setBackdrop(o.variant === 'identity' || this.amount() <= 0 ? 'none' : this.cssBackdrop());
      const set = (node: Element | null | undefined, k: string, v: string) => (node && node.getAttribute(k) !== v ? (node.setAttribute(k, v), 1) : 0);
      if (set(this.blurNode, 'stdDeviation', (this.frost() * this.amount()).toFixed(2)) + set(this.capNode?.firstElementChild, 'tableValues', this.capTable())
        + set(this.colour, 'values', this.matrix().join(' '))) this.changed();
    }
    // The map and light are drawn for the settled size; meanwhile the old ones stretch.
    clearTimeout(this.settleTimer);
    if (now || !this.mapKey) this.draw();
    else this.settleTimer = window.setTimeout(() => this.draw(), SETTLE);
  }

  /** Size the filters, and put the maps where they go: past the element by their margin, and beside it when stashed. */
  private place() {
    const { w, h } = this, m = this.margin;
    for (const f of [this.pre, this.main]) if (f) setAttrs(f, { x: 0, y: 0, width: w, height: h });
    if (!this.maps.length) return;
    // the map's rectangle: `m` past the shape's part of the box on each side, or a little more on a group's grid
    const r = this.region.w ? this.region : { x: 0, y: 0, w, h };
    const rect = this.mapRect ?? { x: -m, y: -m, w: r.w + 2 * m, h: r.h + 2 * m };
    // (in whole px: a region with a fractional edge costs Skia another pass)
    const left = Math.ceil(Math.max(m, -(r.x + rect.x)) - 1e-6), right = Math.ceil(Math.max(m, r.x + rect.x + rect.w - w) - 1e-6);
    // The rim samples the backdrop up to `reach` px past the edge: filter 1, which smooths it, reaches that far, and
    // the stashed maps sit beyond. Filter 2 reads all of filter 1's output whatever its own region, which only has to
    // cover the element (and a little more, for its antialiased edge), and to the right as far as the displacement
    // reads its moved source (see mapNodes): each shifted read of a stashed map then falls inside the map's own
    // margin, and Skia samples it in place. A read that reached past filter 1's region would be copied out first, a
    // pass per read.
    const e = Math.ceil(Math.max(left, right, -(r.y + rect.y), r.y + rect.y + rect.h - h, this.reach) - 1e-6);
    if (this.pre) setAttrs(this.main!, { x: -EDGE, y: -EDGE, width: w + EDGE + Math.max(EDGE, this.reach), height: h + 2 * EDGE });
    const stashed = !!this.pre, slot = Math.ceil(w + left + e) + 8;
    // stashed, each channel of each map has a slot of its own
    const channels = this.maps[0].images.length;
    this.maps.forEach((map, i) => map.images.forEach((image, c) => {
      const side = stashed ? slot * (i * channels + c + 1) : 0;
      setAttrs(image, { x: side + r.x + rect.x, y: r.y + rect.y, width: rect.w, height: rect.h });
      if (map.shifts[c]) setAttrs(map.shifts[c], { dx: -side });
    }));
    // An image's rectangle is also its region, which Chromium clips to the filter's before fitting the image in it:
    // the filter that draws the maps reaches past the element by the margin too.
    if (this.options.bevelMode === 4 && !stashed) {
      // macOS's lens only samples inward: past the left, top and bottom the filter reaches only as far as the map and
      // the frosts' tails do (2σ, at full strength, so a tween of it doesn't move the region); only to the right as far
      // as the displacement reads its moved source. A reach on every side would treble the region.
      const tail = Math.ceil(2 * Math.max(this.frost(), this.filled() ? MAC_FILL_SIGMA : 0));
      const s = Math.ceil(Math.max(left, -(r.y + rect.y), r.y + rect.y + rect.h - h, tail) - 1e-6);
      setAttrs(this.main!, { x: -s, y: -s, width: w + s + Math.ceil(Math.max(right, this.reach, tail) - 1e-6), height: h + 2 * s });
      return;
    }
    setAttrs((this.pre ?? this.main)!, { x: -e, y: -e, width: (stashed ? slot * this.maps.length * channels : 0) + w + Math.max(right, this.reach) + e, height: h + 2 * e });
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

  /** Resolves once the map and light asked for so far are on screen. */
  whenDrawn(): Promise<void> {
    return Promise.all(this.drawing).then(() => undefined);
  }

  private drawing: Promise<unknown>[] = [];

  private draw() {
    // the map, light (and a container's mask) go on screen together, once all are decoded, so they always match
    const applies: Promise<(() => void) | void>[] = [];
    const o = this.options;
    const { w, h, radii } = this;
    const free = this.isFree();
    const field = this.shape ? this.shape.field(w, h) : free ? this.freeField(w, h) : roundedRect(w, h, radii);
    const moving = !!this.shape?.moving();
    // macOS's lens is sized by the element; it reaches a few × its height in
    const mac = o.bevelMode === 4 ? macLensSize(2 * field.shortHalf, o.variant === 'clear', o.zRadius * (this.flat ? 0.8 : 1)) : undefined;
    const zR = Math.min(mac ? mac.height * MAC_LENS_REACH : o.zRadius * (this.flat ? 0.8 : 1), field.shortHalf);
    // the map covers the shape's part of the box (all of it, for a rounded rectangle)
    const region = this.shape?.bounds() ?? { x: 0, y: 0, w, h };
    const sub = region.x || region.y || region.w !== w || region.h !== h ? within(field, region) : field;
    if (this.bends && this.maps.length) {
      const scale = mapScale(region.w / Math.sqrt(this.shape?.detail() ?? 1), region.h, moving, o.bevelMode === 3);
      const refraction = this.unitMaps ? 1 : o.refraction;
      const grid = this.shape || free ? null : this.grid;
      const key = [w, h, ...radii, zR, refraction, o.bevelMode, +o.magnify, scale, mac?.amount ?? 0, mac?.height ?? 0, ...this.maps.map((m) => m.fringe)].map((v) => Math.round(v * 400) / 400).join(':')
        + (this.shape ? `|${this.shape.key()}` : '') + (free ? `|${o.shape}|${o.path}|${o.pathBox}|${o.cornerRadius}` : '') + (grid ? `|${Object.values(grid).join(',')}` : '');
      if (key !== this.mapKey) {
        this.mapKey = key;
        const entries = this.maps.map((map) => {
          const k = `${key}|${map.fringe}`;
          return mapCache.get(k) ?? remember(mapCache, k, (() => {
            // a path's edges are anywhere: its tables come from a plain box's straight edges
            const profile = free && o.shape === 'path' ? roundedRect(w, h, [0, 0, 0, 0]) : sub;
            const m = tableMap(sub, { refraction, bevel: zR, dome: o.bevelMode === 1, rim: o.bevelMode === 2, minify: o.bevelMode === 3, mac, magnify: o.magnify }, scale, moving ? 64 : 256, map.fringe, profile, grid);
            return { urls: [0, 1, 2].slice(0, free ? 3 : 2).map((c) => greyDataURL(m, c)), rimPx: m.rimPx, margin: m.margin, rect: m.rect, grid: m.grid, tables: { ...encodeTables(m.tableX, m.tableY, m.bias), cover: m.tableB.join(' ') } };
          })());
        });
        const maps = this.maps;
        applies.push(Promise.all(entries.flatMap((e) => e.urls.map(predecode))).then(() => () => {
          if (this.mapKey !== key || this.maps !== maps) return;
          entries.forEach((e, i) => {
            maps[i].images.forEach((image, c) => image.setAttribute('href', e.urls[c]));
            maps[i].tables[0].children[0].setAttribute('tableValues', e.tables.across);
            for (const f of maps[i].tables[1].children) f.setAttribute('tableValues', e.tables.down);
            maps[i].cover?.children[0].setAttribute('tableValues', e.tables.cover);
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
  private drawFreeLight(field: Field, zR: number): Promise<(() => void) | void> {
    const o = this.options;
    const scale = Math.min(2, Math.ceil(devicePixelRatio || 1));
    const fill = o.fill ? parseColour(o.fill, o.opacity) : null;
    const pad = o.shadowOpacity > 0 ? Math.ceil(Math.max(o.shadowSpread, 1) * 3 + Math.abs(o.shadowOffsetY)) + 2 : 2;
    const key = `free|${this.mapKey}|${field.w}x${field.h}|${zR}|${o.fresnel}|${o.edgeHighlight}|${o.specular}|${o.shadowOpacity}|${o.shadowSpread}|${o.shadowOffsetY}|${o.opacity}|${scale}|${fill}|${o.shape}|${o.path}|${o.cornerRadius}`;
    if (key === this.lightKey) return Promise.resolve(() => this.applyLight());
    this.lightKey = key;
    const img = fieldLight(field, zR, { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular },
      { opacity: o.shadowOpacity * o.opacity, spread: o.shadowSpread, offsetY: o.shadowOffsetY }, scale, pad, fill);
    // light over shadow, into one image
    const out = img.shadow.data;
    for (let i = 0; i < out.length; i += 4) {
      const la = img.light.data[i + 3] / 255 * (o.opacity < 1 ? o.opacity : 1), sa = out[i + 3] / 255;
      const a = la + sa * (1 - la);
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) out[i + c] = Math.round((img.light.data[i + c] * la) / a);
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
  private drawFieldLight(field: Field, zR: number, moving: boolean, region: { x: number; y: number; w: number; h: number }): Promise<(() => void) | void> {
    const o = this.options, shape = this.shape!;
    const scale = moving ? 0.35 : Math.min(2, Math.ceil(devicePixelRatio || 1));
    const fill = o.fill ? parseColour(o.fill, o.opacity) : null;
    const key = `${shape.key()}|${zR}|${o.fresnel}|${o.edgeHighlight}|${o.specular}|${o.shadowOpacity}|${o.shadowSpread}|${o.shadowOffsetY}|${o.opacity}|${scale}|${fill}`;
    if (key === this.lightKey) return Promise.resolve(() => this.applyLight());
    this.lightKey = key;
    const reach = o.shadowOpacity > 0 ? Math.ceil(Math.max(o.shadowSpread, 1) * 3 + Math.abs(o.shadowOffsetY)) + 2 : 2;
    const x0 = Math.max(Math.floor(region.x - reach), 0), y0 = Math.max(Math.floor(region.y - reach), 0);
    const x1 = Math.min(Math.ceil(region.x + region.w + reach), field.w), y1 = Math.min(Math.ceil(region.y + region.h + reach), field.h);
    const box = { x: x0, y: y0, w: Math.max(x1 - x0, 1), h: Math.max(y1 - y0, 1) };
    const img = fieldLight(within(field, box), zR, { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular },
      { opacity: o.shadowOpacity * o.opacity, spread: o.shadowSpread, offsetY: o.shadowOffsetY }, scale, 0, fill);
    if (o.opacity < 1) for (let i = 3; i < img.light.data.length; i += 4) img.light.data[i] *= o.opacity;
    const urls = [img.light, img.shadow, img.mask].map(toDataURL);
    const empty = emptyImage(img.light.width, img.light.height);
    return Promise.all(urls.map(predecode)).then(() => () => {
      if (this.lightKey !== key) return;
      this.lightUrl = { url: urls[0], shadow: urls[1], mask: urls[2], empty, field: true, box };
      this.applyLight();
    });
  }

  private drawLight(zR: number): Promise<(() => void) | void> {
    const o = this.options;
    const { w, h, radii } = this;
    const shortHalf = Math.min(w, h) / 2;
    const scale = Math.min(2, Math.ceil(devicePixelRatio || 1));
    const lighting = { fresnel: o.fresnel, edge: o.edgeHighlight, specular: o.specular };
    const fill = o.fill ? parseColour(o.fill, o.opacity) : null;
    const key = [...radii, zR, shortHalf, lighting.fresnel, lighting.edge, lighting.specular, scale, o.opacity, o.variant === 'identity' ? 1 : 0]
      .map((v) => Math.round(v * 4) / 4).join(':') + `|${fill}`;
    if (key === this.lightKey) return Promise.resolve(() => this.applyLight());
    this.lightKey = key;
    let hit = lightCache.get(key);
    if (hit === undefined) {
      const img = o.variant === 'identity' ? null : lightImage(radii, zR, shortHalf, lighting, scale, fill);
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
  private applyLight() {
    const light = this.lightUrl, s = this.amount();
    const image = (url: string, empty: string) => (s >= 1 ? `url(${url})` : `-webkit-cross-fade(url(${empty}), url(${url}), ${+(s * 100).toFixed(2)}%)`);
    if (light?.field) {
      const b = light.box!, at = `${b.x}px ${b.y}px`, size = `${b.w}px ${b.h}px`;
      for (const [el, url] of [[this.el, light.url], [this.shape!.shadowEl, light.shadow!]] as const) {
        Object.assign(el.style, { backgroundImage: image(url, light.empty), backgroundPosition: at, backgroundSize: size, backgroundRepeat: 'no-repeat' });
      }
      Object.assign(this.el.style, { maskImage: `url(${light.mask})`, maskPosition: at, maskSize: size, maskRepeat: 'no-repeat' });
      return;
    }
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
    this.el.style.setProperty('border-image', light.free !== undefined
      ? `${image(light.url, light.empty)} 0 fill / 0 / ${light.free}px stretch`
      : `${image(light.url, light.empty)} ${light.slice} fill / ${light.edge}px`);
  }

  // ---------------------------------------------------------------- strength, hover, press, drag

  private applyStrength() {
    this.changed();
    const full = Math.max(this.bulge, 1) * (this.unitMaps ? this.options.refraction : 1), k = full * this.amount() * Math.min(this.bulge, 1);
    let most = 0;
    for (const { node, source, spread, map } of this.passes) {
      // the map's channels span half their range (see mapNodes): the scale is twice what it would be
      const rim = 4 * (this.maps[map]?.rimPx ?? 0) * spread, scale = +(rim * k).toFixed(3);
      node.setAttribute('scale', String(scale));
      source.setAttribute('dx', String(scale / 4));
      // its source is read from up to half the scale to the right: the filters reach that far, for the glass at full
      // strength (so they aren't reset while the strength is tweened, which costs a frame each time)
      most = Math.max(most, Math.abs(rim * full) / 2);
    }
    const reach = Math.ceil((most + 1) / 4) * 4;
    if (reach > this.reach) {
      this.reach = reach;
      this.place();
    }
  }

  private tweenBulge(to: number) {
    cancelAnimationFrame(this.tween);
    if (this.host.env().reduceMotion) {
      this.bulge = to;
      this.applyStrength();
      return;
    }
    const from = this.bulge, t0 = performance.now(), ms = 180;
    const step = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      this.bulge = from + (to - from) * (1 - (1 - p) ** 3);
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
    if (o.press === 'bulge') this.tweenBulge(down ? 1 + o.pressBulge : 1);
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
    this.capNode?.firstElementChild?.setAttribute('tableValues', this.capTable());
    this.changed();
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
      const target = o.button || o.interactive ? el : (el.closest('button, label, [role="button"], [role="slider"], [role="switch"]') as HTMLElement | null) ?? el;
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
      // Elastic, like liquid: dragged, the glass stretches along the way it moves, by how fast, and springs back.
      let last = { x: 0, y: 0, t: 0 }, vx = 0, vy = 0;
      const stretch = (sx: number, sy: number) => {
        if (o.elasticity <= 0 || this.host.env().reduceMotion) return;
        el.style.setProperty('scale', `${sx.toFixed(3)} ${sy.toFixed(3)}`);
      };
      on(el, 'pointerdown', (e) => {
        if (e.button !== 0) return;
        const [tx = 0, ty = 0] = (el.style.translate || '0px 0px').split(' ').map((v) => parseFloat(v) || 0);
        start = { x: e.clientX, y: e.clientY, tx, ty, id: e.pointerId };
        last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        vx = vy = 0;
        el.setPointerCapture(e.pointerId);
        el.toggleAttribute('data-lg-dragging', true);
        el.style.setProperty('transition', 'none');
      });
      on(el, 'pointermove', (e) => {
        if (!start || e.pointerId !== start.id) return;
        el.style.translate = `${start.tx + e.clientX - start.x}px ${start.ty + e.clientY - start.y}px`;
        const dt = Math.max(e.timeStamp - last.t, 1);
        // px per ms, smoothed
        vx = vx * 0.7 + ((e.clientX - last.x) / dt) * 0.3;
        vy = vy * 0.7 + ((e.clientY - last.y) / dt) * 0.3;
        last = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        const k = o.elasticity * 0.25, ax = Math.min(Math.abs(vx) * k, 0.35), ay = Math.min(Math.abs(vy) * k, 0.35);
        // longer the way it moves, a little narrower across, so it keeps its volume
        stretch((1 + ax) / (1 + ay * 0.5), (1 + ay) / (1 + ax * 0.5));
      });
      const end = (e: PointerEvent) => {
        if (!start || e.pointerId !== start.id) return;
        start = null;
        el.toggleAttribute('data-lg-dragging', false);
        if (o.elasticity > 0) {
          el.style.setProperty('transition', 'scale 0.45s cubic-bezier(0.3, 1.8, 0.5, 1)');
          el.style.setProperty('scale', this.saved.scale || '1');
          // the element's own transitions back once it has sprung back
          setTimeout(() => {
            if (!start) el.style.setProperty('transition', this.saved.transition || '');
          }, 480);
        } else el.style.setProperty('transition', this.saved.transition || '');
        el.dispatchEvent(new CustomEvent('glassmove', { bubbles: true }));
      };
      on(el, 'pointerup', end);
      on(el, 'pointercancel', end);
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
    for (const p of ['--lg-shadow', '--lg-x', '--lg-y', '--lg-glow']) this.el.style.removeProperty(p);
    delete this.el.dataset.liquidGlass;
    for (const a of ['data-lg-pressable', 'data-lg-interactive', 'data-lg-floating', 'data-lg-dragging']) this.el.removeAttribute(a);
  }
}

const paths = new Map<string, Field>();
/**
 * An SVG path as a field: filled on a canvas (at most about 400 × 400), its signed distances worked out exactly, and
 * read back with bilinear interpolation. In the element's px, or stretched from `box` ("x y w h").
 */
function pathField(d: string, box: string | null, w: number, h: number): Field {
  const k = `${d}|${box}|${Math.round(w)}x${Math.round(h)}`;
  const hit = paths.get(k);
  if (hit) return hit;
  const scale = Math.min(2, Math.sqrt(160000 / (w * h)));
  const gw = Math.max(2, Math.ceil(w * scale)), gh = Math.max(2, Math.ceil(h * scale));
  const cv = document.createElement('canvas');
  cv.width = gw;
  cv.height = gh;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const [bx, by, bw, bh] = box ? box.trim().split(/[\s,]+/).map(Number) : [0, 0, w, h];
  ctx.scale((scale * w) / bw, (scale * h) / bh);
  ctx.translate(-bx, -by);
  ctx.fill(new Path2D(d));
  const alpha = ctx.getImageData(0, 0, gw, gh).data;
  const mask = new Uint8Array(gw * gh);
  for (let i = 0; i < mask.length; i++) mask[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;
  return remember(paths, k, gridField(w, h, signedDistance(mask, gw, gh), gw, gh, scale));
}

const empties = new Map<string, string>();
/** A transparent image of a size, to cross-fade with. */
function emptyImage(w: number, h: number): string {
  const k = `${w}x${h}`;
  return empties.get(k) ?? remember(empties, k, toDataURL({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));
}

/** The part of a field in `r`, as a field of its own (for a map that covers only that). */
function within(f: Field, r: { x: number; y: number; w: number; h: number }): Field {
  return {
    w: r.w, h: r.h, shortHalf: f.shortHalf,
    sdf: (x, y) => f.sdf(x + r.x, y + r.y),
    pull: (x, y) => f.pull(x + r.x, y + r.y),
    toward: (x, y) => f.toward(x + r.x, y + r.y),
    probe: (axis, d) => {
      const [x, y] = f.probe(axis, d);
      return [x - r.x, y - r.y];
    },
  };
}

/**
 * A CSS colour as [r, g, b] 0..255 and alpha 0..1 (times `opacity`): the fill is painted into the light's image, so
 * a page's CSS reset (button { background: none }) can't take it away.
 */
function parseColour(colour: string, opacity = 1): RGBA {
  // Remembered: the light is drawn again every frame while the glass's strength is tweened, and reading a canvas back
  // waits for the GPU to finish what it's doing (a press could hold up the page for 130 ms).
  const key = `${colour}|${opacity}`;
  const hit = colours.get(key);
  if (hit) return hit;
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return remember(colours, key, [r, g, b, (a / 255) * opacity] as RGBA);
}
const colours = new Map<string, RGBA>();

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
