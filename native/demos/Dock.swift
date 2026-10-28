// demo/demos/dock.js in SwiftUI: a dock, a shelf of glass under the apps, which magnify as the pointer passes; and a
// menu bar of glass along the top.
import SwiftUI

private let APPS: [(String, UInt32)] = [("home", 0x0a84ff), ("mail", 0x30b0c7), ("message", 0x30d158), ("photo", 0xff9f0a), ("music", 0xff375f), ("map", 0x64d2ff), ("camera", 0x8e8e93), ("gear", 0x636366)]

struct DockDemo: View {
  /// the pointer's x in the dock, nil when it's not over it
  @StateObject private var pointer = Store<CGFloat?>(nil)

  var body: some View {
    ZStack {
      Photo("alps")
      // .menubar (Electron: variant regular, no corners, zRadius 10, refraction 0.4)
      HStack(spacing: 18) {
        Text("Finder").bold()
        ForEach(["File", "Edit", "View", "Go"], id: \.self) { Text($0) }
        Spacer()
        Text("9:41").monospacedDigit()
      }
      .font(.system(size: 13, weight: .medium))
      .foregroundStyle(.white)
      .padding(.horizontal, 18)
      .frame(height: 30)
      .glassEffect(.regular, in: .rect)
      .pin(.top, left: 224)
      dock.pin(.bottom, left: 224, bottom: 18)
    }
  }

  /// .dock: 56 px apps, 10 apart, a separator before the last two (Electron: variant regular, 26 px corners)
  private var dock: some View {
    HStack(alignment: .bottom, spacing: 10) {
      ForEach(0..<6, id: \.self) { app($0) }
      Rectangle().fill(.white.opacity(0.3)).frame(width: 1).padding(.vertical, 6).padding(.horizontal, 4)
      ForEach(6..<8, id: \.self) { app($0) }
    }
    .frame(height: 58)
    .padding(.vertical, 10)
    .padding(.horizontal, 14)
    .glassEffect(.regular, in: .rect(cornerRadius: 26))
    .onContinuousHover { phase in
      if case .active(let p) = phase { pointer.value = p.x } else { pointer.value = nil }
    }
  }

  /// an app, scaled up by how near the pointer is (1 + 0.55 (1 − d/150)², from its bottom)
  private func app(_ i: Int) -> some View {
    let (icon, c) = APPS[i]
    let centre = 14 + 28 + CGFloat(i) * 66 + (i >= 6 ? 19 : 0)
    let s = pointer.value.map { 1 + 0.55 * pow(max(0, 1 - abs($0 - centre) / 150), 2) } ?? 1
    return Icon(icon, 28)
      .foregroundStyle(.white)
      .frame(width: 56, height: 56)
      .background(RoundedRectangle(cornerRadius: 15).fill(LinearGradient(colors: [Color(hex: c), Color(hex: c).mix(with: .black, by: 0.3)], startPoint: UnitPoint(x: 0.33, y: 0.03), endPoint: UnitPoint(x: 0.67, y: 0.97))))
      .shadow(color: .black.opacity(0.25), radius: 3, y: 2)
      .scaleEffect(s, anchor: .bottom)
      .offset(y: -(s - 1) * 14)
      .animation(.easeOut(duration: 0.18), value: s)
  }
}
