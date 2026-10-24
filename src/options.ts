// Options: liquidglass's names and defaults, plus what's needed for Apple's Liquid Glass knobs. They come from four
// places, later ones winning: the defaults, the variant, CSS custom properties (--glass-refraction), data attributes
// (data-glass-refraction) and the options passed to glass(). The system's settings (Clear/Tinted, Reduce
// Transparency, Increase Contrast) are applied on top.

export type Variant = 'regular' | 'clear' | 'identity';
export type Shape = 'rect' | 'capsule' | 'circle' | 'concentric';
export type Press = 'flatten' | 'bulge' | 'none';

export interface GlassOptions {
  // ---- liquidglass's options, same names and defaults
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
  /** brightness boost (0; the glass is always 6% brighter, as liquidglass's is) */
  brightness: number;
  shadowOpacity: number;
  shadowSpread: number;
  shadowOffsetY: number;
  /** drag to move */
  floating: boolean;
  /** button: hover brightens, press flattens the bevel and deepens the shadow */
  button: boolean;
  /** 0 = a pill with a bevelled rim, 1 = a dome that magnifies the whole element */
  bevelMode: 0 | 1;

  // ---- beyond liquidglass
  /** Apple's Glass.regular / .clear / .identity; null = liquidglass's defaults (close to .clear) */
  variant: Variant | null;
  /** the colour tintStrength mixes toward (multiplied); null = liquidglass's cool glass (0.92, 0.95, 1.05) */
  tint: string | null;
  /** a colour laid over the glass, as Apple's .tint(_:) and tinted buttons are; null = none */
  fill: string | null;
  /** rect (cornerRadius), capsule, circle, or concentric: the radius of the glass it sits in, less the inset */
  shape: Shape;
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
}

export const DEFAULTS: GlassOptions = {
  blurAmount: 0,
  refraction: 0.69,
  chromAberration: 0.05,
  edgeHighlight: 0.05,
  specular: 0,
  fresnel: 1,
  distortion: 0,
  cornerRadius: null,
  zRadius: 40,
  opacity: 1,
  saturation: 0,
  tintStrength: 0,
  brightness: 0,
  shadowOpacity: 0.3,
  shadowSpread: 10,
  shadowOffsetY: 1,
  floating: false,
  button: false,
  bevelMode: 0,
  variant: null,
  tint: null,
  fill: null,
  shape: 'rect',
  interactive: false,
  press: null,
  pressBulge: 0.25,
  smooth: true,
  magnify: true,
  adaptive: true,
};

/** Apple's glass variants, as option sets. `fill` values that depend on light or dark are resolved later. */
export const VARIANTS: Record<Variant, Partial<GlassOptions>> = {
  // frosted, saturated, a faint fill: legible over anything
  regular: { blurAmount: 0.5, saturation: 0.5, refraction: 0.69, fill: 'auto' },
  // liquidglass's defaults: clear, sharp bending; wants a dim or simple backdrop for text
  clear: {},
  // no glass at all: for switching it off without changing the layout
  identity: { refraction: 0, chromAberration: 0, edgeHighlight: 0, fresnel: 0, specular: 0, shadowOpacity: 0 },
};

const NUMBERS = ['blurAmount', 'refraction', 'chromAberration', 'edgeHighlight', 'specular', 'fresnel', 'distortion', 'cornerRadius',
  'zRadius', 'opacity', 'saturation', 'tintStrength', 'brightness', 'shadowOpacity', 'shadowSpread', 'shadowOffsetY', 'bevelMode',
  'pressBulge'] as const;
const BOOLEANS = ['floating', 'button', 'interactive', 'smooth', 'magnify', 'adaptive'] as const;
const STRINGS = ['variant', 'tint', 'fill', 'shape', 'press'] as const;
const ALL: readonly string[] = [...NUMBERS, ...BOOLEANS, ...STRINGS];

// The names Libre Hub's engine used, for its CSS: --glass-bevel and so on.
const ALIASES: Record<string, keyof GlassOptions> = {
  bevel: 'zRadius', aberration: 'chromAberration', edge: 'edgeHighlight', dome: 'bevelMode', blur: 'blurAmount', radius: 'cornerRadius',
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function coerce(key: string, raw: string): unknown {
  const v = raw.trim();
  if ((NUMBERS as readonly string[]).includes(key)) {
    if (key === 'cornerRadius' && (v === '' || v === 'auto')) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if ((BOOLEANS as readonly string[]).includes(key)) return v === '' || v === 'true' || v === '1' || v === 'yes';
  return v === '' || v === 'none' || v === 'null' ? null : v;
}

/** Options set as CSS custom properties (--glass-chrom-aberration, or the short --glass-aberration) on the element. */
export function fromCss(style: CSSStyleDeclaration): Partial<GlassOptions> {
  const out: Record<string, unknown> = {};
  for (const key of ALL) {
    const raw = style.getPropertyValue(`--glass-${kebab(key)}`);
    if (raw.trim() !== '') {
      const v = coerce(key, raw);
      if (v !== undefined) out[key] = v;
    }
  }
  for (const [alias, key] of Object.entries(ALIASES)) {
    if (key in out) continue;
    const raw = style.getPropertyValue(`--glass-${alias}`);
    if (raw.trim() === '') continue;
    // --glass-dome was 0 or 1, as bevelMode is
    const v = coerce(key, raw);
    if (v !== undefined) out[key] = v;
  }
  return out as Partial<GlassOptions>;
}

/**
 * Options set as data attributes: data-glass="regular" (a variant) or data-glass='{"refraction": 0.5}' (JSON), and
 * data-glass-refraction="0.5", data-glass-floating and so on.
 */
export function fromData(el: HTMLElement): Partial<GlassOptions> {
  const out: Record<string, unknown> = {};
  const main = el.dataset.glass?.trim();
  if (main) {
    if (main.startsWith('{')) {
      try {
        Object.assign(out, JSON.parse(main));
      } catch {
        console.warn('liquid-glass-electron: data-glass is not valid JSON:', main);
      }
    } else if (main in VARIANTS) {
      out.variant = main;
    }
  }
  for (const key of [...ALL, ...Object.keys(ALIASES)]) {
    const attr = el.getAttribute(`data-glass-${kebab(key)}`);
    if (attr === null) continue;
    const name = ALIASES[key] ?? key;
    const v = coerce(name, attr);
    if (v !== undefined) out[name] = v;
  }
  return out as Partial<GlassOptions>;
}

export interface Environment {
  dark: boolean;
  appearance: 'clear' | 'tinted';
  reduceTransparency: boolean;
  increaseContrast: boolean;
  reduceMotion: boolean;
}

/** The options from every source, then adjusted for the system's settings. */
export function resolve(sources: Partial<GlassOptions>[], env: Environment): GlassOptions {
  const merged: GlassOptions = { ...DEFAULTS };
  const variant = sources.reduce<Variant | null>((v, s) => (s.variant !== undefined ? s.variant : v), null);
  if (variant && VARIANTS[variant]) Object.assign(merged, VARIANTS[variant]);
  for (const s of sources) {
    for (const [k, v] of Object.entries(s)) if (v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v;
  }
  merged.variant = variant;
  if (merged.button && merged.press === null) merged.press = 'flatten';
  if (merged.interactive && merged.press === null) merged.press = 'bulge';
  if (merged.variant === 'identity' || !merged.adaptive) return finishFill(merged, env);

  // The system's Clear/Tinted setting: tinted glass is frostier and more opaque, so what's on it reads better.
  if (env.appearance === 'tinted') {
    merged.blurAmount = Math.max(merged.blurAmount, 0.8);
    merged.saturation = Math.max(merged.saturation, 0.3);
    merged.fill ??= 'auto-tinted';
    if (merged.fill === 'auto') merged.fill = 'auto-tinted';
  }
  // Reduce Transparency: glass becomes frosted and nearly opaque.
  if (env.reduceTransparency) {
    merged.blurAmount = Math.max(merged.blurAmount, 2);
    merged.chromAberration = 0;
    merged.distortion = 0;
    merged.fill = merged.fill && !merged.fill.startsWith('auto') ? merged.fill : 'auto-opaque';
  }
  // Increase Contrast: a clear edge and a fill that separates the glass from what's behind it.
  if (env.increaseContrast) {
    merged.edgeHighlight = Math.max(merged.edgeHighlight, 0.6);
    merged.chromAberration = 0;
    if (!merged.fill || merged.fill === 'auto') merged.fill = 'auto-tinted';
  }
  return finishFill(merged, env);
}

/** The automatic fills, for light and dark. */
function finishFill(o: GlassOptions, env: Environment): GlassOptions {
  const fills: Record<string, [string, string]> = {
    auto: ['rgb(255 255 255 / 0.1)', 'rgb(20 20 24 / 0.12)'],
    'auto-tinted': ['rgb(250 250 252 / 0.55)', 'rgb(28 28 32 / 0.55)'],
    'auto-opaque': ['rgb(246 246 248 / 0.9)', 'rgb(30 30 34 / 0.9)'],
  };
  if (o.fill && fills[o.fill]) o.fill = fills[o.fill][env.dark ? 1 : 0];
  return o;
}
