import type { Pixels } from './maps.js';
export declare const SVG_NS = "http://www.w3.org/2000/svg";
/** The <defs> every filter goes in, created on first use. */
export declare function filterDefs(): SVGDefsElement;
export declare function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string | number>, ...children: Element[]): SVGElementTagNameMap[K];
export declare function setAttrs(node: Element, attrs: Record<string, string | number>): void;
/** Pixels as a PNG data URL. */
export declare function toDataURL(p: Pixels): string;
/**
 * Decode an image before an feImage or border-image points at it. Swapping an feImage to an image that isn't decoded
 * yet leaves the map empty for a frame, which reads as a big shift and flashes.
 */
export declare function predecode(url: string): Promise<void>;
/**
 * The library's own rules, at zero specificity (:where), so any rule of the page wins: the glass's shadow comes from a
 * custom property set on each element, and the page can still give it a shadow of its own.
 */
export declare function installStyles(): void;
/**
 * Whether `backdrop-filter: url(#svg-filter)` bends the backdrop here: Chromium (and so Electron) does; Firefox and
 * Safari accept the syntax but draw nothing, so there the glass falls back to a plain blur (with its light, fill and
 * shadow). globalThis.LIQUID_GLASS_FALLBACK = true forces the fallback.
 */
export declare function supportsSvgBackdrop(): boolean;
