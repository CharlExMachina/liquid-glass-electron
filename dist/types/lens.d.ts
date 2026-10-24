import { type Environment, type GlassOptions } from './options.js';
export interface LensHost {
    env(): Environment;
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
    constructor(el: HTMLElement, js: Partial<GlassOptions>, host: LensHost);
    /** Read the options again (CSS custom properties, data attributes, `js` on top) and rebuild. */
    refresh(js?: Partial<GlassOptions>): void;
    /** The border-box size, as the ResizeObserver reported it. */
    resize(w: number, h: number): void;
    private measure;
    private build;
    /** The colour matrix: saturation, brightness (6% always, as liquidglass's glass is, plus a button's hover) and tint. */
    private matrix;
    private layout;
    /** Size the filters, and put the maps where they go: past the element by their margin, and beside it when stashed. */
    private place;
    /** The corner radii, and whether they're the element's own CSS ones (circular, in px). */
    private cornerRadii;
    private draw;
    private drawLight;
    private applyStrength;
    private tweenStrength;
    private setPressed;
    private recolour;
    private bindPointer;
    destroy(): void;
}
