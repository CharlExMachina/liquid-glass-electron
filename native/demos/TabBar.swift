// demo/demos/tabbar.js in SwiftUI: iOS 26's tab bar, a floating capsule with the selected tab on a pill that slides
// between tabs, and a search button on its own circle of glass beside it.
import SwiftUI

private let TABS = [("home", "Home"), ("photo", "Photos"), ("music", "Music"), ("gear", "Settings")]

struct TabBarDemo: View {
  @StateObject private var tab = Store(0)

  var body: some View {
    ZStack {
      Photo("ponds")
      VStack(alignment: .leading, spacing: 4) {
        Text(TABS[tab.value].1).font(.system(size: 44, weight: .bold)).tracking(-0.88)
        Text("Lop Nur, Xinjiang, from Landsat 5.").font(.system(size: 16, weight: .medium)).opacity(0.9)
      }
      .foregroundStyle(.white)
      .shadow(color: .black.opacity(0.5), radius: 4, y: 2)
      .pin(.topLeading, left: 270, top: 40)
      HStack(spacing: 12) {
        bar
        // .searchbtn (Electron: variant regular, a circle, interactive)
        Button {} label: { Icon("search").frame(width: 62, height: 62).contentShape(Circle()) }
          .buttonStyle(.plain)
          .glassEffect(.regular.interactive(), in: .circle)
      }
      .pin(.bottom, left: 224, bottom: 26)
    }
  }

  /// .tabbar: 84 px tabs on a capsule of regular glass, the selected one on a pill
  private var bar: some View {
    ZStack(alignment: .leading) {
      RoundedRectangle(cornerRadius: 26).fill(Color.grey(0.2))
        .frame(width: 84, height: 52)
        .offset(x: CGFloat(tab.value) * 84)
        .animation(bezier(0.3, 1.3, 0.5, 1, 0.5), value: tab.value)
      HStack(spacing: 0) {
        ForEach(Array(TABS.enumerated()), id: \.offset) { i, t in
          Button { tab.value = i } label: {
            VStack(spacing: 2) {
              Icon(t.0, 22)
              Text(t.1).font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(tab.value == i ? Color.accentBlue : Color.text)
            .frame(width: 84, height: 52)
            .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
        }
      }
    }
    .padding(5)
    .glassEffect(.regular, in: .capsule)
  }
}
