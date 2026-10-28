// demo/demos/buttons.js in SwiftUI: buttons straight on the photo. Apple's .glass and .glassProminent button styles
// (the Electron page's glassButton() copies them); shapes, including corners concentric with what they sit in; and
// the press, which on macOS is one thing, interactive glass (the Electron page also has liquidglass's button mode,
// which flattens, and a bulge).
import SwiftUI

struct ButtonsDemo: View {
  var body: some View {
    ZStack {
      Photo("coast")
      Grid(horizontalSpacing: 22, verticalSpacing: 22) {
        GridRow {
          cell(".glass", "Regular glass, interactive: pressed, it grows and lights up under the pointer.") {
            HStack(spacing: 14) {
              label("Share", "share").buttonStyle(.glass)
              round("heart").buttonStyle(.glass)
              label("Edit", "pen").buttonStyle(.glass)
            }
          }
          cell(".glassProminent", "Tinted with the accent colour, for the primary action.") {
            HStack(spacing: 14) {
              label("Continue").buttonStyle(.glassProminent)
              round("plus").buttonStyle(.glassProminent)
            }
          }
        }
        GridRow {
          cell("Shapes", "Capsule, circle, rounded rectangle; corners concentric with their container.") {
            // flex-wrap: the box goes on a line of its own
            VStack(alignment: .leading, spacing: 14) {
              HStack(spacing: 14) {
                label("Capsule").buttonStyle(.glass)
                round("camera").buttonStyle(.glass)
                Button {} label: { Icon("map").foregroundStyle(.white).buttonLabel(height: 64, width: 64) }.buttonStyle(.glass).buttonBorderShape(.roundedRectangle(radius: 18))
              }
              concentric
            }
          }
          cell("Press", "macOS’s glass has one press, .interactive(): it grows and lights up where it’s pressed. Both use it.") {
            HStack(spacing: 14) {
              plain("Button mode")
              plain("Bulge")
            }
          }
        }
      }
      .pin(.topLeading, left: 260, top: 40, right: 30)
    }
  }

  /// .btn-cell: no glass of its own (glass on glass would only see the glass under it)
  private func cell(_ title: String, _ note: String, @ViewBuilder _ buttons: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      Text(title).font(.system(size: 13, weight: .semibold)).tracking(0.65).textCase(.uppercase).opacity(0.8)
      buttons()
      Text(note).font(.system(size: 12, weight: .medium)).lineHeight(12).opacity(0.75)
    }
    .onPhoto(1.5, 1, 0.55)
    .padding(EdgeInsets(top: 20, leading: 22, bottom: 22, trailing: 22))
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .gridCellAnchor(.topLeading)
  }

  /// .gbtn: 46 high, 22 px either side, an icon and a label
  private func label(_ text: String, _ icon: String? = nil) -> some View {
    Button {} label: {
      HStack(spacing: 8) {
        if let icon { Icon(icon) }
        Text(text).font(.system(size: 15, weight: .semibold))
      }
      .foregroundStyle(.white)
      .buttonLabel(height: 46, padding: 22)
    }
    .buttonBorderShape(.capsule)
  }

  /// a .gbtn on interactive glass of its own (Electron: shape capsule, zRadius 22, button: true or press: 'bulge')
  private func plain(_ text: String) -> some View {
    Button {} label: {
      Text(text).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white).padding(.horizontal, 22).frame(height: 46).contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .glassEffect(.clear.interactive(), in: .capsule)
  }

  /// .gbtn.round: 54 px
  private func round(_ icon: String) -> some View {
    Button {} label: { Icon(icon).foregroundStyle(.white).buttonLabel(height: 54, width: 54) }.buttonBorderShape(.circle)
  }

  /// .concentric-box: regular glass with 32 px corners; inside, buttons of light and fill only, their corners
  /// concentric with the box's (Electron: refraction 0, shape concentric)
  private var concentric: some View {
    HStack(spacing: 10) {
      ForEach(Array(["Cancel", "Save"].enumerated()), id: \.offset) { i, t in
        Button {} label: {
          Text(t).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
            .frame(maxWidth: .infinity).frame(height: 46)
            .background(ConcentricRectangle().fill(i == 1 ? Color(hex: 0x0a84ff, 0.9) : .white.opacity(0.2)))
            .contentShape(ConcentricRectangle())
        }
        .buttonStyle(.plain)
      }
    }
    .padding(10)
    .frame(width: 210, height: 120, alignment: .bottom)
    .containerShape(.rect(cornerRadius: 32))
    .glassEffect(.regular, in: .rect(cornerRadius: 32))
  }
}
