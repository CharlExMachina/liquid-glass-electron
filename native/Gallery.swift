// The gallery's shell, as demo/app.js is the Electron gallery's: a sidebar of demos (the same groups and titles) and a
// stage. Each demo is a view in native/demos/, the SwiftUI twin of demo/demos/<name>.js, laid out the same way, with
// Apple's glass where the Electron one has this library's.
//
// The sidebar's settings are the system's own, set for this app alone: Dark is the window's appearance, and Tinted
// glass is macOS's Liquid Glass tint (System Settings › Appearance, NSGlassTintAmount), 1 here and 0 (Clear, where the
// library's references were made) when off. The appearance demo's Reduce Transparency and Increase Contrast are
// SwiftUI's environment, which the glass follows.
import AppKit
import SwiftUI

enum Page: String, CaseIterable, Identifiable {
  case toolbar, tabbar, scroll, many, ios, controls, buttons, toasts, morph, container, drag, dock, video, magnifier, appearance, compare, playground
  var id: String { rawValue }

  var title: String {
    switch self {
    case .ios: "iOS controls"
    case .toolbar: "Toolbar"
    case .tabbar: "Tab bar"
    case .scroll: "Over scrolling content"
    case .many: "Lots of glass"
    case .controls: "Sliders and toggles"
    case .buttons: "Buttons"
    case .toasts: "Toasts"
    case .morph: "Morphing"
    case .container: "Merging glass"
    case .drag: "Dragging"
    case .dock: "Dock"
    case .video: "Over video"
    case .magnifier: "Magnifier"
    case .appearance: "Clear, tinted, accessible"
    case .compare: "Glass vs. blur"
    case .playground: "Playground"
    }
  }

  @MainActor @ViewBuilder var view: some View {
    switch self {
    case .toolbar: ToolbarDemo()
    case .tabbar: TabBarDemo()
    case .scroll: ScrollDemo()
    case .many: ManyDemo()
    case .ios: IOSDemo()
    case .controls: ControlsDemo()
    case .buttons: ButtonsDemo()
    case .toasts: ToastsDemo()
    case .morph: MorphDemo()
    case .container: ContainerDemo()
    case .drag: DragDemo()
    case .dock: DockDemo()
    case .video: VideoDemo()
    case .magnifier: MagnifierDemo()
    case .appearance: AppearanceDemo()
    case .compare: CompareDemo()
    case .playground: PlaygroundDemo()
    }
  }
}

let GROUPS: [(String, [Page])] = [
  ("Bars", [.toolbar, .tabbar, .scroll, .many]),
  ("Controls", [.ios, .controls, .buttons, .toasts]),
  ("Motion", [.morph, .container, .drag, .dock]),
  ("Lenses", [.video, .magnifier]),
  ("Look", [.appearance, .compare, .playground]),
]

/// The gallery's state: the page, light or dark, and the system's glass settings as this app sees them.
final class Gallery: ObservableObject {
  @Published var page: Page {
    didSet {
      window?.title = "\(page.title) · SwiftUI's Liquid Glass"
      // the appearance demo's settings last while it's shown (app.js's demos clean up after themselves)
      if oldValue == .appearance && page != .appearance {
        tintOverride = nil
        reduceTransparency = nil
        increaseContrast = nil
      }
    }
  }
  @Published var dark: Bool { didSet { applyAppearance() } }
  @Published var tinted: Bool { didSet { applyTint() } }
  @Published var hover: Page?
  /// the appearance demo's settings, over the sidebar's and the system's (app.js's setEnvironment); nil follows them
  @Published var tintOverride: Bool? { didSet { applyTint() } }
  @Published var reduceTransparency: Bool?
  @Published var increaseContrast: Bool?
  weak var window: NSWindow?

  init(page: Page, dark: Bool) {
    self.page = page
    self.dark = dark
    self.tinted = false
    applyAppearance()
    applyTint()
  }

  private func applyAppearance() { NSApp.appearance = NSAppearance(named: dark ? .darkAqua : .aqua) }

  /// macOS's glass tint for this app: the argument domain is read before the global one (where System Settings keeps
  /// it), only by this process, and isn't saved. Set, not left to the system's, so Clear is Clear (0, where the
  /// library's references were made).
  private func applyTint() {
    let d = UserDefaults.standard
    var args = d.volatileDomain(forName: UserDefaults.argumentDomain)
    args["NSGlassTintAmount"] = (tintOverride ?? tinted) ? 1.0 : 0.0
    d.setVolatileDomain(args, forName: UserDefaults.argumentDomain)
    // what AppKit's glass re-reads the tint on, as when it's changed in System Settings
    NotificationCenter.default.post(name: Notification.Name("NSGlassEffectDiffusionDidChangeNotification"), object: nil)
  }
}

struct GalleryView: View {
  @ObservedObject var g: Gallery

  var body: some View {
    ZStack(alignment: .topLeading) {
      Color.page
      g.page.view.id(g.page)
      Sidebar(g: g)
    }
    .font(.system(size: 14, weight: .medium))
    .foregroundStyle(Color.text)
    .tint(Color.accentBlue)
    // controls drawn as in a key window even when it isn't, as a web page's are (and for captures made without focus)
    .environment(\.controlActiveState, .key)
    .environmentObject(g)
    .accessibilityOverrides(reduceTransparency: g.reduceTransparency, increaseContrast: g.increaseContrast)
    .ignoresSafeArea()
  }
}

extension View {
  /// Reduce Transparency and Increase Contrast for the views inside, where they're set; the system's where they're nil.
  @ViewBuilder func accessibilityOverrides(reduceTransparency: Bool?, increaseContrast: Bool?) -> some View {
    let a = Group {
      if let rt = reduceTransparency { self.environment(\._accessibilityReduceTransparency, rt) } else { self }
    }
    if let ic = increaseContrast { a.environment(\._colorSchemeContrast, ic ? .increased : .standard) } else { a }
  }
}

/// app.css's #sidebar: 196 wide, 14 from the window's edges, on regular glass with 26 px corners.
struct Sidebar: View {
  @ObservedObject var g: Gallery

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 9) {
        RoundedRectangle(cornerRadius: 7)
          .fill(AngularGradient(colors: [Color(hex: 0x64d2ff), Color(hex: 0x5e5ce6), Color(hex: 0xff375f), Color(hex: 0xffd60a), Color(hex: 0x64d2ff)], center: .center, angle: .degrees(210 - 90)))
          .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(.white.opacity(0.5), lineWidth: 1))
          .frame(width: 20, height: 20)
        Text("liquid glass").font(.system(size: 15, weight: .bold)).tracking(-0.15)
      }
      .padding(.horizontal, 8)
      .padding(.bottom, 12)
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(GROUPS, id: \.0) { group, pages in
            Text(group).smallCaps().foregroundStyle(Color.muted).padding(EdgeInsets(top: 10, leading: 10, bottom: 3, trailing: 10))
            ForEach(pages) { link($0) }
          }
        }
      }
      .scrollIndicators(.never)
      VStack(spacing: 8) {
        setting("Dark", $g.dark)
        setting("Tinted glass", $g.tinted)
      }
      .padding(EdgeInsets(top: 10, leading: 8, bottom: 0, trailing: 8))
      .overlay(alignment: .top) { Rectangle().fill(Color.grey(0.25)).frame(height: 1) }
    }
    .padding(EdgeInsets(top: 18, leading: 10, bottom: 12, trailing: 10))
    .frame(width: 196)
    .frame(maxHeight: .infinity)
    .glassEffect(.regular, in: .rect(cornerRadius: 26))
    .padding(14)
  }

  private func link(_ p: Page) -> some View {
    let current = g.page == p
    return Text(p.title)
      .frame(maxWidth: .infinity, alignment: .leading)
      .lineSpacing(2.8)
      .padding(.horizontal, 10)
      .padding(.vertical, 6.4)
      .foregroundStyle(current ? .white : Color.text)
      .background(RoundedRectangle(cornerRadius: 10).fill(current ? Color.accentBlue : g.hover == p ? Color.grey(0.14) : .clear))
      .contentShape(Rectangle())
      .onHover { g.hover = $0 ? p : (g.hover == p ? nil : g.hover) }
      .onTapGesture { g.page = p }
  }

  private func setting(_ label: String, _ on: Binding<Bool>) -> some View {
    HStack {
      Text(label)
      Spacer()
      Toggle(label, isOn: on).toggleStyle(.switch).labelsHidden().tint(Color(hex: 0x34c759))
    }
  }
}
