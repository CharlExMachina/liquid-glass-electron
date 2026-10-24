import { type Field } from './field.js';
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
    private blurNode;
    private mixNode;
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
    /** What, in the options, decides which filter nodes there are. */
    private structureKey;
    /** A shape the element's own (rounded) box can't clip: the filter masks itself, and light and shadow are an image. */
    private isFree;
    /** A free shape's field, for the element's size. */
    private freeField;
    /** Apply what changed without rebuilding: matrix, blur, fringe, strength, backdrop, light, shadow, size. */
    private live;
    /** The strength, 0..1. */
    private amount;
    /** Follow running transitions and animations of --glass-* properties on the element, a frame at a time. */
    private follow;
    /** The frost and colour as CSS functions, scaled by the strength (glass that doesn't bend, and other browsers). */
    private cssBackdrop;
    /** The border-box size, as the ResizeObserver reported it. */
    resize(w: number, h: number): void;
    private measure;
    private build;
    /** The colour matrix: saturation, brightness (6% always, as liquidglass's glass is, plus a button's hover) and tint. */
    private matrix;
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
