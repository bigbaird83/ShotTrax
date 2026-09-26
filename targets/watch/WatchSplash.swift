import os
import SwiftUI
import UIKit

/// Watch open splash. Same brand clip as the phone, drawn as still frames.
/// A player view letterboxes its own surface and paints system transport chrome,
/// so this splash is one image per frame on a full-screen field.
enum WatchSplashClip {
  /// Frame 0 of the clip, for the logo cover and Reduce Motion.
  /// Contained on the largest Apple Watch screen (Ultra 3 is 422×514 px): 345×514,
  /// the same 392:584 art. Asset catalog, so the first frame does not decode a larger still.
  static let firstFrame = "WatchSplashFirstFrame"
  /// About 3.0s of the 392×584 clip, one imageset per frame (`WatchSplashFrame00`…).
  /// Frame 0 is that first-frame still, so the logo does not jump when motion starts.
  /// 12 fps is every other frame of the 24 fps source.
  static let frameCount = 37
  static let framesPerSecond = 12
  /// Motion begins on the first advance: one interval after the still, inside 1.5s.
  static let frameIntervalNanoseconds: UInt64 = 1_000_000_000 / UInt64(framesPerSecond)
  static let aspectRatio = 392.0 / 584.0
  /// Field behind the contained frames — the clip's own near-black edge.
  /// Stays up for the whole splash so Home cannot show through at any edge.
  static let background = Color(red: 0, green: 1.0 / 255, blue: 1.0 / 255)
  /// Fade after the clip ends or a tap.
  static let fadeNanoseconds: UInt64 = 200_000_000
  /// Ceiling from the first active run, so the splash cannot stick.
  static let safetyNanoseconds: UInt64 = 5_000_000_000
  /// Reduce Motion holds the first frame this long instead of advancing.
  static let reduceMotionNanoseconds: UInt64 = 1_200_000_000

  static let splashLog = Logger(subsystem: "com.shottrax.app.watch", category: "splash")

  /// Decoded before the first frame that shows the cover. Not loaded in onAppear or .task.
  static let poster: UIImage = loadPoster() ?? UIImage()

  static func loadPoster() -> UIImage? {
    if let named = UIImage(named: firstFrame) { return named }
    guard let url = Bundle.main.url(forResource: firstFrame, withExtension: "png") else { return nil }
    return UIImage(contentsOfFile: url.path)
  }

  static func frameName(_ index: Int) -> String {
    String(format: "WatchSplashFrame%02d", index)
  }
}

/// Brand field and the frame-0 logo. No phase or session gate.
struct WatchSplashCover: View {
  var body: some View {
    let poster = WatchSplashClip.poster
    ZStack {
      WatchSplashClip.background
      Image(uiImage: poster)
        .resizable()
        .aspectRatio(WatchSplashClip.aspectRatio, contentMode: .fit)
    }
    .ignoresSafeArea()
  }
}

/// Full-screen overlay on the first time this process is actually on screen.
/// A background launch keeps the still up and does not start a timer.
/// The app is mounted underneath. Tap skips.
struct WatchSplash: View {
  /// Scene phase from the Watch app. Frames advance on the first `.active`.
  var scenePhase: ScenePhase
  let onDone: () -> Void

  init(scenePhase: ScenePhase, onDone: @escaping () -> Void) {
    self.scenePhase = scenePhase
    self.onDone = onDone
  }

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var dismissing = false
  @State private var opacity = 1.0
  @State private var playbackStarted = false
  @State private var loggedPending = false
  @State private var loggedMissingPoster = false
  @State private var frameIndex = 0

  var body: some View {
    ZStack {
      // Unconditional for the life of the splash. The frame is contained, so this
      // field has to stay up or Home shows along the edges.
      WatchSplashClip.background
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
      Image(WatchSplashClip.frameName(frameIndex))
        .resizable()
        .aspectRatio(WatchSplashClip.aspectRatio, contentMode: .fit)
        .animation(nil, value: frameIndex)
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
      applyPhase(scenePhase)
    }
    .onChange(of: scenePhase) { _, phase in
      applyPhase(phase)
    }
    .task(id: playbackStarted) {
      guard playbackStarted else { return }
      await run()
    }
    .onDisappear {
      WatchClubSession.shared.splashDidFinish()
    }
  }

  /// No timer until the scene is active. Leaving active after that dismisses
  /// the splash; it does not start again.
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
    let missingPoster = WatchSplashClip.poster.size.width <= 0
    let missingFrames = UIImage(named: WatchSplashClip.frameName(0)) == nil
      || UIImage(named: WatchSplashClip.frameName(WatchSplashClip.frameCount - 1)) == nil
    if (missingPoster || missingFrames) && !loggedMissingPoster {
      loggedMissingPoster = true
      WatchSplashClip.splashLog.info("resource missing")
    }
    startSafety()
    if reduceMotion {
      WatchSplashClip.splashLog.info("reduce motion still")
      try? await Task.sleep(nanoseconds: WatchSplashClip.reduceMotionNanoseconds)
      if Task.isCancelled || dismissing { return }
      dismiss(fade: true, reason: "ended")
      return
    }
    if missingFrames {
      dismiss(fade: false, reason: "failed")
      return
    }
    WatchSplashClip.splashLog.info("playback started")
    await advanceFrames()
  }

  /// One image at a time, starting on frame 0 (already showing). The first
  /// change is one interval later, so motion begins well inside 1.5s of the logo.
  private func advanceFrames() async {
    for index in 1..<WatchSplashClip.frameCount {
      try? await Task.sleep(nanoseconds: WatchSplashClip.frameIntervalNanoseconds)
      if Task.isCancelled || dismissing { return }
      var transaction = Transaction()
      transaction.disablesAnimations = true
      withTransaction(transaction) {
        frameIndex = index
      }
    }
    try? await Task.sleep(nanoseconds: WatchSplashClip.frameIntervalNanoseconds)
    if Task.isCancelled || dismissing { return }
    dismiss(fade: true, reason: "ended")
  }

  /// 5 s from the first active `run()`. Ignored once dismissed. A background
  /// launch never reaches `run()`.
  private func startSafety() {
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: WatchSplashClip.safetyNanoseconds)
      guard !dismissing else { return }
      dismiss(fade: false, reason: "safety")
    }
  }

  private func dismiss(fade: Bool, reason: String) {
    guard !dismissing else { return }
    dismissing = true
    let reasonLabel = reason
    WatchSplashClip.splashLog.info("dismissed (reason: \(reasonLabel, privacy: .public))")
    guard fade else {
      onDone()
      return
    }
    withAnimation(.easeOut(duration: Double(WatchSplashClip.fadeNanoseconds) / 1_000_000_000)) {
      opacity = 0
    }
    Task { @MainActor in
      try? await Task.sleep(nanoseconds: WatchSplashClip.fadeNanoseconds)
      onDone()
    }
  }
}
