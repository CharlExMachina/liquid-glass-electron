import { GlassContainer, type ContainerOptions } from './container.js';
import type { Environment, GlassOptions } from './options.js';
export { DEFAULTS, VARIANTS } from './options.js';
export type { Environment, GlassOptions, Press, Shape, Variant } from './options.js';
export { morph, materialize, type MorphOptions, type Transition } from './morph.js';
export { scrollEdge, type ScrollEdgeOptions } from './edges.js';
export { GlassContainer, type ContainerOptions } from './container.js';
export interface GlassHandle {
    readonly el: HTMLElement;
    /** the options in effect, after the system's settings */
    readonly options: GlassOptions;
    /**
     * change some options. Strength, refraction, fringe, frost, colour, light and shadow change without rebuilding the
     * filter, so this is cheap enough to call every frame
     */
    update(options: Partial<GlassOptions>): void;
    /** the same as update() */
    set(options: Partial<GlassOptions>): void;
    /**
     * tween numeric options to `to` over `duration` ms (any of them: strength, refraction, blurAmount, chromAberration…),
     * with a CSS easing function's shape (cubic-bezier, linear() or a keyword). Resolves when done
     */
    animate(to: Partial<GlassOptions>, options?: {
        duration?: number;
        easing?: string;
    }): Promise<void>;
    /** read the CSS custom properties and data attributes again */
    refresh(): void;
    /** resolves once the glass's map and light are on screen (they're drawn asynchronously after a change of size or shape) */
    drawn(): Promise<void>;
    /** take the glass off, restoring the element's own styles */
    destroy(): void;
}
/**
 * What the glass adapts to. Each comes from the page unless set with setEnvironment(): dark from
 * prefers-color-scheme (or <html data-glass-theme="dark">), appearance from <html data-glass-appearance="tinted">,
 * the accessibility settings from prefers-reduced-transparency, prefers-contrast and prefers-reduced-motion, and
 * whether the display is wide-gamut from color-gamut (macOS's colour is fitted for either).
 */
export declare function getEnvironment(): Environment;
/**
 * Override what the glass adapts to, for example from Electron's nativeTheme in the main process, or a setting of
 * the app's own (Clear/Tinted). Pass undefined for a key to follow the page again.
 */
export declare function setEnvironment(env: Partial<Environment>): void;
/** Read every glass's options again: after changing CSS custom properties, the theme or the appearance. */
export declare function refreshAll(): void;
/**
 * Make an element glass. Calling it again on the same element updates its options. Glass next to other glass (siblings
 * that don't overlap) shares one backdrop filter with it wherever that draws the same pixels, which costs a fraction
 * per frame; `group: false` keeps it on a filter of its own.
 */
export declare function glass(el: HTMLElement, options?: Partial<GlassOptions>): GlassHandle;
/**
 * Apple's GlassEffectContainer: the glass shapes inside `el` (elements with data-glass or data-glass-member) become
 * one piece of glass, flowing into each other where they come within `spacing` px, and morphing as they move.
 * Declaratively: <div data-glass-container="16"> with autoGlass().
 */
export declare function container(el: HTMLElement, options?: ContainerOptions): GlassContainer;
/** Take a container's glass off; its members go back to plain elements. */
export declare function uncontainer(el: HTMLElement): void;
/** Take the glass off an element. */
export declare function unglass(el: HTMLElement): void;
/** The glass handle of an element, if it has one. */
export declare function glassOf(el: HTMLElement): GlassHandle | undefined;
/**
 * Make every element matching `selector` glass, now and as they're added, and take it off them as they're removed.
 * Options come from their data attributes and CSS custom properties (and `options`, for all of them).
 */
export declare function autoGlass(selector?: string, options?: Partial<GlassOptions>, root?: ParentNode): {
    stop(): void;
};
export interface GlassGroupHandle {
    /** the members */
    readonly elements: HTMLElement[];
    /** change options on every member at once (they stay one filter) */
    set(options: Partial<GlassOptions>): void;
    /** the same as set() */
    update(options: Partial<GlassOptions>): void;
    /** tween numeric options on every member together, as GlassHandle.animate does */
    animate(to: Partial<GlassOptions>, options?: {
        duration?: number;
        easing?: string;
    }): Promise<void>;
    /** read every member's CSS custom properties and data attributes again, and measure where the members are */
    refresh(): void;
    /** resolves once every member's glass is on screen, drawn by the group where it can be */
    drawn(): Promise<void>;
    /** make an element glass (with the group's options and `options` on top) and a member */
    add(el: HTMLElement, options?: Partial<GlassOptions>): GlassHandle;
    /** take a member out of the group; it stays glass, with a filter of its own */
    remove(el: HTMLElement): void;
    /** take the glass off every member and remove the group */
    destroy(): void;
}
/**
 * Many glass elements, one backdrop filter: each element is glass as glass() makes it (its own options, light, shadow,
 * pointer behaviour; a handle from glassOf()), and one layer behind them bends the backdrop for all of them, which is
 * what costs per frame. Pass the elements, or their parent (its children with data-glass or data-glass-member).
 * glass() groups siblings by itself; this makes a group you control: set() and animate() change every member at once
 * and keep them one filter, and it trusts you with the rules glass() checks. The members must be siblings that don't
 * overlap, with nothing painted between them near their edges; a member that moves or changes on its own gets a filter
 * of its own while it does, and joins again once it settles.
 */
export declare function glassGroup(target: HTMLElement | Iterable<HTMLElement>, options?: Partial<GlassOptions>): GlassGroupHandle;
/**
 * Apple's glassEffectUnion: separate elements drawn as one piece of glass, joined however far apart they are. Their
 * parent becomes a container whose spacing reaches across the widest gap between them.
 */
export declare function union(elements: HTMLElement[], options?: ContainerOptions): GlassContainer;
export type ButtonStyle = 'glass' | 'prominent';
/**
 * Apple's .glass and .glassProminent button styles: a capsule of regular glass that responds to the pointer;
 * prominent is tinted with the accent colour (options.fill, or the CSS variable --glass-accent).
 */
export declare function glassButton(el: HTMLElement, style?: ButtonStyle, options?: Partial<GlassOptions>): GlassHandle;
