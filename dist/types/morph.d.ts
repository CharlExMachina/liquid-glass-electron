import type { GlassContainer } from './container.js';
import type { GlassOptions } from './options.js';
export interface MorphOptions {
    /** ms (420) */
    duration?: number;
    /** a CSS easing; the default overshoots a little, like a spring */
    easing?: string;
    /** the glass's options during the morph (by default, those of the element it arrives at, if it's glass) */
    glass?: Partial<GlassOptions>;
}
/** Bridges to the library's internals, set by index.ts (morph needs a container and an element's options). */
export declare const hooks: {
    container: (el: HTMLElement, options: Partial<GlassOptions> & {
        spacing?: number;
    }) => GlassContainer;
    uncontainer: (el: HTMLElement) => void;
    optionsOf: (_el: HTMLElement) => Partial<GlassOptions> | undefined;
    reduceMotion: () => boolean;
};
/**
 * Flow the glass of `from` into `to` (Apple's matchedGeometry transition between two views with the same
 * glassEffectID). `to` must be laid out (it can be visibility: hidden). Resolves when `to` is showing; `from` is left
 * hidden, for the caller to remove.
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
