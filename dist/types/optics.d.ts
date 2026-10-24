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
/**
 * Signed distance from a rounded rectangle centred on the origin (half sizes hx, hy, a radius per corner); < 0 inside.
 * Each quadrant uses its own corner's radius, as CSS draws them.
 */
export declare function sdf(px: number, py: number, hx: number, hy: number, radii: Radii): number;
export interface Shape {
    /** width and height, px */
    w: number;
    h: number;
    /** corner radii, px, each at most half the shorter side */
    radii: Radii;
}
/** Radii clamped to half the shorter side, as a glass's corners are circular. */
export declare const clampRadii: (radii: number[], w: number, h: number) => Radii;
export interface Optics {
    /** how much the bevel bends the backdrop (liquidglass: refraction) */
    refraction: number;
    /** depth of the curved rim, px (zRadius) */
    bevel: number;
    /** a dome that magnifies the whole element instead of a pill with a bevelled rim (bevelMode 1) */
    dome: boolean;
    /** the slight magnification toward the middle of a pill */
    magnify: boolean;
    /** keep the bevel's slope at its peak (2 px in) all the way to the edge, so the profile only falls inward */
    monotone?: boolean;
}
/**
 * Where the backdrop is sampled from, relative to the point, for a point (px, py) measured from the element's centre
 * (y down): the bevel's refraction plus the magnification, as liquidglass's shader computes them.
 */
export declare function shiftAt(px: number, py: number, s: Shape, o: Optics): [number, number];
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
/**
 * liquidglass's shadow, as two CSS box-shadows: a Gaussian falloff exp(−d²/spread²) at 0.65 (CSS blur radius = 2σ,
 * σ = spread/√2) and an exponential contact shadow exp(−2d/spread) at 0.35, approximated by a tight blur.
 */
export declare function boxShadow(opacity: number, spread: number, offsetY: number): string;
