// Apple's scroll edge effect: where content scrolls under glass (a toolbar), it dissolves into a blur at the edge
// (.soft), or meets a nearly opaque band with a dividing line (.hard).
//
// A sticky strip at the scroller's edge, with a backdrop blur that fades out away from the edge (a mask, so it's
// drawn once and costs only its blur per frame). Over dark content the soft edge dims instead of lightening.

export interface ScrollEdgeOptions {
  /** which edges (top) */
  edges?: ('top' | 'bottom')[];
  /** soft: blur dissolving into the content; hard: a nearly opaque band and a line */
  style?: 'soft' | 'hard';
  /** how far the effect reaches into the content, px (56; the toolbar's height is a good value) */
  size?: number;
  /** blur at the very edge, px (10) */
  blur?: number;
  /** dark content: dim rather than lighten (default: follows the page's colour scheme) */
  dark?: boolean;
}

/** Add the scroll edge effect to a scrolling element. Returns a function that takes it off. */
export function scrollEdge(scroller: HTMLElement, options: ScrollEdgeOptions = {}): () => void {
  const edges = options.edges ?? ['top'];
  const size = options.size ?? 56, blur = options.blur ?? 10, style = options.style ?? 'soft';
  const dark = options.dark ?? matchMedia('(prefers-color-scheme: dark)').matches;
  const strips = edges.map((edge) => {
    const strip = document.createElement('div');
    strip.setAttribute('aria-hidden', 'true');
    strip.dataset.lgScrollEdge = `${edge} ${style}`;
    const toward = edge === 'top' ? 'to bottom' : 'to top';
    const tint = dark ? '0 0 0' : '255 255 255';
    strip.style.cssText = [
      `position:sticky;${edge}:0;height:${size}px;pointer-events:none;z-index:1;`,
      edge === 'top' ? `margin-bottom:-${size}px;` : `margin-top:-${size}px;`,
      style === 'soft'
        ? `backdrop-filter:blur(${blur}px) saturate(1.4);mask-image:linear-gradient(${toward}, #000 0%, rgb(0 0 0 / 0.75) 35%, transparent 100%);`
          + `background:linear-gradient(${toward}, rgb(${tint} / ${dark ? 0.35 : 0.25}), transparent);`
        : `backdrop-filter:blur(${blur}px) saturate(1.2);background:rgb(${tint} / 0.82);`
          + `box-shadow:0 ${edge === 'top' ? 1 : -1}px 0 rgb(${dark ? '255 255 255 / 0.12' : '0 0 0 / 0.12'});`,
    ].join('');
    if (edge === 'top') scroller.prepend(strip);
    else scroller.append(strip);
    return strip;
  });
  return () => strips.forEach((s) => s.remove());
}
