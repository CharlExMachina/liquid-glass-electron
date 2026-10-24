// Apple's glassEffectID morphing and glassEffectTransition: glass that flows from one element into another, or
// materializes in place.
//
// A morph draws one piece of glass where the second element is and moves it there from the first one's box with a
// spring (see morph()); both elements are hidden meanwhile, and their contents cross-fade.
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

/** Bridges to the library's internals, set by index.ts. */
export const hooks = {
  glass: null as unknown as (el: HTMLElement, options: Partial<GlassOptions>) => { drawn(): Promise<void>; destroy(): void },
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
 * hidden, for the caller to remove or keep.
 *
 * One piece of glass, the shape of `to`, is drawn once where `to` is, then moved there from `from`'s box with a
 * transform and a spring: the compositor bends in the element's own space, so the glass scales with it and nothing is
 * drawn again while it moves. `from`'s content fades as it leaves, `to`'s as it arrives.
 */
export async function morph(from: HTMLElement, to: HTMLElement, options: MorphOptions = {}): Promise<void> {
  const duration = hooks.reduceMotion() ? 0 : options.duration ?? 420;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const glassOptions = { ...(options.glass ?? hooks.optionsOf(to) ?? hooks.optionsOf(from) ?? {}), floating: false, interactive: false, button: false, strength: 1 };

  const proxy = document.createElement('div');
  proxy.setAttribute('aria-hidden', 'true');
  proxy.style.cssText = `position:fixed;left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;margin:0;pointer-events:none;z-index:2147483000;transform-origin:0 0;`;
  proxy.style.borderRadius = radiiOf(to);
  document.body.append(proxy);
  const g = hooks.glass(proxy, glassOptions);
  const start = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`;
  proxy.style.transform = start;
  await g.drawn();

  const fromVisibility = from.style.visibility;
  from.style.visibility = 'hidden';
  to.style.visibility = 'hidden';
  if (duration > 0) {
    await proxy.animate([{ transform: start }, { transform: 'none' }], { duration, easing: options.easing ?? SPRING, fill: 'forwards' }).finished;
  }
  // The real glass takes over, its content fading in.
  const content = [...to.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.dataset.lgLayer);
  for (const c of content) c.style.opacity = '0';
  to.style.visibility = 'visible';
  from.style.visibility = fromVisibility === 'visible' || !fromVisibility ? 'hidden' : fromVisibility;
  // a frame for the real glass to draw, then the proxy goes
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  g.destroy();
  proxy.remove();
  await Promise.all(content.map((c) => c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration ? 160 : 0, easing: 'ease' }).finished.then(() => c.style.removeProperty('opacity'))));
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
