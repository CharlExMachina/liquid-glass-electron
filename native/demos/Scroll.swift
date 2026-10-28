// demo/demos/scroll.js in SwiftUI: a floating bar over a scrolling feed. The bar's glass bends the posts as they pass
// under it; the scroll edge effect (SwiftUI's own, under a safeAreaBar) dissolves them into a blur at the top (soft)
// or ends them under a band (hard).
import SwiftUI

let POSTS = [
  ("coast", "Zapata Peninsula", "Mangroves and reefs on Cuba’s southern coast."), ("ponds", "Lop Nur", "Potash evaporation ponds in the Tarim Basin."),
  ("alps", "The Alps", "Clouds over the peaks, looking south to Italy."), ("night", "Moscow at night", "City lights, the aurora and the moon."),
]

/// .feed: 24 posts in columns of at least 240 px, in the stage's area. The bar goes in a safeAreaBar 84 px high
/// (scrollEdge()'s size here), which is where SwiftUI draws its scroll edge effect.
struct Feed<Bar: View>: View {
  var edge: ScrollEdgeEffectStyle = .soft
  @ViewBuilder var bar: Bar

  var body: some View {
    ScrollView {
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 18)], spacing: 18) {
        ForEach(0..<24, id: \.self) { i in post(POSTS[i % POSTS.count]) }
      }
      .padding(EdgeInsets(top: 92 - 84, leading: 32, bottom: 40, trailing: 32))
    }
    .scrollIndicators(.never)
    .scrollEdgeEffectStyle(edge, for: .top)
    .safeAreaBar(edge: .top, spacing: 0) { bar.frame(height: 50).padding(.top, 18).padding(.bottom, 16) }
    .area()
  }

  private func post(_ p: (String, String, String)) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Photo(p.0).frame(height: 170)
      VStack(alignment: .leading, spacing: 4) {
        Text(p.1).font(.system(size: 15, weight: .bold))
        Text(p.2).font(.system(size: 13, weight: .medium)).lineHeight(13).foregroundStyle(Color.muted)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(EdgeInsets(top: 12, leading: 14, bottom: 14, trailing: 14))
    }
    .background(Color.grey(0.12))
    .clipShape(.rect(cornerRadius: 22))
  }
}

struct ScrollDemo: View {
  @StateObject private var hard = Store(false)

  var body: some View {
    ZStack {
      Feed(edge: hard.value ? .hard : .soft) {
        // .floatbar (Electron: variant regular, a capsule)
        HStack(spacing: 14) {
          Text("From orbit").font(.system(size: 15, weight: .bold)).padding(.trailing, 6)
          ForEach(["search", "more"], id: \.self) { name in
            Button {} label: { Icon(name).frame(width: 38, height: 38).contentShape(Circle()) }.buttonStyle(.plain)
          }
        }
        .padding(.leading, 20)
        .padding(.trailing, 8)
        .frame(height: 50)
        .glassEffect(.regular, in: .capsule)
      }
      // .edge-toggle (Electron: variant regular, a capsule)
      Button { hard.value.toggle() } label: {
        Text("Edge: \(hard.value ? "hard" : "soft")").font(.system(size: 14, weight: .semibold))
          .padding(.vertical, 8).padding(.horizontal, 14)
          .contentShape(Capsule())
      }
      .buttonStyle(.plain)
      .glassEffect(.regular, in: .capsule)
      .pin(.bottomTrailing, right: 24, bottom: 22)
    }
  }
}
