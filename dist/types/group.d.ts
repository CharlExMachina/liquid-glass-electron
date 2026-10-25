import type { Lens } from './lens.js';
export interface GroupHost {
    lensOf(el: HTMLElement): Lens | undefined;
}
export declare class GlassGroup {
    readonly id: string;
    readonly layer: HTMLDivElement;
    private host;
    private members;
    private pre;
    private main;
    private atlas;
    private key;
    private rendered;
    private batch;
    private queued;
    private settleTimer;
    private building;
    private moved;
    private sizes;
    private parent;
    private savedParentPosition;
    private destroyed;
    private clip;
    private filter;
    private onEvent;
    constructor(host: GroupHost);
    /** The members, in no particular order. */
    get elements(): HTMLElement[];
    has(el: HTMLElement): boolean;
    add(el: HTMLElement): void;
    remove(el: HTMLElement): void;
    private release;
    private lazy;
    private waiting;
    /** Look at the members again once nothing has changed for a moment. */
    private later;
    /** Look at the members again after the next change, before the frame is drawn. */
    schedule(): void;
    /** Resolves once every member's map and light are on screen and the group's image has caught up. */
    whenDrawn(): Promise<void>;
    destroy(): void;
    /** The key of what a member's filter does, everything but where its map is. */
    private sourceOf;
    /**
     * Whether the layer can draw this member's glass for it: nothing on the element that the glass would be painted
     * through (opacity, filter, mask, clip-path, blending: those apply to an element's backdrop filter too), no running
     * animation or transition, no transform but a translation, a box of its own size, the same parent as the others.
     */
    private eligible;
    private reconcile;
    private atlasIds;
    private atlasId;
    /** Who the layer draws now: its clip, and the members' own filters off (or back on), in one go. */
    private apply;
    /** Draw the members that share a filter into the group's image, and put the layer over them. */
    private build;
    /** The layer: the previous sibling of the first member, as big as the members' bounds, positioned as they are. */
    private placeLayer;
    /** The layer's filter: the members' own, with the group's image in place of a member's map. */
    private render;
}
/**
 * Which maps can share an image: the same lookup tables and map pixels per px, at whole map pixels from each other (so
 * each is drawn exactly as it would be on its own), with a map pixel of room between them. Returns the indices, image
 * by image.
 */
export declare function classify(items: {
    x: number;
    y: number;
    w: number;
    h: number;
    kx: number;
    ky: number;
    tables?: string;
}[]): number[][];
/** An element's border box with its border-radius, as SVG path data, at (x, y). */
export declare function roundedBox(x: number, y: number, w: number, h: number, cs: {
    borderTopLeftRadius: string;
    borderTopRightRadius: string;
    borderBottomRightRadius: string;
    borderBottomLeftRadius: string;
}): string;
