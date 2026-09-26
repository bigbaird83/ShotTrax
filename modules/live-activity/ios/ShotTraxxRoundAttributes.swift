import ActivityKit
import Foundation

/// The round shown on the Lock Screen and in the Dynamic Island.
///
/// Two copies of this file exist: modules/live-activity/ios (the app) and
/// targets/live-activity (the widget). ActivityKit matches them by name and
/// fields, so they must stay identical — liveActivity.test.ts checks that.
struct ShotTraxxRoundAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var hole: Int
    var par: Int?
    /// Yards from a fix of 25 m or better. Nil = no good fix (shown as —).
    var front: Int?
    var middle: Int?
    var back: Int?
    /// The course has a green / front and back points for this hole.
    var hasGreen: Bool
    var hasEnds: Bool
    /// "thru 6, +3" or "Hole 1".
    var scoreLine: String
    /// "7 Iron · 152 yd".
    var lastShot: String?
    /// "Ann leads +1 · 3 skins riding".
    var groupLine: String?
  }

  var courseName: String
}
