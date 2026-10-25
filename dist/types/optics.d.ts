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
    /** the slight magnification toward the middle of a pill */
    magnify: boolean;
}
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
 * liquidglass's shadow: 0.65 exp(−d²/s²) + 0.35 exp(−2d/s) from 1 px outside the shape (s = shadowSpread), times
 * shadowOpacity; then squared, as its canvas blends alpha with itself (SRC_ALPHA on a non-premultiplied canvas). As
 * two CSS box-shadows, a least-squares fit of their blurred edges to that falloff (mean error 0.0002).
 */
export declare function boxShadow(opacity: number, spread: number, offsetY: number): string;
