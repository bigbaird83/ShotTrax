import SwiftUI

@main
struct ShotTraxxWatchApp: App {
  @StateObject private var session = WatchClubSession.shared
  /// App-lifetime state: plays on cold start, not when returning from background.
  /// Never during a live round — watchOS can relaunch mid-round and the golfer
  /// needs the hole, not the clip.
  @State private var showSplash = !WatchClubSession.shared.liveHoleInProgress

  init() {
    // Background launch (complication transfer / application context): the
    // session delegate must exist before any view does, or the widget stays stale.
    _ = WatchClubSession.shared
  }

  var body: some Scene {
    WindowGroup {
      ZStack {
        ContentView()
          .environmentObject(session)
        if showSplash {
          WatchSplash { showSplash = false }
        }
      }
      .onChange(of: session.liveHoleInProgress) { _, live in
        // A round the phone starts while the clip plays takes the screen at once.
        if live { showSplash = false }
      }
    }
    .backgroundTask(.watchConnectivity) {
      await WatchClubSession.drainConnectivity()
    }
  }
}
