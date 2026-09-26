import Foundation

/// Plain decisions for the round Live Activity: when content goes stale, and
/// when a round the golfer swiped away may start again. Foundation only, so CI
/// compiles and runs .github/scripts/live-round-policy-tests against it.
enum LiveRoundPolicy {
  /// Lock Screen / Dynamic Island content shows as stale this long after the
  /// fix its yards came from (GPS stopped, or the app was killed).
  static let staleAfterS: TimeInterval = 60
  /// Unchanged yards are re-sent when what is shown is this close to going
  /// stale, so a golfer standing still keeps live yards.
  static let refreshBeforeStaleS: TimeInterval = 30

  /// Stale date for content computed from a fix taken at `fixTime`. No fix → no yards → nil.
  static func staleDate(fixTime: Date?) -> Date? {
    fixTime.map { $0.addingTimeInterval(staleAfterS) }
  }

  /// Unchanged content still needs sending when a newer fix would push out a
  /// stale date that is about to pass.
  static func needsStaleRefresh(sentStaleDate: Date?, newStaleDate: Date?, now: Date) -> Bool {
    guard let newStaleDate else { return false }
    guard let sentStaleDate else { return true }
    return newStaleDate > sentStaleDate && sentStaleDate.timeIntervalSince(now) < refreshBeforeStaleS
  }

  /// The dismissal to keep once a payload for `roundId` arrives: a different
  /// round clears it, the same round keeps it.
  static func dismissedRoundId(afterSyncOf roundId: String, current: String?) -> String? {
    current == roundId ? current : nil
  }

  /// A round the golfer swiped away gets no new activity (and no location).
  static func mayStart(roundId: String, dismissedRoundId: String?) -> Bool {
    roundId != dismissedRoundId
  }

  /// The current activity needs a state watch: it is set and is not the one
  /// already watched. Covers an activity adopted from `Activity.activities`
  /// (app relaunched mid-round) as well as a newly requested one.
  static func needsWatch(activityId: String?, watchedActivityId: String?) -> Bool {
    guard let activityId else { return false }
    return activityId != watchedActivityId
  }

  /// After an activity leaves `.active`: remember its round only when the
  /// golfer dismissed it, not when the app ended it (round over, new round).
  static func dismissedRoundId(
    afterLeaving roundId: String,
    userDismissed: Bool,
    endedByApp: Bool,
    current: String?
  ) -> String? {
    userDismissed && !endedByApp ? roundId : current
  }
}
