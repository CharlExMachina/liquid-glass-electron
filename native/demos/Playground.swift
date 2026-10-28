// demo/demos/playground.js in SwiftUI: glass to drag over a backdrop, and every knob Apple's glass has: the variant,
// .interactive(), .tint(_:), and the shape (any Shape, as the Electron page takes any SVG path). The Electron page's
// other knobs (refraction, frost, light, shadow, ...) are this library's; macOS's glass has none of them.
import AVFoundation
import SwiftUI

enum Backdrop: String, CaseIterable, Identifiable {
  case photo, ponds, video, text
  var id: String { rawValue }
}

enum ShapeChoice: String, CaseIterable, Identifiable {
  case rect, capsule, circle, squircle, star, heart, blob
  var id: String { rawValue }
}

enum VariantChoice: String, CaseIterable, Identifiable {
  case regular, clear, identity
  var id: String { rawValue }
}

// the Electron page's shapes given as paths, in a 100 × 100 box stretched over the element
private let PATHS: [ShapeChoice: String] = [
  .star: "M50 2 L62 36 L98 37 L69 59 L80 95 L50 74 L20 95 L31 59 L2 37 L38 36 Z",
  .heart: "M50 90 C20 70 4 52 6 32 C8 14 30 6 50 26 C70 6 92 14 94 32 C96 52 80 70 50 90 Z",
  .blob: "M50 6 C78 2 98 22 94 48 C91 74 74 97 46 94 C20 91 2 72 6 46 C9 22 26 9 50 6 Z",
]

/// An SVG path in a 100 × 100 box, stretched over the frame.
struct StretchedPath: Shape {
  let d: String
  func path(in rect: CGRect) -> Path {
    SVGShape.parse(d).applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 100, y: rect.height / 100))
  }
}

/// The playground's settings
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
  /// the glass's top left in the stage (.pg-glass: left 120, top 150)
  @Published var position = CGPoint(x: 120, y: 150)
  var dragStart: CGPoint?
}

struct PlaygroundDemo: View {
  @StateObject private var s = Settings()
  @StateObject private var clip = Clip()

  var body: some View {
    HStack(spacing: 0) {
      stage
      panel
        .frame(width: 330)
        .background(Color.page)
        .overlay(alignment: .leading) { Rectangle().fill(Color.grey(0.2)).frame(width: 1) }
    }
    .area()
  }

  private var current: Glass {
    var g: Glass = s.variant == .clear ? .clear : s.variant == .identity ? .identity : .regular
    if s.tinted { g = g.tint(s.tint) }
    if s.interactive { g = g.interactive() }
    return g
  }

  /// .pg-stage: the backdrop, and the glass to drag
  private var stage: some View {
    ZStack(alignment: .topLeading) {
      backdrop
      Text("Drag me")
        .font(.system(size: 18, weight: .bold))
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.4), radius: 1.5, y: 1)
        .frame(width: s.width, height: s.height)
        .contentShape(Rectangle())
        .modifier(GlassIn(glass: current, shape: s.shape, radius: s.radius))
        .offset(x: s.position.x, y: s.position.y)
        .gesture(DragGesture()
          .onChanged { v in
            let start = s.dragStart ?? s.position
            s.dragStart = start
            s.position = CGPoint(x: start.x + v.translation.width, y: start.y + v.translation.height)
          }
          .onEnded { _ in s.dragStart = nil })
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .clipped()
  }

  @ViewBuilder private var backdrop: some View {
    switch s.backdrop {
    case .photo: Photo("coast")
    case .ponds: Photo("ponds")
    case .video:
      if clip.player != nil { ClipView(player: clip.player) } else { Color.black }
    case .text:
      // .pg-text: 34 px bold on a gradient
      LinearGradient(colors: [Color(hex: 0x1d2b64), Color(hex: 0xf8cdda)], startPoint: .topLeading, endPoint: .bottomTrailing)
        .overlay(alignment: .topLeading) {
          VStack(alignment: .leading, spacing: 18) {
            ForEach(["Liquid glass bends whatever is behind it.", "Text, photos, video, canvas: the live page.", "Drag the glass over this and watch the letters bend at the rim."], id: \.self) {
              Text($0).font(.system(size: 34, weight: .bold)).lineHeight(34, 1.25).foregroundStyle(.white)
            }
          }
          .padding(30)
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
    case .star, .heart, .blob: shape = "StretchedPath(d: \"…\")"
    }
    return "content\n  .frame(width: \(Int(s.width)), height: \(Int(s.height)))\n  .glassEffect(\(g), in: \(shape))"
  }

  private var panel: some View {
    Form {
      Section {
        Picker("backdrop", selection: $s.backdrop) { ForEach(Backdrop.allCases) { Text($0.rawValue).tag($0) } }
      }
      Section("Apple") {
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
      Section {
        Text("The Electron playground’s other knobs (refraction, frost, light, shadow, press) are this library’s own: macOS’s glass has only the variant, .interactive(), .tint(_:) and the shape.")
          .font(.system(size: 12)).foregroundStyle(Color.muted)
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

/// Apple's glass in the playground's shape
struct GlassIn: ViewModifier {
  let glass: Glass, shape: ShapeChoice, radius: Double
  func body(content: Content) -> some View {
    switch shape {
    case .capsule: content.glassEffect(glass, in: .capsule)
    case .circle: content.glassEffect(glass, in: .circle)
    case .squircle: content.glassEffect(glass, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
    case .rect: content.glassEffect(glass, in: RoundedRectangle(cornerRadius: radius, style: .circular))
    case .star, .heart, .blob: content.glassEffect(glass, in: StretchedPath(d: PATHS[shape]!))
    }
  }
}
