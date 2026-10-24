// DOM plumbing: the hidden <svg> the filters live in, encoding pixels as data URLs, and the library's stylesheet.
// Everything goes through the CSSOM and setAttribute on SVG nodes, never inline <style> or style attributes, so a
// strict Content-Security-Policy (style-src 'self') doesn't block it. Images are data: URLs (img-src needs data:).
import type { Pixels } from './maps.ts';

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
:where([data-liquid-glass][data-lg-floating]) { touch-action: none; cursor: grab; user-select: none; }
:where([data-liquid-glass][data-lg-floating][data-lg-dragging]) { cursor: grabbing; }
`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  // --glass-strength as a number, so CSS transitions and animations interpolate it (the glass follows them)
  try {
    CSS.registerProperty({ name: '--glass-strength', syntax: '<number>', inherits: false, initialValue: '1' });
  } catch {
    // registered already
  }
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
