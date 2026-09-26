import AVFoundation
import AVKit
import SwiftUI

/// Watch open splash. Same brand clip as the phone, bundled in this target.
enum WatchSplashClip {
  /// 3.0s, portrait 784×1168, H.264. Audio track removed; played muted.
  static let resource = "WatchSplash"
  static let fileExtension = "mov"
  static let aspectRatio = 784.0 / 1168.0
  /// Field behind the contained clip — the clip's own near-black edge.
  static let background = Color(red: 0, green: 1.0 / 255, blue: 1.0 / 255)
  /// Fade after the clip ends or a tap.
  static let fadeNanoseconds: UInt64 = 200_000_000
  /// Hard stop so a stalled video cannot leave the splash up.
  static let safetyNanoseconds: UInt64 = 5_000_000_000
  /// Reduce Motion holds the first frame this long instead of playing.
  static let reduceMotionNanoseconds: UInt64 = 600_000_000
}

/// Full-screen overlay on cold start only. The app is mounted underneath so the
/// session and round state load while the clip plays. Tap skips.
struct WatchSplash: View {
  let onDone: () -> Void

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var player: AVPlayer?
  @State private var dismissing = false
  @State private var opacity = 1.0

  var body: some View {
    ZStack {
      WatchSplashClip.background
      if let player {
        // Contain, never fill: the clip is taller than any Watch screen.
        VideoPlayer(player: player)
          .aspectRatio(WatchSplashClip.aspectRatio, contentMode: .fit)
          .allowsHitTesting(false)
      }
    }
    .ignoresSafeArea()
    .opacity(opacity)
    .contentShape(Rectangle())
    .onTapGesture { dismiss(fade: true) }
    .accessibilityElement()
    .accessibilityLabel("ShotTraxx")
    .accessibilityHint("Tap to skip")
    .accessibilityAddTraits(.isButton)
    .task { await run() }
    .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { note in
      guard let item = note.object as? AVPlayerItem, item === player?.currentItem else { return }
      dismiss(fade: true)
    }
    .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemFailedToPlayToEndTime)) { note in
      guard let item = note.object as? AVPlayerItem, item === player?.currentItem else { return }
      dismiss(fade: false)
    }
  }

  private func run() async {
    guard player == nil, !dismissing else { return }
    guard let url = Bundle.main.url(
      forResource: WatchSplashClip.resource,
      withExtension: WatchSplashClip.fileExtension
    ) else {
      dismiss(fade: false)
      return
    }
    let next = AVPlayer(url: url)
    next.isMuted = true
    next.actionAtItemEnd = .pause
    player = next
    if reduceMotion {
      // First frame only, then out.
      try? await Task.sleep(nanoseconds: WatchSplashClip.reduceMotionNanoseconds)
      dismiss(fade: true)
      return
    }
    next.play()
    try? await Task.sleep(nanoseconds: WatchSplashClip.safetyNanoseconds)
    dismiss(fade: false)
  }

  private func dismiss(fade: Bool) {
    guard !dismissing else { return }
    dismissing = true
    player?.pause()
    guard fade else {
      onDone()
      return
    }
    withAnimation(.easeOut(duration: Double(WatchSplashClip.fadeNanoseconds) / 1_000_000_000)) {
      opacity = 0
    }
    Task {
      try? await Task.sleep(nanoseconds: WatchSplashClip.fadeNanoseconds)
      onDone()
    }
  }
}
