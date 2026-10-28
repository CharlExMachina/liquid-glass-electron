// demo/demos/controls.js in SwiftUI: sliders and toggles on a panel of glass, and a volume HUD whose level shows
// through frosted glass. They're macOS's own Slider and Toggle, whose knobs are Liquid Glass on macOS 26 and later; the
// Electron page draws them as measured from these (sizes, colours, the lenses' surfaces, the timing of a press).
import SwiftUI

final class ControlsModel: ObservableObject {
  @Published var values: [Double] = [62, 40, 80]
  @Published var toggles = [true, false, true]
}

struct ControlsDemo: View {
  @StateObject private var m = ControlsModel()
  private let rows = ["sun", "volume", "music"]

  var body: some View {
    ZStack {
      Photo("alps")
      panel.pin(.top, left: 224, top: 70)
      hud.pin(.topTrailing, top: 70, right: 40)
    }
  }

  /// .ctl-panel: 440 wide (Electron: variant regular, 34 px corners)
  private var panel: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("Control Center").font(.system(size: 17, weight: .bold))
      ForEach(0..<3, id: \.self) { i in
        HStack(spacing: 12) {
          Icon(rows[i]).frame(width: 28)
          Slider(value: $m.values[i], in: 0...100).controlSize(.large).tint(Color.accentBlue)
          Text("\(Int(m.values[i].rounded()))").monospacedDigit().foregroundStyle(Color.muted).frame(width: 44, alignment: .trailing)
        }
        .frame(height: 34)
      }
      HStack(spacing: 22) {
        ForEach(Array(["Wi‑Fi", "Bluetooth", "AirDrop"].enumerated()), id: \.offset) { i, t in
          VStack(spacing: 6) {
            Toggle(t, isOn: $m.toggles[i]).toggleStyle(.switch).labelsHidden().controlSize(.large).tint(Color(hex: 0x34c759))
            Text(t).font(.system(size: 12, weight: .medium)).foregroundStyle(Color.muted)
          }
        }
      }
    }
    .padding(.vertical, 24)
    .padding(.horizontal, 26)
    .frame(width: 440, alignment: .leading)
    .glassEffect(.regular, in: .rect(cornerRadius: 34))
  }

  /// .hud: 64 × 220, the level a white fill from the bottom (Electron: variant regular, 22 px corners)
  private var hud: some View {
    ZStack(alignment: .bottom) {
      UnevenRoundedRectangle(bottomLeadingRadius: 22, bottomTrailingRadius: 22)
        .fill(.white.opacity(0.75))
        .frame(height: 220 * m.values[1] / 100)
      Icon("volume").foregroundStyle(Color(hex: 0x222222)).padding(.bottom, 14)
    }
    .frame(width: 64, height: 220, alignment: .bottom)
    .glassEffect(.regular, in: .rect(cornerRadius: 22))
  }
}
