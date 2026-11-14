import type { Pixels } from './maps.js';
export declare const SVG_NS = "http://www.w3.org/2000/svg";
/** The <defs> every filter goes in, created on first use. */
export declare function filterDefs(): SVGDefsElement;
export declare function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string | number>, ...children: Element[]): SVGElementTagNameMap[K];
export declare function setAttrs(node: Element, attrs: Record<string, string | number>): void;
/** Pixels as a PNG data URL. */
export declare function toDataURL(p: Pixels): string;
/** One channel of pixels (0 red, 1 green, 2 blue) as a grey PNG data URL. */
export declare function greyDataURL(p: Pixels, channel: number): string;
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
export declare function mapNodes(raw: string, out: string, channels: 2 | 3, stash?: boolean): {
    images: SVGFEImageElement[];
    nodes: Element[];
    tables: [SVGFEComponentTransferElement, SVGFEComponentTransferElement];
    cover: SVGFEComponentTransferElement | null;
};
/**
 * A stashed map (mapNodes with `stash`), read back from beside the element in the next filter: each channel moved
 * into place (`shifts`, whose dx the caller sets) and joined into what a displacement reads.
 */
export declare function stashNodes(out: string, channels: 2 | 3): {
    shifts: SVGFEOffsetElement[];
    nodes: (Element | SVGFEOffsetElement)[];
};
/**
 * A map's tables (maps.ts: 0..1 for −largest..+largest shift, `bias` added against Chromium's truncation) for the
 * channels mapNodes puts them in: across at 0.75 ± ¼, down at 0.5 ± ¼. 256 entries each, one per byte of the map's
 * grey, as Chromium bakes them.
 *
 * Each entry is the byte it should bake to and a quarter more: Chromium truncates when it bakes a table on screen and
 * rounds off screen, and between a byte and a half more both give that byte (at half a byte more, as these were, no
 * shift baked to 191 across on screen and 192 off it). No shift bakes to 192 across and 128 down; what a displacement
 * reads there is zeroResidual's.
 */
export declare function encodeTables(tableX: number[], tableY: number[], bias: number): {
    across: string;
    down: string;
};
/**
 * What a displacement reads where a map says "no shift" (its grey's byte 128), less what that should be: across 0.75
 * and down 0.5. Across, the byte the table bakes no shift to (192 with encodeTables'), over 255. Down is premultiplied
 * by that byte (128 × 192 / 255 = 96.4) and divided by it again when the displacement reads it: off screen Chromium keeps
 * it as a byte, 96, and it reads ½ exactly; on screen (its GPU raster, measured on a Mac) it reads a quarter of a byte
 * past ½, as the place a grid's lines are bent to shows (no other amount keeps them all where they are, from small
 * glass to liquidglass's big lens). Times a scale of a few hundred device px, either is up to a pixel. The
 * displacement's source is moved by as much the other way.
 */
export declare function zeroResidual(across: string): {
    x: number;
    y: number;
};
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
 * Safari accept the syntax but draw nothing, so there the glass is drawn by a shader over the backdrop the page names
 * (GlassOptions.backdropSource, webgl.ts), or falls back to a plain blur (with its light, fill and shadow).
 * globalThis.LIQUID_GLASS_FALLBACK = true forces the fallback.
 */
export declare function supportsSvgBackdrop(): boolean;
