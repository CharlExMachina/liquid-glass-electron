import type { Pixels } from './maps.js';
export type BackdropSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
type Box = {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** A map as the shader reads it: the image, and per axis the table from its value to the shift (see tableMap). */
export interface GlMap {
    pixels: Pixels;
    tableX: number[];
    tableY: number[];
    /** what every table value has added to it (for Chromium's truncation), to take off again */
    bias: number;
    /** the shift a table value of 1 stands for, px */
    rimPx: number;
}
/** What a glass looks like now, in its element's px. */
export interface GlFrame {
    w: number;
    h: number;
    /** one map, or one per colour channel (a dome's fringe) */
    maps: GlMap[];
    /** where the map is stretched over */
    mapRect: Box;
    /** red, green and blue: which map, and how many times its shift */
    channels: {
        map: number;
        k: number;
    }[];
    /** the furthest the backdrop is read from past the edge, px */
    reach: number;
    /** the frost, σ px; and macOS's blur fill, laid over it */
    sigma: number;
    fill: {
        sigma: number;
        alpha: number;
        darken: boolean;
    } | null;
    /** the 3 × 3 smoothing (glass with no frost) */
    smooth: boolean;
    /** the colour matrix, as feColorMatrix's 20 values (its first three rows count) */
    matrix: number[];
    /** macOS's cap on dark glass's luma, or null */
    cap: number | null;
    opacity: number;
    surface: {
        urls: [string, string];
        strength: number;
    } | null;
    /** cut the glass to the shape in the map's blue channel */
    cover: boolean;
    /** work in Display P3, as Chromium does on a wide-gamut display (the variants' colour is fitted there) */
    wideGamut: boolean;
}
export interface GlHost {
    el: HTMLElement;
    /** what to draw now, or null for nothing (glass that's off, or whose map isn't drawn yet) */
    frame(): GlFrame | null;
    /** the source can't be read (an image from another origin without CORS, a lost context that didn't come back) */
    failed(): void;
    /** the plain look, as a backdrop-filter: what's under the glass where it looks past its picture ('none' for none) */
    fallback(): string;
}
/** Whether `el` can be a glass's backdrop: an image, a video or a canvas. */
export declare function isBackdropSource(el: Element | null): el is BackdropSource;
/**
 * What a source shows, as far as whether it may be read goes: one that couldn't be read is tried again when this
 * changes (another src, a crossorigin attribute; a canvas is origin-clean again when it's resized).
 */
export declare function sourceIdentity(el: BackdropSource): string;
/** Whether this browser draws WebGL2. */
export declare function glSupported(): boolean;
/**
 * Where a replaced element draws its content, given its content box: CSS's object-fit and object-position (as
 * computed: a percentage or a length per axis).
 */
export declare function fitRect(box: Box, iw: number, ih: number, fit: string, position: string): Box;
/**
 * The shift a map stands for at one of its values, px (at refraction 1): what the shader computes, and the SVG
 * filter's feComponentTransfer and feDisplacementMap between them. `v`: the map's channel, 0..1.
 */
export declare function decodeShift(table: number[], bias: number, rimPx: number, v: number): number;
/** A glass to draw this frame: what it looks like, where it and its source are, and the canvas that shows it. */
interface Job {
    f: GlFrame;
    src: SourceEntry;
    glassBox: Box;
    sourceBox: Box;
    shown: Box;
    cw: number;
    ch: number;
    out: CanvasRenderingContext2D;
    redraw: () => void;
    done: () => void;
    x?: number;
    y?: number;
}
interface SourceEntry {
    texture: WebGLTexture;
    key: string;
    version: number;
    w: number;
    h: number;
    failed: boolean;
    failedAs: string;
    frames: number;
    watching: boolean;
}
/**
 * Call `look` whenever the document may have another source for a glass: an element added or removed, a src, an id or
 * a class set, a picture loaded; and once a second besides. Returns what stops it.
 */
export declare function watchSources(look: () => void): () => void;
/** One glass's canvas, and what it last drew. */
export declare class GlGlass {
    private host;
    private source;
    readonly canvas: HTMLCanvasElement;
    private ctx;
    private dirty;
    private key;
    private shown;
    private under;
    constructor(host: GlHost, source: BackdropSource);
    setSource(source: BackdropSource): void;
    /** What the glass looks like changed: draw it again on the next frame. */
    invalidate(): void;
    /** What to draw, if the glass, the source or either's place changed since it was last drawn; null if nothing did. */
    prepare(): Job | null;
    private setUnder;
    destroy(): void;
}
/** Draw every glass that's due now (a test waits on this instead of a frame). */
export declare function flushGl(): void;
export {};
