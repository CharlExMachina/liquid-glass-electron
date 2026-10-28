// demo/demos/appearance.js in SwiftUI: the look, Apple's own. The glass variants (regular, clear, identity) over a
// bright photo and a dark one; and the system settings the glass follows, set here for this app alone as the Electron
// page sets them with setEnvironment(): macOS's Liquid Glass tint (NSGlassTintAmount), and Reduce Transparency and
// Increase Contrast (SwiftUI's environment). They're the system's again when you leave the page.
import SwiftUI

struct AppearanceDemo: View {
  @EnvironmentObject private var g: Gallery

  var body: some View {
    Grid(horizontalSpacing: 16, verticalSpacing: 16) {
      GridRow {
        // .ap-head (Electron: variant regular, a capsule)
        HStack(spacing: 12) {
          toggle("Tinted", Binding { g.tintOverride ?? false } set: { g.tintOverride = $0 })
          toggle("Reduce transparency", Binding { g.reduceTransparency ?? false } set: { g.reduceTransparency = $0 })
          toggle("Increase contrast", Binding { g.increaseContrast ?? false } set: { g.increaseContrast = $0 })
          Spacer(minLength: 0)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 14)
        .glassEffect(.regular, in: .capsule)
        .gridCellColumns(3)
      }
      ForEach(["coast", "night"], id: \.self) { pic in
        GridRow {
          ForEach([("regular", Glass.regular), ("clear", Glass.clear), ("identity", Glass.identity)], id: \.0) { name, glass in
            cell(pic, name, glass)
          }
        }
      }
    }
    .pin(.topLeading, left: 248, top: 24, right: 24, bottom: 24)
  }

  private func toggle(_ label: String, _ on: Binding<Bool>) -> some View {
    HStack(spacing: 8) {
      Toggle(label, isOn: on).toggleStyle(.switch).labelsHidden().tint(Color(hex: 0x34c759))
      Text(label).font(.system(size: 14, weight: .semibold))
    }
  }

  /// .ap-cell: the photo, its caption, and a bar of the variant (Electron: shape capsule, zRadius 24)
  private func cell(_ pic: String, _ name: String, _ glass: Glass) -> some View {
    ZStack {
      Photo(pic)
      Text(pic == "night" ? "over a dark photo" : "over a bright photo").font(.system(size: 13, weight: .bold)).onPhoto(1.5, 1, 0.6)
        .pin(.topLeading, left: 14, top: 10)
      HStack(spacing: 16) {
        Icon("search")
        Text(".\(name)").font(.system(size: 14, weight: .semibold))
        Icon("more")
      }
      .padding(.horizontal, 18)
      .frame(height: 52)
      .glassEffect(glass, in: .capsule)
      .pin(.bottom, bottom: 18)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .clipShape(.rect(cornerRadius: 26))
  }
}
