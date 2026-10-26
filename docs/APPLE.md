# Apple's Liquid Glass, and what this library offers for each part

Apple's API is the reference for the knobs: SwiftUI's `glassEffect`, UIKit's `UIGlassEffect` and AppKit's
`NSGlassEffectView` (iOS, iPadOS and macOS 26). Below is each part of it, what this library does for it, and what it
can't do in a browser engine. Sources are Apple's documentation and the WWDC25 sessions "Meet Liquid Glass" (219),
"Get to know the new design system" (356) and "Build a UIKit app with the new design" (284).

## The glass

| Apple | Here | Notes |
|---|---|---|
| `.glassEffect(_ glass: Glass = .regular, in: some Shape)` | `glass(el, options)`, or `data-glass` with `autoGlass()` | The glass covers the element's border box, as Apple's covers the view's bounds with its padding. |
| `Glass.regular` | `variant: 'regular'` | macOS 27's regular glass, measured against SwiftUI's own (`pnpm test:native`): frost of σ ≈ 10 px on large glass and less on small, a lens along the rim that samples inward (`bevelMode: 4`), macOS's colour as a matrix for light and dark (lighter and more saturated in light, a cap on brightness in the dark), a thin dark outline, no fringe, no light, no shadow. |
| `Glass.clear` | `variant: 'clear'` | macOS 27's clear glass: twice the frost (σ ≈ 20 px on large glass, from 10 on small), the same lens a little deeper, less colour. On macOS clear glass is frosted too: what's behind shows through as light and colour, not detail. No variant at all is liquidglass's glass: sharp bending, no frost. |
| `Glass.identity` | `variant: 'identity'` | No glass at all, the layout unchanged: for switching it off conditionally. |
| `.tint(_ color:)` | `fill: '<css colour>'` (laid over the glass), or `tint` + `tintStrength` (the backdrop multiplied toward the colour, as liquidglass's tint) | Apple maps its tint to the brightness of what's behind; here the fill is a plain colour with alpha. |
| `.interactive()` | `interactive: true` | A press scales the glass up (1.04, with a spring), bends it more, and lights it where it's pressed; hover lights it a little. Apple's shimmer isn't reproduced. |
| Glass that appears only during an interaction (a slider's knob turning to glass while held, a toggle's knob swelling into a lens) | `strength` | 0..1, cheap to change every frame, followed through CSS transitions of `--glass-strength`; at 0 there's no filter. The gallery's "iOS controls" builds iOS 26's controls this way |
| Glass stretching as it's dragged | `elasticity` (floating glass) | Stretches along the way it moves, by how fast, keeping its volume, and springs back |
| Glass adapting light/dark to what's behind it | not done | A page can't read the pixels behind an element, so the glass can't switch on its own. Set `data-glass-theme` or `setEnvironment({ dark })`. |
| The lens of Apple's small controls (a slider's knob while held: the rim magnifies toward the middle, the middle is flat) | `bevelMode: 2` | Measured from an iPhone's slider: at `refraction` 1 the edge samples halfway to the middle, fading out `zRadius` px in as (1 − d/zRadius)². The thin dark line around the rim and the shading across the glass aren't part of the glass here; the iOS demo draws them in CSS. |
| A switch's knob while held: what's behind shrinks, the two halves part along the middle, and the rim folds back | `bevelMode: 3` | Measured from iOS 26's switch (an iPhone app on a Mac) held over lines of known places: outward along the edge's normal by a profile of the depth (5% of the half-side at the middle, 20% a sixth of the way in, −28% at the edge, as shares of half the shorter side), and along the long side a little more across the straight part. Matched to within 0.2 px. Its outline, shading, rim light and shadow aren't part of the glass; the iOS demo draws them as an image. |
| Larger glass looking thicker | yes, for the variants | macOS sizes its glass by the shorter side: the lens's amount (half of it, at most 60 px) and height (a quarter, at most 20), clear glass's frost (from 10 px below 48 px to 20 at 120 and up) and regular glass's (less below 160 px), and dark regular glass's cap on brightness. `bevelMode: 4` does the same, read from SwiftUI's glass layers (`glassBackground`'s inputs) and checked against what it draws. Otherwise `zRadius` is per element. |

## How macOS 27 draws it, and how this was measured

`native/Glass.swift` draws scenes with SwiftUI's `glassEffect` (and the same with AppKit's `NSGlassEffectView`, which
draws identical pixels), and `test/native/` draws them with this library; both windows are captured with
`screencapture`, at 2× in the display's colour space, where without glass they match to within a level. Measured that
way, with backdrops chosen to show one part at a time (flat colours and nine greys for the colour, an edge for the
frost, ramps for the lens to a pixel, photos to check it all), and with the filter's inputs read from the glass's
layers (a `CABackdropLayer` with a `glassBackground` filter):

- **Frost**: a Gaussian blur of the backdrop around the glass too, not only under it. `.clear` is the more frosted.
- **Lens**: every point samples inward along the edge's normal (around corners too, never sideways), by one profile for
  every size and shape, scaled by an amount and height that follow the shorter side (`inputInnerRefractionAmount`,
  `inputInnerRefractionHeight`). Over frost it reads as a brighter, smeared rim, not as visible bending.
- **Colour**: an affine colour matrix in the display's space (greys stay grey: `regular` light lifts black to 40% and
  takes white to 92.5%, more saturated; dark glass is darker, with its brightness capped by luma, more so the larger it
  is).
- **Regular glass's blur fill**: a second, wider blur (`inputBlurFillBlurRadius` 8) laid over the frost at 0.675, by
  lighten in the light and darken in the dark; here an `feBlend` of the same.
- **None** of colour fringing (`inputAberrationAmount` is unset), rim light, Fresnel or a drop shadow
  (`inputShadowOpacity` 0) on macOS 27; a one-device-pixel dark outline just outside the edge, darker where the edge
  faces sideways (here, box-shadows a device pixel each way). `.interactive()` glass at rest draws the same as plain
  glass.

What wasn't measured, and so is this library's guess rather than macOS's: macOS's Liquid Glass tint (System Settings ›
Appearance, `NSGlassTintAmount`; the references are at its Clear end, 0, and `appearance: 'tinted'` still adds this
library's own frost and fill), Increase Contrast and Reduce Transparency (system-wide settings; their adjustments are
this library's), `.tint(_:)` (here `fill`), glass in a `GlassEffectContainer`, and a pressed `.interactive()` glass.
The colour matrices for an sRGB display are fitted from the P3 captures converted to sRGB, not from an sRGB display.

## Shapes

| Apple | Here |
|---|---|
| `DefaultGlassEffectShape` (a capsule) | `shape: 'capsule'` (the default shape here is `rect` with the element's own `border-radius`, since that's what a web page already has) |
| `.circle` | `shape: 'circle'` |
| `.rect(cornerRadius:)`, `RoundedRectangle` | `cornerRadius: n`, or the element's CSS `border-radius` (per corner) |
| `ConcentricRectangle`, `.rect(corners: .concentric)`, `.containerConcentric` | `shape: 'concentric'`: each corner is the radius of the rounded box the element sits in, less how far in it sits, never below 4 px (Apple's `concentric(minimum:)`; the minimum isn't configurable yet) |
| Continuous corners (`RoundedRectangle(style: .continuous)`, the system's shapes) | `shape: 'squircle'`: superellipse corners whose curvature eases in from the straight edges |
| Any `Shape` | `shape: 'path'` with SVG path data (`path`, optionally in a `pathBox` viewBox): the glass bends along the path's own edge, and its light and shadow follow it |

## Containers, unions, morphing

| Apple | Here | Notes |
|---|---|---|
| `GlassEffectContainer(spacing:)` | `container(el, { spacing })` or `data-glass-container="16"` | The members (`data-glass` or `data-glass-member` inside) become one piece of glass, a smooth union of their shapes: where two come within `spacing` px, their edges flow together. One filter for all of them, which is also Apple's performance advice. It follows the members' CSS transitions and animations and redraws while they move. |
| `glassEffectUnion(id:namespace:)` | `union([a, b, c], options)` | The elements' parent becomes a container whose spacing reaches across the widest gap between them, so they're joined even at rest. |
| `glassEffectID(_:in:)` with `@Namespace` | `morph(from, to)` | The glass of one element flows into another: a spring moves one shape from the first's box and corners to the second's, and their contents cross-fade. SwiftUI matches IDs across a view-hierarchy change by itself; here you call `morph` when you swap the elements. |
| `glassEffectTransition(.matchedGeometry)` | `morph` | |
| `glassEffectTransition(.materialize)` | `materialize(el, 'in' \| 'out')` | Grows from 90% and fades in, or the reverse. |
| `glassEffectTransition(.identity)` | `materialize(el, dir, { transition: 'identity' })` | Shows or hides at once. |

## Buttons

| Apple | Here |
|---|---|
| `.buttonStyle(.glass)` | `glassButton(el, 'glass')`: a capsule of regular glass, interactive |
| `.buttonStyle(.glassProminent)` | `glassButton(el, 'prominent')`: the same, filled with the accent colour (`--glass-accent`, or `fill`) |
| `buttonBorderShape(_:)` | `shape` (and the element's `border-radius`) |
| `UIButton.Configuration.clearGlass()` / `.prominentClearGlass()` | `glassButton(el, 'glass', { variant: 'clear' })`, `glassButton(el, 'prominent', { variant: 'clear' })` |

## Scroll edges and background extension

| Apple | Here | Notes |
|---|---|---|
| `scrollEdgeEffectStyle(.soft, for:)` | `scrollEdge(scroller, { style: 'soft' })` | Content dissolves into a blur under the edge (a masked backdrop blur on a sticky strip). Over dark content it dims instead. |
| `scrollEdgeEffectStyle(.hard, for:)` | `scrollEdge(scroller, { style: 'hard' })` | A nearly opaque band with a dividing line. |
| `scrollEdgeEffectHidden` | the function `scrollEdge` returns takes it off | |
| `backgroundExtensionEffect()` | not done | Mirrored, blurred copies of a view under a sidebar. Possible with CSS (`-webkit-box-reflect` and a blur) but out of scope. |

## The system's settings

| Apple | Here | Notes |
|---|---|---|
| iOS/macOS 26.1: Liquid Glass Clear / Tinted (Settings › Display & Brightness, System Settings › Appearance) | `<html data-glass-appearance="tinted">` or `setEnvironment({ appearance: 'tinted' })` | Apple: "Tinted increases opacity and adds more contrast." Tinted glass here is frostier (`blurAmount` ≥ 0.8) with an opaque-ish fill for light or dark. There's no public API to read the OS setting, so an app offers its own (Libre Hub does). |
| Reduce Transparency | `prefers-reduced-transparency: reduce`, or `setEnvironment({ reduceTransparency: true })` | The glass becomes frosted and nearly opaque, without fringing or micro-noise. Chromium reports the media query where the OS has the setting (macOS, Windows); on Linux, pass it from the main process. |
| Increase Contrast | `prefers-contrast: more`, or `setEnvironment({ increaseContrast: true })` | A strong edge (`edgeHighlight` ≥ 0.6), a fill that separates the glass from what's behind, no fringing. |
| Reduce Motion | `prefers-reduced-motion: reduce`, or `setEnvironment({ reduceMotion: true })` | Presses, morphs and materializing happen at once, without springs. |
| Opting out (`UIDesignRequiresCompatibility`) | `adaptive: false` per element, or `variant: 'identity'` | |

In Electron, the main process knows the OS's settings better than the page does: `nativeTheme.shouldUseDarkColors`,
`nativeTheme.prefersReducedTransparency`, `nativeTheme.shouldUseHighContrastColors` (macOS, Windows) and
`systemPreferences.getAnimationSettings()`. Send them to the renderer and call `setEnvironment()`.

## Toolbars and tab bars

`ToolbarSpacer`, `sharedBackgroundVisibility`, `tabBarMinimizeBehavior` and `tabViewBottomAccessory` arrange system bars;
a web page arranges its own. The gallery shows the equivalents built from the pieces above: grouped toolbar items on
capsules of glass, a floating tab bar with a separate search button, and a bar that floats over scrolling content.

## Apple's design rules, which hold here too

- Glass is for the layer that floats over the content (navigation, controls), not for the content.
- Don't put glass on glass. In CSS it can't work anyway: glass inside glass only sees the glass's own painting, not
  what's behind it (the element with the backdrop filter is the inner one's backdrop root). Put controls on a glass bar
  as plain elements, or with `refraction: 0` (light and fill only).
- Use clear glass only over media, with bold content on it, or with a dimming layer.
