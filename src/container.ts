// Apple's GlassEffectContainer: glass shapes rendered as one piece of glass, flowing into each other where they come
// within `spacing` px, and morphing as they move.
//
// The members keep their content but lose their own glass. The container gets two layers behind its content: a
// shadow, and the glass itself, a lens whose shape is the members' smooth union (one filter for all of them, however
// many there are). The union's edge is a mask-image, so it's exact and costs nothing per frame. When the members
// move (a CSS transition or animation on one of them, or animate()), the union is drawn again every frame, at a lower
// resolution until they stop.
import { union, type Member } from './field.ts';
import { Lens, type LensHost } from './lens.ts';
import { clampRadii } from './optics.ts';
import type { GlassOptions } from './options.ts';

export interface ContainerOptions extends Partial<GlassOptions> {
  /** how close, px, two shapes have to come before they start to flow together (Apple's spacing; 16) */
  spacing?: number;
  /** which descendants are the glass shapes (default: [data-glass], [data-glass-member]) */
  members?: string;
}

const layerCss = 'position:absolute;pointer-events:none;z-index:-1;margin:0;padding:0;border:0;';

export class GlassContainer {
  readonly el: HTMLElement;
  readonly options: ContainerOptions;
  private lens: Lens;
  private glassLayer: HTMLDivElement;
  private shadowLayer: HTMLDivElement;
  private members: Member[] = [];
  private key = '';
  private pad: number;
  private movingUntil = 0;
  private running = 0;
  private sizes: ResizeObserver;
  private tree: MutationObserver;
  private saved: Record<string, string> = {};
  private stopEvents: () => void;

  constructor(el: HTMLElement, options: ContainerOptions, host: LensHost) {
    this.el = el;
    this.options = options;
    el.dataset.glassContainer ??= String(options.spacing ?? 16);
    for (const p of ['position', 'isolation']) this.saved[p] = el.style.getPropertyValue(p);
    // The layers sit behind the content, inside the container: it becomes a stacking context (isolation isn't a
    // backdrop root, so the glass still sees what's behind the container) and, if it was static, positioned.
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.isolation = 'isolate';
    const o = { ...options };
    this.pad = Math.ceil(Math.max(o.shadowSpread ?? 10, 1) * 3 + Math.abs(o.shadowOffsetY ?? 1)) + 2;
    this.shadowLayer = document.createElement('div');
    this.glassLayer = document.createElement('div');
    for (const layer of [this.shadowLayer, this.glassLayer]) {
      layer.setAttribute('aria-hidden', 'true');
      layer.dataset.lgLayer = layer === this.glassLayer ? 'glass' : 'shadow';
      layer.style.cssText = `${layerCss}background-size:100% 100%;mask-size:100% 100%;`;
    }
    el.prepend(this.shadowLayer, this.glassLayer);
    this.measure();
    const self = this;
    this.lens = new Lens(this.glassLayer, { ...options, shadowOpacity: options.shadowOpacity ?? 0.3 }, host, {
      field: (w, h) => union(w, h, self.members.map((m) => ({ ...m, x: m.x + self.pad, y: m.y + self.pad })), self.spacing()),
      key: () => self.key,
      shadowEl: this.shadowLayer,
      get pad() { return self.pad; },
      moving: () => performance.now() < self.movingUntil,
      // the members and room for the bevel's edge around them
      bounds: () => {
        if (!self.members.length) return { x: 0, y: 0, w: 1, h: 1 };
        const m = self.spacing() + 4;
        const x0 = Math.min(...self.members.map((b) => b.x)) - m, y0 = Math.min(...self.members.map((b) => b.y)) - m;
        const x1 = Math.max(...self.members.map((b) => b.x + b.w)) + m, y1 = Math.max(...self.members.map((b) => b.y + b.h)) + m;
        return { x: Math.max(x0 + self.pad, 0), y: Math.max(y0 + self.pad, 0), w: x1 - x0, h: y1 - y0 };
      },
      detail: () => Math.max(self.members.length, 1),
    });
    this.sizes = new ResizeObserver(() => this.update());
    this.sizes.observe(el);
    // a member added, removed, restyled or moved by script (the layers' own changes don't count)
    this.tree = new MutationObserver((records) => {
      if (records.some((r) => r.target !== this.glassLayer && r.target !== this.shadowLayer)) this.update();
    });
    this.tree.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-glass', 'data-glass-member'] });
    // A member's transition or animation moves the shape: follow it every frame until it ends.
    const start = (e: Event) => {
      if (e.target instanceof HTMLElement && this.isMember(e.target)) this.animate(10000);
    };
    const end = () => {
      if (!this.el.getAnimations({ subtree: true }).some((a) => a.playState === 'running')) this.animate(150);
    };
    for (const t of ['transitionrun', 'animationstart']) el.addEventListener(t, start);
    for (const t of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) el.addEventListener(t, end);
    this.stopEvents = () => {
      for (const t of ['transitionrun', 'animationstart']) el.removeEventListener(t, start);
      for (const t of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) el.removeEventListener(t, end);
    };
    this.update();
  }

  private spacing() {
    return Number(this.el.dataset.glassContainer) || this.options.spacing || 16;
  }

  private isMember(n: HTMLElement) {
    return n !== this.glassLayer && n !== this.shadowLayer && n.matches(this.options.members ?? '[data-glass], [data-glass-member]')
      && n.closest('[data-glass-container]') === this.el;
  }

  /** Measure the members (their transformed boxes, so moving ones count) and lay the layers over the container. */
  private measure() {
    const box = this.el.getBoundingClientRect();
    const sel = this.options.members ?? '[data-glass], [data-glass-member]';
    const found = [...this.el.querySelectorAll<HTMLElement>(sel)].filter((n) => this.isMember(n));
    this.members = found.map((n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      const shape = n.dataset.glassShape;
      const radius = (v: string) => (v.endsWith('%') ? (parseFloat(v) / 100) * Math.min(r.width, r.height) : parseFloat(v) || 0);
      const radii = shape === 'capsule' || shape === 'circle' ? [1e9, 1e9, 1e9, 1e9]
        : [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map((v) => radius(v.split(' ')[0]));
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, radii: clampRadii(radii, r.width, r.height) };
    });
    const w = this.el.clientWidth || box.width, h = this.el.clientHeight || box.height;
    // the layers cover the container's padding box and room for the shadow around it; members are measured from
    // the border box, so the border moves them in
    const bl = this.el.clientLeft, bt = this.el.clientTop;
    for (const m of this.members) {
      m.x -= bl;
      m.y -= bt;
    }
    for (const layer of [this.shadowLayer, this.glassLayer]) {
      Object.assign(layer.style, { left: `${-this.pad}px`, top: `${-this.pad}px`, width: `${w + 2 * this.pad}px`, height: `${h + 2 * this.pad}px` });
    }
    this.key = this.members.map((m) => [m.x, m.y, m.w, m.h, ...m.radii].map((v) => Math.round(v * 2) / 2).join(',')).join(';') + `|${this.spacing()}`;
  }

  /** Measure the members again and redraw the glass if they moved. */
  update() {
    const before = this.key;
    this.measure();
    if (this.key !== before) this.lens?.reshape();
  }

  /** Follow the members every frame for `ms` (while they move in ways the container can't see coming). */
  animate(ms = 400) {
    this.movingUntil = Math.max(this.movingUntil, performance.now() + ms);
    if (this.running) return;
    const tick = () => {
      this.update();
      if (performance.now() < this.movingUntil) this.running = requestAnimationFrame(tick);
      else {
        this.running = 0;
        // once still, at full resolution
        this.key = '';
        this.update();
      }
    };
    this.running = requestAnimationFrame(tick);
  }

  /** Change the glass's options (spacing too). */
  set(options: ContainerOptions) {
    Object.assign(this.options, options);
    if (options.spacing !== undefined) this.el.dataset.glassContainer = String(options.spacing);
    this.lens.refresh(options);
    this.key = '';
    this.update();
  }

  destroy() {
    cancelAnimationFrame(this.running);
    this.sizes.disconnect();
    this.tree.disconnect();
    this.stopEvents();
    this.lens.destroy();
    this.glassLayer.remove();
    this.shadowLayer.remove();
    for (const [p, v] of Object.entries(this.saved)) {
      if (v) this.el.style.setProperty(p, v);
      else this.el.style.removeProperty(p);
    }
    delete this.el.dataset.glassContainer;
  }
}
