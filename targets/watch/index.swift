import HealthKit
import SwiftUI
import WatchKit

final class ShotTraxxWatchDelegate: NSObject, WKApplicationDelegate {
  /// watchOS relaunches the app to reclaim an HKWorkoutSession that outlived
  /// the process. Hand that session back so a second one is never created.
  func handleActiveWorkoutRecovery() {
    WatchClubSession.shared.beginGolfWorkoutRecovery()
    HKHealthStore().recoverActiveWorkoutSession { session, error in
      DispatchQueue.main.async {
        WatchClubSession.shared.finishGolfWorkoutRecovery(session, error: error)
      }
    }
  }
}

@main
struct ShotTraxxWatchApp: App {
  @WKApplicationDelegateAdaptor(ShotTraxxWatchDelegate.self) private var appDelegate
  @StateObject private var session = WatchClubSession.shared

  init() {
    // Background launch (complication transfer / application context): the
    // session delegate must exist before any view does, or the widget stays stale.
    _ = appDelegate
    _ = WatchClubSession.shared
    // Cover the first open before any scene callback can raise When In Use.
    // A fresh live round skips the clip, so it does not wait.
    if !WatchClubSession.shared.liveHoleInProgress {
      WatchClubSession.shared.prepareLaunchSplash()
    }
  }

  var body: some Scene {
    WindowGroup {
      ShotTraxxWatchRoot(session: session)
    }
    .backgroundTask(.watchConnectivity) {
      await WatchClubSession.drainConnectivity()
    }
  }
}

/// Cold start overlay. A background launch must not play or time out the clip.
private struct ShotTraxxWatchRoot: View {
  @ObservedObject var session: WatchClubSession
  @Environment(\.scenePhase) private var scenePhase
  /// App-lifetime state: plays on the first active scene, not on a warm resume
  /// and not when a background launch already existed. Never during a fresh
  /// live round — the golfer needs the hole, not the clip.
  @State private var showSplash = !WatchClubSession.shared.liveHoleInProgress
  @State private var loggedLiveSkip = false

  var body: some View {
    ZStack {
      ContentView()
        .environmentObject(session)
      if showSplash {
        WatchSplash(scenePhase: scenePhase) { showSplash = false }
      }
    }
    .onAppear { skipSplashForLiveRound() }
    .onChange(of: scenePhase) { _, _ in
      skipSplashForLiveRound()
    }
    .onChange(of: session.liveHoleInProgress) { _, live in
      // A round the phone starts while the clip plays takes the screen at once.
      if live { skipSplashForLiveRound() }
    }
  }

  private func skipSplashForLiveRound() {
    guard session.liveHoleInProgress else { return }
    if !loggedLiveSkip {
      loggedLiveSkip = true
      WatchSplashClip.splashLog.info("skipped for live round")
    }
    showSplash = false
    session.splashDidFinish()
  }
}
