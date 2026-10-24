// liquid-glass-electron: liquid glass for Electron (and Chromium), bent by the compositor.
//
//   import { glass } from 'liquid-glass-electron';
//   glass(document.querySelector('.toolbar'), { blurAmount: 0.3 });
//
// or declaratively, for every element with data-glass now and later:
//
//   import { autoGlass } from 'liquid-glass-electron';
//   autoGlass();   // <nav data-glass="regular" data-glass-floating>
import { installStyles } from './dom.ts';
import { Lens } from './lens.ts';
import type { Environment, GlassOptions } from './options.ts';

export { DEFAULTS, VARIANTS } from './options.ts';
export type { Environment, GlassOptions, Press, Shape, Variant } from './options.ts';
export { morph, type MorphOptions } from './morph.ts';
export { GlassContainer, container, type ContainerOptions } from './container.ts';

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

const lenses = new Map<HTMLElement, Lens>();
let sizes: ResizeObserver | null = null;
let attrs: MutationObserver | null = null;
let pending = new Set<Lens>();

// ---------------------------------------------------------------- the environment

const media = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null);
const queries = {
  dark: media('(prefers-color-scheme: dark)'),
  reduceTransparency: media('(prefers-reduced-transparency: reduce)'),
  increaseContrast: media('(prefers-contrast: more)'),
  reduceMotion: media('(prefers-reduced-motion: reduce)'),
};
let overrides: Partial<Environment> = {};

/**
 * What the glass adapts to. Each comes from the page unless set with setEnvironment(): dark from
 * prefers-color-scheme (or <html data-glass-theme="dark">), appearance from <html data-glass-appearance="tinted">,
 * the accessibility settings from prefers-reduced-transparency, prefers-contrast and prefers-reduced-motion.
 */
export function getEnvironment(): Environment {
  const root = typeof document !== 'undefined' ? document.documentElement.dataset : {};
  const theme = root.glassTheme;
  return {
    dark: overrides.dark ?? (theme ? theme === 'dark' : !!queries.dark?.matches),
    appearance: overrides.appearance ?? (root.glassAppearance === 'tinted' ? 'tinted' : 'clear'),
    reduceTransparency: overrides.reduceTransparency ?? !!queries.reduceTransparency?.matches,
    increaseContrast: overrides.increaseContrast ?? !!queries.increaseContrast?.matches,
    reduceMotion: overrides.reduceMotion ?? !!queries.reduceMotion?.matches,
  };
}

/**
 * Override what the glass adapts to, for example from Electron's nativeTheme in the main process, or a setting of
 * the app's own (Clear/Tinted). Pass undefined for a key to follow the page again.
 */
export function setEnvironment(env: Partial<Environment>) {
  overrides = { ...overrides, ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete overrides[k as keyof Environment];
  refreshAll();
}

const host = { env: getEnvironment };

/** Read every glass's options again: after changing CSS custom properties, the theme or the appearance. */
export function refreshAll() {
  for (const lens of lenses.values()) lens.refresh();
}

let watching = false;
function watchEnvironment() {
  if (watching || typeof document === 'undefined') return;
  watching = true;
  for (const q of Object.values(queries)) q?.addEventListener('change', refreshAll);
  new MutationObserver(refreshAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-glass-theme', 'data-glass-appearance'] });
}

// ---------------------------------------------------------------- glass on elements

function observe(lens: Lens) {
  sizes ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize?.[0];
      lenses.get(e.target as HTMLElement)?.resize(box ? box.inlineSize : e.contentRect.width, box ? box.blockSize : e.contentRect.height);
    }
  });
  // A class or data attribute change can change the options; refresh once per frame at most.
  attrs ??= new MutationObserver((records) => {
    for (const r of records) {
      const l = lenses.get(r.target as HTMLElement);
      if (l) pending.add(l);
    }
    requestAnimationFrame(() => {
      const now = pending;
      pending = new Set();
      for (const l of now) if (lenses.get(l.el) === l) l.refresh();
    });
  });
  sizes.observe(lens.el, { box: 'border-box' });
  const filter = ['class', 'data-glass', ...[...lens.el.attributes].map((a) => a.name).filter((n) => n.startsWith('data-glass-'))];
  attrs.observe(lens.el, { attributes: true, attributeFilter: filter });
}

/** Make an element glass. Calling it again on the same element updates its options. */
export function glass(el: HTMLElement, options: Partial<GlassOptions> = {}): GlassHandle {
  installStyles();
  watchEnvironment();
  let lens = lenses.get(el);
  if (lens) lens.refresh(options);
  else {
    lens = new Lens(el, options, host);
    lenses.set(el, lens);
    observe(lens);
  }
  const l = lens;
  return {
    el,
    get options() {
      return l.options;
    },
    update: (o) => l.refresh(o),
    refresh: () => l.refresh(),
    destroy: () => unglass(el),
  };
}

/** Take the glass off an element. */
export function unglass(el: HTMLElement) {
  const lens = lenses.get(el);
  if (!lens) return;
  sizes?.unobserve(el);
  lens.destroy();
  lenses.delete(el);
}

/** The glass handle of an element, if it has one. */
export function glassOf(el: HTMLElement): GlassHandle | undefined {
  return lenses.has(el) ? glass(el) : undefined;
}

/**
 * Make every element matching `selector` glass, now and as they're added, and take it off them as they're removed.
 * Options come from their data attributes and CSS custom properties (and `options`, for all of them).
 */
export function autoGlass(selector = '[data-glass]', options: Partial<GlassOptions> = {}, root: ParentNode = document.body) {
  const add = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const found = el.matches(selector) ? [el, ...el.querySelectorAll<HTMLElement>(selector)] : [...el.querySelectorAll<HTMLElement>(selector)];
    for (const f of found) if (!lenses.has(f)) glass(f, options);
  };
  const mo = new MutationObserver((records) => {
    let removed = false;
    for (const r of records) {
      r.addedNodes.forEach(add);
      removed ||= r.removedNodes.length > 0;
      if (r.type === 'attributes') {
        const el = r.target as HTMLElement;
        if (el.matches(selector)) add(el);
        else if (lenses.has(el)) unglass(el);
      }
    }
    if (removed) for (const el of [...lenses.keys()]) if (!el.isConnected) unglass(el);
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-glass'] });
  add(root as Node);
  return {
    stop() {
      mo.disconnect();
    },
  };
}
