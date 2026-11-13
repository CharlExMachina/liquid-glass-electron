// The cases of test:web: a glass over a photo, drawn by the shader (the page's backdropSource) and compared with
// what Chromium's compositor draws for the same options. `photo`: one of the runner's 640 × 400 backdrops, or with
// `fit`, a photo of demo/assets as it is, fitted by CSS. `box`: the glass, x y w h. `crop`: only the photo's top rows,
// this many px, the page's own background below. `late`, `retry`, `replace`: what happens to the source after glass()
// (the page does it with the shader only; the compositor's glass is drawn over the picture as it ends up).
// The glass's light, shadow and outline are off in every case: they're a border-image and box-shadows in both, drawn
// over the bending, and the page can read the bending back only without them.
export const LIGHT_OFF = { edgeHighlight: 0, fresnel: 0, specular: 0, shadowOpacity: 0, outline: 0, outlineTop: 0 };

export const CASES = [
  { name: 'defaults', photo: 'coast', box: [140, 90, 360, 200], options: { cornerRadius: 40 } },
  { name: 'capsule', photo: 'ponds', box: [170, 150, 300, 80], options: { shape: 'capsule' } },
  { name: 'circle', photo: 'coast', box: [250, 130, 140, 140], options: { shape: 'circle' } },
  { name: 'nofringe', photo: 'coast', box: [140, 90, 360, 200], options: { cornerRadius: 24, chromAberration: 0, zRadius: 24 } },
  { name: 'unsmoothed', photo: 'ponds', box: [140, 90, 360, 200], options: { cornerRadius: 24, chromAberration: 0, smooth: false } },
  { name: 'strongfringe', photo: 'ponds', box: [170, 110, 300, 180], options: { cornerRadius: 60, chromAberration: 0.4 } },
  { name: 'dome', photo: 'ponds', box: [220, 100, 200, 200], options: { shape: 'circle', bevelMode: 1, refraction: 1.4 } },
  { name: 'applelens', photo: 'coast', box: [250, 158, 113, 83], options: { cornerRadius: 41.5, bevelMode: 2, zRadius: 24, refraction: 1.15, chromAberration: 0 } },
  { name: 'switchlens', photo: 'coast', box: [280, 180, 58, 38], options: { shape: 'capsule', bevelMode: 3, chromAberration: 0 } },
  { name: 'frost', photo: 'alps', box: [140, 90, 360, 200], options: { cornerRadius: 32, blurAmount: 0.4 } },
  { name: 'regular', photo: 'alps', box: [120, 80, 400, 240], options: { variant: 'regular', cornerRadius: 32 } },
  { name: 'clear', photo: 'coast', box: [120, 80, 400, 240], options: { variant: 'clear', cornerRadius: 32 } },
  { name: 'regulardark', photo: 'coast', box: [120, 80, 400, 240], options: { variant: 'regular', cornerRadius: 32 }, dark: true },
  { name: 'smallregular', photo: 'ponds', box: [270, 178, 100, 44], options: { variant: 'regular', shape: 'capsule' } },
  { name: 'colour', photo: 'ponds', box: [140, 90, 360, 200], options: { cornerRadius: 40, saturation: 0.4, tintStrength: 0.6, tint: 'rgb(255 180 120)', brightness: 0.1 } },
  { name: 'opacity', photo: 'coast', box: [140, 90, 360, 200], options: { cornerRadius: 40, opacity: 0.5 } },
  { name: 'strength', photo: 'coast', box: [140, 90, 360, 200], options: { cornerRadius: 40, strength: 0.45, blurAmount: 0.3 } },
  { name: 'squircle', photo: 'ponds', box: [200, 80, 240, 240], options: { shape: 'squircle', cornerRadius: 70 } },
  { name: 'path', photo: 'coast', box: [200, 80, 240, 240], options: { shape: 'path', path: 'M50 4 61 36 96 36 68 57 79 91 50 70 21 91 32 57 4 36 39 36Z', pathBox: '0 0 100 100' } },
  { name: 'surface', photo: 'alps', box: [220, 120, 200, 160], options: { cornerRadius: 30, chromAberration: 0 }, surface: true },
  { name: 'fitted', photo: 'coast', fit: 'cover', box: [140, 90, 360, 200], options: { cornerRadius: 40 } },
  { name: 'contained', photo: 'ponds', fit: 'contain', box: [200, 110, 240, 180], options: { cornerRadius: 40, chromAberration: 0 } },
  // The glass across the picture's edge: the picture bent as far as there is any, and past it nothing drawn (the
  // compositor bends the page there; the shader has no page, so what it draws is compared, and how much it leaves
  // clear: `clear`, the share of the glass, from and to). Under what's clear, the plain look (`under`).
  { name: 'edge', photo: 'ponds', crop: 250, box: [140, 150, 360, 200], options: { cornerRadius: 40 }, clear: [0.38, 0.58], under: true },
  { name: 'edgefrost', photo: 'alps', crop: 250, box: [140, 150, 360, 200], options: { variant: 'regular', cornerRadius: 32 }, clear: [0.38, 0.75], under: true },
  // a source that isn't in the document when glass() runs; one that can't be read, then one that can; and one replaced
  // by another element of the same name
  { name: 'late', photo: 'coast', late: true, box: [140, 90, 360, 200], options: { cornerRadius: 40 } },
  { name: 'retry', photo: 'ponds', retry: true, box: [140, 90, 360, 200], options: { cornerRadius: 40 } },
  { name: 'replaced', photo: 'alps', replace: 'coast', box: [140, 90, 360, 200], options: { cornerRadius: 40 } },
  // where the shader can't be used, the glass is the plain blur: no source named, and a picture the page may not read
  // (another origin's, served without CORS headers)
  { name: 'nosource', photo: 'coast', box: [140, 90, 360, 200], options: { cornerRadius: 40 }, source: null, expect: 'blur' },
  { name: 'foreign', photo: 'coast', foreign: true, box: [140, 90, 360, 200], options: { cornerRadius: 40 }, expect: 'blur' },
  // glass wholly past its picture: the same plain blur, under a canvas with nothing on it
  { name: 'beyond', photo: 'coast', crop: 120, box: [140, 190, 360, 160], options: { variant: 'regular', cornerRadius: 32 }, expect: 'under' },
];
