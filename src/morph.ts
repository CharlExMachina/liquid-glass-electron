// Apple's glassEffectID morphing and glassEffectTransition: glass that flows from one element into another, or
// materializes in place.
//
// A morph lays a temporary container over both elements and moves one glass shape (a proxy, with no content) from the
// first element's box and corners to the second's, with a spring. The container draws the moving shape every frame,
// at a lower resolution until it stops. Both elements are hidden meanwhile; the first one's content fades out as the
// glass leaves, and the second one's fades in as it arrives.
import type { GlassContainer } from './container.ts';
import type { GlassOptions } from './options.ts';

export interface MorphOptions {
  /** ms (420) */
  duration?: number;
  /** a CSS easing; the default overshoots a little, like a spring */
  easing?: string;
  /** the glass's options during the morph (by default, those of the element it arrives at, if it's glass) */
  glass?: Partial<GlassOptions>;
}

const SPRING = 'linear(0, 0.14 6%, 0.52 18%, 0.82 30%, 0.98 42%, 1.04 52%, 1.04 62%, 1.01 76%, 1)';

/** Bridges to the library's internals, set by index.ts (morph needs a container and an element's options). */
export const hooks = {
  container: null as unknown as (el: HTMLElement, options: Partial<GlassOptions> & { spacing?: number }) => GlassContainer,
  uncontainer: null as unknown as (el: HTMLElement) => void,
  optionsOf: (_el: HTMLElement): Partial<GlassOptions> | undefined => undefined,
  reduceMotion: () => false,
};

const radiiOf = (el: HTMLElement) => {
  const cs = getComputedStyle(el);
  return [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => v.split(' ')[0]).join(' ');
};

/**
 * Flow the glass of `from` into `to` (Apple's matchedGeometry transition between two views with the same
 * glassEffectID). `to` must be laid out (it can be visibility: hidden). Resolves when `to` is showing; `from` is left
 * hidden, for the caller to remove.
 */
export async function morph(from: HTMLElement, to: HTMLElement, options: MorphOptions = {}): Promise<void> {
  const duration = hooks.reduceMotion() ? 0 : options.duration ?? 420;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const glassOptions = options.glass ?? hooks.optionsOf(to) ?? hooks.optionsOf(from) ?? {};
  const fade = (el: HTMLElement, to: number, ms: number, delay = 0) =>
    el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: to }], { duration: ms, delay, fill: 'forwards', easing: 'ease' }).finished;

  // An overlay over both boxes, with the proxy shape in it.
  const pad = 80;
  const left = Math.min(a.left, b.left) - pad, top = Math.min(a.top, b.top) - pad;
  const overlay = document.createElement('div');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${Math.max(a.right, b.right) - left + pad}px;height:${Math.max(a.bottom, b.bottom) - top + pad}px;pointer-events:none;z-index:2147483000;`;
  const proxy = document.createElement('div');
  proxy.dataset.glassMember = '';
  const box = (r: DOMRect) => ({ left: `${r.left - left}px`, top: `${r.top - top}px`, width: `${r.width}px`, height: `${r.height}px` });
  proxy.style.cssText = 'position:absolute;';
  Object.assign(proxy.style, box(a), { borderRadius: radiiOf(from) });
  overlay.append(proxy);
  document.body.append(overlay);
  const glass = hooks.container(overlay, { spacing: 0, ...glassOptions });

  const fromVisibility = from.style.visibility, toVisibility = to.style.visibility;
  to.style.visibility = 'hidden';
  from.style.visibility = 'hidden';
  if (duration > 0) {
    glass.animate(duration + 100);
    await proxy.animate([{ ...box(a), borderRadius: radiiOf(from) }, { ...box(b), borderRadius: radiiOf(to) }], { duration, easing: options.easing ?? SPRING, fill: 'forwards' }).finished;
  }
  // The real glass takes over, its content fading in.
  const content = [...to.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.dataset.lgLayer);
  for (const c of content) c.style.opacity = '0';
  to.style.visibility = toVisibility;
  from.style.visibility = fromVisibility === 'hidden' ? fromVisibility : 'hidden';
  hooks.uncontainer(overlay);
  overlay.remove();
  await Promise.all(content.map((c) => fade(c, 1, duration ? 160 : 0).then(() => {
    c.getAnimations().forEach((x) => x.cancel());
    c.style.removeProperty('opacity');
  })));
}

export type Transition = 'materialize' | 'matchedGeometry' | 'identity';

/**
 * Glass appearing or disappearing in place (Apple's .materialize): it grows from 90% as its bending strengthens and
 * it fades in, or the reverse. 'identity' just shows or hides it.
 */
export async function materialize(el: HTMLElement, direction: 'in' | 'out', options: { duration?: number; transition?: Transition } = {}): Promise<void> {
  const duration = hooks.reduceMotion() || options.transition === 'identity' ? 0 : options.duration ?? 320;
  const shown = { opacity: 1, scale: '1' }, hidden = { opacity: 0, scale: '0.9' };
  if (direction === 'in') el.style.removeProperty('visibility');
  // its own opacity, not a wrapper's: an ancestor with opacity below 1 would stop it bending
  await el.animate(direction === 'in' ? [hidden, shown] : [shown, hidden], { duration, easing: direction === 'in' ? SPRING : 'ease-in' }).finished;
  if (direction === 'out') el.style.visibility = 'hidden';
}
