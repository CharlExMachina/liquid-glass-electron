import type { Environment, GlassOptions } from './options.js';
export { DEFAULTS, VARIANTS } from './options.js';
export type { Environment, GlassOptions, Press, Shape, Variant } from './options.js';
export { morph, type MorphOptions } from './morph.js';
export { GlassContainer, container, type ContainerOptions } from './container.js';
export interface GlassHandle {
    readonly el: HTMLElement;
    /** the options in effect, after the system's settings */
    readonly options: GlassOptions;
    /** change some options */
    update(options: Partial<GlassOptions>): void;
    /** read the CSS custom properties and data attributes again */
    refresh(): void;
    /** take the glass off, restoring the element's own styles */
    destroy(): void;
}
/**
 * What the glass adapts to. Each comes from the page unless set with setEnvironment(): dark from
 * prefers-color-scheme (or <html data-glass-theme="dark">), appearance from <html data-glass-appearance="tinted">,
 * the accessibility settings from prefers-reduced-transparency, prefers-contrast and prefers-reduced-motion.
 */
export declare function getEnvironment(): Environment;
/**
 * Override what the glass adapts to, for example from Electron's nativeTheme in the main process, or a setting of
 * the app's own (Clear/Tinted). Pass undefined for a key to follow the page again.
 */
export declare function setEnvironment(env: Partial<Environment>): void;
/** Read every glass's options again: after changing CSS custom properties, the theme or the appearance. */
export declare function refreshAll(): void;
/** Make an element glass. Calling it again on the same element updates its options. */
export declare function glass(el: HTMLElement, options?: Partial<GlassOptions>): GlassHandle;
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
