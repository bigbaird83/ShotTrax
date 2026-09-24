import SwiftUI

@main
struct ShotTraxxWatchApp: App {
  @StateObject private var session = WatchClubSession.shared

  init() {
    // Background launch (complication transfer / application context): the
    // session delegate must exist before any view does, or the widget stays stale.
    _ = WatchClubSession.shared
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(session)
    }
    .backgroundTask(.watchConnectivity) {
      await WatchClubSession.drainConnectivity()
    }
  }
}
