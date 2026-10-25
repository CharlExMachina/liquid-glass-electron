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
import { GlassContainer, type ContainerOptions } from './container.ts';
import { GlassGroup } from './group.ts';
import { Lens } from './lens.ts';
import { hooks } from './morph.ts';
import type { Environment, GlassOptions } from './options.ts';

export { DEFAULTS, VARIANTS } from './options.ts';
export type { Environment, GlassOptions, Press, Shape, Variant } from './options.ts';
export { morph, materialize, type MorphOptions, type Transition } from './morph.ts';
export { scrollEdge, type ScrollEdgeOptions } from './edges.ts';
export { GlassContainer, type ContainerOptions } from './container.ts';

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
  animate(to: Partial<GlassOptions>, options?: { duration?: number; easing?: string }): Promise<void>;
  /** read the CSS custom properties and data attributes again */
  refresh(): void;
  /** resolves once the glass's map and light are on screen (they're drawn asynchronously after a change of size or shape) */
  drawn(): Promise<void>;
  /** take the glass off, restoring the element's own styles */
  destroy(): void;
}

const lenses = new Map<HTMLElement, Lens>();
const containers = new Map<HTMLElement, GlassContainer>();
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
  for (const c of containers.values()) c.set({});
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
    set: (o) => l.refresh(o),
    animate: (to, opts = {}) => tween([l], to, opts),
    refresh: () => l.refresh(),
    drawn: () => l.whenDrawn(),
    destroy: () => unglass(el),
  };
}

/**
 * Apple's GlassEffectContainer: the glass shapes inside `el` (elements with data-glass or data-glass-member) become
 * one piece of glass, flowing into each other where they come within `spacing` px, and morphing as they move.
 * Declaratively: <div data-glass-container="16"> with autoGlass().
 */
export function container(el: HTMLElement, options: ContainerOptions = {}): GlassContainer {
  installStyles();
  watchEnvironment();
  for (const member of el.querySelectorAll<HTMLElement>('[data-glass], [data-glass-member]')) unglass(member);
  const existing = containers.get(el);
  if (existing) {
    existing.set(options);
    return existing;
  }
  const c = new GlassContainer(el, { ...fromContainerData(el), ...options }, host);
  containers.set(el, c);
  return c;
}

/** Take a container's glass off; its members go back to plain elements. */
export function uncontainer(el: HTMLElement) {
  containers.get(el)?.destroy();
  containers.delete(el);
}

function fromContainerData(el: HTMLElement): ContainerOptions {
  const spacing = parseFloat(el.dataset.glassContainer ?? '');
  return Number.isFinite(spacing) ? { spacing } : {};
}

/**
 * Numeric options from where they are to `to`, a frame at a time. The easing is sampled through the Web Animations
 * API, so any CSS easing works (springs with linear(), cubic-bezier, ease-out…).
 */
function tween(ls: Lens[], to: Partial<GlassOptions>, { duration = 300, easing = 'ease' }: { duration?: number; easing?: string }): Promise<void> {
  const keys = Object.keys(to).filter((k) => typeof to[k as keyof GlassOptions] === 'number') as (keyof GlassOptions)[];
  // all of them in one frame callback, so a group's members change together
  const froms = ls.map((l) => Object.fromEntries(keys.map((k) => [k, l.options[k] as number])));
  if (getEnvironment().reduceMotion) duration = 0;
  // the easing's progress: a dummy animation on a detached element, read each frame
  const probe = document.createElement('div').animate([{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(duration, 1), easing, fill: 'forwards' });
  probe.pause();
  const t0 = performance.now();
  return new Promise((done) => {
    const step = (now: number) => {
      const p = duration ? Math.min((now - t0) / duration, 1) : 1;
      probe.currentTime = p * Math.max(duration, 1);
      const e = Number((probe.effect as KeyframeEffect).getComputedTiming().progress ?? p);
      const eased = Number.isFinite(e) ? e : p;
      ls.forEach((l, i) => l.refresh(Object.fromEntries(keys.map((k) => [k, froms[i][k] + ((to[k] as number) - froms[i][k]) * eased])) as Partial<GlassOptions>));
      if (p < 1) requestAnimationFrame(step);
      else {
        for (const l of ls) l.refresh(Object.fromEntries(keys.map((k) => [k, to[k]])) as Partial<GlassOptions>);
        done();
      }
    };
    requestAnimationFrame(step);
  });
}

/** Take the glass off an element. */
export function unglass(el: HTMLElement) {
  const lens = lenses.get(el);
  if (!lens) return;
  groups.get(el)?.remove(el);
  groups.delete(el);
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
  // only glass this made is taken off again: glass() on an element is the page's to remove
  const made = new Set<HTMLElement>();
  const add = (node: Node) => {
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const all = (sel: string) => (el.matches(sel) ? [el, ...el.querySelectorAll<HTMLElement>(sel)] : [...el.querySelectorAll<HTMLElement>(sel)]);
    for (const c of all('[data-glass-container]')) if (!containers.has(c)) container(c, options);
    // a container's members are part of its glass, not glass of their own
    for (const f of all(selector)) {
      if (lenses.has(f) || f.closest('[data-glass-container]')) continue;
      glass(f, options);
      made.add(f);
    }
  };
  const drop = (el: HTMLElement) => {
    unglass(el);
    made.delete(el);
  };
  const mo = new MutationObserver((records) => {
    let removed = false;
    for (const r of records) {
      r.addedNodes.forEach(add);
      removed ||= r.removedNodes.length > 0;
      if (r.type === 'attributes') {
        const el = r.target as HTMLElement;
        if (el.matches(selector)) add(el);
        else if (made.has(el)) drop(el);
      }
    }
    if (removed) {
      for (const el of [...made]) if (!el.isConnected) drop(el);
      for (const el of [...containers.keys()]) if (!el.isConnected) uncontainer(el);
    }
  });
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-glass', 'data-glass-container'] });
  add(root as Node);
  return {
    stop() {
      mo.disconnect();
    },
  };
}

// ---------------------------------------------------------------- groups

const groups = new Map<HTMLElement, GlassGroup>();

export interface GlassGroupHandle {
  /** the members */
  readonly elements: HTMLElement[];
  /** change options on every member at once (they stay one filter) */
  set(options: Partial<GlassOptions>): void;
  /** the same as set() */
  update(options: Partial<GlassOptions>): void;
  /** tween numeric options on every member together, as GlassHandle.animate does */
  animate(to: Partial<GlassOptions>, options?: { duration?: number; easing?: string }): Promise<void>;
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
 * The members must be siblings that don't overlap, with nothing painted between them near their edges; a member that
 * moves or changes on its own gets a filter of its own while it does, and joins again once it settles.
 */
export function glassGroup(target: HTMLElement | Iterable<HTMLElement>, options: Partial<GlassOptions> = {}): GlassGroupHandle {
  const els = target instanceof HTMLElement ? [...target.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.matches('[data-glass], [data-glass-member]')) : [...target];
  const group = new GlassGroup({ lensOf: (el) => lenses.get(el) });
  const add = (el: HTMLElement, o: Partial<GlassOptions> = {}) => {
    groups.get(el)?.remove(el);
    const handle = glass(el, { ...options, ...o });
    groups.set(el, group);
    group.add(el);
    return handle;
  };
  for (const el of els) add(el);
  const lensList = () => group.elements.map((el) => lenses.get(el)).filter((l): l is Lens => !!l);
  return {
    get elements() {
      return group.elements;
    },
    set: (o) => lensList().forEach((l) => l.refresh(o)),
    update: (o) => lensList().forEach((l) => l.refresh(o)),
    animate: (to, opts = {}) => tween(lensList(), to, opts),
    refresh: () => {
      lensList().forEach((l) => l.refresh());
      group.schedule();
    },
    drawn: () => group.whenDrawn(),
    add,
    remove: (el) => {
      group.remove(el);
      groups.delete(el);
    },
    destroy: () => {
      const members = group.elements;
      group.destroy();
      for (const el of members) {
        groups.delete(el);
        unglass(el);
      }
    },
  };
}

// morph() needs glass and elements' options
hooks.glass = (el, options) => glass(el, options);
hooks.optionsOf = (el) => lenses.get(el)?.options;
hooks.reduceMotion = () => getEnvironment().reduceMotion;

/**
 * Apple's glassEffectUnion: separate elements drawn as one piece of glass, joined however far apart they are. Their
 * parent becomes a container whose spacing reaches across the widest gap between them.
 */
export function union(elements: HTMLElement[], options: ContainerOptions = {}): GlassContainer {
  const parent = elements[0]?.parentElement;
  if (!parent) throw new Error('union: the elements need a parent');
  const rects = elements.map((e) => e.getBoundingClientRect());
  let gap = 0;
  rects.forEach((r, i) => {
    const near = Math.min(...rects.filter((_, j) => j !== i).map((q) => Math.max(q.left - r.right, r.left - q.right, q.top - r.bottom, r.top - q.bottom, 0)));
    if (Number.isFinite(near)) gap = Math.max(gap, near);
  });
  for (const e of elements) e.dataset.glassMember = '';
  return container(parent, { members: '[data-glass-member]', spacing: Math.max(gap * 2.5, 16), ...options });
}

export type ButtonStyle = 'glass' | 'prominent';

/**
 * Apple's .glass and .glassProminent button styles: a capsule of regular glass that responds to the pointer;
 * prominent is tinted with the accent colour (options.fill, or the CSS variable --glass-accent).
 */
export function glassButton(el: HTMLElement, style: ButtonStyle = 'glass', options: Partial<GlassOptions> = {}): GlassHandle {
  const accent = getComputedStyle(el).getPropertyValue('--glass-accent').trim() || 'rgb(0 122 255)';
  const base: Partial<GlassOptions> = { variant: 'regular', shape: 'capsule', interactive: true, zRadius: 24 };
  if (style === 'prominent') {
    Object.assign(base, { fill: `color-mix(in srgb, ${accent} 82%, transparent)`, saturation: 0.6, chromAberration: 0 });
    el.style.color ||= '#fff';
  }
  return glass(el, { ...base, ...options });
}
