import type { Field } from './field.js';
export declare const IOR = 1.5;
export declare const ABERRATION = 1.7;
export declare const clamp: (v: number, lo: number, hi: number) => number;
export declare const smoothstep: (a: number, b: number, x: number) => number;
/** The height of the bevel `d` px in from the edge: a quarter circle of radius `zR`, flat beyond it. */
export declare const height: (d: number, zR: number) => number;
/** Its slope, taken over ±2 px as the shader does (which keeps it finite at the edge). */
export declare const slope: (d: number, zR: number) => number;
/** Corner radii in CSS order: top-left, top-right, bottom-right, bottom-left. */
export type Radii = [number, number, number, number];
/** Radii clamped to half the shorter side, as a glass's corners are circular. */
export declare const clampRadii: (radii: number[], w: number, h: number) => Radii;
export interface Optics {
    /** how much the bevel bends the backdrop (liquidglass: refraction) */
    refraction: number;
    /** depth of the curved rim, px (zRadius) */
    bevel: number;
    /** a dome that magnifies the whole element instead of a pill with a bevelled rim (bevelMode 1) */
    dome: boolean;
    /**
     * Apple's lens (bevelMode 2): the rim magnifies toward the middle, most at the edge and fading out over `bevel` px,
     * and the middle is flat
     */
    rim?: boolean;
    /**
     * Apple's switch lens (bevelMode 3): the glass shrinks what's behind it, every point sampling outward along the
     * edge's normal, and its outermost px fold back
     */
    minify?: boolean;
    /**
     * macOS's lens (bevelMode 4): every point samples inward along the edge's normal, by `amount` px at the edge, falling
     * off over a few × `height` px (see macLens)
     */
    mac?: {
        amount: number;
        height: number;
    };
    /** the slight magnification toward the middle of a pill */
    magnify: boolean;
}
/** The switch lens's shift outward, px, at `d` px in from the edge, for a glass whose shorter side is 2 × `half` px. */
export declare function switchLens(d: number, half: number): number;
/** How far in macOS's lens reaches, in units of its height: nothing is moved deeper than this. */
export declare const MAC_LENS_REACH = 2;
/** macOS's lens: the inward shift, px, `d` px in from the edge. */
export declare function macLens(d: number, amount: number, height: number): number;
/**
 * The lens macOS gives glass whose shorter side is `s` px (SwiftUI's glassBackground filter, read from its layers):
 * the amount is half the shorter side (0.65 of it for clear glass), at most 60 px; the height a quarter of it (0.36 for
 * clear), at most `height` (macOS: 20).
 */
export declare function macLensSize(s: number, clear: boolean, height: number): {
    amount: number;
    height: number;
};
/**
 * How much of the frost macOS gives glass whose shorter side is `s` px, against the frost it gives large glass: clear
 * glass's blur radius grows from 5 to 10 between 48 and 120 px; regular glass's blur is laid over less of the backdrop
 * below 160 px (from 40% at 64 px down), which measures as a narrower blur (under its blur fill, see lens.ts).
 */
export declare function macFrost(s: number, clear: boolean, dark: boolean): number;
/**
 * How bright dark regular glass gets, as a share of white luma: macOS caps it (0.45 for glass 104 px and larger, up to
 * 0.6 at 64 px and smaller), as fitted to what it draws, where a clamp applied to the luma of the coloured backdrop
 * keeps the hue.
 */
export declare function macMaxLuma(s: number): number;
/**
 * Where the backdrop is sampled from, relative to the point (x, y) of the field's box: the bevel's refraction plus
 * the magnification, as liquidglass's shader computes them.
 */
export declare function shiftAt(x: number, y: number, f: Field, o: Optics): [number, number];
/**
 * liquidglass's colour fringe at a point: how far red is sampled from green (blue the same amount the other way), px,
 * along the surface normal: chromAberration × 36 × (0.3 + 0.7 × edge) × |N.xy|, outward. Nothing in the flat middle.
 */
export declare function fringeAt(x: number, y: number, f: Field, bevel: number, chroma: number): [number, number];
export interface Lighting {
    fresnel: number;
    edge: number;
    specular: number;
}
/**
 * The light at a point `d` px in from the edge, with outward normal (nx, ny); `top` is 1 at the top of the element and
 * 0 at its bottom; `shortHalf` is half the element's shorter side. White light, returned as its strength (0..1).
 * liquidglass adds most of these terms to the colour and mixes toward white by the Fresnel term; laid over as white,
 * the result is the same to within a few percent. Light doesn't bend, so this is painted once, as a border-image.
 */
export declare function lightAt(d: number, nx: number, ny: number, top: number, shortHalf: number, zR: number, o: Lighting): number;
/**
 * liquidglass blurs with three passes of a 9-tap Gaussian (σ ≈ 1.75 taps) spread 2.5 × blurAmount px apart, in each
 * direction: one Gaussian of σ = √3 × 1.75 × 2.5 × blurAmount px.
 */
export declare const blurSigma: (blurAmount: number) => number;
/**
 * Its tint: a mix toward the colour multiplied by (0.92, 0.95, 1.05), a cool glass. With a tint colour of our own,
 * the mix is toward the colour multiplied by that. Returned as the diagonal of a colour matrix.
 */
export declare function tintGains(strength: number, rgb?: [number, number, number]): [number, number, number];
/**
 * A 4×5 colour matrix (feColorMatrix order) for saturation (liquidglass: mix from luma by 1 + saturation, Rec. 601),
 * brightness (× 1 + brightness) and the tint gains, in that order.
 */
export declare function colorMatrix(saturation: number, brightness: number, gains: [number, number, number]): number[];
/** liquidglass's shadow's opacity `-d` px outside the shape (d is the distance in, so negative outside). */
export declare function boxShadowAlpha(d: number, opacity: number, spread: number): number;
/**
 * macOS's outline: a line one device pixel wide just outside the edge, black at `outline` opacity where the edge faces
 * sideways and `outlineTop` where it faces up or down (as measured, over grey and white, from SwiftUI's glass), times
 * `strength`. As box-shadows the size of the element moved a device pixel each way, so it follows the corners and is
 * painted once, like the shadow.
 */
export declare function outlineShadow(o: {
    outline: number;
    outlineTop: number;
}, strength?: number, dpr?: number): string;
/**
 * liquidglass's shadow: 0.65 exp(−d²/s²) + 0.35 exp(−2d/s) from 1 px outside the shape (s = shadowSpread), times
 * shadowOpacity; then squared, as its canvas blends alpha with itself (SRC_ALPHA on a non-premultiplied canvas). As
 * two CSS box-shadows, a least-squares fit of their blurred edges to that falloff (mean error 0.0002).
 */
export declare function boxShadow(opacity: number, spread: number, offsetY: number): string;
