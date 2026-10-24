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
    private passes;
    private stash;
    private bends;
    private w;
    private h;
    private radii;
    private margin;
    private region;
    private mapKey;
    private lightKey;
    private settleTimer;
    private strength;
    private tween;
    private hover;
    private pressed;
    private flat;
    private saved;
    private off;
    private shape;
    constructor(el: HTMLElement, js: Partial<GlassOptions>, host: LensHost, shape?: ShapeSource | null);
    /** Read the options again (CSS custom properties, data attributes, `js` on top) and rebuild. */
    refresh(js?: Partial<GlassOptions>): void;
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
    private draw;
    /** A shape's light, shadow and coverage, as images on the element (and its shadow layer). */
    private drawFieldLight;
    private drawLight;
    private applyStrength;
    private tweenStrength;
    private setPressed;
    private recolour;
    private bindPointer;
    destroy(): void;
}
