// DOM plumbing: the hidden <svg> the filters live in, encoding pixels as data URLs, and the library's stylesheet.
// Everything goes through the CSSOM and setAttribute on SVG nodes, never inline <style> or style attributes, so a
// strict Content-Security-Policy (style-src 'self') doesn't block it. Images are data: URLs (img-src needs data:).
import type { Pixels } from './maps.ts';
import { NUMBER_PROPERTIES, UNSET } from './options.ts';

export const SVG_NS = 'http://www.w3.org/2000/svg';

let defs: SVGDefsElement | null = null;

/** The <defs> every filter goes in, created on first use. */
export function filterDefs(): SVGDefsElement {
  if (defs?.isConnected) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-liquid-glass-defs', '');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  defs = document.createElementNS(SVG_NS, 'defs');
  svg.append(defs);
  document.body.append(svg);
  return defs;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: Element[]) {
  const node = document.createElementNS(SVG_NS, tag);
  setAttrs(node, attrs);
  node.append(...children);
  return node;
}

export function setAttrs(node: Element, attrs: Record<string, string | number>) {
  for (const [k, v] of Object.entries(attrs)) {
    const s = String(v);
    if (node.getAttribute(k) !== s) node.setAttribute(k, s);
  }
}

let canvas: HTMLCanvasElement | null = null;

/** Pixels as a PNG data URL. */
export function toDataURL(p: Pixels): string {
  canvas ??= document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, p.width, p.height), 0, 0);
  return canvas.toDataURL();
}

/** One channel of pixels (0 red, 1 green, 2 blue) as a grey PNG data URL. */
export function greyDataURL(p: Pixels, channel: number): string {
  const data = new Uint8ClampedArray(p.data.length);
  for (let k = 0; k < data.length; k += 4) {
    data[k] = data[k + 1] = data[k + 2] = p.data[k + channel];
    data[k + 3] = 255;
  }
  return toDataURL({ width: p.width, height: p.height, data });
}

/**
 * A map's filter nodes. Chromium composites in the display's colour space (Display P3 on a wide-gamut Mac) and turns
 * a map that isn't grey into it before bending: red is mixed into green and what's dark is lifted, so up and left fall
 * short by as much as a fifth. A grey is the same in both spaces (the same white, the same curve), and alpha is never
 * converted: the shift down travels as a grey, the shift across as alpha. Each comes as a grey image (`raw`_0 across,
 * `raw`_1 down) and goes through its own lookup table at full precision (see encodeTables): across comes out at
 * 0.75 ± ¼ and is put into alpha (at least 0.5, so the grey premultiplied by it keeps its precision), down at 0.5 ± ¼
 * as a grey; together they're `out`, read by a displacement with xChannelSelector A, yChannelSelector R, a scale of 4 ×
 * the largest shift, and its source moved right by a quarter of the scale. A free shape's coverage (`raw`_2, a grey
 * too) goes through its own table into `out`_cover.
 *
 * `stash`: the map is stashed beside the element in this filter's output for the next filter to read (stashNodes),
 * which carries neither alpha (merged over the backdrop, it's lost) nor colour (it's converted on the way): each
 * channel is left as an opaque grey of its own, `out`_0, `out`_1 (and `out`_2), each where its image is.
 */
export function mapNodes(raw: string, out: string, channels: 2 | 3, stash = false) {
  const images = Array.from({ length: channels }, (_, c) => svgEl('feImage', { preserveAspectRatio: 'none', x: 0, y: 0, width: 1, height: 1, result: `${raw}_${c}` }));
  const table = (c: number, result: string) => svgEl('feComponentTransfer', { in: `${raw}_${c}`, result },
    ...(['feFuncR', 'feFuncG', 'feFuncB'] as const).map((f) => svgEl(f, { type: 'table', tableValues: '0 1' })));
  const across = table(0, stash ? `${out}_0` : `${raw}_x`), down = table(1, stash ? `${out}_1` : `${raw}_y`);
  const cover = channels === 3 ? table(2, stash ? `${out}_2` : `${out}_c`) : null;
  const nodes: Element[] = [...images, across, down, ...(cover ? [cover] : [])];
  if (!stash) nodes.push(...joinNodes(`${raw}_x`, `${raw}_y`, cover ? `${out}_c` : null, out));
  return { images, nodes, tables: [across, down] as [SVGFEComponentTransferElement, SVGFEComponentTransferElement], cover };
}

/** Across (a grey) into alpha under down (a grey): the map a displacement reads; and a coverage grey into alpha. */
function joinNodes(across: string, down: string, cover: string | null, out: string): Element[] {
  const ALPHA = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0';
  return [
    svgEl('feColorMatrix', { in: across, type: 'matrix', values: ALPHA, result: `${out}_a` }),
    svgEl('feComposite', { in: down, in2: `${out}_a`, operator: 'in', result: out }),
    ...(cover ? [svgEl('feColorMatrix', { in: cover, type: 'matrix', values: ALPHA, result: `${out}_cover` })] : []),
  ];
}

/**
 * A stashed map (mapNodes with `stash`), read back from beside the element in the next filter: each channel moved
 * into place (`shifts`, whose dx the caller sets) and joined into what a displacement reads.
 */
export function stashNodes(out: string, channels: 2 | 3) {
  const shifts = Array.from({ length: channels }, (_, c) => svgEl('feOffset', { in: 'SourceGraphic', dx: 0, dy: 0, result: `${out}s${c}` }));
  return { shifts, nodes: [...shifts, ...joinNodes(`${out}s0`, `${out}s1`, channels === 3 ? `${out}s2` : null, out)] };
}

/**
 * A map's tables (maps.ts: 0..1 for −largest..+largest shift, `bias` added against Chromium's truncation) for the
 * channels mapNodes puts them in: across at 0.75 ± ¼, down at 0.5 ± ¼. 256 entries each, one per byte of the map's
 * grey, as Chromium bakes them; each a step of a half byte more, so that baking rounds.
 */
export function encodeTables(tableX: number[], tableY: number[], bias: number): { across: string; down: string } {
  const at = (t: number[], u: number) => {
    const k = u * (t.length - 1), i = Math.min(Math.floor(k), t.length - 2);
    return t[i] + (t[i + 1] - t[i]) * (k - i) - bias;
  };
  const encode = (t: number[], from: number) =>
    Array.from({ length: 256 }, (_, k) => +Math.min(Math.max(from + at(t, k / 255) / 2 + 0.5 / 255, 0), 1).toFixed(5)).join(' ');
  return { across: encode(tableX, 0.5), down: encode(tableY, 0.25) };
}

const decoded = new Set<string>();

/**
 * Decode an image before an feImage or border-image points at it. Swapping an feImage to an image that isn't decoded
 * yet leaves the map empty for a frame, which reads as a big shift and flashes.
 */
export async function predecode(url: string): Promise<void> {
  if (decoded.has(url)) return;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    // an image that can't be decoded just won't show; nothing to wait for
  }
  decoded.add(url);
  if (decoded.size > 512) decoded.clear();
}

let sheet: CSSStyleSheet | null = null;

/**
 * The library's own rules, at zero specificity (:where), so any rule of the page wins: the glass's shadow comes from a
 * custom property set on each element, and the page can still give it a shadow of its own.
 */
export function installStyles() {
  if (sheet) return;
  sheet = new CSSStyleSheet();
  sheet.replaceSync(`
:where([data-liquid-glass]) { box-shadow: var(--lg-shadow, none); }
:where([data-liquid-glass][data-lg-pressable]) { cursor: pointer; -webkit-tap-highlight-color: transparent; transition: scale 0.32s cubic-bezier(0.3, 1.6, 0.5, 1); }
:where([data-liquid-glass][data-lg-interactive]) { background-image: radial-gradient(circle at var(--lg-x, 50%) var(--lg-y, 50%), rgb(255 255 255 / var(--lg-glow, 0)), transparent 70%); }
:where([data-liquid-glass][data-lg-layered]) { box-shadow: none; }
:where([data-liquid-glass][data-lg-interactive][data-lg-layered]) { background-image: none; }
:where([data-liquid-glass][data-lg-interactive]) > :where([data-lg-layer='glass']) { background-image: radial-gradient(circle at var(--lg-x, 50%) var(--lg-y, 50%), rgb(255 255 255 / var(--lg-glow, 0)), transparent 70%); }
:where([data-liquid-glass][data-lg-floating]) { touch-action: none; cursor: grab; user-select: none; }
:where([data-liquid-glass][data-lg-floating][data-lg-dragging]) { cursor: grabbing; }
`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  // --glass-strength as a number, so CSS transitions and animations interpolate it (the glass follows them); and the
  // other number options, UNSET where nothing sets them. Registered here, a page's own @property for one (with an
  // initial value of its own) doesn't count: it would give every element that value, glass that should have its
  // variant's instead.
  const register = (name: string, syntax: string, inherits: boolean, initialValue: string) => {
    try {
      CSS.registerProperty({ name, syntax, inherits, initialValue });
    } catch {
      // registered already
    }
  };
  register('--glass-strength', '<number>', false, '1');
  for (const { name, syntax } of NUMBER_PROPERTIES) register(name, syntax, true, String(UNSET));
}

/**
 * Whether `backdrop-filter: url(#svg-filter)` bends the backdrop here: Chromium (and so Electron) does; Firefox and
 * Safari accept the syntax but draw nothing, so there the glass falls back to a plain blur (with its light, fill and
 * shadow). globalThis.LIQUID_GLASS_FALLBACK = true forces the fallback.
 */
export function supportsSvgBackdrop(): boolean {
  // set to see (or test) what other browsers get
  if ((globalThis as { LIQUID_GLASS_FALLBACK?: boolean }).LIQUID_GLASS_FALLBACK) return false;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
  if (brands.some((b) => /Chromium|Google Chrome|Microsoft Edge|Electron/.test(b.brand))) return true;
  return /\b(Chrome|Chromium|Electron)\//.test(ua) && !/\bEdge\//.test(ua);
}
