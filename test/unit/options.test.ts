import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, fromCss, fromData, resolve, type Environment } from '../../src/options.ts';

const env: Environment = { dark: false, appearance: 'clear', reduceTransparency: false, increaseContrast: false, reduceMotion: false };
const css = (props: Record<string, string>) => ({ getPropertyValue: (n: string) => props[n] ?? '' }) as unknown as CSSStyleDeclaration;
const element = (attrs: Record<string, string>) => ({
  dataset: { glass: attrs['data-glass'] },
  getAttribute: (n: string) => attrs[n] ?? null,
}) as unknown as HTMLElement;

test('liquidglass\'s defaults', () => {
  const o = resolve([], env);
  assert.equal(o.refraction, 0.69);
  assert.equal(o.zRadius, 40);
  assert.equal(o.chromAberration, 0.05);
  assert.equal(o.edgeHighlight, 0.05);
  assert.equal(o.fresnel, 1);
  assert.equal(o.shadowOpacity, 0.3);
  assert.deepEqual(Object.keys(DEFAULTS).filter((k) => !(k in o)), []);
});

test('CSS custom properties, then data attributes, then options win', () => {
  const o = resolve([fromCss(css({ '--glass-refraction': '0.4', '--glass-z-radius': '20' })), fromData(element({ 'data-glass-z-radius': '30' })), { zRadius: 50 }], env);
  assert.equal(o.refraction, 0.4);
  assert.equal(o.zRadius, 50);
  const p = resolve([fromCss(css({ '--glass-z-radius': '20' })), fromData(element({ 'data-glass-z-radius': '30' }))], env);
  assert.equal(p.zRadius, 30);
});

test('Libre Hub\'s short names still work', () => {
  const o = resolve([fromCss(css({ '--glass-bevel': '24', '--glass-aberration': '0', '--glass-edge': '0.3', '--glass-dome': '1' }))], env);
  assert.equal(o.zRadius, 24);
  assert.equal(o.chromAberration, 0);
  assert.equal(o.edgeHighlight, 0.3);
  assert.equal(o.bevelMode, 1);
  assert.equal(resolve([fromCss(css({ '--glass-smooth': '0.6' }))], env).smooth, true);
  assert.equal(resolve([fromCss(css({ '--glass-smooth': '0' }))], env).smooth, false);
});

test('data-glass takes a variant or JSON; flags read as booleans', () => {
  assert.equal(resolve([fromData(element({ 'data-glass': 'regular' }))], env).variant, 'regular');
  assert.equal(resolve([fromData(element({ 'data-glass': '{"refraction": 1.2}' }))], env).refraction, 1.2);
  assert.equal(resolve([fromData(element({ 'data-glass-floating': '' }))], env).floating, true);
  assert.equal(resolve([fromData(element({ 'data-glass': 'identity' }))], env).refraction, 0);
});

test('button mode presses flat; interactive glass bulges', () => {
  assert.equal(resolve([{ button: true }], env).press, 'flatten');
  assert.equal(resolve([{ interactive: true }], env).press, 'bulge');
  assert.equal(resolve([{ interactive: true, press: 'none' }], env).press, 'none');
});

test('the system\'s settings: tinted, reduce transparency, increase contrast', () => {
  const tinted = resolve([], { ...env, appearance: 'tinted' });
  assert.ok(tinted.blurAmount >= 0.8 && tinted.fill?.startsWith('rgb('));
  const reduced = resolve([], { ...env, reduceTransparency: true, dark: true });
  assert.ok(reduced.blurAmount >= 2 && reduced.chromAberration === 0 && reduced.fill?.includes('0.9'));
  const contrast = resolve([], { ...env, increaseContrast: true });
  assert.ok(contrast.edgeHighlight >= 0.6 && contrast.chromAberration === 0);
  // opting out
  assert.equal(resolve([{ adaptive: false }], { ...env, reduceTransparency: true }).blurAmount, 0);
});

test('Apple\'s variants are macOS 27\'s glass: its lens, frost and colour, no fringe, light or shadow', () => {
  for (const v of ['regular', 'clear'] as const) {
    const o = resolve([{ variant: v }], env);
    assert.equal(o.bevelMode, 4);
    assert.equal(o.chromAberration, 0);
    assert.equal(o.fresnel + o.edgeHighlight + o.specular + o.shadowOpacity, 0);
    assert.ok(Array.isArray(o.colorMatrix) && o.colorMatrix.length === 12);
  }
  // clear glass is the more frosted
  assert.ok(resolve([{ variant: 'clear' }], env).blurAmount > resolve([{ variant: 'regular' }], env).blurAmount);
  // a colour matrix for light and dark, and for a wide-gamut display or an sRGB one
  const m = (e: Partial<Environment>) => resolve([{ variant: 'regular' }], { ...env, ...e }).colorMatrix;
  assert.notDeepEqual(m({}), m({ dark: true }));
  assert.notDeepEqual(m({}), m({ wideGamut: false }));
  // greys stay grey: each row's gains add up to the same
  for (const e of [{}, { dark: true }, { wideGamut: false }]) {
    const c = m(e) as number[], sums = [0, 1, 2].map((r) => c[r * 4] + c[r * 4 + 1] + c[r * 4 + 2]);
    assert.ok(Math.max(...sums) - Math.min(...sums) < 0.02, String(sums));
  }
  // the outline is darker in the dark; one of your own stays
  assert.ok(resolve([{ variant: 'regular' }], { ...env, dark: true }).outline > resolve([{ variant: 'regular' }], env).outline);
  assert.equal(resolve([{ variant: 'regular', outline: 0.1 }], { ...env, dark: true }).outline, 0.1);
  // a matrix of your own, as CSS gives it
  assert.deepEqual(resolve([fromCss(css({ '--glass-color-matrix': '1 0 0 0 0 1 0 0 0 0 1 0.1' }))], env).colorMatrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0.1]);
});
