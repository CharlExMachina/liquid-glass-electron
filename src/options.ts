// Options: liquidglass's names and defaults, plus what's needed for Apple's Liquid Glass knobs. They come from four
// places, later ones winning: the defaults, the variant, CSS custom properties (--glass-refraction), data attributes
// (data-glass-refraction) and the options passed to glass(). The system's settings (Clear/Tinted, Reduce
// Transparency, Increase Contrast) are applied on top.

export type Variant = 'regular' | 'clear' | 'identity';
export type Shape = 'rect' | 'capsule' | 'circle' | 'concentric' | 'squircle' | 'path';
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
   * 3 = Apple's switch lens: it shrinks what's behind it, and its rim folds back (scaled to the element, not `zRadius`),
   * 4 = macOS 27's glass: the rim samples inward along its normal, sized by the element as macOS sizes it (`zRadius` is
   * the most its height can be), and the frost is sized by it too (regular and clear glass are this)
   */
  bevelMode: 0 | 1 | 2 | 3 | 4;

  // ---- beyond liquidglass
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
  /**
   * what's behind the glass, for browsers whose backdrop-filter can't bend (Safari, Firefox): an <img>, <video> or
   * <canvas>, or a selector for one (looked up again when the document changes: the element may come later). The
   * glass there bends that element's picture, drawn with WebGL; anything else behind the glass isn't seen through it,
   * and where the glass reaches past the picture it's a plain blur. Without it, glass in those browsers is a plain
   * blur. Chromium bends whatever is behind the glass and doesn't need it. null = none
   */
  backdropSource: string | Element | null;
  /** the colour tintStrength mixes toward (multiplied); null = liquidglass's cool glass (0.92, 0.95, 1.05) */
  tint: string | null;
  /** a colour laid over the glass, as Apple's .tint(_:) and tinted buttons are; null = none */
  fill: string | null;
  /**
   * how the glass's surface changes what it shows, per pixel: out = gain × glass + offset, clipped. What one blend
   * can't draw: Apple's knobs add light to their rim and take it away along their edge, by the same amount over any
   * backdrop. Two images' URLs, each stretched over the element's box, in greys: the gain, and the offset (½ is none,
   * from −½ to ½). In CSS, --glass-surface: url(…) url(…). null = none
   */
  surface: [string, string] | null;
  /**
   * the backdrop's colour under the glass as a colour matrix: 12 numbers, three rows of red, green and blue gains and
   * an offset (0..1), in place of saturation, brightness and tint; 'auto' = macOS 27's, for the variant and light or
   * dark; null = none
   */
  colorMatrix: number[] | string | null;
  /** a thin dark line around the edge, as macOS draws: its opacity where the edge faces sideways, and up or down */
  outline: number;
  outlineTop: number;
  /**
   * macOS's light along the glass's top and bottom edges, which it draws in a focused window: 1 = its own, 0 none;
   * null (the default) = macOS's for the variants in a focused window (Environment.active), none otherwise. Bright at
   * the edge and gone 15 device px in, strongest where the edge faces up or down; on clear glass stronger over
   * mid-tones than over black or white, as macOS's is.
   */
  keyLight: number | null;
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
  baseBrightness: 0.06,
  shadowOpacity: 0.3,
  shadowSpread: 10,
  shadowOffsetY: 1,
  floating: false,
  elasticity: 0.15,
  button: false,
  bevelMode: 0,
  strength: 1,
  variant: null,
  backdrop: null,
  backdropSource: null,
  tint: null,
  fill: null,
  surface: null,
  colorMatrix: null,
  outline: 0,
  outlineTop: 0,
  keyLight: null,
  shape: 'rect',
  path: null,
  pathBox: null,
  interactive: false,
  press: null,
  pressBulge: 0.25,
  smooth: true,
  magnify: true,
  adaptive: true,
  group: true,
};

// What macOS 27 draws (SwiftUI's glassEffect, measured in test/native): no colour fringe, no light but a thin dark line
// around the edge, no shadow; a lens along the rim and the frost (bevelMode 4, sized by the element), and the colour
// as a matrix (colorMatrix 'auto', for light or dark).
const MACOS: Partial<GlassOptions> = {
  bevelMode: 4, zRadius: 20, chromAberration: 0, edgeHighlight: 0, fresnel: 0, specular: 0, shadowOpacity: 0, baseBrightness: 0,
  saturation: 0, magnify: false, colorMatrix: 'auto',
};

/** Apple's glass variants, as option sets. `fill` and `colorMatrix` values that depend on light or dark are resolved later. */
export const VARIANTS: Record<Variant, Partial<GlassOptions>> = {
  // frosted (σ ≈ 8 px on large glass, and a wider blur laid over it), saturated and lightened (or darkened): legible over anything
  regular: { ...MACOS, blurAmount: 1.097, refraction: 0.9, outline: 0.295, outlineTop: 0.194 },
  // more frost (σ ≈ 20 px on large glass), less colour: what's behind shows through as light, not detail
  clear: { ...MACOS, blurAmount: 2.665, refraction: 0.9, outline: 0.345, outlineTop: 0 },
  // no glass at all: for switching it off without changing the layout
  identity: { refraction: 0, chromAberration: 0, edgeHighlight: 0, fresnel: 0, specular: 0, shadowOpacity: 0 },
};

const NUMBERS = ['blurAmount', 'refraction', 'chromAberration', 'edgeHighlight', 'specular', 'fresnel', 'distortion', 'cornerRadius',
  'zRadius', 'opacity', 'saturation', 'tintStrength', 'brightness', 'baseBrightness', 'shadowOpacity', 'shadowSpread', 'shadowOffsetY', 'bevelMode',
  'pressBulge', 'strength', 'elasticity', 'outline', 'outlineTop', 'keyLight'] as const;
const BOOLEANS = ['floating', 'button', 'interactive', 'smooth', 'magnify', 'adaptive', 'group'] as const;
const STRINGS = ['variant', 'tint', 'fill', 'surface', 'shape', 'press', 'path', 'pathBox', 'backdrop', 'backdropSource', 'colorMatrix'] as const;
const ALL: readonly string[] = [...NUMBERS, ...BOOLEANS, ...STRINGS];

// The names Libre Hub's engine used, for its CSS: --glass-bevel and so on. Its --glass-tint was the app's background
// colour, not an option; here it's `tint` (which does nothing while tintStrength is 0).
const ALIASES: Record<string, keyof GlassOptions> = {
  bevel: 'zRadius', aberration: 'chromAberration', edge: 'edgeHighlight', dome: 'bevelMode', blur: 'blurAmount', radius: 'cornerRadius',
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * What a number option's custom property is where nothing sets it. They're registered as numbers (see
 * NUMBER_PROPERTIES), so they always have a value: this one, which isn't an option's.
 */
export const UNSET = -99999;
/**
 * The number options' custom properties, as the library registers them (installStyles): numbers (or lengths, for those
 * in px, as they could always be written), so CSS transitions and animations interpolate them (the glass follows),
 * inherited as unregistered ones are. --glass-strength is registered on its own (1 where it isn't set, not inherited).
 */
const IN_PX = ['cornerRadius', 'zRadius', 'shadowSpread', 'shadowOffsetY'];
export const NUMBER_PROPERTIES = NUMBERS.filter((k) => k !== 'strength')
  .map((k) => ({ name: `--glass-${kebab(k)}`, syntax: IN_PX.includes(k) ? '<number> | <length>' : '<number>' }));

function coerce(key: string, raw: string): unknown {
  const v = raw.trim();
  if ((NUMBERS as readonly string[]).includes(key)) {
    if (key === 'cornerRadius' && (v === '' || v === 'auto')) return null;
    const n = parseFloat(v);
    // not set (or on its way from not set, in a transition)
    if (n <= UNSET / 2) return undefined;
    return Number.isFinite(n) ? n : undefined;
  }
  if ((BOOLEANS as readonly string[]).includes(key)) {
    // a number counts as on above 0 (Libre Hub's --glass-smooth was a blur in px)
    const n = parseFloat(v);
    return Number.isFinite(n) ? n > 0 : v === '' || v === 'true' || v === 'yes';
  }
  if (v === '' || v === 'none' || v === 'null') return null;
  if (key === 'surface') {
    // --glass-surface: url(…) url(…), as CSS writes images
    const urls = [...v.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gs)].map((m) => m[2]);
    return urls.length === 2 ? urls : undefined;
  }
  return v;
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
  /** the display is wide-gamut (Display P3), where Chromium composites in its colour space; unset counts as wide */
  wideGamut?: boolean;
  /**
   * the window has focus: macOS draws its glass otherwise in the window in use (its key window) than in the others
   * (clear glass without frost and brighter); unset counts as focused
   */
  active?: boolean;
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

/**
 * macOS 27's colour, fitted to what SwiftUI's glass draws over photos, flat colours, greys and lines (test/native): per
 * variant, light and dark, three rows of red, green and blue gains and an offset. Chromium bends and colours the
 * backdrop in the display's colour space, so there's a matrix for a wide-gamut (Display P3) display, fitted to what the
 * filter sees there, and one for an sRGB display.
 */
export const MACOS_COLOUR: Record<'regular' | 'clear', Record<'p3' | 'srgb', [number[], number[]]>> = {
  regular: {
    p3: [
      [1.0109, -0.4446, -0.0421, 0.4042, -0.1385, 0.708, -0.0456, 0.4057, -0.1392, -0.4553, 1.1175, 0.4056],
      [1.0335, -0.2837, 0.0079, 0.0945, -0.0441, 0.7589, 0.0284, 0.0977, -0.07, -0.3057, 1.1334, 0.097],
    ],
    srgb: [
      [1.0352, -0.4969, -0.0143, 0.4039, -0.1223, 0.6788, -0.0302, 0.4021, -0.1298, -0.4899, 1.145, 0.4024],
      [1.0531, -0.3563, 0.0411, 0.0911, -0.0428, 0.704, 0.0665, 0.0921, -0.0715, -0.3338, 1.1377, 0.0976],
    ],
  },
  clear: {
    p3: [
      [0.8511, -0.1598, -0.0136, 0.2778, -0.0474, 0.7405, -0.0154, 0.2783, -0.0498, -0.1609, 0.8886, 0.278],
      [0.9006, -0.1663, -0.0195, 0.0955, -0.048, 0.7818, -0.0187, 0.0955, -0.0514, -0.1679, 0.9342, 0.0957],
    ],
    srgb: [
      [0.83, -0.1351, -0.0215, 0.2832, -0.0361, 0.7286, -0.0149, 0.2785, -0.053, -0.1526, 0.8823, 0.2793],
      [0.917, -0.2103, 0.0107, 0.0921, -0.045, 0.7741, -0.013, 0.0941, -0.0407, -0.1883, 0.9461, 0.0931],
    ],
  },
};

/**
 * macOS 27's clear glass in a focused window (Environment.active), fitted as MACOS_COLOUR is, to the flat colours and
 * greys under SwiftUI's glass made key (to within half a level): brighter and a little more saturated than in a window
 * that isn't, the same in light and dark (its glass filter's inputFaceColorMatrix: white 1.08, black 0.125, saturation
 * 1.06; what passes white is clipped). The sRGB one is the Display P3 one carried over to sRGB's values.
 */
export const MACOS_COLOUR_ACTIVE: Record<'regular' | 'clear', Record<'p3' | 'srgb', [number[], number[]]>> = {
  // regular glass 160 px and larger (smaller, see MACOS_SMALL_ACTIVE), brighter than in a window that isn't focused;
  // dark, under a cap on its luma a little higher than there (lens.ts)
  regular: {
    p3: [
      [1.0274, -0.3707, -0.0325, 0.415, -0.1186, 0.7848, -0.0419, 0.4163, -0.1104, -0.3791, 1.1137, 0.415],
      [1.0179, -0.3306, -0.0207, 0.1435, -0.0294, 0.6636, 0.0137, 0.1425, -0.0952, -0.3172, 1.089, 0.1434],
    ],
    srgb: [
      [0.9786, -0.3594, -0.0255, 0.4315, -0.0908, 0.7529, -0.035, 0.4137, -0.0895, -0.3818, 1.0725, 0.4247],
      [1.013, -0.3208, -0.0283, 0.1408, -0.04, 0.6694, 0.0154, 0.142, -0.1095, -0.3186, 1.1051, 0.1367],
    ],
  },
  clear: {
    p3: [
      [1.0394, -0.0766, -0.0071, 0.1246, -0.0229, 0.9865, -0.0079, 0.1247, -0.0209, -0.0755, 1.0521, 0.1248],
      [1.0394, -0.0766, -0.0071, 0.1246, -0.0229, 0.9865, -0.0079, 0.1247, -0.0209, -0.0755, 1.0521, 0.1248],
    ],
    srgb: [
      [1.0035, -0.0599, -0.0064, 0.1392, -0.011, 0.969, -0.0066, 0.1283, -0.0158, -0.0661, 1.0232, 0.1354],
      [1.0035, -0.0599, -0.0064, 0.1392, -0.011, 0.969, -0.0066, 0.1283, -0.0158, -0.0661, 1.0232, 0.1354],
    ],
  },
};

/**
 * Focused regular glass's colour at 64 px and smaller, light and dark: between 64 and 160 px (dark, 104) it goes from
 * this to MACOS_COLOUR_ACTIVE's (lens.ts).
 */
export const MACOS_SMALL_ACTIVE: Record<'p3' | 'srgb', [number[], number[]]> = {
  p3: [
    [1.0389, -0.405, -0.0388, 0.4036, -0.1215, 0.7577, -0.0411, 0.4039, -0.1196, -0.403, 1.1183, 0.4035],
    [1.0699, -0.3265, -0.0383, 0.1598, -0.0506, 0.7588, -0.0082, 0.1569, -0.1053, -0.3247, 1.1382, 0.1616],
  ],
  srgb: [
    [1.013, -0.4117, -0.0347, 0.4179, -0.0941, 0.7274, -0.0341, 0.4003, -0.0995, -0.4193, 1.0947, 0.4113],
    [1.0743, -0.3315, -0.0434, 0.1561, -0.0557, 0.7591, -0.0049, 0.1554, -0.1168, -0.3384, 1.1617, 0.1545],
  ],
};

/**
 * Dark regular glass's colour at 64 px and smaller: brighter than large glass's (macOS caps it less, see macMaxLuma);
 * between 64 and 104 px it goes from this to MACOS_COLOUR's (lens.ts).
 */
export const MACOS_SMALL_DARK: Record<'p3' | 'srgb', number[]> = {
  p3: [1.097, -0.2822, 0.0069, 0.093, -0.035, 0.8139, 0.0322, 0.095, -0.0641, -0.2836, 1.1696, 0.0934],
  srgb: [1.1322, -0.3705, 0.0417, 0.0906, -0.0471, 0.8063, 0.0327, 0.0978, -0.0684, -0.3061, 1.176, 0.0961],
};

/**
 * macOS's outline in the dark: darker, where light glass's is lighter. macOS's darkens what's behind it more the darker
 * that is (over a grey x, clear light glass's is about x × (¼ + x/2)), and a box-shadow can only scale it: regular
 * glass's is the opacity closest to macOS's over the tones of photos (test/native's), from its outline over nine greys
 * (the others, fitted so, came out further from macOS's around curves, where the shadows across and down overlap).
 */
const DARK_OUTLINE: Record<'regular' | 'clear', [number, number]> = { regular: [0.498, 0.339], clear: [0.49, 0] };

/**
 * macOS's outline in a focused window, light and dark: fitted as DARK_OUTLINE's regular one, from its outline over nine
 * greys around a circle (the sides', and the top's). Regular glass's is darker at the sides there and, in the dark, all
 * but gone at the top; clear glass's is the same light or dark.
 */
const ACTIVE_OUTLINE: Record<'regular' | 'clear', [[number, number], [number, number]]> = {
  regular: [[0.444, 0.183], [0.576, 0.089]],
  clear: [[0.393, 0], [0.393, 0]],
};

/** The automatic fills, for light and dark. */
function finishFill(o: GlassOptions, env: Environment): GlassOptions {
  const active = env.active !== false;
  if (o.colorMatrix === 'auto') {
    const table = (active ? MACOS_COLOUR_ACTIVE : MACOS_COLOUR)[o.variant === 'clear' ? 'clear' : 'regular'];
    o.colorMatrix = table[env.wideGamut === false ? 'srgb' : 'p3'][env.dark ? 1 : 0];
  } else if (o.colorMatrix !== null) {
    const m = typeof o.colorMatrix === 'string' ? o.colorMatrix.split(/[\s,]+/).filter(Boolean).map(Number) : o.colorMatrix;
    o.colorMatrix = Array.isArray(m) && m.length === 12 && m.every(Number.isFinite) ? m : null;
  }
  // In a focused window macOS's clear glass has no frost (its blur, 0): only its lens shows (frost of your own stays)
  if (active && o.variant === 'clear' && o.blurAmount === VARIANTS.clear.blurAmount) o.blurAmount = 0;
  // and the variants have its light along their top and bottom edges
  o.keyLight ??= active && (o.variant === 'regular' || o.variant === 'clear') ? 1 : 0;
  // the variants' outline, darker in the dark, and as macOS draws it in a focused window (an outline of your own stays
  // as it is)
  if (o.variant === 'regular' || o.variant === 'clear') {
    const v = VARIANTS[o.variant];
    if (o.outline === v.outline && o.outlineTop === v.outlineTop) {
      if (active) [o.outline, o.outlineTop] = ACTIVE_OUTLINE[o.variant][env.dark ? 1 : 0];
      else if (env.dark) [o.outline, o.outlineTop] = DARK_OUTLINE[o.variant];
    }
  }
  const fills: Record<string, [string, string]> = {
    auto: ['rgb(255 255 255 / 0.1)', 'rgb(20 20 24 / 0.12)'],
    'auto-tinted': ['rgb(250 250 252 / 0.55)', 'rgb(28 28 32 / 0.55)'],
    'auto-opaque': ['rgb(246 246 248 / 0.9)', 'rgb(30 30 34 / 0.9)'],
  };
  if (o.fill && fills[o.fill]) o.fill = fills[o.fill][env.dark ? 1 : 0];
  return o;
}
