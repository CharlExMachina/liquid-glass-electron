// demo/demos/toolbar.js in SwiftUI: a toolbar over a photo, its buttons grouped on capsules of glass as iOS 26 groups
// toolbar items; a segmented control with a sliding pill; a card whose chips sit in concentric corners.
import SwiftUI

struct ToolbarDemo: View {
  @StateObject private var segment = Store(0)

  var body: some View {
    ZStack {
      Photo("coast")
      HStack(spacing: 12) {
        group(["back", "forward"])
        Text("Coastline").font(.system(size: 16, weight: .semibold)).onPhoto(1.5, 1, 0.45).frame(maxWidth: .infinity)
        group(["share", "plus", "more"])
      }
      .frame(height: 52)
      .pin(.top, left: 248, top: 22, right: 24)
      segmented.pin(.top, left: 224, top: 104)
      card.pin(.bottomLeading, left: 260, bottom: 30)
    }
  }

  /// .tb-group: 44 px buttons on a capsule (Electron: shape capsule, zRadius 18, no variant: liquidglass's clear look)
  private func group(_ icons: [String]) -> some View {
    HStack(spacing: 2) {
      ForEach(icons, id: \.self) { name in
        Button {} label: { Icon(name).frame(width: 44, height: 44).contentShape(Circle()) }.buttonStyle(.plain)
      }
    }
    .foregroundStyle(.white)
    .padding(3)
    .glassEffect(.clear, in: .capsule)
  }

  /// .seg: three 104 px segments and a pill that springs between them (Electron: variant regular, a capsule)
  private var segmented: some View {
    ZStack(alignment: .leading) {
      RoundedRectangle(cornerRadius: 16)
        .fill(.white.opacity(0.24))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(.white.opacity(0.4), lineWidth: 0.5))
        .frame(width: 104, height: 32)
        .offset(x: CGFloat(segment.value) * 104)
        .animation(bezier(0.3, 1.35, 0.5, 1, 0.45), value: segment.value)
      HStack(spacing: 0) {
        ForEach(Array(["Day", "Week", "Month"].enumerated()), id: \.offset) { i, t in
          Button { segment.value = i } label: {
            Text(t).font(.system(size: 14, weight: .semibold)).onPhoto().frame(width: 104, height: 32).contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(4)
    .frame(height: 40)
    .glassEffect(.regular, in: .capsule)
  }

  /// .card: regular glass with 28 px corners; its chips' corners are concentric with it (Electron: shape concentric,
  /// no variant)
  private var card: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("Zapata Peninsula").font(.system(size: 17, weight: .bold)).padding(.bottom, 4)
      Text("Southern Cuba, from the International Space Station.").lineHeight(13).font(.system(size: 13, weight: .medium)).opacity(0.9)
      HStack(spacing: 8) {
        ForEach(["Swim", "Snorkel", "Sail"], id: \.self) { t in
          Text(t).font(.system(size: 12, weight: .semibold)).padding(.horizontal, 12).frame(height: 30)
            .glassEffect(.clear, in: ConcentricRectangle())
        }
      }
      .padding(.top, 12)
    }
    .foregroundStyle(.white)
    .padding(.vertical, 18)
    .padding(.horizontal, 20)
    .frame(width: 300, alignment: .leading)
    .containerShape(.rect(cornerRadius: 28))
    .glassEffect(.regular, in: .rect(cornerRadius: 28))
  }
}
