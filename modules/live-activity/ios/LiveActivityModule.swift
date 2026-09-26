import ExpoModulesCore

/// JS bridge for the round Live Activity. The work lives in RoundLiveActivity
/// (plain Swift, no Expo), which CI typechecks on its own.
public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ShotTraxxLiveActivity")

    /// Live Activities available and allowed for this app (iOS 16.2+).
    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return RoundLiveActivity.activitiesEnabled
      }
      return false
    }

    /// Start or update the round. JSON is the LiveActivityPayload from src/domain/liveActivity.ts.
    AsyncFunction("syncRound") { (json: String) -> Bool in
      if #available(iOS 16.2, *) {
        return RoundLiveActivity.shared.sync(json: json)
      }
      return false
    }.runOnQueue(.main)

    /// End the round's activity and stop its location.
    AsyncFunction("endRound") { () in
      if #available(iOS 16.2, *) {
        RoundLiveActivity.shared.end()
      }
    }.runOnQueue(.main)
  }
}
