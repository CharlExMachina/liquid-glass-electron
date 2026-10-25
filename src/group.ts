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
// The members' maps are copied into one image at whole pixels of the map, so they're drawn exactly as they'd be on
// their own; members that don't line up with each other (different sizes, odd offsets) get an image each. Every image
// goes through its own lookup table before anything is merged: the table turns a stretched value into a steep shift,
// and it has to see the stretched value itself, not one rounded to 8 bits by a merge first.
import type { Lens } from './lens.ts';
import { filterDefs, predecode, setAttrs, svgEl } from './dom.ts';

/** How long a member has to keep its place before its map goes into the group's image, ms. */
const SETTLE = 120;
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
  href: string;
}

interface Member {
  el: HTMLElement;
  lens: Lens;
  version: number;
  source: Source | null;
  // how it was when last measured (for the lens's version), or null to measure again
  look: { version: number; ok: boolean; fixed: boolean; z: string; box: { x: number; y: number; w: number; h: number }; clip: string } | null;
  saved: string;
  observer: MutationObserver;
  touch: () => void;
}

/** The group's image of maps: the layer's size, each member's map in it (by where its box is), and the images. */
interface Atlas {
  w: number;
  h: number;
  fixed: boolean;
  placed: Map<HTMLElement, string>;
  classes: { url: string; x: number; y: number; w: number; h: number; table: SVGFEComponentTransferElement }[];
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
  // where each member that waits to join was last seen: the image is drawn once none has moved for SETTLE ms
  private moved = new Map<HTMLElement, string>();
  private sizes: ResizeObserver;
  private parent: HTMLElement | null = null;
  private savedParentPosition: string | null = null;
  private destroyed = false;
  private clip = '';
  private filter = '';
  // anything may have changed (the window, the parent's size): every member is measured again
  private onEvent = () => {
    for (const m of this.members) m.look = null;
    this.schedule();
  };

  constructor(host: GroupHost) {
    this.host = host;
    this.layer = document.createElement('div');
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.dataset.lgLayer = 'group';
    this.layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;margin:0;padding:0;border:0;';
    this.sizes = new ResizeObserver(this.onEvent);
    addEventListener('resize', this.onEvent);
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
    const m: Member = { el, lens, version: -1, source: null, look: null, saved: el.style.getPropertyValue('isolation'), observer: null!, touch: () => {
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
          if (n === src.image && (a.name === 'x' || a.name === 'y' || a.name === 'width' || a.name === 'height' || a.name === 'href')) continue;
          if (n === src.shift && a.name === 'dx') continue;
          if (n.parentNode === src.table && a.name === 'tableValues') continue;
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
    parts.push(`margin=${src.margin}`);
    const num = (a: string) => Number(src.image.getAttribute(a));
    const tables = [...src.table.children].map((f) => f.getAttribute('tableValues')).join('|');
    return (m.source = { key: parts.join(' '), tables, src, map: { x: num('x') - src.side, y: num('y'), w: num('width'), h: num('height') }, href: src.image.getAttribute('href')! });
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
    this.parent = this.members[0]?.el.parentElement ?? null;
    if (!this.parent) return;
    // the members' boxes relative to the layer's corner (scrolling moves both); only those that changed are measured
    const lr = this.layer.getBoundingClientRect();
    const look = this.members.map((m) => {
      const source = this.sourceOf(m);
      if (!source) return { m, source, ok: false, fixed: false, z: '', box: null, clip: '' };
      if (!m.look || m.look.version !== m.version) {
        const cs = getComputedStyle(m.el), rect = m.el.getBoundingClientRect();
        const box = { x: rect.left - lr.left, y: rect.top - lr.top, w: rect.width, h: rect.height };
        m.look = {
          version: m.version, ok: this.eligible(m.el, cs, rect), fixed: cs.position === 'fixed', z: cs.zIndex, box,
          // its own rounded box, as Chromium clips its backdrop filter
          clip: roundedBox(box.x, box.y, box.w, box.h, cs),
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
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    const sharing = candidates.filter((l) => {
      const r = l.box!;
      if (boxes.some((b) => r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h)) return false;
      boxes.push(r);
      return true;
    });

    const atlas = this.atlas;
    const sig = (l: (typeof look)[number]) => placeSig(l.source!, l.box!);
    const inLayer = atlas && first && atlas.fixed === first.fixed ? sharing.filter((l) => atlas.placed.get(l.m.el) === sig(l)) : [];
    // a member that should be drawn by the layer but isn't in its image yet: the image is drawn again once it holds still
    const waiting = sharing.filter((l) => !inLayer.includes(l));
    this.waiting = sharing.length > 1 ? waiting.length : 0;
    let restart = false;
    for (const l of waiting) {
      const s = sig(l);
      if (this.moved.get(l.m.el) !== s) {
        this.moved.set(l.m.el, s);
        restart = true;
      }
    }
    for (const el of this.moved.keys()) if (!waiting.some((l) => l.m.el === el)) this.moved.delete(el);
    if (waiting.length && (restart || !this.settleTimer) && !this.building && sharing.length > 1) {
      clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => {
        this.settleTimer = 0;
        this.building = this.build(key).finally(() => {
          this.building = null;
          // the layer moved: everyone is measured again
          for (const m of this.members) m.look = null;
          this.schedule();
        });
      }, SETTLE);
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
    this.apply(new Set(batch.map((l) => l.m.el)), batch.map((l) => l.clip).join(' '));
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

  // ---------------------------------------------------------------- the layer's image and filter

  /** Draw the members that share a filter into the group's image, and put the layer over them. */
  private async build(key: string) {
    const parent = this.parent;
    if (!parent) return;
    const plan = this.members.map((m) => ({ m, source: this.sourceOf(m) })).filter((p) => p.source && p.source.key === key);
    const looks = plan.map((p) => ({ ...p, cs: getComputedStyle(p.m.el), rect: p.m.el.getBoundingClientRect() })).filter((l) => this.eligible(l.m.el, l.cs, l.rect));
    if (looks.length < 2) return;
    const fixed = looks[0].cs.position === 'fixed';
    const x0 = Math.min(...looks.map((l) => l.rect.left)), y0 = Math.min(...looks.map((l) => l.rect.top));
    const w = Math.max(...looks.map((l) => l.rect.right)) - x0, h = Math.max(...looks.map((l) => l.rect.bottom)) - y0;
    // the maps, decoded, and how many map pixels each has per px
    const imgs = await Promise.all(looks.map((l) => image(l.source!.href)));
    if (this.destroyed) return;
    const items = looks.map((l, i) => {
      const map = l.source!.map, img = imgs[i];
      return { img, x: l.rect.left - x0 + map.x, y: l.rect.top - y0 + map.y, w: map.w, h: map.h, kx: img.naturalWidth / map.w, ky: img.naturalHeight / map.h, tables: l.source!.tables, table: l.source!.src.table };
    });
    const classes = classify(items).map((idx) => ({ kx: items[idx[0]].kx, ky: items[idx[0]].ky, table: items[idx[0]].table.cloneNode(true) as SVGFEComponentTransferElement, items: idx.map((i) => items[i]) }));
    const drawn = await Promise.all(classes.map(async (c) => {
      const left = Math.min(...c.items.map((i) => i.x)), top = Math.min(...c.items.map((i) => i.y));
      const cw = Math.round(Math.max(...c.items.map((i) => (i.x - left + i.w) * c.kx))), ch = Math.round(Math.max(...c.items.map((i) => (i.y - top + i.h) * c.ky)));
      const cv = document.createElement('canvas');
      cv.width = Math.max(cw, 1);
      cv.height = Math.max(ch, 1);
      const ctx = cv.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      for (const i of c.items) ctx.drawImage(i.img, Math.round((i.x - left) * c.kx), Math.round((i.y - top) * c.ky));
      const url = cv.toDataURL();
      await predecode(url);
      return { url, x: left, y: top, w: cv.width / c.kx, h: cv.height / c.ky, table: c.table };
    }));
    if (this.destroyed) return;
    const mapMargin = Math.max(...looks.map((l) => -l.source!.map.y));
    // where the layer goes: over the members, in its containing block's px
    if (!fixed && getComputedStyle(parent).position === 'static' && looks.every((l) => l.cs.position === 'static' || l.cs.position === 'relative')) {
      // in-flow members: the layer is positioned within their parent, so it scrolls and moves with them
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
    // the stash: past the layer and its reach, at a whole number of device pixels (at 1.25× that rounds fewer pixels
    // differently from separate glass than any other offset)
    const e = src.margin, m = atlas.mapMargin;
    let side = 0;
    if (src.shift) {
      side = Math.ceil(atlas.w + m + e) + 8;
      const d = devicePixelRatio || 1;
      for (let k = 0; k < 64 && Math.abs(side * d - Math.round(side * d)) > 1e-4; k++) side++;
    }
    // the map: an image (and its table) per class, merged
    const first = filters[0];
    const at = [...src.filters[0].children].indexOf(src.image), tableAt = [...src.filters[0].children].indexOf(src.table);
    const image = first.children[at] as SVGFEImageElement, table = first.children[tableAt] as SVGFEComponentTransferElement;
    const raw = image.getAttribute('result')!, out = table.getAttribute('result')!;
    const nodes: Element[] = [];
    const merge = svgEl('feMerge', { result: out });
    atlas.classes.forEach((c, i) => {
      const im = image.cloneNode(true) as SVGFEImageElement;
      setAttrs(im, { x: side + c.x, y: c.y, width: c.w, height: c.h, href: c.url, result: `${raw}_${i}` });
      // the class's own table (members of different sizes have tables of their own)
      const t = c.table.cloneNode(true) as SVGFEComponentTransferElement;
      setAttrs(t, { in: `${raw}_${i}`, result: atlas.classes.length > 1 ? `${out}_${i}` : out });
      nodes.push(im, t);
      merge.append(svgEl('feMergeNode', { in: `${out}_${i}` }));
    });
    if (atlas.classes.length > 1) nodes.push(merge);
    table.remove();
    image.replaceWith(...nodes);
    if (src.shift) {
      const shiftAt = [...src.filters[1].children].indexOf(src.shift);
      filters[1].children[shiftAt].setAttribute('dx', String(-side));
    }
    // the regions: as a member's, around the whole layer (filter 2 reaches past it only as far as a member's does)
    if (wantPre) {
      const edge = -Number(src.filters[1].getAttribute('x'));
      setAttrs(this.main, { x: -edge, y: -edge, width: atlas.w + 2 * edge, height: atlas.h + 2 * edge });
      setAttrs(this.pre!, { x: -e, y: -e, width: side + atlas.w + m + e, height: atlas.h + 2 * e });
    } else {
      setAttrs(this.main, { x: -e, y: -e, width: atlas.w + m + e, height: atlas.h + 2 * e });
    }
  }
}

let atlasCount = 0;

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

/** A member's map and where its box is in the layer: equal when the layer's image holds that map there. */
function placeSig(s: Source, b: { x: number; y: number; w: number; h: number }) {
  return `${s.href}|${b.x.toFixed(2)},${b.y.toFixed(2)},${b.w.toFixed(2)},${b.h.toFixed(2)},${s.map.x},${s.map.y},${s.map.w},${s.map.h}`;
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
