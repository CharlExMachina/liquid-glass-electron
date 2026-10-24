# Apple's Liquid Glass, and what this library offers for each part

Apple's API is the reference for the knobs: SwiftUI's `glassEffect`, UIKit's `UIGlassEffect` and AppKit's
`NSGlassEffectView` (iOS, iPadOS and macOS 26). Below is each part of it, what this library does for it, and what it
can't do in a browser engine. Sources are Apple's documentation and the WWDC25 sessions "Meet Liquid Glass" (219),
"Get to know the new design system" (356) and "Build a UIKit app with the new design" (284).

## The glass

| Apple | Here | Notes |
|---|---|---|
| `.glassEffect(_ glass: Glass = .regular, in: some Shape)` | `glass(el, options)`, or `data-glass` with `autoGlass()` | The glass covers the element's border box, as Apple's covers the view's bounds with its padding. |
| `Glass.regular` | `variant: 'regular'` | Frosted (`blurAmount` 0.5), more saturated, a faint fill that follows light and dark. Legible over anything. |
| `Glass.clear` | `variant: 'clear'`, or no variant | liquidglass's defaults: sharp bending, no frost. Apple says clear glass wants a dimming layer under it and bold content on it; so does this. |
| `Glass.identity` | `variant: 'identity'` | No glass at all, the layout unchanged: for switching it off conditionally. |
| `.tint(_ color:)` | `fill: '<css colour>'` (laid over the glass), or `tint` + `tintStrength` (the backdrop multiplied toward the colour, as liquidglass's tint) | Apple maps its tint to the brightness of what's behind; here the fill is a plain colour with alpha. |
| `.interactive()` | `interactive: true` | A press scales the glass up (1.04, with a spring), bends it more, and lights it where it's pressed; hover lights it a little. Apple's shimmer isn't reproduced. |
| Glass that appears only during an interaction (a slider's knob turning to glass while held, a toggle's knob swelling into a lens) | `strength` | 0..1, cheap to change every frame, followed through CSS transitions of `--glass-strength`; at 0 there's no filter. The gallery's "iOS controls" builds iOS 26's controls this way |
| Glass stretching as it's dragged | `elasticity` (floating glass) | Stretches along the way it moves, by how fast, keeping its volume, and springs back |
| Glass adapting light/dark to what's behind it | not done | A page can't read the pixels behind an element, so the glass can't switch on its own. Set `data-glass-theme` or `setEnvironment({ dark })`. |
| Larger glass looking thicker | partly | `zRadius` (the bevel's depth) is per element; nothing scales it with size automatically. |

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
