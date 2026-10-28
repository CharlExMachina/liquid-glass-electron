// demo/demos/container.js in SwiftUI: Apple's GlassEffectContainer (the Electron page's container() copies it). The
// shapes in it are one piece of glass: where two come within the spacing their edges flow together; drag them apart
// and the glass stretches and splits.
import SwiftUI

final class ContainerModel: ObservableObject {
  struct Blob { var x: CGFloat, y: CGFloat; let icon: String, wide: Bool }
  @Published var blobs = [Blob(x: 150, y: 160, icon: "heart", wide: false), Blob(x: 300, y: 190, icon: "star", wide: false), Blob(x: 520, y: 150, icon: "music", wide: true),
    Blob(x: 260, y: 380, icon: "camera", wide: false), Blob(x: 470, y: 360, icon: "map", wide: false)]
  @Published var spacing = 28.0
  var start: CGPoint?
}

struct ContainerDemo: View {
  @StateObject private var m = ContainerModel()

  var body: some View {
    ZStack {
      Photo("ponds")
      // .blobs, in the stage's area (Electron: variant clear, zRadius 30)
      GlassEffectContainer(spacing: m.spacing) {
        ZStack(alignment: .topLeading) {
          ForEach(m.blobs.indices, id: \.self) { blob($0) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
      .area()
      // .spacing-ctl (Electron: variant regular, 22 px corners)
      VStack(alignment: .leading, spacing: 6) {
        Text("Spacing \(Text("\(Int(m.spacing))").bold().monospacedDigit()) px")
        Slider(value: $m.spacing, in: 0...80, step: 1).tint(Color.accentBlue)
      }
      .padding(.vertical, 14)
      .padding(.horizontal, 18)
      .frame(width: 300)
      .glassEffect(.regular, in: .rect(cornerRadius: 22))
      .pin(.bottomTrailing, right: 24, bottom: 22)
    }
  }

  /// .blob: 110 px, the wide one 200 (dragged by its position, which the container follows)
  private func blob(_ i: Int) -> some View {
    let b = m.blobs[i], w: CGFloat = b.wide ? 200 : 110
    return Icon(b.icon, 30)
      .foregroundStyle(.white)
      .shadow(color: .black.opacity(0.4), radius: 1, y: 1)
      .frame(width: w, height: 110)
      .contentShape(Capsule())
      .glassEffect(.clear, in: .capsule)
      .position(x: b.x + w / 2, y: b.y + 55)
      .gesture(DragGesture()
        .onChanged { v in
          let s = m.start ?? CGPoint(x: m.blobs[i].x, y: m.blobs[i].y)
          m.start = s
          m.blobs[i].x = s.x + v.translation.width
          m.blobs[i].y = s.y + v.translation.height
        }
        .onEnded { _ in m.start = nil })
  }
}
