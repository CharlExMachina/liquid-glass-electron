export type Variant = 'regular' | 'clear' | 'identity';
export type Shape = 'rect' | 'capsule' | 'circle' | 'concentric' | 'squircle' | 'path';
export type Press = 'flatten' | 'bulge' | 'none';
export interface GlassOptions {
    /** frost: blur of the backdrop (0; 1 ≈ a 7.6 px Gaussian) */
    blurAmount: number;
    /** how much the bevel bends the backdrop (0.69). 0 = no bending at all, only the lighting, which costs nothing per frame */
    refraction: number;
    /** colour fringing at the rim (0.05). Costs two more passes per frame */
    chromAberration: number;
    /** the bright stroke and glow along the edge (0.05) */
    edgeHighlight: number;
    /** highlights from four lights (0) */
    specular: number;
    /** light reflected at grazing angles, toward the rim (1) */
    fresnel: number;
    /** micro-noise in the bending, like textured glass (0) */
    distortion: number;
    /** corner radius in px; null = the element's own border-radius */
    cornerRadius: number | null;
    /** depth of the curved rim, px (40) */
    zRadius: number;
    /** how much of the glass shows over the plain backdrop (1) */
    opacity: number;
    /** saturation boost (0; 0.5 = 1.5×) */
    saturation: number;
    /** tint toward `tint` (0) */
    tintStrength: number;
    /** brightness boost (0), on top of baseBrightness */
    brightness: number;
    /** the brightening the glass always has, as liquidglass's does (0.06 = 6%); 0 = none */
    baseBrightness: number;
    shadowOpacity: number;
    shadowSpread: number;
    shadowOffsetY: number;
    /** drag to move */
    floating: boolean;
    /** floating glass stretches along the way it's dragged, by how fast, and springs back (0.15; 0 = rigid) */
    elasticity: number;
    /** button: hover brightens, press flattens the bevel and deepens the shadow */
    button: boolean;
    /**
     * 0 = a pill with a bevelled rim (liquidglass's), 1 = a dome that magnifies the whole element, 2 = Apple's lens: the
     * rim magnifies toward the middle, most at the edge and fading out `zRadius` px in, and the middle is flat,
     * 3 = Apple's switch lens: it shrinks what's behind it, and its rim folds back (scaled to the element, not `zRadius`)
     */
    bevelMode: 0 | 1 | 2 | 3;
    /**
     * how much glass there is, 0..1 (1): bending, fringe, frost, colour, light, fill and shadow together. Cheap to change
     * every frame (no filter is rebuilt), so glass can come and go within an animation; at 0 it costs nothing
     */
    strength: number;
    /** Apple's Glass.regular / .clear / .identity; null = liquidglass's defaults (close to .clear) */
    variant: Variant | null;
    /**
     * CSS filter functions applied to the backdrop before the glass, as written (`blur(2px) saturate(1.4)`): for a look
     * already written in CSS. blurAmount and saturation do the same inside the glass's own filter, which is cheaper
     */
    backdrop: string | null;
    /** the colour tintStrength mixes toward (multiplied); null = liquidglass's cool glass (0.92, 0.95, 1.05) */
    tint: string | null;
    /** a colour laid over the glass, as Apple's .tint(_:) and tinted buttons are; null = none */
    fill: string | null;
    /**
     * rect (cornerRadius), capsule, circle, concentric (the radius of the glass it sits in, less the inset), squircle
     * (Apple's continuous corners, of cornerRadius), or path (any shape: `path`)
     */
    shape: Shape;
    /** for shape: 'path', SVG path data: in the element's px, or in `pathBox` units stretched over the element */
    path: string | null;
    /** the path's viewBox, "x y width height"; null = the path is in the element's px */
    pathBox: string | null;
    /** Apple's .interactive(): a press scales the glass up, bends it more and lights it where it's touched */
    interactive: boolean;
    /** what a press does: flatten (button mode's default), bulge (bend more), none */
    press: Press | null;
    /** extra bending while pressed, for press: bulge (0.25) */
    pressBulge: number;
    /** smooth the backdrop before bending it (true): evens out the grain where the rim squeezes it */
    smooth: boolean;
    /** the slight magnification toward the middle of a pill (true) */
    magnify: boolean;
    /** follow the system's Clear/Tinted setting and the accessibility settings (true) */
    adaptive: boolean;
    /**
     * share one filter with the glass next to it (true): sibling glass is bent by one backdrop filter wherever that draws
     * the same pixels, which costs a fraction per frame. false = a filter of its own, always
     */
    group: boolean;
}
export declare const DEFAULTS: GlassOptions;
/** Apple's glass variants, as option sets. `fill` values that depend on light or dark are resolved later. */
export declare const VARIANTS: Record<Variant, Partial<GlassOptions>>;
/** Options set as CSS custom properties (--glass-chrom-aberration, or the short --glass-aberration) on the element. */
export declare function fromCss(style: CSSStyleDeclaration): Partial<GlassOptions>;
/**
 * Options set as data attributes: data-glass="regular" (a variant) or data-glass='{"refraction": 0.5}' (JSON), and
 * data-glass-refraction="0.5", data-glass-floating and so on.
 */
export declare function fromData(el: HTMLElement): Partial<GlassOptions>;
export interface Environment {
    dark: boolean;
    appearance: 'clear' | 'tinted';
    reduceTransparency: boolean;
    increaseContrast: boolean;
    reduceMotion: boolean;
}
/** The options from every source, then adjusted for the system's settings. */
export declare function resolve(sources: Partial<GlassOptions>[], env: Environment): GlassOptions;
