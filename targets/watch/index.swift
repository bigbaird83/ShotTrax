import SwiftUI

@main
struct ShotTraxxWatchApp: App {
  @StateObject private var session = WatchClubSession()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(session)
    }
  }
}
