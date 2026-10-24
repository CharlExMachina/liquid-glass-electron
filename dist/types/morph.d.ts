import type { GlassOptions } from './options.js';
export interface MorphOptions {
    /** ms (420) */
    duration?: number;
    /** a CSS easing; the default overshoots a little, like a spring */
    easing?: string;
    /** the glass's options during the morph (by default, those of the element it arrives at, if it's glass) */
    glass?: Partial<GlassOptions>;
}
/** Bridges to the library's internals, set by index.ts. */
export declare const hooks: {
    glass: (el: HTMLElement, options: Partial<GlassOptions>) => {
        drawn(): Promise<void>;
        destroy(): void;
    };
    optionsOf: (_el: HTMLElement) => Partial<GlassOptions> | undefined;
    reduceMotion: () => boolean;
};
/**
 * Flow the glass of `from` into `to` (Apple's matchedGeometry transition between two views with the same
 * glassEffectID). `to` must be laid out (it can be visibility: hidden). Resolves when `to` is showing; `from` is left
 * hidden, for the caller to remove or keep.
 *
 * One piece of glass, the shape of `to`, is drawn once where `to` is, then moved there from `from`'s box with a
 * transform and a spring: the compositor bends in the element's own space, so the glass scales with it and nothing is
 * drawn again while it moves. `from`'s content fades as it leaves, `to`'s as it arrives.
 */
export declare function morph(from: HTMLElement, to: HTMLElement, options?: MorphOptions): Promise<void>;
export type Transition = 'materialize' | 'matchedGeometry' | 'identity';
/**
 * Glass appearing or disappearing in place (Apple's .materialize): it grows from 90% as its bending strengthens and
 * it fades in, or the reverse. 'identity' just shows or hides it.
 */
export declare function materialize(el: HTMLElement, direction: 'in' | 'out', options?: {
    duration?: number;
    transition?: Transition;
}): Promise<void>;
