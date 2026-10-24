import { type Lighting, type Optics, type Radii, type Shape } from './optics.js';
export interface Pixels {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}
export interface DisplacementMap extends Pixels {
    /** the largest shift in the map, px: the channel range 0..255 stands for −rimPx..+rimPx */
    rimPx: number;
}
/**
 * The displacement map of a whole element at `scale` map pixels per CSS px: red is the x shift, green the y shift
 * (128 = none). Each map pixel is the average of `ss`² samples: the map is stretched back up with bilinear filtering,
 * and an average keeps the steep part of the rim from aliasing into beads where a point sample would miss it.
 */
export declare function displacementMap(s: Shape, o: Optics, scale: number, ss?: number): DisplacementMap;
export declare const LIGHT_MID = 32;
export interface LightImage extends Pixels {
    /** border-image-slice, in image pixels */
    slice: number;
    /** border-image-width, CSS px */
    edge: number;
}
/**
 * The light for border-image, at `scale` image pixels per CSS px: a box of 2e + LIGHT_MID, whose middle row and
 * column border-image stretches and whose middle pixel it stretches over the whole middle (so that has to be the flat
 * top's light). Its edges reach as far in as the glow does: e = max(largest corner, bevel, 0.35 × the shorter half).
 * Each corner is drawn with its own radius.
 */
export declare function lightImage(radii: Radii, bevel: number, shortHalf: number, o: Lighting, scale: number): LightImage | null;
export interface TableMap extends Pixels {
    /** feFuncR / feFuncG tableValues: the map's channel (0..1) to the displacement channel (0..1, 0.5 = none) */
    tableX: number[];
    tableY: number[];
    /** the largest shift, px: the displacement channel's range 0..1 stands for −rimPx..+rimPx */
    rimPx: number;
    /** how far the image reaches past the element on each side, px */
    margin: number;
}
/**
 * A displacement map that stays exact at a quarter of the resolution. The bevel's shift rises steeply within a few px
 * of the edge, which a small map stretched back up can't follow; but the distance from the edge is linear there, and
 * stretching reproduces a linear ramp exactly. So the map stores, per axis, where on a lookup table the shift is, laid
 * out linearly in distance from the edge (and in position across the middle), and feComponentTransfer's table turns it
 * back into the shift. Along the straight edges it's exact; in the corners, the stored value is what gives the right
 * shift through the same table, which varies smoothly too. The bevel's profile has to only fall inward for that
 * (`monotone`), which changes nothing visible. The image reaches `margin` px past the edge, so the outermost pixels
 * are interpolated rather than clamped.
 */
export declare function tableMap(s: Shape, o: Optics, scale: number, N?: number): TableMap;
