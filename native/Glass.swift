// The native reference: Apple's own Liquid Glass (SwiftUI's glassEffect), for comparing this library's glass with
// the real thing on a Mac. Two modes:
//
//   playground                the gallery's playground in SwiftUI: a backdrop, glass to drag, and Apple's knobs
//   playground --scenes       a scene renderer for tests: reads scenes as JSON lines on stdin, draws each in a
//                             borderless window and answers `READY <name> <window id>` once it's drawn, for
//                             `screencapture -l` to capture (test/native/run.mjs drives it)
//
// Built by scripts/native.mjs with the command line tools' swiftc (no Xcode project). macOS 26 or later.
import AppKit
import SwiftUI

// ---------------------------------------------------------------- scenes (the same JSON the Electron side reads)

struct GlassSpec: Decodable, Identifiable {
  var id: Int { index ?? 0 }
  var index: Int?
  var x: Double, y: Double, w: Double, h: Double
  /// rect (circular corners of `radius`), squircle (continuous corners of `radius`), capsule, circle
  var shape: String?
  var radius: Double?
  /// regular, clear, identity
  var variant: String?
  /// a tint, as #rrggbb or #rrggbbaa
  var tint: String?
  var interactive: Bool?
  /// swiftui (glassEffect, the default), appkit (NSGlassEffectView) or button (a Button in .buttonStyle(.glass))
  var kind: String?
}

struct SceneSpec: Decodable {
  var name: String
  var width: Double, height: Double
  /// a PNG at the window's size in device pixels, drawn 1:1
  var backdrop: String
  var appearance: String?
  var glass: [GlassSpec]
  /// put the glass in one GlassEffectContainer of this spacing
  var container: Double?
}

func color(hex: String) -> Color {
  var s = hex.trimmingCharacters(in: .whitespaces)
  if s.hasPrefix("#") { s.removeFirst() }
  var v: UInt64 = 0
  Scanner(string: s).scanHexInt64(&v)
  let a = s.count == 8 ? Double(v & 0xff) / 255 : 1
  let rgb = s.count == 8 ? v >> 8 : v
  return Color(.sRGB, red: Double((rgb >> 16) & 0xff) / 255, green: Double((rgb >> 8) & 0xff) / 255, blue: Double(rgb & 0xff) / 255, opacity: a)
}

func makeGlass(variant: String?, tint: String?, interactive: Bool) -> Glass {
  var g: Glass = variant == "clear" ? .clear : variant == "identity" ? .identity : .regular
  if let t = tint, !t.isEmpty { g = g.tint(color(hex: t)) }
  if interactive { g = g.interactive() }
  return g
}

extension View {
  /// Apple's glass in one of the shapes the tests use.
  @ViewBuilder func glass(_ g: Glass, shape: String?, radius: Double) -> some View {
    switch shape {
    case "capsule": glassEffect(g, in: Capsule())
    case "circle": glassEffect(g, in: Circle())
    case "squircle": glassEffect(g, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    default: glassEffect(g, in: RoundedRectangle(cornerRadius: radius, style: .circular))
    }
  }
}

/// AppKit's glass, NSGlassEffectView, for checking that it's the same as SwiftUI's
struct AppKitGlass: NSViewRepresentable {
  let spec: GlassSpec
  func makeNSView(context: Context) -> NSGlassEffectView {
    let v = NSGlassEffectView()
    v.style = spec.variant == "clear" ? .clear : .regular
    v.cornerRadius = spec.shape == "capsule" || spec.shape == "circle" ? min(spec.w, spec.h) / 2 : spec.radius ?? 0
    if let t = spec.tint, !t.isEmpty { v.tintColor = NSColor(color(hex: t)) }
    return v
  }
  func updateNSView(_ v: NSGlassEffectView, context: Context) {}
}

struct GlassItem: View {
  let spec: GlassSpec
  var body: some View {
    switch spec.kind {
    case "appkit":
      AppKitGlass(spec: spec).frame(width: spec.w, height: spec.h).position(x: spec.x + spec.w / 2, y: spec.y + spec.h / 2)
    case "button":
      Button(action: {}) { Color.clear.frame(width: spec.w, height: spec.h) }
        .buttonStyle(.glass)
        .position(x: spec.x + spec.w / 2, y: spec.y + spec.h / 2)
    default:
      swiftUI
    }
  }
  private var swiftUI: some View {
    Color.clear
      .frame(width: spec.w, height: spec.h)
      .glass(makeGlass(variant: spec.variant, tint: spec.tint, interactive: spec.interactive ?? false), shape: spec.shape, radius: spec.radius ?? 0)
      .position(x: spec.x + spec.w / 2, y: spec.y + spec.h / 2)
  }
}

struct SceneView: View {
  let scene: SceneSpec
  let backdrop: NSImage
  var body: some View {
    ZStack(alignment: .topLeading) {
      Image(nsImage: backdrop).resizable().interpolation(.none).frame(width: scene.width, height: scene.height)
      if let spacing = scene.container {
        GlassEffectContainer(spacing: spacing) { items }
      } else {
        items
      }
    }
    .frame(width: scene.width, height: scene.height)
    .ignoresSafeArea()
  }
  private var items: some View {
    ZStack(alignment: .topLeading) {
      ForEach(Array(scene.glass.enumerated()), id: \.offset) { _, g in GlassItem(spec: g) }
    }
    .frame(width: scene.width, height: scene.height, alignment: .topLeading)
  }
}

/// A borderless window that can be key: glass in an inactive window can be drawn differently
final class KeyWindow: NSWindow {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
}

final class SceneRunner: NSObject {
  /// make the window key and the app active (--activate), as an app in use is
  var activate = false
  var window: NSWindow?
  let origin: NSPoint

  init(origin: NSPoint) { self.origin = origin }

  func show(_ scene: SceneSpec) {
    guard let image = NSImage(contentsOfFile: scene.backdrop) else {
      print("ERROR \(scene.name) no backdrop \(scene.backdrop)")
      fflush(stdout)
      return
    }
    // drawn 1:1: the image is in device pixels, the window in points
    let scale = window?.backingScaleFactor ?? NSScreen.main?.backingScaleFactor ?? 2
    image.size = NSSize(width: Double(image.representations.first?.pixelsWide ?? 0) / scale, height: Double(image.representations.first?.pixelsHigh ?? 0) / scale)
    // origin is the top left, as Electron places windows; AppKit's y goes up from the bottom of the main screen
    let screenH = NSScreen.screens.first?.frame.height ?? 1000
    let rect = NSRect(x: origin.x, y: screenH - origin.y - scene.height, width: scene.width, height: scene.height)
    if window == nil || window!.frame.size != rect.size {
      window?.orderOut(nil)
      let w = KeyWindow(contentRect: rect, styleMask: [.borderless], backing: .buffered, defer: false)
      w.isReleasedWhenClosed = false
      w.hasShadow = false
      w.backgroundColor = .black
      window = w
    }
    let win = window!
    win.appearance = NSAppearance(named: scene.appearance == "dark" ? .darkAqua : .aqua)
    win.contentView = NSHostingView(rootView: SceneView(scene: scene, backdrop: image))
    win.setFrame(rect, display: true)
    if activate {
      NSApp.activate()
      win.makeKeyAndOrderFront(nil)
    } else {
      win.orderFrontRegardless()
    }
    // glass settles over a few frames
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
      print("READY \(scene.name) \(win.windowNumber)")
      fflush(stdout)
    }
  }

  func listen() {
    DispatchQueue.global().async {
      while let line = readLine() {
        if line == "quit" { break }
        guard let data = line.data(using: .utf8) else { continue }
        do {
          let scene = try JSONDecoder().decode(SceneSpec.self, from: data)
          DispatchQueue.main.async { self.show(scene) }
        } catch {
          print("ERROR bad scene \(error)")
          fflush(stdout)
        }
      }
      DispatchQueue.main.async { NSApp.terminate(nil) }
    }
  }
}

// ---------------------------------------------------------------- the playground

enum Backdrop: String, CaseIterable, Identifiable {
  case photo, ponds, alps, night, text, stripes
  var id: String { rawValue }
}

enum ShapeChoice: String, CaseIterable, Identifiable {
  case rect, squircle, capsule, circle
  var id: String { rawValue }
}

enum VariantChoice: String, CaseIterable, Identifiable {
  case regular, clear, identity
  var id: String { rawValue }
}

/// The playground's settings (an ObservableObject: SwiftUI's @State is a macro, and the command line tools ship no
/// macro plugins)
final class Settings: ObservableObject {
  @Published var backdrop = Backdrop.photo
  @Published var variant = VariantChoice.regular
  @Published var shape = ShapeChoice.rect
  @Published var radius = 40.0
  @Published var width = 340.0
  @Published var height = 200.0
  @Published var tinted = false
  @Published var tint = Color(.sRGB, red: 0, green: 0.48, blue: 1, opacity: 0.5)
  @Published var interactive = false
  @Published var position = CGPoint(x: 290, y: 250)
  @Published var dragStart: CGPoint?
  @Published var dark = false
}

struct PlaygroundView: View {
  let assets: URL
  @ObservedObject var s: Settings

  var body: some View {
    HStack(spacing: 0) {
      stage
      Divider()
      panel.frame(width: 330)
    }
    .preferredColorScheme(s.dark ? .dark : .light)
  }

  private var current: Glass {
    var g: Glass = s.variant == .clear ? .clear : s.variant == .identity ? .identity : .regular
    if s.tinted { g = g.tint(s.tint) }
    if s.interactive { g = g.interactive() }
    return g
  }

  private var stage: some View {
    GeometryReader { geo in
      ZStack {
        backdropView.frame(width: geo.size.width, height: geo.size.height).clipped()
        Text("Drag me")
          .font(.system(size: 18, weight: .bold))
          .foregroundStyle(.white)
          .shadow(color: .black.opacity(0.4), radius: 1.5, y: 1)
          .frame(width: s.width, height: s.height)
          .glass(current, shape: s.shape.rawValue, radius: s.radius)
          .position(s.position)
          .gesture(DragGesture()
            .onChanged { v in
              let start = s.dragStart ?? s.position
              s.dragStart = start
              s.position = CGPoint(x: start.x + v.translation.width, y: start.y + v.translation.height)
            }
            .onEnded { _ in s.dragStart = nil })
      }
    }
  }

  @ViewBuilder private var backdropView: some View {
    switch s.backdrop {
    case .text:
      LinearGradient(colors: [Color(red: 0.11, green: 0.17, blue: 0.39), Color(red: 0.97, green: 0.8, blue: 0.85)], startPoint: .topLeading, endPoint: .bottomTrailing)
        .overlay(alignment: .topLeading) {
          VStack(alignment: .leading, spacing: 18) {
            ForEach(["Liquid glass bends whatever is behind it.", "Text, photos, video, canvas: the live page.", "Drag the glass over this and watch the letters bend at the rim."], id: \.self) {
              Text($0).font(.system(size: 34, weight: .bold)).foregroundStyle(.white)
            }
          }.padding(30)
        }
    case .stripes:
      Canvas { ctx, size in
        ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white))
        for x in stride(from: 0.0, to: size.width, by: 20) { ctx.fill(Path(CGRect(x: x, y: 0, width: 10, height: size.height)), with: .color(Color(white: 0.07))) }
      }
    default:
      if let image = NSImage(contentsOf: assets.appendingPathComponent("\(s.backdrop == .photo ? "coast" : s.backdrop.rawValue).jpg")) {
        Image(nsImage: image).resizable().aspectRatio(contentMode: .fill)
      } else {
        Color.gray
      }
    }
  }

  private var code: String {
    var g = ".\(s.variant.rawValue)"
    if s.tinted { g += ".tint(...)" }
    if s.interactive { g += ".interactive()" }
    let shape: String
    switch s.shape {
    case .rect: shape = ".rect(cornerRadius: \(Int(s.radius)))"
    case .squircle: shape = "RoundedRectangle(cornerRadius: \(Int(s.radius)), style: .continuous)"
    case .capsule: shape = ".capsule"
    case .circle: shape = ".circle"
    }
    return "content\n  .frame(width: \(Int(s.width)), height: \(Int(s.height)))\n  .glassEffect(\(g), in: \(shape))"
  }

  private var panel: some View {
    Form {
      Section("Backdrop") {
        Picker("backdrop", selection: $s.backdrop) { ForEach(Backdrop.allCases) { Text($0.rawValue).tag($0) } }
        Toggle("dark", isOn: $s.dark)
      }
      Section("Glass") {
        Picker("variant", selection: $s.variant) { ForEach(VariantChoice.allCases) { Text($0.rawValue).tag($0) } }
        Toggle("interactive", isOn: $s.interactive)
        Toggle("tint", isOn: $s.tinted)
        if s.tinted { ColorPicker("tint colour", selection: $s.tint, supportsOpacity: true) }
      }
      Section("Shape") {
        Picker("shape", selection: $s.shape) { ForEach(ShapeChoice.allCases) { Text($0.rawValue).tag($0) } }
        if s.shape == .rect || s.shape == .squircle { slider("cornerRadius", $s.radius, 0...120) }
        slider("width", $s.width, 40...600)
        slider("height", $s.height, 30...400)
      }
      Section("SwiftUI") {
        Text(code).font(.system(size: 12, design: .monospaced)).textSelection(.enabled)
      }
    }
    .formStyle(.grouped)
  }

  private func slider(_ label: String, _ value: Binding<Double>, _ range: ClosedRange<Double>) -> some View {
    HStack {
      Text(label).frame(width: 96, alignment: .leading)
      Slider(value: value, in: range, step: 1)
      Text("\(Int(value.wrappedValue))").monospacedDigit().frame(width: 36, alignment: .trailing)
    }
  }
}

// ---------------------------------------------------------------- the app

final class AppDelegate: NSObject, NSApplicationDelegate {
  var runner: SceneRunner?
  var window: NSWindow?

  func applicationDidFinishLaunching(_ notification: Notification) {
    let args = CommandLine.arguments
    if args.contains("--scenes") {
      let at = args.first { $0.hasPrefix("--at=") }?.dropFirst(5).split(separator: ",").compactMap { Double($0) } ?? [80, 80]
      runner = SceneRunner(origin: NSPoint(x: at[0], y: at.count > 1 ? at[1] : 80))
      runner!.activate = args.contains("--activate")
      runner!.listen()
      print("LISTENING")
      fflush(stdout)
      return
    }
    // the demo's photos, next to this file in the repo
    let assets = URL(fileURLWithPath: args.first { $0.hasPrefix("--assets=") }.map { String($0.dropFirst(9)) } ?? "demo/assets")
    let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180 - 224, height: 760), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
    w.title = "Playground · SwiftUI's Liquid Glass"
    w.contentView = NSHostingView(rootView: PlaygroundView(assets: assets, s: Settings()))
    w.center()
    // --inactive: shown without taking focus (for screenshots while the machine is in use)
    if args.contains("--inactive") {
      w.orderFrontRegardless()
    } else {
      w.makeKeyAndOrderFront(nil)
      NSApp.activate()
    }
    window = w
    if args.contains("--print-window") {
      print("WINDOW \(w.windowNumber)")
      fflush(stdout)
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { runner == nil }
}

let app = NSApplication.shared
let scenes = CommandLine.arguments.contains("--scenes")
app.setActivationPolicy(scenes ? .accessory : .regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
