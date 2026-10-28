// demo/demos/video.js in SwiftUI: glass over video, the player's controls and a lens bending each frame as it plays.
// The clip is demo/assets/orbit.webm as H.264 (AVFoundation doesn't play WebM), made by scripts/native.mjs.
import AVFoundation
import AppKit
import SwiftUI

/// The clip, muted and looping, filling its frame (object-fit: cover).
final class Clip: ObservableObject {
  let player: AVQueuePlayer?
  private var looper: AVPlayerLooper?
  private var observer: Any?
  @Published var time = 0.0
  @Published var duration = 1.0
  @Published var playing = true

  init() {
    let url = Assets.build.appendingPathComponent("orbit.mp4")
    guard FileManager.default.fileExists(atPath: url.path) else {
      player = nil
      return
    }
    let item = AVPlayerItem(url: url)
    let p = AVQueuePlayer()
    p.isMuted = true
    looper = AVPlayerLooper(player: p, templateItem: item)
    player = p
    observer = p.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 4), queue: .main) { [weak self] t in
      self?.time = t.seconds
      if let d = p.currentItem?.duration.seconds, d.isFinite, d > 0 { self?.duration = d }
    }
    p.play()
  }

  func toggle() {
    playing.toggle()
    if playing { player?.play() } else { player?.pause() }
  }

  deinit {
    if let observer { player?.removeTimeObserver(observer) }
    player?.pause()
  }
}

struct ClipView: NSViewRepresentable {
  let player: AVPlayer?
  func makeNSView(context: Context) -> NSView {
    let v = NSView()
    let layer = AVPlayerLayer(player: player)
    layer.videoGravity = .resizeAspectFill
    v.layer = layer
    v.wantsLayer = true
    return v
  }
  func updateNSView(_ v: NSView, context: Context) {}
}

struct VideoDemo: View {
  @StateObject private var clip = Clip()

  var body: some View {
    ZStack {
      if clip.player != nil { ClipView(player: clip.player) } else {
        Text("No video: brew install ffmpeg, then run again (scripts/native.mjs makes native/.build/orbit.mp4)").foregroundStyle(Color.muted).area()
      }
      // .video-title (Electron: variant regular, 20 px corners)
      VStack(alignment: .leading, spacing: 0) {
        Text("Earth from the ISS").font(.system(size: 16, weight: .bold)).lineHeight(16)
        Text("NASA, High Definition Earth Viewing").font(.system(size: 12, weight: .medium)).lineHeight(12).opacity(0.85)
      }
      .foregroundStyle(.white)
      .padding(.vertical, 12)
      .padding(.horizontal, 18)
      .glassEffect(.regular, in: .rect(cornerRadius: 20))
      .pin(.topLeading, left: 260, top: 30)
      // .lens-badge: 170 px (Electron: a dome, bevelMode 1, that magnifies; macOS's glass has no dome: .clear)
      Color.clear.frame(width: 170, height: 170).glassEffect(.clear, in: .circle).pin(.topTrailing, top: 160, right: 60)
      player.pin(.bottom, left: 224, bottom: 30)
    }
  }

  /// .player: 560 × 64 (Electron: variant regular, a capsule; its buttons on circles of clear glass, interactive)
  private var player: some View {
    HStack(spacing: 14) {
      button(clip.playing ? "pause" : "play") { clip.toggle() }
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule().fill(.white.opacity(0.3))
          Rectangle().fill(.white).frame(width: geo.size.width * min(clip.time / clip.duration, 1))
        }
        .clipShape(Capsule())
      }
      .frame(height: 6)
      Text(String(format: "0:%02d", Int(clip.time))).font(.system(size: 13, weight: .medium)).monospacedDigit().frame(width: 40, alignment: .leading)
      button("volume") {}
    }
    .foregroundStyle(.white)
    .padding(.horizontal, 16)
    .frame(width: 560, height: 64)
    .glassEffect(.regular, in: .capsule)
  }

  private func button(_ icon: String, _ action: @escaping () -> Void) -> some View {
    Button(action: action) { Icon(icon).frame(width: 44, height: 44).contentShape(Circle()) }
      .buttonStyle(.plain)
      .glassEffect(.clear.interactive(), in: .circle)
  }
}
