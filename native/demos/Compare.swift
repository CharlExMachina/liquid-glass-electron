// demo/demos/compare.js in SwiftUI: the same card three ways, over stripes so the bending shows. The Electron page
// has CSS backdrop-filter (a blur: the usual "glassmorphism"), its glass frosted, and its glass clear; a Mac's are a
// Material (NSVisualEffectView's blur), and the regular and clear glass.
import SwiftUI

struct CompareDemo: View {
  var body: some View {
    ZStack(alignment: .topLeading) {
      Photo("coast")
      ZStack(alignment: .topLeading) {
        // .cmp-strip: 12 px stripes, white and near-black
        Canvas { ctx, size in
          for x in stride(from: 0.0, to: size.width, by: 24) {
            ctx.fill(Path(CGRect(x: x, y: 0, width: 12, height: size.height)), with: .color(.white))
            ctx.fill(Path(CGRect(x: x + 12, y: 0, width: 12, height: size.height)), with: .color(Color(hex: 0x111111)))
          }
        }
        .frame(height: 26)
        .offset(y: 230)
        // the CSS card's blur, saturation and border: a Material, the system's blur
        card("Material", ".ultraThinMaterial: a blur")
          .background(.ultraThinMaterial, in: .rect(cornerRadius: 34))
          .overlay(RoundedRectangle(cornerRadius: 34).strokeBorder(.white.opacity(0.35), lineWidth: 1))
          .shadow(color: .black.opacity(0.25), radius: 15, y: 8)
          .offset(x: 36, y: 120)
        card("Liquid glass, frosted", ".glassEffect(.regular)").glassEffect(.regular, in: .rect(cornerRadius: 34)).offset(x: 36 + 302, y: 120)
        card("Liquid glass, clear", ".glassEffect(.clear)").glassEffect(.clear, in: .rect(cornerRadius: 34)).offset(x: 36 + 2 * 302, y: 120)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .area()
    }
  }

  /// .cmp-card: 280 × 190, 302 apart from 36 px in, 120 down
  private func card(_ title: String, _ note: String) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(title).font(.system(size: 17, weight: .bold)).lineHeight(17)
      Text(note).font(.system(size: 12, weight: .medium)).opacity(0.9)
    }
    .onPhoto(1, 1, 0.4)
    .padding(.vertical, 18)
    .padding(.horizontal, 22)
    .frame(width: 280, height: 190, alignment: .topLeading)
  }
}
