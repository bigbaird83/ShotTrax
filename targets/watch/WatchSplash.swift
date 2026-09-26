import AVFoundation
import AVKit
import os
import SwiftUI
import UIKit

/// Watch open splash. Same brand clip as the phone, bundled in this target.
enum WatchSplashClip {
  /// 3.0s, portrait 784×1168, H.264. Audio track removed; played muted.
  static let resource = "WatchSplash"
  static let fileExtension = "mov"
  /// Frame 0 of the clip. Shown under the player and for Reduce Motion.
  static let firstFrame = "WatchSplashFirstFrame"
  static let aspectRatio = 784.0 / 1168.0
  /// Field behind the contained clip — the clip's own near-black edge.
  static let background = Color(red: 0, green: 1.0 / 255, blue: 1.0 / 255)
  /// Fade after the clip ends or a tap.
  static let fadeNanoseconds: UInt64 = 200_000_000
  /// Hard stop so a stalled video cannot leave the splash up.
  static let safetyNanoseconds: UInt64 = 5_000_000_000
  /// Reduce Motion holds the first-frame still this long instead of playing.
  static let reduceMotionNanoseconds: UInt64 = 1_200_000_000

  static let splashLog = Logger(subsystem: "com.shottrax.app.watch", category: "splash")

  static func loadPoster() -> UIImage? {
    if let named = UIImage(named: firstFrame) { return named }
    guard let url = Bundle.main.url(forResource: firstFrame, withExtension: "png") else { return nil }
    return UIImage(contentsOfFile: url.path)
  }
}

/// Full-screen overlay on the first time this process is actually on screen.
/// A background launch keeps the still up and does not start a player or a timer.
/// The app is mounted underneath. Tap skips.
struct WatchSplash: View {
  /// Scene phase from the Watch app. Playback starts on the first `.active`.
  var scenePhase: ScenePhase
  let onDone: () -> Void

  init(scenePhase: ScenePhase, onDone: @escaping () -> Void) {
    self.scenePhase = scenePhase
    self.onDone = onDone
    _poster = State(initialValue: WatchSplashClip.loadPoster())
  }

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var player: AVPlayer?
  @State private var poster: UIImage?
  @State private var dismissing = false
  @State private var opacity = 1.0
  @State private var playbackStarted = false
  @State private var loggedPending = false
  @State private var loggedMissingPoster = false

  var body: some View {
    ZStack {
      WatchSplashClip.background
      if let poster {
        Image(uiImage: poster)
          .resizable()
          .aspectRatio(WatchSplashClip.aspectRatio, contentMode: .fit)
      }
      if let player {
        // Contain, never fill: the clip is taller than any Watch screen.
        // The still stays underneath so the first decoded frame is never a black gap.
        VideoPlayer(player: player)
          .aspectRatio(WatchSplashClip.aspectRatio, contentMode: .fit)
          .allowsHitTesting(false)
      }
    }
    .ignoresSafeArea()
    .opacity(opacity)
    .contentShape(Rectangle())
    .onTapGesture { dismiss(fade: true, reason: "tap") }
    .accessibilityElement()
    .accessibilityLabel("ShotTraxx")
    .accessibilityHint("Tap to skip")
    .accessibilityAddTraits(.isButton)
    .onAppear {
      if poster == nil { poster = WatchSplashClip.loadPoster() }
      applyPhase(scenePhase)
    }
    .onChange(of: scenePhase) { _, phase in
      applyPhase(phase)
    }
    .task(id: playbackStarted) {
      guard playbackStarted else { return }
      await run()
    }
    .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { note in
      guard let item = note.object as? AVPlayerItem, item === player?.currentItem else { return }
      dismiss(fade: true, reason: "ended")
    }
    .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemFailedToPlayToEndTime)) { note in
      guard let item = note.object as? AVPlayerItem, item === player?.currentItem else { return }
      dismiss(fade: false, reason: "failed")
    }
    .onDisappear {
      WatchClubSession.shared.splashDidFinish()
    }
  }

  /// No player and no timer until the scene is active. Leaving active after
  /// that dismisses the clip; it does not start again.
  private func applyPhase(_ phase: ScenePhase) {
    if phase == .active {
      guard !playbackStarted, !dismissing else { return }
      playbackStarted = true
      return
    }
    if playbackStarted {
      dismiss(fade: false, reason: "scene left")
      return
    }
    guard !loggedPending else { return }
    loggedPending = true
    WatchSplashClip.splashLog.info("splash pending (scene not active)")
  }

  private func run() async {
    guard !dismissing else { return }
    if poster == nil {
      poster = WatchSplashClip.loadPoster()
    }
    if poster == nil, !loggedMissingPoster {
      loggedMissingPoster = true
      WatchSplashClip.splashLog.info("resource missing")
    }
    if reduceMotion {
      WatchSplashClip.splashLog.info("reduce motion still")
      try? await Task.sleep(nanoseconds: WatchSplashClip.reduceMotionNanoseconds)
      if Task.isCancelled || dismissing { return }
      dismiss(fade: true, reason: "ended")
      return
    }
    guard let url = Bundle.main.url(
      forResource: WatchSplashClip.resource,
      withExtension: WatchSplashClip.fileExtension
    ) else {
      if !loggedMissingPoster {
        WatchSplashClip.splashLog.info("resource missing")
      }
      dismiss(fade: false, reason: "failed")
      return
    }
    let next = AVPlayer(url: url)
    next.isMuted = true
    next.actionAtItemEnd = .pause
    player = next
    WatchSplashClip.splashLog.info("playback started")
    next.play()
    try? await Task.sleep(nanoseconds: WatchSplashClip.safetyNanoseconds)
    if Task.isCancelled || dismissing { return }
    dismiss(fade: false, reason: "safety")
  }

  private func dismiss(fade: Bool, reason: String) {
    guard !dismissing else { return }
    dismissing = true
    let reasonLabel = reason
    WatchSplashClip.splashLog.info("dismissed (reason: \(reasonLabel, privacy: .public))")
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
