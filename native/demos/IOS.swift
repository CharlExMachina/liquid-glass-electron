// demo/demos/ios.js in SwiftUI: the same cards on the same grid, with Apple's controls on them. The Electron page
// draws iOS 26's controls, measured from an iPhone; iOS's own run only on iOS, so here are the Mac's: SwiftUI's
// Slider, Toggle, segmented Picker and Menu, and the .glass and .glassProminent button styles, as macOS 27 draws them.
import SwiftUI

final class IOSModel: ObservableObject {
  @Published var size = 38.0
  @Published var enabled = true
  @Published var mode = 0
  @Published var option = "Option 1"
}

// ios.css's colours, dark and light
private let CARD = Color.themed(Color(.sRGB, white: 243 / 255), Color(hex: 0x1c1c1e))
private let MUTED = Color.themed(Color(.sRGB, red: 60 / 255, green: 60 / 255, blue: 67 / 255, opacity: 0.6), Color(.sRGB, red: 235 / 255, green: 235 / 255, blue: 245 / 255, opacity: 0.6))
private let TEXT = Color.themed(.black, .white)
private let GRID = Color.themed(.black.opacity(0.045), .white.opacity(0.07))
private let BLUE = Color.themed(Color(.sRGB, red: 0, green: 125 / 255, blue: 254 / 255), Color(hex: 0x0a84ff))
private let SWITCH_ON = Color.themed(Color(.sRGB, red: 0, green: 136 / 255, blue: 1), Color(.sRGB, red: 0, green: 145 / 255, blue: 1))

struct IOSDemo: View {
  @StateObject private var m = IOSModel()

  var body: some View {
    ZStack(alignment: .topLeading) {
      Color.themed(.white, .black)
      // .ios-scene's grid: 1 px lines every 56 px
      Canvas { ctx, size in
        for x in stride(from: 55.0, to: size.width, by: 56) { ctx.fill(Path(CGRect(x: x, y: 0, width: 1, height: size.height)), with: .color(GRID)) }
        for y in stride(from: 55.0, to: size.height, by: 56) { ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: 1)), with: .color(GRID)) }
      }
      ZStack(alignment: .topLeading) {
        Text("Liquid Glass controls").font(.system(size: 26, weight: .bold)).tracking(-0.26).offset(x: 44, y: 34)
        left.frame(width: 460).offset(x: 44, y: 96)
        right.frame(width: 400).offset(x: 534, y: 96)
      }
      .area()
    }
    .foregroundStyle(TEXT)
    .font(.system(size: 15))
  }

  private var left: some View {
    VStack(alignment: .leading, spacing: 14) {
      card {
        label("Size")
        HStack(spacing: 14) {
          Text("Small")
          Slider(value: $m.size, in: 0...100).controlSize(.large).tint(SWITCH_ON)
          Text("Large")
        }
        .font(.system(size: 16))
        .frame(height: 34)
      }
      HStack {
        Text("Enabled").font(.system(size: 16))
        Spacer()
        Toggle("Enabled", isOn: $m.enabled).toggleStyle(.switch).labelsHidden().controlSize(.large).tint(SWITCH_ON)
      }
      .padding(.vertical, 18)
      .padding(.horizontal, 20)
      .background(CARD, in: .rect(cornerRadius: 26))
      card {
        label("Mode")
        Picker("Mode", selection: $m.mode) {
          ForEach(Array(["A", "B", "C"].enumerated()), id: \.offset) { i, t in Text(t).tag(i) }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .controlSize(.large)
        .buttonSizing(.flexible)
        .frame(width: 384)
      }
      Text("macOS’s own controls: SwiftUI’s Slider, Toggle and segmented Picker, whose knobs and selection are Liquid Glass on macOS 26 and later. The Electron page draws iOS 26’s instead, sized and timed from an iPhone’s screen recording; iOS’s own controls only run on iOS, so these are what a Mac draws for the same things.")
        .font(.system(size: 13))
        .lineHeight(13, 1.5)
        .foregroundStyle(MUTED)
        .padding(EdgeInsets(top: 6, leading: 4, bottom: 0, trailing: 4))
    }
  }

  private var right: some View {
    VStack(alignment: .leading, spacing: 14) {
      card {
        label("Options")
        // the pop-up: macOS's own menu, which grows out of the field as the Electron page's glass does
        Menu {
          ForEach(["Option 1", "Option 2", "Option 3"], id: \.self) { o in
            Button { m.option = o } label: {
              if o == m.option { Label(o, systemImage: "checkmark") } else { Text(o) }
            }
          }
        } label: {
          HStack {
            Text(m.option).font(.system(size: 17))
            Spacer()
            Icon("chevrons", 16, width: 2.2)
          }
          .foregroundStyle(BLUE)
          .frame(height: 26)
          .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
      }
      ZStack(alignment: .bottom) {
        Photo("coast")
        HStack(spacing: 18) {
          // .ios-btn: 44 high, 24 px either side
          Button {} label: { Text("Tap Me").font(.system(size: 16, weight: .semibold)).buttonLabel(height: 44, padding: 24) }
            .buttonStyle(.glassProminent)
          Button {} label: { Text("Button").font(.system(size: 16, weight: .semibold)).foregroundStyle(.white).buttonLabel(height: 44, padding: 24) }
            .buttonStyle(.glass)
        }
        .buttonBorderShape(.capsule)
        .padding(.bottom, 40)
      }
      .frame(height: 300)
      .clipShape(.rect(cornerRadius: 26))
    }
  }

  /// .ios-card
  private func card(@ViewBuilder _ content: () -> some View) -> some View {
    VStack(alignment: .leading, spacing: 0) { content() }
      .padding(EdgeInsets(top: 14, leading: 20, bottom: 16, trailing: 20))
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(CARD, in: .rect(cornerRadius: 26))
  }

  private func label(_ t: String) -> some View {
    Text(t).font(.system(size: 13)).foregroundStyle(MUTED).padding(.bottom, 8)
  }
}
