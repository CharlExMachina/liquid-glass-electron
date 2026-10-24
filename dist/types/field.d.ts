import { type Radii } from './optics.js';
export interface Field {
    /** the box, px */
    w: number;
    h: number;
    /** signed distance to the edge, px: < 0 inside */
    sdf(x: number, y: number): number;
    /** where the magnification pulls a point, per unit of magnification: (−1..1, −1..1), 0 in the middle */
    pull(x: number, y: number): [number, number];
    /** from the point to the middle, px (a dome magnifies by moving every sample toward it) */
    toward(x: number, y: number): [number, number];
    /** half the shorter side (how far in the edge's glow reaches) */
    shortHalf: number;
    /** a point d px in from a straight edge, per axis, for the map's lookup tables (x: a left edge, y: a top edge) */
    probe(axis: 0 | 1, d: number): [number, number];
}
/** Signed distance from a rounded rectangle centred on the origin, with a radius per corner (CSS order). */
export declare function rectSdf(px: number, py: number, hx: number, hy: number, radii: Radii): number;
/** A rounded rectangle filling its box. */
export declare function roundedRect(w: number, h: number, radii: Radii): Field;
export interface Member {
    /** position in the union's box, and size, px */
    x: number;
    y: number;
    w: number;
    h: number;
    radii: Radii;
}
/**
 * Rounded rectangles as one piece of glass: where two come within `spacing` px of each other, their edges flow
 * together (a smooth minimum of their distances), as Apple's glass in a GlassEffectContainer does. Each pulls its own
 * magnification toward its own middle, blended where they meet.
 */
export declare function union(w: number, h: number, members: Member[], spacing: number): Field;
/**
 * A rectangle with continuous corners, as Apple draws them (a "squircle"): each corner a superellipse
 * |x|ⁿ + |y|ⁿ = rⁿ instead of a quarter circle, so the curvature eases in from the straight edges. Its distance is the
 * superellipse's level set divided by its gradient, exact on the edge and close near it, which is where the glass bends.
 */
export declare function squircle(w: number, h: number, radius: number, n?: number): Field;
/**
 * Signed distances from a coverage mask (1 inside, 0 outside), px of the grid: negative inside. Two exact Euclidean
 * distance transforms (Felzenszwalb and Huttenlocher), one to the outside and one to the inside, meeting at the edge.
 */
export declare function signedDistance(mask: Uint8Array, gw: number, gh: number): Float32Array;
/**
 * A shape given as a grid of signed distances (from a rasterised path) over a w × h box, `scale` grid pixels per px:
 * read with bilinear interpolation. The magnification pulls toward the middle of its box.
 */
export declare function gridField(w: number, h: number, grid: Float32Array, gw: number, gh: number, scale: number): Field;
