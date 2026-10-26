import type { Field } from './field.js';
import { type Lighting, type Optics, type Radii } from './optics.js';
export interface Pixels {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}
export declare const LIGHT_MID = 32;
export interface LightImage extends Pixels {
    /** border-image-slice, in image pixels */
    slice: number;
    /** border-image-width, CSS px */
    edge: number;
}
/**
 * The light of a rounded rectangle, for border-image, at `scale` image pixels per CSS px: a box of 2e + LIGHT_MID, whose middle row and
 * column border-image stretches and whose middle pixel it stretches over the whole middle (so that has to be the flat
 * top's light). Its edges reach as far in as the glow does: e = max(largest corner, bevel, 0.35 × the shorter half).
 * Each corner is drawn with its own radius.
 */
export declare function lightImage(radii: Radii, bevel: number, shortHalf: number, o: Lighting, scale: number, fill?: RGBA | null): LightImage | null;
/** A colour, 0..255, with its alpha 0..1. */
export type RGBA = [number, number, number, number];
export interface TableMap extends Pixels {
    /** feFuncR / feFuncG tableValues: the map's channel (0..1) to the displacement channel (0..1, 0.5 = none) */
    tableX: number[];
    tableY: number[];
    /** feFuncB tableValues: the blue channel (the distance to the edge) to coverage, for shapes the element's own
     * rounded corners can't clip */
    tableB: number[];
    /** the largest shift, px: the displacement channel's range 0..1 stands for −rimPx..+rimPx */
    rimPx: number;
    /** how far the image reaches past the element on each side, px (at least) */
    margin: number;
    /** where the image goes, in the field's px: `margin` past it on each side, or the grid's rectangle */
    rect: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    /** the grid it's drawn on */
    grid: MapGrid;
}
/**
 * A map's pixels on a given grid: its top-left corner (in the field's px), the size of a map pixel (px) and how many
 * there are. Maps of glass of the same size on one grid, whole map pixels apart, can be copied into one image.
 */
export interface MapGrid {
    x: number;
    y: number;
    px: number;
    py: number;
    width: number;
    height: number;
}
/** The grid a map of `f` gets on its own: `margin` px past it on each side, about `scale` pixels per px. */
export declare function ownGrid(w: number, h: number, scale: number, margin: number): MapGrid;
/**
 * A displacement map that stays exact at a quarter of the resolution. The bevel's shift rises steeply within a few px
 * of the edge, which a small map stretched back up can't follow; but the distance from the edge is linear there, and
 * stretching reproduces a linear ramp exactly. So the map stores, per axis, where on a lookup table the shift is, laid
 * out linearly in distance from the edge (and in position across the middle), and feComponentTransfer's table turns it
 * back into the shift. Along the straight edges it's exact; in the corners, the stored value is what gives the right
 * shift through the same table, which varies smoothly too. The shift peaks 2 px in and falls toward the edge, so a
 * shift there can be found on either side of the peak: a point takes the one nearer its own distance, which along
 * straight edges is the point itself. The image reaches `margin` px past the edge, so the outermost pixels are
 * interpolated rather than clamped.
 */
export declare function tableMap(f: Field, o: Optics, scale: number, N?: number, fringe?: number, profile?: Field, grid?: MapGrid | null): TableMap;
export interface FieldLight {
    /** the light inside the shape, its shadow outside it, and its coverage (for mask-image), all the same size */
    light: Pixels;
    shadow: Pixels;
    mask: Pixels;
    /** how far the images reach past the box on each side, px (for the shadow) */
    pad: number;
}
/**
 * The light of any shape (a container's merged glass), its shadow, and its coverage: whole images over the box and
 * `pad` px around it, at `scale` pixels per px. Light is worked out only near the edge, where it changes; the middle
 * is the flat top's light. A 9-slice border-image can't do a shape like this, so these are background and mask
 * images, drawn again when the shape changes.
 */
export declare function fieldLight(f: Field, bevel: number, o: Lighting, shadow: {
    opacity: number;
    spread: number;
    offsetY: number;
}, scale: number, pad: number, fill?: RGBA | null): FieldLight;
