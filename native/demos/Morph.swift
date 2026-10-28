// demo/demos/morph.js in SwiftUI: morphing, Apple's glassEffectID in a GlassEffectContainer (the Electron page's
// morph() copies it): the glass of a button flows into the menu or sheet it opens, and back.
import SwiftUI

private let ITEMS = [("camera", "Take photo"), ("photo", "Choose from library"), ("folder", "Browse files"), ("map", "Add location")]

final class MorphModel: ObservableObject {
  @Published var menu = false
  @Published var sheet = false
}

struct MorphDemo: View {
  @StateObject private var m = MorphModel()
  @Namespace private var ns
  private let spring = Animation.bouncy(duration: 0.55, extraBounce: 0.05)

  var body: some View {
    ZStack {
      Photo("alps")
      // .morph-root, the stage's area
      ZStack {
        GlassEffectContainer {
          ZStack {
            Group {
              if m.sheet { sheet } else { pill }
            }
            .pin(.topLeading, left: 60, top: 60)
            Group {
              if m.menu { menu } else { fab }
            }
            .pin(.bottomTrailing, right: 40, bottom: 40)
          }
        }
        Text("Tap the + or the pill. The glass travels with a spring, its corners going from the button’s to the panel’s.")
          .lineHeight(14)
          .onPhoto(1.5, 1, 0.5)
          .frame(maxWidth: 360, alignment: .leading)
          .pin(.bottomLeading, left: 60, bottom: 40)
      }
      .area()
    }
  }

  /// .fab: 60 px (Electron: variant regular, a circle, interactive)
  private var fab: some View {
    Button { withAnimation(spring) { m.menu = true } } label: {
      Icon("plus").foregroundStyle(.white).frame(width: 60, height: 60).contentShape(Circle())
    }
    .buttonStyle(.plain)
    .glassEffect(.regular.interactive(), in: .circle)
    .glassEffectID("fab", in: ns)
  }

  /// .menu: 260 wide (Electron: variant regular, 30 px corners)
  private var menu: some View {
    VStack(alignment: .leading, spacing: 2) {
      ForEach(ITEMS, id: \.1) { item in
        Button { withAnimation(spring) { m.menu = false } } label: {
          HStack(spacing: 12) {
            Icon(item.0)
            Text(item.1).font(.system(size: 15, weight: .medium))
          }
          .padding(.horizontal, 14)
          .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
    }
    .foregroundStyle(.white)
    .padding(10)
    .frame(width: 260)
    .glassEffect(.regular, in: .rect(cornerRadius: 30))
    .glassEffectID("fab", in: ns)
  }

  /// .pill-btn: 48 high (Electron: variant regular, a capsule, interactive)
  private var pill: some View {
    Button { withAnimation(spring) { m.sheet = true } } label: {
      HStack(spacing: 8) {
        Icon("edit")
        Text("Write a note").font(.system(size: 14, weight: .semibold))
      }
      .foregroundStyle(.white)
      .padding(.horizontal, 22)
      .frame(height: 48)
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .glassEffect(.regular.interactive(), in: .capsule)
    .glassEffectID("note", in: ns)
  }

  /// .sheet: 420 × 260 (Electron: variant regular, 36 px corners). Its close button is light and fill only: glass in
  /// the container would merge with the sheet's.
  private var sheet: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("New note").font(.system(size: 20, weight: .bold)).padding(.bottom, 8)
      Text("The button’s glass became this sheet. Close it and the sheet flows back into the button.").lineHeight(14).opacity(0.85)
    }
    .foregroundStyle(.white)
    .padding(.vertical, 22)
    .padding(.horizontal, 24)
    .frame(width: 420, height: 260, alignment: .topLeading)
    .overlay(alignment: .topTrailing) {
      Button { withAnimation(spring) { m.sheet = false } } label: {
        Icon("close").foregroundStyle(.white).frame(width: 36, height: 36).background(Circle().fill(.white.opacity(0.15))).contentShape(Circle())
      }
      .buttonStyle(.plain)
      .padding(14)
    }
    .glassEffect(.regular, in: .rect(cornerRadius: 36))
    .glassEffectID("note", in: ns)
  }
}
