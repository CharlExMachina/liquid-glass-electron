// Small helpers for the demos, as demo/demos/lib.js is for the Electron gallery's: the same icons (lib.js's SVG paths,
// parsed and stroked), photos, colours, and placing things the way the gallery's CSS does (position: absolute).
import AppKit
import SwiftUI

// ---------------------------------------------------------------- assets

enum Assets {
  /// demo/assets, passed in by scripts/native.mjs (--assets=)
  nonisolated(unsafe) static var dir = URL(fileURLWithPath: "demo/assets")
  /// native/.build, where the build puts what macOS can't read from demo/assets (the video, as MP4)
  nonisolated(unsafe) static var build = URL(fileURLWithPath: "native/.build")
  nonisolated(unsafe) private static var images: [String: NSImage] = [:]

  static func image(_ name: String) -> NSImage? {
    if let hit = images[name] { return hit }
    let image = NSImage(contentsOf: dir.appendingPathComponent("\(name).jpg"))
    images[name] = image
    return image
  }
}

/// A full-bleed photo (lib.js's photo(): object-fit: cover).
struct Photo: View {
  let name: String
  init(_ name: String) { self.name = name }
  var body: some View {
    Color.clear.overlay {
      if let image = Assets.image(name) { Image(nsImage: image).resizable().scaledToFill() } else { Color.gray }
    }
    .clipped()
  }
}

// ---------------------------------------------------------------- state

/// A demo's state: a value views can bind to (@StateObject private var x = Store(0)). SwiftUI's @State is a macro, and
/// the command line tools ship no macro plugins.
final class Store<Value>: ObservableObject {
  @Published var value: Value
  init(_ value: Value) { self.value = value }
}

// ---------------------------------------------------------------- colours

extension Color {
  /// #rrggbb, with an opacity
  init(hex: UInt32, _ opacity: Double = 1) {
    self.init(.sRGB, red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255, opacity: opacity)
  }
  /// a colour for light and one for dark, following the window's appearance (the gallery's --text, --muted, ...)
  static func themed(_ light: Color, _ dark: Color) -> Color {
    Color(NSColor(name: nil) { a in NSColor(a.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light) })
  }
  // app.css's colours
  static let text = themed(Color(hex: 0x0b0b0f), Color(hex: 0xf4f5f8))
  static let muted = themed(Color(.sRGB, red: 20 / 255, green: 20 / 255, blue: 30 / 255, opacity: 0.6), Color(.sRGB, red: 235 / 255, green: 235 / 255, blue: 245 / 255, opacity: 0.62))
  static let accentBlue = Color(hex: 0x0a84ff)
  static let page = themed(Color(hex: 0xe9ecf2), Color(hex: 0x0c0d10))
  /// rgb(127 127 127 / a), the gallery's neutral wash
  static func grey(_ a: Double) -> Color { Color(.sRGB, white: 127 / 255, opacity: a) }
}

// ---------------------------------------------------------------- layout

extension View {
  /// position: absolute, as the gallery's CSS places things: at `alignment` in its container, inset by the CSS
  /// left/top/right/bottom. (A frame that fills the container and aligns the view in it: what isn't the view takes no
  /// clicks.)
  func pin(_ alignment: Alignment = .topLeading, left: CGFloat = 0, top: CGFloat = 0, right: CGFloat = 0, bottom: CGFloat = 0) -> some View {
    frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
      .padding(EdgeInsets(top: top, leading: left, bottom: bottom, trailing: right))
  }

  /// the stage's own area, right of the sidebar (app.css's .area: left 224px)
  func area() -> some View { padding(.leading, 224) }

  /// text on a photo: white, with app.css's shadow
  func onPhoto(_ radius: CGFloat = 1, _ y: CGFloat = 1, _ opacity: Double = 0.35) -> some View {
    foregroundStyle(.white).shadow(color: .black.opacity(opacity), radius: radius, y: y)
  }

  /// CSS's line-height for text of `size` (SwiftUI's own is about 1.2): the extra leading between lines, and half of
  /// it above and below
  func lineHeight(_ size: CGFloat, _ lh: CGFloat = 1.4) -> some View {
    let extra = max(0, (lh - 1.2) * size)
    return lineSpacing(extra).padding(.vertical, extra / 2)
  }

  /// CSS's text-transform: uppercase with letter-spacing, for the small headings
  func smallCaps(_ size: CGFloat = 11, tracking: CGFloat = 0.06) -> some View {
    font(.system(size: size, weight: .semibold)).tracking(size * tracking).textCase(.uppercase)
  }
}

/// CSS's cubic-bezier(), as a SwiftUI animation (control points past 1 overshoot, as in CSS)
func bezier(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ seconds: Double) -> Animation {
  .timingCurve(x1, y1, x2, y2, duration: seconds)
}

// ---------------------------------------------------------------- icons: lib.js's, stroked in the text colour

let ICONS: [String: String] = [
  "back": "M15 5l-7 7 7 7",
  "forward": "M9 5l7 7-7 7",
  "share": "M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7",
  "plus": "M12 5v14M5 12h14",
  "more": "M5 12h.01M12 12h.01M19 12h.01",
  "search": "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4.2-4.2",
  "home": "M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z",
  "photo": "M4 6h16v12H4zM4 15l4-4 4 4 3-3 5 5",
  "music": "M9 18V6l11-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z",
  "heart": "M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z",
  "star": "M12 3l2.7 5.6 6.2.9-4.5 4.4 1 6.1L12 17.1 6.6 20l1-6.1L3.1 9.5l6.2-.9z",
  "gear": "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z",
  "bell": "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  "play": "M7 4l13 8-13 8z",
  "pause": "M7 4h4v16H7zM14 4h4v16h-4z",
  "volume": "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11",
  "sun": "M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  "message": "M21 12a8 8 0 01-11.9 7L3 21l2-6A8 8 0 1121 12z",
  "mail": "M3 6h18v12H3zM3 7l9 6 9-6",
  "folder": "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  "trash": "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  "close": "M6 6l12 12M18 6L6 18",
  "check": "M5 12l5 5 9-10",
  "map": "M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  "camera": "M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 100 7 3.5 3.5 0 000-7z",
  "edit": "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  "pen": "M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z",
  "chevrons": "M8 9.5l4-4 4 4M8 14.5l4 4 4-4",
]

/// An icon, lib.js's icon(): a 24 × 24 SVG path stroked 1.8 wide (at 24) in the current colour, round caps and joins.
/// 20 px, as app.css's .icon draws them whatever size icon() is given, unless a demo's CSS sizes it.
struct Icon: View {
  let name: String, size: CGFloat, width: CGFloat
  init(_ name: String, _ size: CGFloat = 20, width: CGFloat = 1.8) {
    self.name = name
    self.size = size
    self.width = width
  }
  var body: some View {
    SVGShape(d: ICONS[name] ?? ICONS["more"]!)
      .stroke(style: StrokeStyle(lineWidth: width * size / 24, lineCap: .round, lineJoin: .round))
      .frame(width: size, height: size)
  }
}

/// An SVG path's d, in a 24 × 24 view box scaled to the frame.
struct SVGShape: Shape {
  let d: String
  func path(in rect: CGRect) -> Path {
    let s = min(rect.width, rect.height) / 24
    return SVGShape.parse(d).applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: s, y: s))
  }

  nonisolated(unsafe) private static var cache: [String: Path] = [:]

  /// The path data's commands (M L H V C S Q A Z, absolute and relative), as a Path.
  static func parse(_ d: String) -> Path {
    if let hit = cache[d] { return hit }
    let chars = Array(d.utf8)
    var i = 0, path = Path()
    var cur = CGPoint.zero, start = CGPoint.zero, lastControl: CGPoint?
    var cmd: UInt8 = 0
    func skip() { while i < chars.count, chars[i] == 32 || chars[i] == 44 || chars[i] == 10 { i += 1 } }
    func number() -> CGFloat {
      skip()
      let s = i
      if i < chars.count, chars[i] == 45 || chars[i] == 43 { i += 1 }
      var dot = false
      while i < chars.count {
        let c = chars[i]
        if c >= 48 && c <= 57 { i += 1 } else if c == 46 && !dot { dot = true; i += 1 } else { break }
      }
      return CGFloat(Double(String(decoding: chars[s..<i], as: UTF8.self)) ?? 0)
    }
    // an arc's flags are one digit each, and may run into what follows ("a7 7 0 100 14")
    func flag() -> Bool {
      skip()
      defer { i += 1 }
      return chars[i] == 49
    }
    while i < chars.count {
      skip()
      guard i < chars.count else { break }
      let c = chars[i]
      if (c >= 65 && c <= 90) || (c >= 97 && c <= 122) {
        cmd = c
        i += 1
      }
      let rel = cmd >= 97
      let up = rel ? cmd - 32 : cmd
      let o = rel ? cur : .zero
      switch up {
      case 77: // M
        cur = CGPoint(x: o.x + number(), y: o.y + number())
        start = cur
        path.move(to: cur)
        cmd = rel ? 108 : 76 // further pairs are lines
        lastControl = nil
      case 76: // L
        cur = CGPoint(x: o.x + number(), y: o.y + number())
        path.addLine(to: cur)
        lastControl = nil
      case 72: // H
        cur.x = (rel ? cur.x : 0) + number()
        path.addLine(to: cur)
        lastControl = nil
      case 86: // V
        cur.y = (rel ? cur.y : 0) + number()
        path.addLine(to: cur)
        lastControl = nil
      case 67: // C
        let c1 = CGPoint(x: o.x + number(), y: o.y + number()), c2 = CGPoint(x: o.x + number(), y: o.y + number())
        cur = CGPoint(x: o.x + number(), y: o.y + number())
        path.addCurve(to: cur, control1: c1, control2: c2)
        lastControl = c2
      case 83: // S
        let c1 = lastControl.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
        let c2 = CGPoint(x: o.x + number(), y: o.y + number())
        cur = CGPoint(x: o.x + number(), y: o.y + number())
        path.addCurve(to: cur, control1: c1, control2: c2)
        lastControl = c2
      case 81: // Q
        let c1 = CGPoint(x: o.x + number(), y: o.y + number())
        cur = CGPoint(x: o.x + number(), y: o.y + number())
        path.addQuadCurve(to: cur, control: c1)
        lastControl = nil
      case 65: // A
        let rx = number(), ry = number(), rot = number(), large = flag(), sweep = flag()
        let to = CGPoint(x: o.x + number(), y: o.y + number())
        arc(&path, from: cur, to: to, rx: rx, ry: ry, rotation: rot, large: large, sweep: sweep)
        cur = to
        lastControl = nil
      case 90: // Z
        path.closeSubpath()
        cur = start
        lastControl = nil
        continue
      default:
        i += 1
        continue
      }
    }
    cache[d] = path
    return path
  }

  /// An SVG arc (endpoints, radii, flags) as cubic Béziers, one per quarter turn or less.
  private static func arc(_ path: inout Path, from p0: CGPoint, to p1: CGPoint, rx rx0: CGFloat, ry ry0: CGFloat, rotation: CGFloat, large: Bool, sweep: Bool) {
    var rx = abs(rx0), ry = abs(ry0)
    guard rx > 0, ry > 0, p0 != p1 else { path.addLine(to: p1); return }
    let phi = rotation * .pi / 180, cp = cos(phi), sp = sin(phi)
    let dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2
    let x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy
    let l = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry)
    if l > 1 { rx *= sqrt(l); ry *= sqrt(l) }
    let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1
    let k = (large == sweep ? -1 : 1) * sqrt(max(0, num / den))
    let cx1 = k * rx * y1 / ry, cy1 = -k * ry * x1 / rx
    let cx = cp * cx1 - sp * cy1 + (p0.x + p1.x) / 2, cy = sp * cx1 + cp * cy1 + (p0.y + p1.y) / 2
    func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
      let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
      return a
    }
    let t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
    var dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
    if !sweep && dt > 0 { dt -= 2 * .pi } else if sweep && dt < 0 { dt += 2 * .pi }
    let n = Int(ceil(abs(dt) / (.pi / 2))), step = dt / CGFloat(n)
    let a = 4 / 3 * tan(step / 4)
    func point(_ t: CGFloat) -> CGPoint {
      let x = rx * cos(t), y = ry * sin(t)
      return CGPoint(x: cx + cp * x - sp * y, y: cy + sp * x + cp * y)
    }
    func deriv(_ t: CGFloat) -> CGPoint {
      let x = -rx * sin(t), y = ry * cos(t)
      return CGPoint(x: cp * x - sp * y, y: sp * x + cp * y)
    }
    var t = t1
    for _ in 0..<n {
      let s = point(t), e = point(t + step), ds = deriv(t), de = deriv(t + step)
      path.addCurve(to: e, control1: CGPoint(x: s.x + a * ds.x, y: s.y + a * ds.y), control2: CGPoint(x: e.x - a * de.x, y: e.y - a * de.y))
      t += step
    }
  }
}

// ---------------------------------------------------------------- glass

/// What the .glass and .glassProminent button styles put around a label (measured, at the regular control size): a
/// label is sized less these to come out the size the Electron page's button is.
let BUTTON_PAD = (h: 10.0, v: 4.0)

extension View {
  /// a button label that comes out w × h (or h high and `padding` either side of its content) in a glass button style
  func buttonLabel(height: CGFloat, padding: CGFloat? = nil, width: CGFloat? = nil) -> some View {
    self
      .padding(.horizontal, padding.map { $0 - BUTTON_PAD.h } ?? 0)
      .frame(width: width.map { $0 - 2 * BUTTON_PAD.h }, height: height - 2 * BUTTON_PAD.v)
  }
}
