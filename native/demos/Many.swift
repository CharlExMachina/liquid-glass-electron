// demo/demos/many.js in SwiftUI: lots of glass at once, 24 glass tiles over a scrolling feed, each with a glassEffect
// of its own, or all of them in one GlassEffectContainer (Apple's way of drawing glass together; the Electron page's
// glassGroup()). The readout counts the window's backdrop layers (CABackdropLayer: what macOS's glass samples the
// window behind it with) under the tiles, as the Electron page counts the tiles' backdrop filters.
import AppKit
import Combine
import SwiftUI

private let TILES = [("home", "Home"), ("mail", "Mail"), ("message", "Messages"), ("photo", "Photos"), ("music", "Music"), ("map", "Maps"),
  ("camera", "Camera"), ("gear", "Settings"), ("bell", "Alerts"), ("search", "Search"), ("folder", "Files"), ("star", "Starred"),
  ("heart", "Health"), ("sun", "Weather"), ("play", "Videos"), ("volume", "Sound"), ("edit", "Notes"), ("pen", "Sign"),
  ("share", "Share"), ("trash", "Trash"), ("check", "Tasks"), ("plus", "New"), ("back", "Back"), ("forward", "Forward")]

/// How many backdrop layers a window's views have inside `rect` (window coordinates, from the top left): the glass
/// drawn there.
@MainActor func backdropLayers(_ window: NSWindow?, in rect: CGRect) -> Int {
  guard let view = window?.contentView, let root = view.layer else { return 0 }
  func count(_ layer: CALayer) -> Int {
    var n = 0
    if String(describing: type(of: layer)).contains("Backdrop") {
      var r = layer.convert(layer.bounds, to: root)
      if !view.isFlipped && !root.isGeometryFlipped { r.origin.y = root.bounds.height - r.maxY }
      if rect.contains(CGPoint(x: r.midX, y: r.midY)) { n += 1 }
    }
    return n + (layer.sublayers ?? []).reduce(0) { $0 + count($1) }
  }
  return count(root)
}

final class ManyModel: ObservableObject {
  @Published var container = true
  @Published var layers = 0
  var grid = CGRect.zero
}

struct ManyDemo: View {
  @EnvironmentObject private var gallery: Gallery
  @StateObject private var m = ManyModel()
  private let tick = Timer.publish(every: 0.15, on: .main, in: .common).autoconnect()

  var body: some View {
    ZStack {
      Feed { EmptyView() }
      // the tiles sit over the feed (Electron: variant regular, 26 px corners, button: true; Apple's press is
      // .interactive())
      Group {
        if m.container { GlassEffectContainer(spacing: 0) { tiles } } else { tiles }
      }
      .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { m.grid = $0 }
      .area()
      panel.pin(.bottomTrailing, right: 24, bottom: 22)
    }
    .onReceive(tick) { _ in m.layers = backdropLayers(gallery.window, in: m.grid) }
  }

  private var tiles: some View {
    Grid(horizontalSpacing: 22, verticalSpacing: 22) {
      ForEach(0..<4, id: \.self) { row in
        GridRow {
          ForEach(TILES[(row * 6)..<(row * 6 + 6)], id: \.1) { t in
            Button {} label: {
              VStack(spacing: 6) {
                Icon(t.0)
                Text(t.1).font(.system(size: 12, weight: .semibold))
              }
              .frame(width: 96, height: 96)
              .contentShape(.rect(cornerRadius: 26))
            }
            .buttonStyle(.plain)
            .glassEffect(.regular.interactive(), in: .rect(cornerRadius: 26))
          }
        }
      }
    }
  }

  /// .many-panel: the two ways, and the count (Electron: variant regular, a capsule)
  private var panel: some View {
    HStack(spacing: 14) {
      HStack(spacing: 2) {
        mode("glassEffect × 24", false)
        mode("GlassEffectContainer", true)
      }
      Text("\(Text("\(m.layers)").bold().monospacedDigit())\(m.layers == 1 ? " backdrop layer" : " backdrop layers")")
    }
    .padding(.leading, 5)
    .padding(.trailing, 18)
    .frame(height: 48)
    .glassEffect(.regular, in: .capsule)
  }

  private func mode(_ label: String, _ container: Bool) -> some View {
    Button { m.container = container } label: {
      Text(label).font(.system(size: 13, weight: .semibold))
        .padding(.horizontal, 14)
        .frame(height: 38)
        .background(Capsule().fill(m.container == container ? Color.grey(0.22) : .clear))
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}
