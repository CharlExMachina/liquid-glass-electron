// A group: many glass elements bent by one backdrop filter, for pages with a lot of glass on screen.
//
// Chromium's cost per frame is mostly per backdrop filter: every one is recorded, sent to the GPU process and run again
// on every frame anything changes, and each sends its map's pixels along. A group keeps every member a glass element of
// its own (its options, light, shadow, pointer behaviour, everything but the bending) and bends all of them with one
// filter on a layer just behind them: a copy of the members' filter, with one map made of all their maps, clipped to
// their shapes. It draws the same pixels as separate glass, so a member can leave the group at any time and get its
// own filter back within the same task, and come back the same way: one that changes on its own (strength, hover, a
// press, a drag, a transition, a resize) leaves while it changes, and members that change together stay together.
//
// The members' maps are copied into one image at whole pixels of the map (an image per channel: a map travels as greys,
// see mapNodes), so they're drawn exactly as they'd be on their own; members that don't line up with each other
// (different sizes, odd offsets) get images of their own. Every map goes through its own lookup table before anything
// is merged: the table turns a stretched value into a steep shift, and it has to see the stretched value itself, not
// one rounded to 8 bits by a merge first.
//
// glass() puts sibling glass in a group of its own accord (an implicit one), which is stricter: a member is drawn by
// the layer only if nothing is painted between the layer and it over what it bends, and the parent is never made a
// containing block if that would move anything else.
import type { Lens } from './lens.ts';
import type { MapGrid } from './maps.ts';
import { filterDefs, mapNodes, predecode, setAttrs, svgEl } from './dom.ts';

/** How long a member has to keep its place before its map goes into the group's image, ms. */
const SETTLE = 120;
/** How much bigger than the glass in it an implicit group's layer may be (it bends all of its box). */
const MAX_SPREAD = 3;
let nextGroup = 0;
// a member's transitions and animations: it leaves while one runs
const EVENTS = ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel'];

interface Source {
  // what its filter does, but where its map is and the map's lookup tables (each image has its own table)
  key: string;
  tables: string;
  src: NonNullable<ReturnType<Lens['batchSource']>>;
  // the map's rectangle in the element's px (where it would be without the stash)
  map: { x: number; y: number; w: number; h: number };
  // its map's images, a grey per channel
  hrefs: string[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Radii = Pick<CSSStyleDeclaration, 'borderTopLeftRadius' | 'borderTopRightRadius' | 'borderBottomRightRadius' | 'borderBottomLeftRadius'>;

interface Member {
  el: HTMLElement;
  lens: Lens;
  version: number;
  source: Source | null;
  // how it was when last measured (for the lens's version), or null to measure again
  look: { version: number; ok: boolean; fixed: boolean; z: string; box: Box; radii: Radii } | null;
  saved: string;
  observer: MutationObserver;
  touch: () => void;
  // while the layer draws it: what tells the group it has moved (see watch())
  watching: { io: IntersectionObserver; at: string; look: Member['look'] } | null;
}

/** The group's image of maps: the layer's size, each member's map in it (by where its box is), and the images. */
interface Atlas {
  w: number;
  h: number;
  fixed: boolean;
  placed: Map<HTMLElement, string>;
  classes: { urls: string[]; x: number; y: number; w: number; h: number; tables: SVGFEComponentTransferElement[] }[];
  mapMargin: number;
}

export interface GroupHost {
  lensOf(el: HTMLElement): Lens | undefined;
}

export class GlassGroup {
  readonly id = `lgg${++nextGroup}`;
  readonly layer: HTMLDivElement;
  private host: GroupHost;
  private members: Member[] = [];
  private pre: SVGFilterElement | null = null;
  private main: SVGFilterElement | null = null;
  private atlas: Atlas | null = null;
  private key = '';
  private rendered = '';
  private batch = new Set<HTMLElement>();
  private queued = false;
  private settleTimer = 0;
  private building: Promise<void> | null = null;
  // where each member that waits to join was last seen, and since when: the image is drawn again once one of them has
  // held still for SETTLE ms, with those that have
  private moved = new Map<HTMLElement, { at: string; since: number }>();
  // the members the layer could draw, when last looked at
  private sharing = new Set<HTMLElement>();
  private sizes: ResizeObserver;
  private parent: HTMLElement | null = null;
  private savedParentPosition: string | null = null;
  private destroyed = false;
  // made by glass() for siblings, not asked for: see unobstructed() and canPosition()
  readonly implicit: boolean;
  private children: MutationObserver | null = null;
  private clip = '';
  private filter = '';
  // anything may have changed (the window, the parent's size): every member is measured again
  private onEvent = () => {
    for (const m of this.members) m.look = null;
    this.schedule();
  };

  constructor(host: GroupHost, implicit = false) {
    this.host = host;
    this.implicit = implicit;
    this.layer = document.createElement('div');
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.dataset.lgLayer = 'group';
    this.layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;margin:0;padding:0;border:0;';
    this.sizes = new ResizeObserver(this.onEvent);
    addEventListener('resize', this.onEvent);
    // an implicit group also looks again when something is put between its members
    if (implicit) this.children = new MutationObserver(this.onEvent);
  }

  /** The members, in no particular order. */
  get elements(): HTMLElement[] {
    return this.members.map((m) => m.el);
  }

  has(el: HTMLElement) {
    return this.members.some((m) => m.el === el);
  }

  add(el: HTMLElement) {
    const lens = this.host.lensOf(el);
    if (!lens || this.has(el)) return;
    // A change to a member the layer draws is looked at before the frame is drawn (it may have to leave at once); a
    // change to one with a filter of its own can wait until it has stopped changing.
    const m: Member = { el, lens, version: -1, source: null, look: null, saved: el.style.getPropertyValue('isolation'), observer: null!, watching: null, touch: () => {
      m.look = null;
      if (this.batch.has(el)) this.schedule();
      else this.later();
    } };
    lens.onChange = m.touch;
    // a style or class change can move the element, or change what's on it
    m.observer = new MutationObserver(m.touch);
    m.observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    for (const t of EVENTS) el.addEventListener(t, m.touch);
    this.sizes.observe(el);
    this.members.push(m);
    this.schedule();
  }

  remove(el: HTMLElement) {
    const i = this.members.findIndex((m) => m.el === el);
    if (i < 0) return;
    const [m] = this.members.splice(i, 1);
    this.release(m);
    this.batch.delete(el);
    this.schedule();
  }

  private release(m: Member) {
    this.watch(m, false);
    m.lens.onChange = null;
    m.lens.setBatched(false);
    m.observer.disconnect();
    for (const t of EVENTS) m.el.removeEventListener(t, m.touch);
    this.sizes.unobserve(m.el);
    if (m.saved) m.el.style.setProperty('isolation', m.saved);
    else m.el.style.removeProperty('isolation');
  }

  private lazy = 0;
  private waiting = 0;
  /** Look at the members again once nothing has changed for a moment. */
  private later() {
    clearTimeout(this.lazy);
    this.lazy = window.setTimeout(() => {
      this.lazy = 0;
      this.schedule();
    }, SETTLE);
  }

  /** Look at the members again after the next change, before the frame is drawn. */
  schedule() {
    if (this.queued || this.destroyed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (!this.destroyed) this.reconcile();
    });
  }

  /** Resolves once every member's map and light are on screen and the group's image has caught up. */
  async whenDrawn(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await Promise.all(this.members.map((m) => m.lens.whenDrawn()));
      await new Promise((r) => requestAnimationFrame(r));
      if (this.building) await this.building;
      else if (!this.settleTimer && !this.lazy && !this.queued && !this.waiting) return;
      else await new Promise((r) => setTimeout(r, SETTLE / 2));
    }
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.settleTimer);
    clearTimeout(this.lazy);
    for (const m of this.members) this.release(m);
    this.members = [];
    this.sizes.disconnect();
    this.children?.disconnect();
    removeEventListener('resize', this.onEvent);
    this.layer.remove();
    this.pre?.remove();
    this.main?.remove();
    if (this.parent && this.savedParentPosition !== null) this.parent.style.position = this.savedParentPosition;
  }

  // ---------------------------------------------------------------- which members the layer draws

  /** The key of what a member's filter does, everything but where its map is. */
  private sourceOf(m: Member): Source | null {
    if (m.version === m.lens.version && m.source) return m.source;
    m.version = m.lens.version;
    const src = m.lens.batchSource();
    if (!src) return (m.source = null);
    const parts: string[] = [];
    for (const f of src.filters) {
      for (const n of f.querySelectorAll('*')) {
        parts.push(n.tagName);
        for (const a of n.attributes) {
          if (src.images.includes(n as SVGFEImageElement) && (a.name === 'x' || a.name === 'y' || a.name === 'width' || a.name === 'height' || a.name === 'href')) continue;
          if (src.shifts.includes(n as SVGFEOffsetElement) && a.name === 'dx') continue;
          if (src.tables.includes(n.parentNode as SVGFEComponentTransferElement) && a.name === 'tableValues') continue;
          // elements of different sizes differ in the shift's scale in the fifth digit: shared, that moves a sample
          // by a thousandth of a pixel at most
          if (n.tagName === 'feDisplacementMap' && a.name === 'scale') {
            parts.push(`scale=${Number(a.value).toFixed(2)}`);
            continue;
          }
          parts.push(`${a.name}=${a.value}`);
        }
      }
      parts.push('|');
    }
    const num = (a: string) => Number(src.images[0].getAttribute(a));
    const tables = src.tables.flatMap((t) => [...t.children].map((f) => f.getAttribute('tableValues'))).join('|');
    return (m.source = { key: parts.join(' '), tables, src, map: { x: num('x') - src.side, y: num('y'), w: num('width'), h: num('height') }, hrefs: src.images.map((im) => im.getAttribute('href')!) });
  }

  /**
   * Whether the layer can draw this member's glass for it: nothing on the element that the glass would be painted
   * through (opacity, filter, mask, clip-path, blending: those apply to an element's backdrop filter too), no running
   * animation or transition, no transform but a translation, a box of its own size, the same parent as the others.
   */
  private eligible(el: HTMLElement, cs: CSSStyleDeclaration, rect: DOMRect): boolean {
    if (el.parentElement !== this.parent || !rect.width || !rect.height) return false;
    if (Math.abs(rect.width - el.offsetWidth) > 0.5 || Math.abs(rect.height - el.offsetHeight) > 0.5) return false;
    if (cs.position === 'sticky' || cs.opacity !== '1' || cs.filter !== 'none' || cs.mixBlendMode !== 'normal' || cs.maskImage !== 'none' || cs.clipPath !== 'none') return false;
    if (cs.rotate !== 'none' || (cs.scale !== 'none' && cs.scale !== '1')) return false;
    if (cs.transform !== 'none' && !/^matrix\(1, 0, 0, 1, [-\d.e]+, [-\d.e]+\)$/.test(cs.transform)) return false;
    if (cs.visibility !== 'visible' || cs.display === 'none' || cs.display === 'contents') return false;
    return !el.getAnimations().some((a) => a.playState === 'running');
  }

  private reconcile() {
    const parent = this.members[0]?.el.parentElement ?? null;
    if (parent !== this.parent) {
      this.children?.disconnect();
      if (parent) this.children?.observe(parent, { childList: true });
    }
    this.parent = parent;
    if (!this.parent) return;
    // the members' boxes relative to the layer's corner (scrolling moves both); only those that changed are measured
    const lr = this.layer.getBoundingClientRect();
    const look = this.members.map((m) => {
      const source = this.sourceOf(m);
      if (!source) return { m, source, ok: false, fixed: false, z: '', box: null, radii: null };
      if (!m.look || m.look.version !== m.version) {
        const cs = getComputedStyle(m.el), rect = m.el.getBoundingClientRect();
        const box = { x: rect.left - lr.left, y: rect.top - lr.top, w: rect.width, h: rect.height };
        const { borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius } = cs;
        m.look = {
          version: m.version, ok: m.lens.options.group && this.eligible(m.el, cs, rect), fixed: cs.position === 'fixed', z: cs.zIndex, box,
          // its rounded box, as Chromium clips its backdrop filter
          radii: { borderTopLeftRadius, borderTopRightRadius, borderBottomRightRadius, borderBottomLeftRadius },
        };
      }
      return { m, source, ...m.look };
    });
    // the filter most of them share: the group draws those
    const counts = new Map<string, number>();
    for (const l of look) if (l.ok) counts.set(l.source!.key, (counts.get(l.source!.key) ?? 0) + 1);
    const key = most(counts, this.key);
    const first = look.find((l) => l.ok && l.source!.key === key);
    const candidates = look.filter((l) => l.ok && l.source!.key === key && l.fixed === first!.fixed && l.z === first!.z);
    // no two overlapping
    const boxes: Box[] = [];
    const apart = candidates.filter((l) => {
      const r = l.box!;
      if (boxes.some((b) => r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h)) return false;
      boxes.push(r);
      return true;
    });
    const sharing = this.implicit ? this.unobstructed(apart, lr) : apart;
    this.sharing = new Set(sharing.map((l) => l.m.el));

    const atlas = this.atlas;
    const sig = (l: (typeof look)[number]) => placeSig(l.source!, l.box!);
    const inLayer = atlas && first && atlas.fixed === first.fixed ? sharing.filter((l) => atlas.placed.get(l.m.el) === sig(l)) : [];
    // a member that should be drawn by the layer but isn't in its image yet: the image is drawn again once one of them
    // holds still (one that keeps moving keeps its own filter meanwhile, and doesn't hold the others up)
    const waiting = sharing.filter((l) => !inLayer.includes(l));
    this.waiting = sharing.length > 1 ? waiting.length : 0;
    const now = performance.now();
    for (const l of waiting) {
      const at = boxKey(l.box!);
      if (this.moved.get(l.m.el)?.at !== at) this.moved.set(l.m.el, { at, since: now });
    }
    for (const el of this.moved.keys()) if (!waiting.some((l) => l.m.el === el)) this.moved.delete(el);
    if (waiting.length && !this.building && sharing.length > 1) {
      const ready = Math.min(...waiting.map((l) => this.moved.get(l.m.el)!.since)) + SETTLE;
      clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => {
        this.settleTimer = 0;
        this.building = this.build(key).finally(() => {
          this.building = null;
          // the layer moved: everyone is measured again
          for (const m of this.members) m.look = null;
          this.schedule();
        });
      }, Math.max(ready - now, 0));
    }

    const batch = inLayer.length > 1 ? inLayer : [];
    this.key = key;
    if (batch.length) {
      const src = batch[0].source!.src, id = `${key}|${src.side}|${devicePixelRatio}|${this.atlasId(atlas!)}`;
      if (id !== this.rendered) {
        this.rendered = id;
        this.render(src, atlas!);
      }
    }
    this.apply(new Set(batch.map((l) => l.m.el)), batch.map((l) => roundedBox(l.box!.x, l.box!.y, l.box!.w, l.box!.h, l.radii!)).join(' '));
  }

  /**
   * The members nothing is painted between: the layer goes just before the first of them, and paints the backdrop as it
   * is there, so something painted after it but before a member (a positioned sibling between them, or a stacking
   * context) would be bent by that member on its own but not by the layer. Content in flow is painted before both.
   */
  private unobstructed<T extends { m: Member; box: Box | null; source: Source | null }>(list: T[], lr: DOMRect): T[] {
    if (list.length < 2) return list;
    const members = new Set(this.members.map((m) => m.el));
    const inDomOrder = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const ordered = [...list].sort((a, b) => inDomOrder(a.m.el, b.m.el));
    const kept: T[] = [];
    // what is painted with the glass after the layer (just before the first member) and before each member, as boxes
    // relative to the layer
    const between: Box[] = [];
    let node: Element | null = [...members].filter((el) => el.parentElement === this.parent).sort(inDomOrder)[0] ?? null;
    for (const l of ordered) {
      for (; node && node !== l.m.el; node = node.nextElementSibling) {
        if (members.has(node as HTMLElement) || node === this.layer) continue;
        for (const r of paintedWithGlass(node)) between.push({ x: r.left - lr.left, y: r.top - lr.top, w: r.width, h: r.height });
      }
      node = l.m.el.nextElementSibling;
      // what the member bends: its box and as far past it as its filter reaches
      const e = l.source!.src.margin, b = l.box!;
      const x = b.x - e, y = b.y - e, w = b.w + 2 * e, h = b.h + 2 * e;
      if (!between.some((r) => r.x < x + w && x < r.x + r.w && r.y < y + h && y < r.y + r.h)) kept.push(l);
    }
    return kept.length > 1 ? kept : [];
  }

  private atlasIds = new WeakMap<Atlas, number>();
  private atlasId(a: Atlas) {
    let n = this.atlasIds.get(a);
    if (n === undefined) this.atlasIds.set(a, (n = ++atlasCount));
    return n;
  }

  /** Who the layer draws now: its clip, and the members' own filters off (or back on), in one go. */
  private apply(now: Set<HTMLElement>, path: string) {
    const layer = this.layer;
    for (const m of this.members) {
      const on = now.has(m.el);
      m.lens.setBatched(on);
      this.watch(m, on);
      // each member stays a stacking context, as its backdrop filter made it
      const iso = on ? 'isolate' : m.saved;
      if (m.el.style.getPropertyValue('isolation') !== iso) {
        if (iso) m.el.style.setProperty('isolation', iso);
        else m.el.style.removeProperty('isolation');
      }
    }
    this.batch = now;
    const filter = !now.size ? 'none' : this.pre ? `url(#${this.pre.id}) url(#${this.main!.id})` : `url(#${this.main!.id})`;
    if (now.size && path !== this.clip) {
      this.clip = path;
      layer.style.clipPath = `path('${path}')`;
    }
    if (filter !== this.filter) {
      this.filter = filter;
      layer.style.backdropFilter = filter;
    }
  }

  /**
   * Watch where a member the layer draws is. Most moves come through its style, class, size or events, which the group
   * listens to; the rest (a stylesheet rule, a layout shift among its siblings, an animation from script) would leave
   * the layer's glass behind. An IntersectionObserver whose root box is the member's own box (as Floating UI watches
   * for layout shifts) fires as soon as it moves by a px, for nothing per frame meanwhile.
   */
  private watch(m: Member, on: boolean) {
    if (!on) {
      m.watching?.io.disconnect();
      m.watching = null;
      return;
    }
    // not measured again since: where it was
    if (m.watching && m.watching.look === m.look) return;
    const cs = getComputedStyle(m.el), r = m.el.getBoundingClientRect();
    // the root: what it's positioned against (its parent, its positioned ancestor), or the viewport
    const cb = cs.position === 'absolute' ? m.el.offsetParent : cs.position === 'fixed' ? null : m.el.parentElement;
    const root = cb && cb !== document.body && cb !== document.documentElement ? cb : null;
    const box = root ? root.getBoundingClientRect() : { left: 0, top: 0 };
    // its padding box (the root's box when it clips; a little smaller than its border box when it doesn't)
    const rx = box.left + (root?.clientLeft ?? 0), ry = box.top + (root?.clientTop ?? 0);
    const rw = root ? root.clientWidth : document.documentElement.clientWidth, rh = root ? root.clientHeight : document.documentElement.clientHeight;
    const at = [r.left - rx, r.top - ry, r.right - rx, r.bottom - ry, rw, rh].map((v) => Math.round(v)).join(',');
    if (m.watching?.at === at && m.watching.io.root === root) {
      m.watching.look = m.look;
      return;
    }
    m.watching?.io.disconnect();
    // a px of room on each side, so rounding doesn't put it partly out at the start
    const px = (v: number) => `${Math.floor(v) + 1}px`;
    let first = true;
    const io = new IntersectionObserver((entries) => {
      if (first) {
        first = false;
        return;
      }
      if (entries.some((e) => e.intersectionRatio < 1)) m.touch();
    }, { root, threshold: 1, rootMargin: [-(r.top - ry), -(rx + rw - r.right), -(ry + rh - r.bottom), -(r.left - rx)].map(px).join(' ') });
    io.observe(m.el);
    m.watching = { io, at, look: m.look };
  }

  // ---------------------------------------------------------------- the layer's image and filter

  /**
   * The members the layer could draw that have held still for SETTLE ms (or are in its image already), as they are
   * now. A member that changes on its own is looked at only once it stops, so one that has moved since it was last
   * looked at starts waiting again here.
   */
  private sharers(key: string) {
    const lr = this.layer.getBoundingClientRect(), now = performance.now();
    const out: { m: Member; source: Source; cs: CSSStyleDeclaration; rect: DOMRect; box: Box }[] = [];
    for (const m of this.members) {
      const source = this.sourceOf(m);
      if (!source || source.key !== key || !this.sharing.has(m.el) || !m.lens.options.group) continue;
      const cs = getComputedStyle(m.el), rect = m.el.getBoundingClientRect();
      if (!this.eligible(m.el, cs, rect)) continue;
      const box = { x: rect.left - lr.left, y: rect.top - lr.top, w: rect.width, h: rect.height }, at = boxKey(box);
      const seen = this.moved.get(m.el);
      if (seen && seen.at !== at) this.moved.set(m.el, { at, since: now });
      if (seen && (seen.at !== at || now - seen.since < SETTLE - 1)) continue;
      out.push({ m, source, cs, rect, box });
    }
    return out;
  }

  /**
   * Members of the same size draw their maps on one grid, whole map pixels apart (each on its own too: see
   * Lens.setGrid), so one image holds all of them. The grid's pixels are a whole number of px, as close to the maps'
   * own as can be, and it starts `mapMargin` px before the first member: on elements at whole px, every map's
   * rectangle is then at whole px too (Skia takes another pass for an image whose place and size both aren't).
   */
  private async align(looks: ReturnType<GlassGroup['sharers']>) {
    const grids: { tables: string; px: number; py: number; x: number; y: number }[] = [];
    await Promise.all(looks.map((l) => {
      const s = l.source!, g = s.src.grid, mm = s.src.mapMargin;
      const px = Math.max(1, Math.floor(g.px + 1e-6)), py = Math.max(1, Math.floor(g.py + 1e-6));
      let ref = grids.find((r) => r.tables === s.tables && r.px === px && r.py === py);
      if (!ref) grids.push((ref = { tables: s.tables, px, py, x: l.rect.left - mm, y: l.rect.top - mm }));
      // the grid's first line at or before `mm` px past the element, and as many pixels as reach `mm` past its far side
      const ix = Math.floor((l.rect.left - mm - ref.x) / px + 1e-6), iy = Math.floor((l.rect.top - mm - ref.y) / py + 1e-6);
      const x = ref.x + ix * px, y = ref.y + iy * py;
      const grid: MapGrid = {
        x: x - l.rect.left, y: y - l.rect.top, px, py,
        width: Math.ceil((l.rect.right + mm - x) / px - 1e-6), height: Math.ceil((l.rect.bottom + mm - y) / py - 1e-6),
      };
      return l.m.lens.setGrid(grid);
    }));
  }

  /** Draw the members that share a filter into the group's image, and put the layer over them. */
  private async build(key: string) {
    const parent = this.parent;
    if (!parent) return;
    if (this.sharers(key).length < 2) return;
    await this.align(this.sharers(key));
    if (this.destroyed) return;
    let looks = this.sharers(key);
    // an implicit group draws only glass near together: the layer bends everything in its box, so far-apart glass in one
    // would cost the GPU more pixels than separate filters do (the farthest from the others keeps its own)
    if (this.implicit) looks = near(looks);
    if (looks.length < 2) return;
    // nothing new to draw (those waiting are still moving)
    const atlas = this.atlas;
    if (atlas && looks.every((l) => atlas.placed.get(l.m.el) === placeSig(l.source, l.box))) return;
    const fixed = looks[0].cs.position === 'fixed';
    const x0 = Math.min(...looks.map((l) => l.rect.left)), y0 = Math.min(...looks.map((l) => l.rect.top));
    const w = Math.max(...looks.map((l) => l.rect.right)) - x0, h = Math.max(...looks.map((l) => l.rect.bottom)) - y0;
    // the maps, decoded, and how many map pixels each has per px
    const imgs = await Promise.all(looks.map((l) => Promise.all(l.source!.hrefs.map(image))));
    if (this.destroyed) return;
    const items = looks.map((l, i) => {
      const map = l.source!.map, img = imgs[i];
      return { img, x: l.rect.left - x0 + map.x, y: l.rect.top - y0 + map.y, w: map.w, h: map.h, kx: img[0].naturalWidth / map.w, ky: img[0].naturalHeight / map.h, tables: l.source!.tables, maps: l.source!.src.tables };
    });
    const classes = classify(items).map((idx) => ({ kx: items[idx[0]].kx, ky: items[idx[0]].ky, tables: items[idx[0]].maps.map((t) => t.cloneNode(true) as SVGFEComponentTransferElement), items: idx.map((i) => items[i]) }));
    const drawn = await Promise.all(classes.map(async (c) => {
      const left = Math.min(...c.items.map((i) => i.x)), top = Math.min(...c.items.map((i) => i.y));
      const cw = Math.round(Math.max(...c.items.map((i) => (i.x - left + i.w) * c.kx))), ch = Math.round(Math.max(...c.items.map((i) => (i.y - top + i.h) * c.ky)));
      const cv = document.createElement('canvas');
      cv.width = Math.max(cw, 1);
      cv.height = Math.max(ch, 1);
      const ctx = cv.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      // a grey image per channel
      const urls = c.items[0].img.map((_, k) => {
        ctx.clearRect(0, 0, cv.width, cv.height);
        for (const i of c.items) ctx.drawImage(i.img[k], Math.round((i.x - left) * c.kx), Math.round((i.y - top) * c.ky));
        return cv.toDataURL();
      });
      await Promise.all(urls.map(predecode));
      return { urls, x: left, y: top, w: cv.width / c.kx, h: cv.height / c.ky, tables: c.tables };
    }));
    if (this.destroyed) return;
    const mapMargin = Math.max(...looks.map((l) => -l.source!.map.y));
    // where the layer goes: over the members, in its containing block's px
    if (!fixed && getComputedStyle(parent).position === 'static' && looks.every((l) => l.cs.position === 'static' || l.cs.position === 'relative')) {
      // in-flow members: the layer is positioned within their parent, so it scrolls and moves with them (an implicit
      // group only if that moves nothing else)
      if (this.implicit && this.savedParentPosition === null && !canPosition(parent, new Set(looks.map((l) => l.m.el)))) return;
      this.savedParentPosition ??= parent.style.position;
      parent.style.position = 'relative';
    }
    const placed = new Map<HTMLElement, string>();
    this.atlas = { w, h, fixed, placed, classes: drawn, mapMargin };
    this.placeLayer(looks[0].cs, fixed, x0, y0, w, h);
    // the members as they are in it, relative to its corner (the planned ones that haven't moved meanwhile)
    const lr = this.layer.getBoundingClientRect();
    for (const l of looks) {
      const r = l.m.el.getBoundingClientRect();
      if (Math.abs(r.left - lr.left - (l.rect.left - x0)) > 0.01 || Math.abs(r.top - lr.top - (l.rect.top - y0)) > 0.01) continue;
      placed.set(l.m.el, placeSig(l.source!, { x: r.left - lr.left, y: r.top - lr.top, w: r.width, h: r.height }));
    }
  }

  /** The layer: the previous sibling of the first member, as big as the members' bounds, positioned as they are. */
  private placeLayer(cs: CSSStyleDeclaration, fixed: boolean, x: number, y: number, w: number, h: number) {
    const layer = this.layer, first = this.members.map((m) => m.el).filter((el) => el.parentElement === this.parent).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
    if (first && layer.nextElementSibling !== first) first.before(layer);
    layer.style.position = fixed ? 'fixed' : 'absolute';
    layer.style.zIndex = cs.position === 'static' ? 'auto' : cs.zIndex;
    Object.assign(layer.style, { width: `${w}px`, height: `${h}px` });
    // its containing block's corner, in the viewport: where it is now, less where it was put
    const r = layer.getBoundingClientRect();
    const cx = r.left - (parseFloat(layer.style.left) || 0), cy = r.top - (parseFloat(layer.style.top) || 0);
    Object.assign(layer.style, { left: `${x - cx}px`, top: `${y - cy}px` });
  }

  /** The layer's filter: the members' own, with the group's image in place of a member's map. */
  private render(src: Source['src'], atlas: Atlas) {
    const defs = filterDefs();
    const wantPre = src.filters.length === 2;
    const make = (id: string) => {
      const f = svgEl('filter', { id });
      defs.append(f);
      return f;
    };
    this.main ??= make(this.id);
    if (wantPre && !this.pre) this.pre = make(`${this.id}a`);
    if (!wantPre && this.pre) {
      this.pre.remove();
      this.pre = null;
    }
    const filters = wantPre ? [this.pre!, this.main] : [this.main];
    src.filters.forEach((own, i) => {
      const f = filters[i];
      for (const a of own.attributes) if (a.name !== 'id') f.setAttribute(a.name, a.value);
      f.replaceChildren(...[...own.children].map((n) => n.cloneNode(true) as Element));
    });
    // as far as a member's filters reach, or the images (on a group's grid, a map reaches a little further), in whole px
    const ext = (f: (c: Atlas['classes'][number]) => number) => Math.max(0, ...atlas.classes.map(f));
    const e = Math.ceil(Math.max(src.margin, ext((c) => -c.x), ext((c) => -c.y), ext((c) => c.y + c.h - atlas.h)) - 1e-6);
    const m = Math.ceil(Math.max(atlas.mapMargin, ext((c) => c.x + c.w - atlas.w)) - 1e-6);
    // the stash: past the layer and its reach, at a whole number of device pixels (at 1.25× that rounds fewer pixels
    // differently from separate glass than any other offset)
    let side = 0;
    const stash = src.shifts.length > 0;
    if (stash) {
      side = Math.ceil(atlas.w + m + e) + 8;
      const d = devicePixelRatio || 1;
      for (let k = 0; k < 64 && Math.abs(side * d - Math.round(side * d)) > 1e-4; k++) side++;
    }
    // the map: its nodes (images, tables, and unless stashed what joins them) per class, merged; stashed, each channel
    // in a slot of its own, merged channel by channel
    const first = filters[0];
    // (its nodes run from its first image to the last whose result is the map, or a stashed channel of it)
    const own = [...src.filters[0].children], at = own.indexOf(src.images[0]);
    const isOut = (n: Element) => /^(map|side)\d+(_\d)?$/.test(n.getAttribute('result') ?? '');
    const endAt = own.length - 1 - [...own].reverse().findIndex(isOut);
    const raw = src.images[0].getAttribute('result')!.replace(/_0$/, ''), out = own[endAt].getAttribute('result')!.replace(/_\d$/, '');
    const channels = src.images.length as 2 | 3, many = atlas.classes.length > 1;
    const nodes: Element[] = [];
    const merges = (stash ? Array.from({ length: channels }, (_, k) => `${out}_${k}`) : [out]).map((r) => svgEl('feMerge', { result: r }));
    atlas.classes.forEach((c, i) => {
      const name = many ? `${out}_c${i}` : out;
      const graph = mapNodes(`${raw}_${i}`, name, channels, stash);
      graph.images.forEach((im, k) => setAttrs(im, { x: side * (stash ? k + 1 : 0) + c.x, y: c.y, width: c.w, height: c.h, href: c.urls[k] }));
      // the class's own tables (members of different sizes have tables of their own)
      graph.tables.forEach((t, k) => t.replaceChildren(...[...c.tables[k].children].map((f) => f.cloneNode(true))));
      nodes.push(...graph.nodes);
      merges.forEach((mg, k) => mg.append(svgEl('feMergeNode', { in: stash ? `${name}_${k}` : name })));
    });
    if (many) nodes.push(...merges);
    const anchor = first.children[at];
    for (const n of [...first.children].slice(at + 1, endAt + 1)) n.remove();
    anchor.replaceWith(...nodes);
    src.shifts.forEach((shift, k) => {
      const shiftAt = [...src.filters[1].children].indexOf(shift);
      filters[1].children[shiftAt].setAttribute('dx', String(-side * (k + 1)));
    });
    // the regions: as a member's, around the whole layer (filter 2 reaches past it only as far as a member's does)
    if (wantPre) {
      const edge = -Number(src.filters[1].getAttribute('x'));
      // the displacement reads its source up to a member's reach to the right (see mapNodes)
      setAttrs(this.main, { x: -edge, y: -edge, width: atlas.w + edge + Math.max(edge, e), height: atlas.h + 2 * edge });
      setAttrs(this.pre!, { x: -e, y: -e, width: side * channels + atlas.w + m + e, height: atlas.h + 2 * e });
    } else {
      setAttrs(this.main, { x: -e, y: -e, width: atlas.w + 2 * e, height: atlas.h + 2 * e });
    }
  }
}

let atlasCount = 0;

/**
 * Where an element, or anything in it, is painted along with glass (positioned, or a stacking context) rather than
 * before it, as client rects. An element with a lot inside counts as painted along with glass all over its box.
 */
function paintedWithGlass(el: Element): DOMRect[] {
  const own = (e: Element) => {
    const cs = getComputedStyle(e);
    return cs.position !== 'static' || cs.zIndex !== 'auto' || cs.opacity !== '1' || cs.transform !== 'none' || cs.filter !== 'none' || cs.backdropFilter !== 'none'
      || cs.isolation === 'isolate' || cs.mixBlendMode !== 'normal' || cs.willChange !== 'auto' || cs.clipPath !== 'none' || cs.maskImage !== 'none' || /paint|strict|content/.test(cs.contain);
  };
  const inside = el.getElementsByTagName('*');
  if (inside.length > 64) return [el.getBoundingClientRect()];
  return [el, ...inside].filter(own).map((e) => e.getBoundingClientRect());
}

/** Whether making `parent` a containing block (position: relative) moves nothing in it but the group's members. */
function canPosition(parent: HTMLElement, members: Set<HTMLElement>): boolean {
  // a member is a containing block of its own (its backdrop filter makes it one): what's in it never moves
  const walk = document.createTreeWalker(parent, NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (members.has(n as HTMLElement) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  for (let e = walk.nextNode() as Element | null; e; e = walk.nextNode() as Element | null) {
    if (getComputedStyle(e).position !== 'absolute') continue;
    // positioned against something outside the parent now: it would be against the parent
    let inside = false;
    for (let a = e.parentElement; a && a !== parent; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position !== 'static' || cs.transform !== 'none' || cs.filter !== 'none' || cs.backdropFilter !== 'none' || cs.perspective !== 'none' || /layout|paint|strict|content/.test(cs.contain)) {
        inside = true;
        break;
      }
    }
    if (!inside) return false;
  }
  return true;
}

/**
 * Which maps can share an image: the same lookup tables and map pixels per px, at whole map pixels from each other (so
 * each is drawn exactly as it would be on its own), with a map pixel of room between them. Returns the indices, image
 * by image.
 */
export function classify(items: { x: number; y: number; w: number; h: number; kx: number; ky: number; tables?: string }[]): number[][] {
  const near = (v: number) => Math.abs(v - Math.round(v)) < 1e-4;
  const classes: number[][] = [];
  const apart = (a: (typeof items)[number], b: (typeof items)[number]) => {
    const px = 1 / a.kx, py = 1 / a.ky;
    return a.x + a.w + px <= b.x - px || b.x + b.w + px <= a.x - px || a.y + a.h + py <= b.y - py || b.y + b.h + py <= a.y - py;
  };
  items.forEach((it, i) => {
    const c = classes.find((c) => {
      const o = items[c[0]];
      return o.tables === it.tables && Math.abs(o.kx - it.kx) < 1e-9 && Math.abs(o.ky - it.ky) < 1e-9 && near((it.x - o.x) * it.kx) && near((it.y - o.y) * it.ky) && c.every((j) => apart(items[j], it));
    });
    if (c) c.push(i);
    else classes.push([i]);
  });
  return classes;
}

/** As many of `list` as fit in a box at most MAX_SPREAD times their area: the farthest from the rest go first. */
export function near<T extends { rect: DOMRect }>(list: T[]): T[] {
  const kept = [...list];
  for (;;) {
    const x0 = Math.min(...kept.map((l) => l.rect.left)), y0 = Math.min(...kept.map((l) => l.rect.top));
    const x1 = Math.max(...kept.map((l) => l.rect.right)), y1 = Math.max(...kept.map((l) => l.rect.bottom));
    if (kept.length < 2 || (x1 - x0) * (y1 - y0) <= MAX_SPREAD * kept.reduce((a, l) => a + l.rect.width * l.rect.height, 0)) return kept;
    // the middle of the glass (by area), not of its box: the box's middle can be as far from the many as from the one
    const area = (l: T) => l.rect.width * l.rect.height, total = kept.reduce((a, l) => a + area(l), 0);
    const cx = kept.reduce((a, l) => a + (l.rect.left + l.rect.width / 2) * area(l), 0) / total;
    const cy = kept.reduce((a, l) => a + (l.rect.top + l.rect.height / 2) * area(l), 0) / total;
    const d = (l: T) => Math.hypot(l.rect.left + l.rect.width / 2 - cx, l.rect.top + l.rect.height / 2 - cy);
    kept.splice(kept.indexOf(kept.reduce((a, b) => (d(b) > d(a) ? b : a))), 1);
  }
}

const boxKey = (b: Box) => `${b.x.toFixed(2)},${b.y.toFixed(2)},${b.w.toFixed(2)},${b.h.toFixed(2)}`;

/** A member's map and where its box is in the layer: equal when the layer's image holds that map there. */
function placeSig(s: Source, b: { x: number; y: number; w: number; h: number }) {
  return `${s.hrefs.join(" ")}|${b.x.toFixed(2)},${b.y.toFixed(2)},${b.w.toFixed(2)},${b.h.toFixed(2)},${s.map.x},${s.map.y},${s.map.w},${s.map.h}`;
}

/** The key counted most often (the current one wins a tie). */
function most(counts: Map<string, number>, current: string) {
  let key = current, best = counts.get(current) ?? 0;
  for (const [k, n] of counts) if (n > best) [key, best] = [k, n];
  return key;
}

const images = new Map<string, HTMLImageElement>();
/** A map's image, decoded. */
async function image(url: string): Promise<HTMLImageElement> {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    if (images.size > 64) images.delete(images.keys().next().value as string);
    images.set(url, img);
  }
  await img.decode().catch(() => undefined);
  return img;
}

/** An element's border box with its border-radius, as SVG path data, at (x, y). */
export function roundedBox(x: number, y: number, w: number, h: number, cs: { borderTopLeftRadius: string; borderTopRightRadius: string; borderBottomRightRadius: string; borderBottomLeftRadius: string }): string {
  const corner = (v: string): [number, number] => {
    const [a, b = a] = v.split(' ');
    const px = (s: string, of: number) => (s.endsWith('%') ? (parseFloat(s) / 100) * of : parseFloat(s) || 0);
    return [px(a, w), px(b, h)];
  };
  const [tl, tr, br, bl] = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(corner);
  // CSS shrinks all the radii together when two of them don't fit along a side
  const f = Math.min(1, w / (tl[0] + tr[0] || 1), w / (bl[0] + br[0] || 1), h / (tl[1] + bl[1] || 1), h / (tr[1] + br[1] || 1));
  for (const c of [tl, tr, br, bl]) {
    c[0] *= f;
    c[1] *= f;
  }
  const n = (v: number) => +v.toFixed(3);
  return `M${n(x + tl[0])} ${n(y)}H${n(x + w - tr[0])}A${n(tr[0])} ${n(tr[1])} 0 0 1 ${n(x + w)} ${n(y + tr[1])}V${n(y + h - br[1])}A${n(br[0])} ${n(br[1])} 0 0 1 ${n(x + w - br[0])} ${n(y + h)}H${n(x + bl[0])}A${n(bl[0])} ${n(bl[1])} 0 0 1 ${n(x)} ${n(y + h - bl[1])}V${n(y + tl[1])}A${n(tl[0])} ${n(tl[1])} 0 0 1 ${n(x + tl[0])} ${n(y)}Z`;
}
