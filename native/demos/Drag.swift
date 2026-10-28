// demo/demos/drag.js in SwiftUI: glass to drag around over live content, text scrolling by and orbs drifting, all of
// it bending through the glass as it moves.
import SwiftUI

private let WORDS = String(repeating: "Liquid glass bends the live page behind it · ", count: 8)

final class DragModel: ObservableObject {
  @Published var cards: [CGPoint] = [CGPoint(x: 340, y: 120), CGPoint(x: 720, y: 300), CGPoint(x: 420, y: 440)]
  @Published var tickerWidth: CGFloat = 0
  var start: CGPoint?
}

struct DragDemo: View {
  @StateObject private var m = DragModel()
  private let t0 = Date()

  var body: some View {
    ZStack(alignment: .topLeading) {
      live.area()
      // .float (Electron: floating, no variant: liquidglass's clear look)
      card(0, 240, 150, .rect(cornerRadius: 32)) { title("Drag me", ".glassEffect(.clear)") }
      card(1, 150, 150, .circle) { Text("Or me").font(.system(size: 16, weight: .bold)).padding(.top, 18).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top) }
      // Electron: bevelMode 1, a dome that magnifies; macOS's glass has no dome
      card(2, 240, 150, .rect(cornerRadius: 32)) { title("Dome", "macOS has no dome lens: .clear") }
    }
  }

  /// .live: a gradient, three blurred orbs drifting and four lines of text scrolling, each on a CSS animation there
  private var live: some View {
    TimelineView(.animation) { tl in
      let t = tl.date.timeIntervalSince(t0)
      // in an overlay, so the text (far wider than the window) takes no part in the layout, as position: absolute
      LinearGradient(colors: [Color(hex: 0x0f2027), Color(hex: 0x203a43), Color(hex: 0x2c5364)], startPoint: UnitPoint(x: 0.08, y: 0.21), endPoint: UnitPoint(x: 0.92, y: 0.79))
        .overlay(alignment: .topLeading) {
          ZStack(alignment: .topLeading) {
            // .orb: 220 px, blur 20, drifting 260 × 120 and back over 9 s each way, ease-in-out
            ForEach(Array([(0xff375f, 80.0, 120.0), (0x30d158, 420, 360), (0x5e5ce6, 700, 80)].enumerated()), id: \.offset) { _, o in
              let p = (t / 9).truncatingRemainder(dividingBy: 2), k = p < 1 ? p : 2 - p, e = k < 0.5 ? 2 * k * k : 1 - pow(-2 * k + 2, 2) / 2
              Circle().fill(Color(hex: UInt32(o.0))).frame(width: 220, height: 220).blur(radius: 20).opacity(0.85)
                .offset(x: o.1 + 260 * e, y: o.2 + 120 * e)
            }
            // .ticker: 64 px, 800 weight, scrolling half its width (four of its eight repeats) in 18, 26 (reversed) or 22 s
            ticker(t, 90, 18, false, .white.opacity(0.9))
            ticker(t, 260, 26, true, Color(.sRGB, red: 1, green: 214 / 255, blue: 10 / 255, opacity: 0.9))
            ticker(t, 430, 22, false, Color(.sRGB, red: 100 / 255, green: 210 / 255, blue: 1, opacity: 0.9))
            ticker(t, 600, 18, false, .white.opacity(0.9))
          }
        }
    }
    .clipped()
  }

  private func ticker(_ t: Double, _ top: CGFloat, _ seconds: Double, _ reverse: Bool, _ colour: Color) -> some View {
    var p = (t / seconds).truncatingRemainder(dividingBy: 1)
    if reverse { p = 1 - p }
    return Text(WORDS)
      .font(.system(size: 64, weight: .heavy))
      .foregroundStyle(colour)
      .fixedSize()
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { m.tickerWidth = $0 }
      .offset(x: -p * m.tickerWidth / 2, y: top + (64 * 1.15 - 64 * 1.2) / 2)
  }

  private func title(_ name: String, _ note: String) -> some View {
    VStack(alignment: .leading) {
      Text(name).font(.system(size: 16, weight: .bold))
      Spacer()
      Text(note).font(.system(size: 12, weight: .medium)).opacity(0.85)
    }
    .padding(.vertical, 18)
    .padding(.horizontal, 20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private func card(_ i: Int, _ w: CGFloat, _ h: CGFloat, _ shape: some Shape, @ViewBuilder _ content: () -> some View) -> some View {
    content()
      .foregroundStyle(.white)
      .frame(width: w, height: h)
      .contentShape(shape)
      .glassEffect(.clear, in: shape)
      .offset(x: m.cards[i].x, y: m.cards[i].y)
      .gesture(DragGesture()
        .onChanged { v in
          let s = m.start ?? m.cards[i]
          m.start = s
          m.cards[i] = CGPoint(x: s.x + v.translation.width, y: s.y + v.translation.height)
        }
        .onEnded { _ in m.start = nil })
  }
}
