// demo/demos/toasts.js in SwiftUI: notifications that materialize, Apple's .materialize glass transition (the
// Electron page's materialize()): their glass grows in as its bending strengthens, and fades away when dismissed.
import SwiftUI

private let MESSAGES = [("message", "Messages", "Landing at 6:40, see you at the gate"), ("mail", "Mail", "Your boarding pass is ready"), ("bell", "Reminders", "Pack the camera"), ("music", "Music", "Now playing: Clair de Lune")]

final class ToastsModel: ObservableObject {
  struct Toast: Identifiable { let id: Int; let icon: String, title: String, text: String }
  @Published var toasts: [Toast] = []
  private var n = 0

  func spawn() {
    let (icon, title, text) = MESSAGES[n % MESSAGES.count]
    let t = Toast(id: n, icon: icon, title: title, text: text)
    n += 1
    withAnimation(.smooth(duration: 0.5)) { toasts.insert(t, at: 0) }
    DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) { [weak self] in
      withAnimation(.smooth(duration: 0.5)) { self?.toasts.removeAll { $0.id == t.id } }
    }
  }
}

struct ToastsDemo: View {
  @StateObject private var m = ToastsModel()

  var body: some View {
    ZStack {
      Photo("night")
      GlassEffectContainer {
        VStack(spacing: 12) {
          ForEach(m.toasts) { toast($0) }
        }
      }
      .frame(width: 340)
      .pin(.topTrailing, top: 24, right: 24)
      // .toast-btn: 50 high (Electron: glassButton(button, 'prominent'))
      Button { m.spawn() } label: {
        Text("Notify me").font(.system(size: 15, weight: .semibold)).buttonLabel(height: 50, padding: 26)
      }
      .buttonStyle(.glassProminent)
      .buttonBorderShape(.capsule)
      .pin(.bottom, left: 224, bottom: 40)
    }
  }

  /// .toast (Electron: variant regular, 24 px corners)
  private func toast(_ t: ToastsModel.Toast) -> some View {
    HStack(spacing: 12) {
      Icon(t.icon).foregroundStyle(.white).frame(width: 38, height: 38).background(RoundedRectangle(cornerRadius: 12).fill(Color.accentBlue))
      VStack(alignment: .leading, spacing: 0) {
        Text(t.title).font(.system(size: 14, weight: .bold)).lineHeight(14)
        Text(t.text).font(.system(size: 13, weight: .medium)).lineHeight(13).foregroundStyle(Color.muted)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.vertical, 14)
    .padding(.horizontal, 16)
    .glassEffect(.regular, in: .rect(cornerRadius: 24))
    .glassEffectTransition(.materialize)
  }
}
