import { type Field } from './field.js';
import { type MapGrid } from './maps.js';
import { type Environment, type GlassOptions } from './options.js';
export interface LensHost {
    env(): Environment;
}
/**
 * A shape other than the element's own rounded rectangle (a container's merged glass): the field for the element's
 * size, a key that changes when the shape does, and where its shadow goes. Its light and coverage are images.
 */
export interface ShapeSource {
    field(w: number, h: number): Field;
    key(): string;
    shadowEl: HTMLElement;
    /** how far the element reaches past the shape's box on each side, px (room for the shadow) */
    pad: number;
    /** while the shape moves: cheaper maps and light, drawn every frame */
    moving(): boolean;
    /** the part of the box the shape is in (the map covers only that), px */
    bounds(): {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    /** how many elements' worth of map pixels the shape gets (a container is one filter for all its members) */
    detail(): number;
}
export declare class Lens {
    readonly el: HTMLElement;
    readonly id: string;
    options: GlassOptions;
    private js;
    private host;
    private pre;
    private main;
    private maps;
    private colour;
    private capNode;
    private fillBlur;
    private fillAlpha;
    private blurNode;
    private mixNode;
    private surface;
    private filterCss;
    private structure;
    private unitMaps;
    private following;
    private lightUrl;
    private passes;
    private stash;
    private bends;
    private w;
    private h;
    private radii;
    private margin;
    private mapRect;
    private mapGrid;
    private grid;
    private reach;
    private region;
    private mapKey;
    private lightKey;
    private settleTimer;
    private bulge;
    private tween;
    private hover;
    private pressed;
    private flat;
    private saved;
    private off;
    private shape;
    constructor(el: HTMLElement, js: Partial<GlassOptions>, host: LensHost, shape?: ShapeSource | null);
    private unlisten;
    /**
     * Read the options again (CSS custom properties, data attributes, `js` on top). Only a change to the filter's
     * structure rebuilds it; strength, refraction, fringe, frost, colour, light and shadow are attributes and styles, cheap
     * enough to change every frame.
     */
    refresh(js?: Partial<GlassOptions>): void;
    /** Set by a group: called whenever what the filter draws may have changed. */
    onChange: (() => void) | null;
    /** Counts the changes, so a group can tell whether anything changed since it last looked. */
    version: number;
    private batched;
    private wanted;
    private changed;
    private setBackdrop;
    private layer;
    private layerSaved;
    private get paint();
    /**
     * Glass with glass inside it, or none any more. An element with a backdrop filter is its descendants' backdrop root:
     * glass inside it would see only what the element paints, not what's behind it. So with glass inside, this glass's
     * own painting (the bending, its light and shadow, and the element's background over them) goes on a layer behind
     * its content: a child at z-index -1, in the element made a stacking context (positioned, z-index 0, which paints
     * where its backdrop filter had it paint). The element is then no backdrop root, and the glass inside sees through
     * this one as it would through Apple's: what's behind, bent and frosted, this glass's light, and what's on it.
     */
    setNested(on: boolean): void;
    /** A group draws (true) or stops drawing (false) this element's glass: its own filter goes off or back on, at once. */
    setBatched(on: boolean): void;
    /**
     * What a group needs to draw this element's glass in a filter of its own, or null if it can't: glass that doesn't
     * bend, a free shape, a dome's per-channel maps, noise (it's in the filter's coordinates), CSS filters in front, a
     * surface (images in the element's box), glass with glass inside (it paints on a layer of its own), or no map yet.
     * `filters` are the element's own filter elements (the group copies them), `images` its map's (a grey per channel),
     * `side` how far the map is stashed beside the element, `margin` how far the filters reach past it (and `right`, past
     * its right side, which can be further).
     */
    batchSource(): {
        filters: SVGFilterElement[];
        images: SVGFEImageElement[];
        tables: [SVGFEComponentTransferElement, SVGFEComponentTransferElement];
        shifts: SVGFEOffsetElement[];
        side: number;
        margin: number;
        right: number;
        grid: MapGrid;
        mapMargin: number;
    } | null;
    /** What, in the options, decides which filter nodes there are. */
    private structureKey;
    /** A shape the element's own (rounded) box can't clip: the filter masks itself, and light and shadow are an image. */
    private isFree;
    /** A free shape's field, for the element's size. */
    private freeField;
    /** Apply what changed without rebuilding: matrix, blur, fringe, strength, backdrop, light, shadow, size. */
    private live;
    /** The surface's images and, at strength s, its gain and offset: a gain of 1 − s·(1 − g), an offset of s·(o − ½). */
    private applySurface;
    /** The strength, 0..1. */
    private amount;
    /** Follow running transitions and animations of --glass-* properties on the element, a frame at a time. */
    private follow;
    /** The frost and colour as CSS functions, scaled by the strength (glass that doesn't bend, and other browsers). */
    private cssBackdrop;
    /** The border-box size, as the ResizeObserver reported it. */
    resize(w: number, h: number): void;
    /**
     * Draw the map on a group's grid (or its own again, with null): glass of the same size on one grid, whole map pixels
     * apart, shares one image in the group. The element draws that same map itself, so it looks the same in the group or
     * out of it. Resolves once it's on screen.
     */
    setGrid(grid: MapGrid | null): Promise<void>;
    private measure;
    private build;
    /**
     * The colour matrix: saturation, brightness (baseBrightness, 6% as liquidglass's glass is, plus a button's hover) and
     * tint, after `colorMatrix` if there is one; with macOS's cap on brightness, the luma in alpha too (see build).
     */
    private matrix;
    /** Whether macOS's blur fill applies (regular glass, bevelMode 4). */
    private filled;
    /** Whether macOS's cap on dark regular glass's brightness applies. */
    private capped;
    /** The cap's table: from 0.5 + luma / 2 (in alpha) to the share of the colour kept, at the current strength. */
    private capTable;
    /** The frost, σ px: blurAmount's, and for macOS's glass (bevelMode 4) sized by the element as macOS sizes it. */
    private frost;
    /** The shape changed (a container's members moved): draw it again now. */
    reshape(): void;
    private layout;
    /** Size the filters, and put the maps where they go: past the element by their margin, and beside it when stashed. */
    private place;
    /** The corner radii, and whether they're the element's own CSS ones (circular, in px). */
    private cornerRadii;
    /** Resolves once the map and light asked for so far are on screen. */
    whenDrawn(): Promise<void>;
    private drawing;
    private draw;
    /**
     * A free shape's light and shadow, as one image stretched over the element and past it (border-image-outset), so
     * the shadow can fall outside the box. Painted once, like a rounded rectangle's.
     */
    private drawFreeLight;
    /**
     * A shape's light, shadow and coverage, as images on the element (and its shadow layer), over the part of the box
     * the shape is in and its shadow's reach (positioned there; the rest has no glass). While the shape moves, at half
     * the resolution.
     */
    private drawFieldLight;
    private drawLight;
    /**
     * The light at the current strength: the image cross-faded with a transparent one of the same size (so a 9-slice
     * still lines up), which is only a change of style, every frame if need be.
     */
    private applyLight;
    private applyStrength;
    private tweenBulge;
    private setPressed;
    private recolour;
    private bindPointer;
    destroy(): void;
}
