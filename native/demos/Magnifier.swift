// demo/demos/magnifier.js in SwiftUI: a magnifier that follows the pointer. The Electron page's is a dome of glass
// (liquidglass's bevelMode 1, refraction 2.6) that bends what's under it larger. macOS's glass doesn't magnify, so here
// the scene is drawn again 1.6× around the pointer, clipped to the lens, under a circle of clear glass: how a Mac app
// would make one.
import AppKit
import SwiftUI

private let SIZE: CGFloat = 190, ZOOM: CGFloat = 1.6

struct MagnifierDemo: View {
  @StateObject private var at = Store(CGPoint(x: 380, y: 260))

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .topLeading) {
        scene
        // the lens: the scene again, larger about the pointer, then clear glass over it
        scene
          .scaleEffect(ZOOM, anchor: UnitPoint(x: at.value.x / geo.size.width, y: at.value.y / geo.size.height))
          .mask(Circle().frame(width: SIZE, height: SIZE).position(at.value))
        Color.clear
          .frame(width: SIZE, height: SIZE)
          .glassEffect(.clear, in: .circle)
          .position(at.value)
          .allowsHitTesting(false)
      }
      .contentShape(Rectangle())
      .onContinuousHover { phase in
        if case .active(let p) = phase {
          at.value = p
          NSCursor.setHiddenUntilMouseMoves(true)
        }
      }
    }
    .clipped()
    .area()
  }

  /// .mag-scene: the photo and the small print
  private var scene: some View {
    ZStack {
      Photo("ponds")
      Text("\(Text("Lop Nur, Xinjiang").font(.system(size: 15, weight: .bold)))\nPotash is mined from brine pumped into these evaporation ponds; the water evaporates and the salts crystallize. Each pond is a different colour because algae, salts and depth differ from one to the next. Small print, to read through the lens.")
        .font(.system(size: 13, weight: .medium))
        .lineHeight(13, 1.6)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 18)
        .padding(.horizontal, 22)
        .background(RoundedRectangle(cornerRadius: 18).fill(.black.opacity(0.55)))
        .pin(.bottom, left: 40, right: 40, bottom: 40)
    }
  }
}
