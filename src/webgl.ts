// Glass drawn by a shader, for browsers whose backdrop-filter takes no SVG filter (Safari, Firefox).
//
// A page can't read the pixels behind an element, so this bends a backdrop the page names (GlassOptions.backdropSource:
// an <img>, <video> or <canvas>): the source is a texture, and a fragment shader samples it through the same map and
// lookup tables the SVG filter uses (maps.ts), bilinearly. One WebGL2 context draws every glass on the page, one at a
// time, and each glass shows its pixels in a 2D canvas of its own inside the element (so the page's own stacking
// decides what's over what, and the count of WebGL contexts a page may have doesn't limit the count of glass).
//
// Nothing is drawn unless something changed. A page gets no event when an element moves, so while anything is going
// on (scrolling, the pointer, a transition, a change of the glass's options) each glass's place is read every frame and
// its glass drawn again if it moved; after half a second of nothing, a look once a second is all that's left (and
// any change of a style or a class on the page brings the look every frame back at once).
import type { Pixels } from './maps.ts';

export type BackdropSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
type Box = { x: number; y: number; w: number; h: number };

/** A map as the shader reads it: the image, and per axis the table from its value to the shift (see tableMap). */
export interface GlMap {
  pixels: Pixels;
  tableX: number[];
  tableY: number[];
  /** what every table value has added to it (for Chromium's truncation), to take off again */
  bias: number;
  /** the shift a table value of 1 stands for, px */
  rimPx: number;
}

/** What a glass looks like now, in its element's px. */
export interface GlFrame {
  w: number;
  h: number;
  /** one map, or one per colour channel (a dome's fringe) */
  maps: GlMap[];
  /** where the map is stretched over */
  mapRect: Box;
  /** red, green and blue: which map, and how many times its shift */
  channels: { map: number; k: number }[];
  /** the furthest the backdrop is read from past the edge, px */
  reach: number;
  /** the frost, σ px; and macOS's blur fill, laid over it */
  sigma: number;
  fill: { sigma: number; alpha: number; darken: boolean } | null;
  /** the 3 × 3 smoothing (glass with no frost) */
  smooth: boolean;
  /** the colour matrix, as feColorMatrix's 20 values (its first three rows count) */
  matrix: number[];
  /** macOS's cap on dark glass's luma, or null */
  cap: number | null;
  opacity: number;
  surface: { urls: [string, string]; strength: number } | null;
  /** cut the glass to the shape in the map's blue channel */
  cover: boolean;
  /** work in Display P3, as Chromium does on a wide-gamut display (the variants' colour is fitted there) */
  wideGamut: boolean;
}

export interface GlHost {
  el: HTMLElement;
  /** what to draw now, or null for nothing (glass that's off, or whose map isn't drawn yet) */
  frame(): GlFrame | null;
  /** the source can't be read (an image from another origin without CORS, a lost context that didn't come back) */
  failed(): void;
}

/** Whether `el` can be a glass's backdrop: an image, a video or a canvas. */
export function isBackdropSource(el: Element | null): el is BackdropSource {
  return !!el && (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLCanvasElement);
}

let supported: boolean | null = null;

/** Whether this browser draws WebGL2. */
export function glSupported(): boolean {
  if (supported !== null) return supported;
  if (typeof document === 'undefined') return (supported = false);
  try {
    supported = !!renderer().gl;
  } catch {
    supported = false;
  }
  return supported;
}

/**
 * Where a replaced element draws its content, given its content box: CSS's object-fit and object-position (as
 * computed: a percentage or a length per axis).
 */
export function fitRect(box: Box, iw: number, ih: number, fit: string, position: string): Box {
  if (!iw || !ih) return box;
  let w = box.w, h = box.h;
  const contain = Math.min(box.w / iw, box.h / ih), cover = Math.max(box.w / iw, box.h / ih);
  const scale = fit === 'contain' ? contain : fit === 'cover' ? cover : fit === 'none' ? 1 : fit === 'scale-down' ? Math.min(1, contain) : 0;
  if (scale) {
    w = iw * scale;
    h = ih * scale;
  }
  const [px = '50%', py = '50%'] = position.trim().split(/\s+/);
  const at = (v: string, free: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * free : parseFloat(v) || 0);
  return { x: box.x + at(px, box.w - w), y: box.y + at(py, box.h - h), w, h };
}

/**
 * The shift a map stands for at one of its values, px (at refraction 1): what the shader computes, and the SVG
 * filter's feComponentTransfer and feDisplacementMap between them. `v`: the map's channel, 0..1.
 */
export function decodeShift(table: number[], bias: number, rimPx: number, v: number): number {
  const t = Math.min(Math.max(v, 0), 1) * (table.length - 1), i = Math.min(Math.floor(t), table.length - 2);
  return (table[i] + (table[i + 1] - table[i]) * (t - i) - bias - 0.5) * 2 * rimPx;
}

// ---------------------------------------------------------------- the shaders

const VERTEX = `#version 300 es
out vec2 v;
void main() {
  // one triangle over the viewport
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// The source into a texture of the glass's surroundings (rows from the top), for the frost to blur.
const COPY = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec4 uRegion;   // the texture's place, in the element's px
uniform vec4 uToUv;     // the element's px to the source's uv: p * xy + zw
uniform vec2 uGx, uGy;  // the source's uv per texel of the output
in vec2 v;
out vec4 o;
void main() {
  vec2 p = uRegion.xy + v * uRegion.zw;
  o = textureGrad(uSrc, clamp(p * uToUv.xy + uToUv.zw, 0.0, 1.0), uGx, uGy);
}`;

// One way of a Gaussian (σ in texels).
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uStep;
uniform float uSigma;
in vec2 v;
out vec4 o;
void main() {
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -12; i <= 12; i++) {
    float w = exp(-0.5 * float(i * i) / (uSigma * uSigma));
    sum += w * textureLod(uTex, v + float(i) * uStep, 0.0);
    total += w;
  }
  o = sum / total;
}`;

// The glass: per colour channel, where the map says the backdrop is seen from, then colour, surface and shape.
const GLASS = `#version 300 es
precision highp float;
uniform sampler2D uBack, uWide, uMap0, uMap1, uMap2, uTab0, uTab1, uTab2, uGain, uOffset;
uniform vec4 uTabInfo[3];   // entries, bias, rimPx
uniform vec3 uK;            // red, green, blue: times the map's shift
uniform vec2 uSize;         // the element, px
uniform vec4 uMapRect;
uniform vec4 uToUv;         // the element's px to the backdrop texture's uv
uniform vec2 uGx, uGy;      // the backdrop's uv per device pixel
uniform float uPixel;       // a device pixel, in the element's px
uniform vec4 uSrcBox;       // the source, in the element's px: none of it, no glass
uniform mat3 uColour;
uniform vec3 uColourOffset;
uniform float uFill, uCap, uOpacity, uSurface;
uniform bool uFlip, uSmooth, uDarken, uFringe, uCover;
in vec2 v;
out vec4 o;

vec4 tap(vec2 p) {
  return textureGrad(uBack, clamp(p * uToUv.xy + uToUv.zw, 0.0, 1.0), uGx, uGy);
}

vec3 back(vec2 p) {
  vec4 c;
  if (uSmooth) {
    // four taps half a pixel out, each the mean of four pixels: the 3 x 3 kernel 1 2 1, 2 4 2, 1 2 1
    vec2 d = vec2(uPixel * 0.5);
    c = 0.25 * (tap(p + d) + tap(p - d) + tap(p + vec2(d.x, -d.y)) + tap(p + vec2(-d.x, d.y)));
  } else {
    c = tap(p);
  }
  if (uFill > 0.0) {
    vec3 w = textureLod(uWide, clamp(p * uToUv.xy + uToUv.zw, 0.0, 1.0), 0.0).rgb;
    c.rgb = mix(c.rgb, uDarken ? min(c.rgb, w) : max(c.rgb, w), uFill);
  }
  // the matrix, clipped as a filter clips; and macOS's cap on the luma, which keeps the hue
  vec3 r = uColour * c.rgb + uColourOffset;
  vec3 col = clamp(r, 0.0, 1.0);
  if (uCap > 0.0) {
    float l = clamp(dot(vec3(0.2126, 0.7152, 0.0722), r), -1.0, 1.0);
    if (l > uCap) col *= uCap / l;
  }
  return col;
}

vec2 shift(sampler2D map, sampler2D tab, vec4 info, vec2 p, out float edge) {
  vec3 m = textureLod(map, (p - uMapRect.xy) / uMapRect.zw, 0.0).rgb;
  edge = m.b;
  vec2 t = m.rg * (info.x - 1.0), i = min(floor(t), info.x - 2.0), f = t - i;
  float x = mix(texelFetch(tab, ivec2(int(i.x), 0), 0).r, texelFetch(tab, ivec2(int(i.x) + 1, 0), 0).r, f.x);
  float y = mix(texelFetch(tab, ivec2(int(i.y), 0), 0).g, texelFetch(tab, ivec2(int(i.y) + 1, 0), 0).g, f.y);
  return (vec2(x, y) - info.y - 0.5) * 2.0 * info.z;
}

void main() {
  vec2 p = vec2(v.x, uFlip ? 1.0 - v.y : v.y) * uSize;
  float edge, unused;
  vec2 s0 = shift(uMap0, uTab0, uTabInfo[0], p, edge);
  vec3 col;
  if (uFringe) {
    vec2 s1 = shift(uMap1, uTab1, uTabInfo[1], p, unused), s2 = shift(uMap2, uTab2, uTabInfo[2], p, unused);
    col = vec3(back(p + s0 * uK.x).r, back(p + s1 * uK.y).g, back(p + s2 * uK.z).b);
  } else {
    col = back(p + s0 * uK.x);
  }
  if (uOpacity < 1.0) col = mix(back(p), col, uOpacity);
  if (uSurface > 0.0) {
    float gain = textureLod(uGain, p / uSize, 0.0).r, offset = textureLod(uOffset, p / uSize, 0.0).r;
    col = clamp(col * (1.0 - uSurface + uSurface * gain) + uSurface * (offset - 0.5), 0.0, 1.0);
  }
  float a = uCover ? clamp((edge * 255.0 - 128.0) / 8.0 + 0.5, 0.0, 1.0) : 1.0;
  vec2 q = (p - uSrcBox.xy) / uSrcBox.zw;
  a *= step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  o = vec4(col * a, a);
}`;

// ---------------------------------------------------------------- the renderer (one per page)

// the texture unit textures are made and filled on
const SCRATCH = 15;
interface Program { program: WebGLProgram; at: Record<string, WebGLUniformLocation | null> }
interface Target { texture: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number; used: number }
/** A glass to draw this frame: what it looks like, where it and its source are, and the canvas that shows it. */
interface Job { f: GlFrame; src: SourceEntry; glassBox: Box; sourceBox: Box; cw: number; ch: number; out: CanvasRenderingContext2D; redraw: () => void; done: () => void; x?: number; y?: number }
interface SourceEntry { texture: WebGLTexture; key: string; version: number; w: number; h: number; failed: boolean; frames: number; watching: boolean }

class Renderer {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  gl: WebGL2RenderingContext;
  private copy!: Program;
  private blur!: Program;
  private glass!: Program;
  private targets = new Map<string, Target[]>();
  private sources = new WeakMap<BackdropSource, SourceEntry>();
  private mapTextures = new WeakMap<Pixels, WebGLTexture>();
  private tableTextures = new WeakMap<GlMap, WebGLTexture>();
  private images = new Map<string, { texture: WebGLTexture | null; ready: boolean }>();
  // textures of maps that are gone, deleted with them
  private gone = new FinalizationRegistry<WebGLTexture>((t) => this.gl.deleteTexture(t));
  private frame = 0;
  private maxTexture = 4096;
  private p3 = false;
  lost = false;

  constructor() {
    // An OffscreenCanvas where it draws WebGL2: its frame leaves as an ImageBitmap, which every glass's canvas copies
    // its part from. From a canvas element, each copy has the browser take the whole canvas again (Firefox draws 30
    // glasses at 24 frames a second that way, 60 this way).
    const options = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
    let canvas: HTMLCanvasElement | OffscreenCanvas | null = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(256, 256) : null;
    let gl = (canvas?.getContext('webgl2', options) ?? null) as WebGL2RenderingContext | null;
    if (!gl) {
      const element = document.createElement('canvas');
      gl = element.getContext('webgl2', options) as WebGL2RenderingContext | null;
      canvas = element;
    }
    if (!gl) throw new Error('no WebGL2');
    this.canvas = canvas!;
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.setup();
      this.lost = false;
      for (const g of glasses) g.invalidate();
    });
    this.setup();
  }

  /** Everything the context holds, made (again). */
  private setup() {
    const gl = this.gl;
    this.targets = new Map();
    this.sources = new WeakMap();
    this.mapTextures = new WeakMap();
    this.tableTextures = new WeakMap();
    this.images = new Map();
    this.maxTexture = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 8192);
    this.copy = this.link(COPY);
    this.blur = this.link(BLUR);
    this.glass = this.link(GLASS);
    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.p3 = false;
  }

  private link(fragment: string): Program {
    const gl = this.gl, program = gl.createProgram()!;
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`liquid-glass-electron: shader: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`liquid-glass-electron: program: ${gl.getProgramInfoLog(program)}`);
    const at: Record<string, WebGLUniformLocation | null> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i)!.name.replace(/\[0\]$/, '');
      at[name] = gl.getUniformLocation(program, name);
    }
    return { program, at };
  }

  /** Whether the shader's numbers can be Display P3's (a wide-gamut display's, as Chromium's filters' are there). */
  get canWide() {
    return 'drawingBufferColorSpace' in this.gl && 'unpackColorSpace' in this.gl;
  }

  /** The colour space the shader's numbers are in. */
  private colourSpace(wide: boolean) {
    const gl = this.gl as WebGL2RenderingContext & { drawingBufferColorSpace?: string; unpackColorSpace?: string };
    const p3 = wide && this.canWide;
    if (p3 === this.p3) return;
    this.p3 = p3;
    gl.drawingBufferColorSpace = gl.unpackColorSpace = p3 ? 'display-p3' : 'srgb';
    // the sources were unpacked for the other space
    this.sources = new WeakMap();
  }

  /** A new texture, bound to the unit textures are made and filled on (never one a shader reads). */
  private texture(filter: number, wrap = this.gl.CLAMP_TO_EDGE) {
    const gl = this.gl, t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + SCRATCH);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  /** A texture to draw into, of this size: kept for the next glass of the same size (and dropped after a while unused). */
  private target(w: number, h: number, n: number): Target {
    const gl = this.gl, key = `${w}x${h}`;
    let list = this.targets.get(key);
    if (!list) this.targets.set(key, (list = []));
    while (list.length <= n) {
      const texture = this.texture(gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      list.push({ texture, fbo, w, h, used: this.frame });
    }
    list[n].used = this.frame;
    return list[n];
  }

  /** Once a draw: targets no glass has used for a while go. */
  private sweep() {
    if (++this.frame % 240) return;
    for (const [key, list] of this.targets) {
      if (list.every((t) => this.frame - t.used > 240)) {
        for (const t of list) {
          this.gl.deleteTexture(t.texture);
          this.gl.deleteFramebuffer(t.fbo);
        }
        this.targets.delete(key);
      }
    }
  }

  /** The source as a texture, uploaded when what it shows changed; null while it has nothing to show (or can't be read). */
  source(el: BackdropSource): SourceEntry | null {
    const gl = this.gl;
    let e = this.sources.get(el);
    if (!e) {
      // a picture shown smaller than it is needs its smaller copies; a video's or a canvas's every frame would cost more
      // than they're worth
      e = { texture: this.texture(el instanceof HTMLImageElement ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR), key: '', version: 0, w: 0, h: 0, failed: false, frames: 0, watching: false };
      this.sources.set(el, e);
    }
    if (e.failed) return e;
    let w: number, h: number, key: string;
    if (el instanceof HTMLImageElement) {
      if (!el.complete || !el.naturalWidth) return null;
      w = el.naturalWidth;
      h = el.naturalHeight;
      key = `${el.currentSrc}|${w}x${h}`;
    } else if (el instanceof HTMLVideoElement) {
      if (el.readyState < 2 || !el.videoWidth) return null;
      w = el.videoWidth;
      h = el.videoHeight;
      // a frame shown since the last upload (or, where the browser doesn't say, another time)
      const video = el as HTMLVideoElement & { requestVideoFrameCallback?: (fn: () => void) => void };
      const told = typeof video.requestVideoFrameCallback === 'function';
      if (told && !e.watching) {
        const entry = e;
        const next = () => {
          entry.frames++;
          entry.watching = false;
          wake();
        };
        e.watching = true;
        video.requestVideoFrameCallback!(next);
      }
      key = `${w}x${h}|${told ? e.frames : el.currentTime}`;
    } else {
      if (!el.width || !el.height) return null;
      w = el.width;
      h = el.height;
      // a canvas doesn't say when it's drawn on: every frame
      key = `${w}x${h}|${this.frame}`;
    }
    if (key === e.key) return e;
    e.key = key;
    try {
      gl.activeTexture(gl.TEXTURE0 + SCRATCH);
      gl.bindTexture(gl.TEXTURE_2D, e.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      const scale = Math.min(1, this.maxTexture / Math.max(w, h));
      if (scale < 1) {
        // larger than a texture may be: through a smaller canvas
        const small = document.createElement('canvas');
        small.width = Math.round(w * scale);
        small.height = Math.round(h * scale);
        small.getContext('2d')!.drawImage(el, 0, 0, small.width, small.height);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, small);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
      }
      if (el instanceof HTMLImageElement) gl.generateMipmap(gl.TEXTURE_2D);
      e.w = w;
      e.h = h;
      e.version++;
    } catch {
      // an image from another origin, served without CORS: the page may show it, not read it
      e.failed = true;
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return e;
  }

  private mapTexture(m: GlMap) {
    const gl = this.gl;
    let t = this.mapTextures.get(m.pixels);
    if (!t) {
      t = this.texture(gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, m.pixels.width, m.pixels.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.pixels.data as Uint8ClampedArray<ArrayBuffer>);
      this.mapTextures.set(m.pixels, t);
      this.gone.register(m.pixels, t);
    }
    return t;
  }

  private tableTexture(m: GlMap) {
    const gl = this.gl;
    let t = this.tableTextures.get(m);
    if (!t) {
      t = this.texture(gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const n = m.tableX.length, data = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        data[i * 2] = m.tableX[i];
        data[i * 2 + 1] = m.tableY[i];
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, n, 1, 0, gl.RG, gl.FLOAT, data);
      this.tableTextures.set(m, t);
      this.gone.register(m, t);
    }
    return t;
  }

  /** An image by its URL (a surface's gain or offset), once it's loaded; null until then. */
  private image(url: string, loaded: () => void): WebGLTexture | null {
    let e = this.images.get(url);
    if (!e) {
      const entry: { texture: WebGLTexture | null; ready: boolean } = (e = { texture: null, ready: false });
      this.images.set(url, entry);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const gl = this.gl;
        entry.texture = this.texture(gl.LINEAR);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          entry.ready = true;
        } catch {
          entry.texture = null;
        }
        loaded();
      };
      img.src = url;
      if (this.images.size > 64) this.images.delete(this.images.keys().next().value as string);
    }
    return e.ready ? e.texture : null;
  }

  private run(target: Target | null, x: number, y: number, w: number, h: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(x, y, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private bind(unit: number, texture: WebGLTexture) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
  }

  /**
   * The backdrop around the glass (`pad` px past it on each side), blurred by σ px: at a resolution the blur can't
   * tell from full, so its kernel stays 25 taps whatever σ is.
   */
  private frosted(src: SourceEntry, f: GlFrame, toUv: number[], scale: number, sigma: number, pad: number, slot: number): { texture: WebGLTexture; region: Box } {
    const gl = this.gl;
    const texels = sigma * scale, q = Math.min(1, 2 ** -Math.ceil(Math.log2(Math.max(texels, 1e-3) / 4)));
    const region = { x: -pad, y: -pad, w: f.w + 2 * pad, h: f.h + 2 * pad };
    const w = Math.max(2, Math.round(region.w * scale * q)), h = Math.max(2, Math.round(region.h * scale * q));
    const a = this.target(w, h, slot), b = this.target(w, h, slot + 1);
    gl.useProgram(this.copy.program);
    this.bind(0, src.texture);
    gl.uniform1i(this.copy.at.uSrc, 0);
    gl.uniform4f(this.copy.at.uRegion, region.x, region.y, region.w, region.h);
    gl.uniform4f(this.copy.at.uToUv, toUv[0], toUv[1], toUv[2], toUv[3]);
    gl.uniform2f(this.copy.at.uGx, (toUv[0] * region.w) / w, 0);
    gl.uniform2f(this.copy.at.uGy, 0, (toUv[1] * region.h) / h);
    this.run(a, 0, 0, w, h);
    gl.useProgram(this.blur.program);
    gl.uniform1i(this.blur.at.uTex, 0);
    gl.uniform1f(this.blur.at.uSigma, Math.max(texels * q, 0.05));
    this.bind(0, a.texture);
    gl.uniform2f(this.blur.at.uStep, 1 / w, 0);
    this.run(b, 0, 0, w, h);
    this.bind(0, b.texture);
    gl.uniform2f(this.blur.at.uStep, 0, 1 / h);
    this.run(a, 0, 0, w, h);
    return { texture: a.texture, region };
  }

  /**
   * Draw the glasses due this frame, each into its own canvas. All of them are drawn side by side on the one WebGL
   * canvas first and copied out after: a copy taken between two draws would have the browser finish the first draw
   * before it starts the second, once per glass. False if nothing could be drawn (the context is lost).
   */
  flush(jobs: Job[]): boolean {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return false;
    this.sweep();
    this.colourSpace(jobs[0].f.wideGamut);
    const LIMIT = Math.min(this.maxTexture, 4096);
    for (let from = 0; from < jobs.length;) {
      // in rows, as many as fit one canvas
      let x = 0, y = 0, row = 0, width = 0, to = from;
      for (; to < jobs.length; to++) {
        const j = jobs[to];
        if (x && x + j.cw > LIMIT) {
          x = 0;
          y += row;
          row = 0;
        }
        if (to > from && y + j.ch > LIMIT) break;
        j.x = x;
        j.y = y;
        x += j.cw;
        row = Math.max(row, j.ch);
        width = Math.max(width, x);
      }
      const height = y + row;
      // (a canvas that changes size is cleared: before anything is drawn on it)
      if (this.canvas.width < width || this.canvas.height < height) {
        this.canvas.width = Math.max(this.canvas.width, width);
        this.canvas.height = Math.max(this.canvas.height, height);
      }
      const batch = jobs.slice(from, to);
      for (const j of batch) this.draw(j);
      const image = this.canvas instanceof HTMLCanvasElement ? this.canvas : this.canvas.transferToImageBitmap();
      for (const j of batch) {
        j.out.globalCompositeOperation = 'copy';
        j.out.drawImage(image, j.x!, j.y!, j.cw, j.ch, 0, 0, j.cw, j.ch);
        j.done();
      }
      if (!(image instanceof HTMLCanvasElement)) image.close();
      from = to;
    }
    return true;
  }

  /** One glass, at its place on the WebGL canvas. */
  private draw({ f, src, glassBox, sourceBox, cw, ch, redraw, x = 0, y = 0 }: Job) {
    const gl = this.gl;
    // the element's px to the viewport's (it may be scaled), and on to the source's uv
    const sx = glassBox.w / f.w, sy = glassBox.h / f.h;
    const toUv = [sx / sourceBox.w, sy / sourceBox.h, (glassBox.x - sourceBox.x) / sourceBox.w, (glassBox.y - sourceBox.y) / sourceBox.h];
    const scale = cw / f.w;
    let back = src.texture, backToUv = toUv, wide: WebGLTexture | null = null;
    let gx = [toUv[0] / scale, 0], gy = [0, toUv[1] / (ch / f.h)];
    if (f.sigma > 0.01) {
      const tail = Math.ceil(3 * Math.max(f.sigma, f.fill?.sigma ?? 0));
      const pad = Math.ceil(f.reach) + tail + 2;
      const frost = this.frosted(src, f, toUv, scale, f.sigma, pad, 0);
      back = frost.texture;
      backToUv = [1 / frost.region.w, 1 / frost.region.h, -frost.region.x / frost.region.w, -frost.region.y / frost.region.h];
      // blurred already: read as it is
      gx = [0, 0];
      gy = [0, 0];
      // the wide blur's texture has the same place (the same region), whatever its own resolution
      if (f.fill && f.fill.alpha > 0) wide = this.frosted(src, f, toUv, scale, f.fill.sigma, pad, 2).texture;
    }
    const p = this.glass, at = p.at;
    gl.useProgram(p.program);
    this.bind(0, back);
    this.bind(1, wide ?? back);
    const maps = [0, 1, 2].map((c) => f.maps[f.channels[c].map]);
    maps.forEach((m, c) => {
      this.bind(2 + c, this.mapTexture(m));
      this.bind(5 + c, this.tableTexture(m));
    });
    let surface = 0;
    if (f.surface && f.surface.strength > 0) {
      const gain = this.image(f.surface.urls[0], redraw), offset = this.image(f.surface.urls[1], redraw);
      if (gain && offset) {
        this.bind(8, gain);
        this.bind(9, offset);
        surface = f.surface.strength;
      }
    }
    if (!surface) {
      this.bind(8, back);
      this.bind(9, back);
    }
    ['uBack', 'uWide', 'uMap0', 'uMap1', 'uMap2', 'uTab0', 'uTab1', 'uTab2', 'uGain', 'uOffset'].forEach((name, unit) => gl.uniform1i(at[name], unit));
    gl.uniform4fv(at.uTabInfo, maps.flatMap((m) => [m.tableX.length, m.bias, m.rimPx, 0]));
    gl.uniform3f(at.uK, f.channels[0].k, f.channels[1].k, f.channels[2].k);
    gl.uniform2f(at.uSize, f.w, f.h);
    gl.uniform4f(at.uMapRect, f.mapRect.x, f.mapRect.y, f.mapRect.w, f.mapRect.h);
    gl.uniform4f(at.uToUv, backToUv[0], backToUv[1], backToUv[2], backToUv[3]);
    gl.uniform2f(at.uGx, gx[0], gx[1]);
    gl.uniform2f(at.uGy, gy[0], gy[1]);
    gl.uniform1f(at.uPixel, 1 / scale);
    gl.uniform4f(at.uSrcBox, (sourceBox.x - glassBox.x) / sx, (sourceBox.y - glassBox.y) / sy, sourceBox.w / sx, sourceBox.h / sy);
    const m = f.matrix;
    // by columns; what the matrix has for alpha counts as an offset (the backdrop is opaque)
    gl.uniformMatrix3fv(at.uColour, false, [m[0], m[5], m[10], m[1], m[6], m[11], m[2], m[7], m[12]]);
    gl.uniform3f(at.uColourOffset, m[3] + m[4], m[8] + m[9], m[13] + m[14]);
    gl.uniform1f(at.uFill, wide ? f.fill!.alpha : 0);
    gl.uniform1f(at.uCap, f.cap ?? 0);
    gl.uniform1f(at.uOpacity, f.opacity);
    gl.uniform1f(at.uSurface, surface);
    gl.uniform1i(at.uFlip, 1);
    gl.uniform1i(at.uSmooth, f.smooth && f.sigma <= 0.01 ? 1 : 0);
    gl.uniform1i(at.uDarken, f.fill?.darken ? 1 : 0);
    gl.uniform1i(at.uFringe, f.channels.some((c) => c.map !== f.channels[0].map || c.k !== f.channels[0].k) ? 1 : 0);
    gl.uniform1i(at.uCover, f.cover ? 1 : 0);
    // its place from the canvas's top-left corner (the canvas's rows run up)
    this.run(null, x, this.canvas.height - y - ch, cw, ch);
  }
}

let shared: Renderer | null = null;
function renderer(): Renderer {
  return (shared ??= new Renderer());
}

// ---------------------------------------------------------------- when to draw

const glasses = new Set<GlGlass>();
let frame = 0, timer = 0, quiet = 0, listening = false;
// a script that moves something sets a style or a class, here or on anything around it
let mutations: MutationObserver | null = null;
// frames of nothing changing before the look every frame becomes one every REST ms
const QUIET = 30, REST = 1000;
const EVENTS = ['scroll', 'wheel', 'pointermove', 'pointerdown', 'pointerup', 'touchmove', 'keydown', 'transitionrun', 'animationstart', 'load', 'play', 'seeked'];

/** Draw every glass that has changed, or whose place or source has. True if any was drawn. */
function drawDue(): boolean {
  const jobs: Job[] = [];
  for (const g of glasses) {
    const job = g.prepare();
    if (job) jobs.push(job);
  }
  return jobs.length > 0 && renderer().flush(jobs);
}

/** Something may have moved: look every frame again. */
function wake() {
  quiet = 0;
  if (frame || !glasses.size) return;
  clearTimeout(timer);
  timer = 0;
  frame = requestAnimationFrame(tick);
}

function tick() {
  frame = 0;
  if (!glasses.size) return;
  const drew = !document.hidden && drawDue();
  quiet = drew ? 0 : quiet + 1;
  if (quiet < QUIET) frame = requestAnimationFrame(tick);
  else timer = window.setTimeout(() => {
    timer = 0;
    frame = requestAnimationFrame(tick);
  }, REST);
}

function listen(on: boolean) {
  if (on === listening) return;
  listening = on;
  for (const type of EVENTS) {
    if (on) document.addEventListener(type, wake, { capture: true, passive: true });
    else document.removeEventListener(type, wake, { capture: true });
  }
  if (on) {
    window.addEventListener('resize', wake);
    document.addEventListener('visibilitychange', wake);
    mutations = new MutationObserver(wake);
    mutations.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'src', 'hidden'] });
  } else {
    mutations?.disconnect();
    mutations = null;
    window.removeEventListener('resize', wake);
    document.removeEventListener('visibilitychange', wake);
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    frame = timer = 0;
  }
}

const boxOf = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/** Where a source's picture is in the viewport: its content box, and in it the picture as object-fit puts it. */
function pictureBox(el: BackdropSource, src: SourceEntry): Box {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
  // the borders and padding, scaled as the element is (its box may be transformed)
  const kx = el.offsetWidth ? r.width / el.offsetWidth : 1, ky = el.offsetHeight ? r.height / el.offsetHeight : 1;
  const px = (name: string) => parseFloat(cs.getPropertyValue(name)) || 0;
  const left = (px('border-left-width') + px('padding-left')) * kx, top = (px('border-top-width') + px('padding-top')) * ky;
  const right = (px('border-right-width') + px('padding-right')) * kx, bottom = (px('border-bottom-width') + px('padding-bottom')) * ky;
  const content = { x: r.left + left, y: r.top + top, w: Math.max(r.width - left - right, 0), h: Math.max(r.height - top - bottom, 0) };
  return fitRect(content, src.w * kx, src.h * ky, cs.objectFit, cs.objectPosition);
}

/** One glass's canvas, and what it last drew. */
export class GlGlass {
  private host: GlHost;
  private source: BackdropSource;
  readonly canvas: HTMLCanvasElement;
  // made with the first frame, in the colour space the glass is drawn in
  private ctx: CanvasRenderingContext2D | null = null;
  private dirty = true;
  private key = '';
  private shown = false;

  constructor(host: GlHost, source: BackdropSource) {
    this.host = host;
    this.source = source;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.dataset.lgLayer = 'backdrop';
    this.canvas.style.cssText = 'position:absolute;z-index:-2;pointer-events:none;margin:0;padding:0;border:0;border-radius:inherit;display:block;';
    glasses.add(this);
    listen(true);
    wake();
  }

  setSource(source: BackdropSource) {
    if (source === this.source) return;
    this.source = source;
    this.invalidate();
  }

  /** What the glass looks like changed: draw it again on the next frame. */
  invalidate() {
    this.dirty = true;
    wake();
  }

  /** What to draw, if the glass, the source or either's place changed since it was last drawn; null if nothing did. */
  prepare(): Job | null {
    const f = this.host.frame();
    const r = renderer();
    const src = f ? r.source(this.source) : null;
    if (src?.failed) {
      this.host.failed();
      return null;
    }
    if (!f || !src || !f.w || !f.h) {
      if (this.shown) {
        this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.shown = false;
        this.key = '';
      }
      return null;
    }
    const el = this.host.el, glassBox = boxOf(el.getBoundingClientRect());
    // off screen: nothing to draw until it's back
    if (glassBox.x > innerWidth || glassBox.y > innerHeight || glassBox.x + glassBox.w < 0 || glassBox.y + glassBox.h < 0 || !glassBox.w || !glassBox.h) return null;
    const sourceBox = pictureBox(this.source, src);
    if (!sourceBox.w || !sourceBox.h) return null;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    const key = [glassBox.x - sourceBox.x, glassBox.y - sourceBox.y, glassBox.w, glassBox.h, sourceBox.w, sourceBox.h, f.w, f.h, dpr].map((v) => Math.round(v * 64)).join() + `|${src.version}`;
    if (!this.dirty && key === this.key) return null;
    // the canvas over the element's border box (it's placed in its padding box)
    const cs = getComputedStyle(el), style = this.canvas.style;
    const set = (k: 'left' | 'top' | 'width' | 'height', v: string) => {
      if (style[k] !== v) style[k] = v;
    };
    set('left', `${-(parseFloat(cs.borderLeftWidth) || 0)}px`);
    set('top', `${-(parseFloat(cs.borderTopWidth) || 0)}px`);
    set('width', `${f.w}px`);
    set('height', `${f.h}px`);
    const cw = Math.max(1, Math.round(f.w * dpr)), ch = Math.max(1, Math.round(f.h * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.ctx ??= this.canvas.getContext('2d', f.wideGamut && r.canWide ? { colorSpace: 'display-p3' } : undefined)!;
    return {
      f, src, glassBox, sourceBox, cw, ch, out: this.ctx,
      redraw: () => this.invalidate(),
      done: () => {
        this.dirty = false;
        this.key = key;
        this.shown = true;
      },
    };
  }

  destroy() {
    glasses.delete(this);
    this.canvas.remove();
    if (!glasses.size) listen(false);
  }
}

/** Draw every glass that's due now (a test waits on this instead of a frame). */
export function flushGl() {
  drawDue();
}
