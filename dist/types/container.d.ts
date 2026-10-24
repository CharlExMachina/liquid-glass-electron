import { type LensHost } from './lens.js';
import type { GlassOptions } from './options.js';
export interface ContainerOptions extends Partial<GlassOptions> {
    /** how close, px, two shapes have to come before they start to flow together (Apple's spacing; 16) */
    spacing?: number;
    /** which descendants are the glass shapes (default: [data-glass], [data-glass-member]) */
    members?: string;
}
export declare class GlassContainer {
    readonly el: HTMLElement;
    readonly options: ContainerOptions;
    private lens;
    private glassLayer;
    private shadowLayer;
    private members;
    private key;
    private pad;
    private movingUntil;
    private running;
    private sizes;
    private tree;
    private saved;
    private stopEvents;
    constructor(el: HTMLElement, options: ContainerOptions, host: LensHost);
    private spacing;
    private isMember;
    /** Measure the members (their transformed boxes, so moving ones count) and lay the layers over the container. */
    private measure;
    private drawn;
    private pending;
    private settle;
    /**
     * Measure the members again and redraw the glass if they moved. One redraw at a time: while one is being decoded,
     * the next waits, and then draws the latest shape (so a fast drag skips shapes rather than queueing them).
     */
    update(): void;
    /** Follow the members every frame for `ms` (while they move in ways the container can't see coming). */
    animate(ms?: number): void;
    /** Change the glass's options (spacing too). */
    set(options: ContainerOptions): void;
    destroy(): void;
}
