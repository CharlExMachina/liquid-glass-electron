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
