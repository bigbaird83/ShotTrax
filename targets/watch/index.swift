import SwiftUI

@main
struct ShotTraxxWatchApp: App {
  @StateObject private var session = WatchClubSession.shared
  /// App-lifetime state: plays on cold start, not when returning from background.
  @State private var showSplash = true

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
    }
    .backgroundTask(.watchConnectivity) {
      await WatchClubSession.drainConnectivity()
    }
  }
}
