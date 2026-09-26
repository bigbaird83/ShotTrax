import ActivityKit
import CoreLocation
import Foundation

/// A green point sent by the app. Never invented: missing points stay nil.
struct LivePoint: Equatable {
  let lat: Double
  let lng: Double
}

/// What the app sends for the hole in play (JSON from JS).
struct LiveRoundPayload: Equatable {
  /// The app's round id. A swipe-away is remembered per round.
  var roundId: String
  var courseName: String
  var hole: Int
  var par: Int?
  var front: LivePoint?
  var middle: LivePoint?
  var back: LivePoint?
  var scoreLine: String
  var lastShot: String?
  var groupLine: String?

  init?(json: String) {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let hole = object["hole"] as? Int,
      let roundId = object["roundId"] as? String, !roundId.isEmpty
    else { return nil }
    func point(_ key: String) -> LivePoint? {
      guard
        let raw = object[key] as? [String: Any],
        let lat = raw["lat"] as? Double,
        let lng = raw["lng"] as? Double,
        lat.isFinite, lng.isFinite, abs(lat) <= 90, abs(lng) <= 180, !(lat == 0 && lng == 0)
      else { return nil }
      return LivePoint(lat: lat, lng: lng)
    }
    func text(_ key: String) -> String? {
      guard let value = object[key] as? String, !value.isEmpty else { return nil }
      return value
    }
    self.roundId = roundId
    self.courseName = text("courseName") ?? "Round"
    self.hole = hole
    self.par = object["par"] as? Int
    self.front = point("front")
    self.middle = point("middle")
    self.back = point("back")
    self.scoreLine = text("scoreLine") ?? ""
    self.lastShot = text("lastShot")
    self.groupLine = text("groupLine")
  }
}

/// Yards to a green point from a live fix. Same bands as the hole screen:
/// accuracy worse than 25 m, an old fix, or a distance past 1000 yd shows nothing.
enum LiveYards {
  static let maxAccuracyM = 25.0
  static let maxFixAgeS = 30.0
  static let maxYards = 1000
  static let metersPerYard = 0.9144
  static let earthRadiusM = 6_371_000.0

  static func usable(_ fix: CLLocation?, now: Date = Date()) -> CLLocation? {
    guard let fix, fix.horizontalAccuracy >= 0, fix.horizontalAccuracy <= maxAccuracyM else { return nil }
    return now.timeIntervalSince(fix.timestamp) <= maxFixAgeS ? fix : nil
  }

  static func yards(from fix: CLLocation?, to point: LivePoint?) -> Int? {
    guard let fix, let point else { return nil }
    let toRad = Double.pi / 180
    let dLat = (point.lat - fix.coordinate.latitude) * toRad
    let dLng = (point.lng - fix.coordinate.longitude) * toRad
    let lat1 = fix.coordinate.latitude * toRad
    let lat2 = point.lat * toRad
    let h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1) * cos(lat2) * sin(dLng / 2) * sin(dLng / 2)
    let meters = 2 * earthRadiusM * asin(min(1, sqrt(h)))
    let yards = Int((meters / metersPerYard).rounded())
    return yards <= maxYards ? yards : nil
  }
}

/// Runs the round's Live Activity and the location that keeps its yards fresh.
///
/// Location runs only while an activity is up (a round in progress), on the
/// When In Use permission the app already has, with iOS's blue indicator.
/// It stops when the round ends or the Live Activity is dismissed. Fixes stay
/// on the phone: they are only turned into yards here.
///
/// Each update carries a stale date 60 s after the fix its yards came from, so
/// the views show "—" if GPS stops or the app is killed. A round the golfer
/// swiped away is remembered (UserDefaults) and never started again; a
/// different round clears that. Decisions live in LiveRoundPolicy.
@available(iOS 16.2, *)
final class RoundLiveActivity: NSObject, CLLocationManagerDelegate {
  static let shared = RoundLiveActivity()

  /// Yard changes push at most this often; text and hole changes push at once.
  static let minYardsUpdateS = 2.0
  /// Every fix, not every few meters: a golfer standing still still needs fresh
  /// fixes so the yards (30 s fix age) and the stale date (60 s) stay current.
  static let distanceFilter = kCLDistanceFilterNone
  static let dismissedRoundKey = "shottraxx.liveActivity.dismissedRoundId"

  private let manager = CLLocationManager()
  private var activity: Activity<ShotTraxxRoundAttributes>?
  private var payload: LiveRoundPayload?
  private var lastFix: CLLocation?
  private var lastSent: ShotTraxxRoundAttributes.ContentState?
  private var lastSentAt = Date.distantPast
  private var tracking = false
  private var flushScheduled = false
  private var stateWatch: Task<Void, Never>?
  private var lastSentStaleDate: Date?
  /// Activities the app itself ended; their `.dismissed` is not a swipe-away.
  private var endedByApp = Set<String>()
  private let defaults = UserDefaults.standard

  private override init() {
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.distanceFilter = Self.distanceFilter
    manager.activityType = .fitness
    manager.pausesLocationUpdatesAutomatically = false
  }

  static var activitiesEnabled: Bool {
    ActivityAuthorizationInfo().areActivitiesEnabled
  }

  /// Start the round's activity, or update it for a new hole / score / shot.
  @discardableResult
  func sync(json: String) -> Bool {
    guard let next = LiveRoundPayload(json: json), Self.activitiesEnabled else { return false }
    let dismissed = LiveRoundPolicy.dismissedRoundId(
      afterSyncOf: next.roundId,
      current: defaults.string(forKey: Self.dismissedRoundKey)
    )
    saveDismissed(dismissed)
    guard LiveRoundPolicy.mayStart(roundId: next.roundId, dismissedRoundId: dismissed) else {
      // Swiped away for this round: no new activity, and location stays off.
      payload = nil
      stopLocation()
      return false
    }
    payload = next
    if activity == nil || activity?.activityState != .active {
      activity = Activity<ShotTraxxRoundAttributes>.activities.first {
        $0.activityState == .active && $0.attributes.roundId == next.roundId
      }
    }
    // Anything still up from another round goes.
    for other in Activity<ShotTraxxRoundAttributes>.activities where other.id != activity?.id {
      endActivity(other)
    }
    if activity == nil {
      do {
        let content = state()
        let stale = staleDate()
        activity = try Activity.request(
          attributes: ShotTraxxRoundAttributes(roundId: next.roundId, courseName: next.courseName),
          content: ActivityContent(state: content, staleDate: stale),
          pushType: nil
        )
        lastSent = content
        lastSentStaleDate = stale
        lastSentAt = Date()
      } catch {
        return false
      }
      watchState()
    }
    startLocation()
    push(force: true)
    return true
  }

  /// The round ended: close the activity and stop location.
  func end() {
    stopLocation()
    payload = nil
    lastSent = nil
    lastSentStaleDate = nil
    stateWatch?.cancel()
    stateWatch = nil
    for item in Activity<ShotTraxxRoundAttributes>.activities {
      endActivity(item)
    }
    activity = nil
  }

  private func endActivity(_ item: Activity<ShotTraxxRoundAttributes>) {
    endedByApp.insert(item.id)
    Task { await item.end(nil, dismissalPolicy: .immediate) }
  }

  private func saveDismissed(_ roundId: String?) {
    if let roundId {
      defaults.set(roundId, forKey: Self.dismissedRoundKey)
    } else {
      defaults.removeObject(forKey: Self.dismissedRoundKey)
    }
  }

  /// When the activity leaves `.active`, stop location. A golfer's swipe-away
  /// (dismissed without the app ending it) is remembered for that round.
  private func watchState() {
    stateWatch?.cancel()
    guard let current = activity else { return }
    let roundId = current.attributes.roundId
    let activityId = current.id
    stateWatch = Task { [weak self] in
      for await next in current.activityStateUpdates where next != .active {
        await MainActor.run {
          guard let self else { return }
          self.stopLocation()
          let remembered = LiveRoundPolicy.dismissedRoundId(
            afterLeaving: roundId,
            userDismissed: next == .dismissed,
            endedByApp: self.endedByApp.contains(activityId),
            current: self.defaults.string(forKey: Self.dismissedRoundKey)
          )
          self.saveDismissed(remembered)
          if self.activity?.id == activityId {
            self.activity = nil
            self.payload = nil
            self.lastSent = nil
          }
        }
        return
      }
    }
  }

  /// Stale date for what is about to be shown: 60 s after the fix its yards came from.
  private func staleDate() -> Date? {
    LiveRoundPolicy.staleDate(fixTime: LiveYards.usable(lastFix)?.timestamp)
  }

  private func state() -> ShotTraxxRoundAttributes.ContentState {
    let fix = LiveYards.usable(lastFix)
    let hasEnds = payload?.front != nil && payload?.back != nil
    return ShotTraxxRoundAttributes.ContentState(
      hole: payload?.hole ?? 1,
      par: payload?.par,
      front: hasEnds ? LiveYards.yards(from: fix, to: payload?.front) : nil,
      middle: LiveYards.yards(from: fix, to: payload?.middle),
      back: hasEnds ? LiveYards.yards(from: fix, to: payload?.back) : nil,
      hasGreen: payload?.middle != nil,
      hasEnds: hasEnds,
      scoreLine: payload?.scoreLine ?? "",
      lastShot: payload?.lastShot,
      groupLine: payload?.groupLine
    )
  }

  private func push(force: Bool) {
    guard let current = activity, current.activityState == .active else { return }
    let next = state()
    let stale = staleDate()
    let now = Date()
    if next == lastSent {
      // Same numbers (standing still): only re-send to push the stale date out.
      guard LiveRoundPolicy.needsStaleRefresh(sentStaleDate: lastSentStaleDate, newStaleDate: stale, now: now) else {
        return
      }
      lastSentStaleDate = stale
      lastSentAt = now
      Task { await current.update(ActivityContent(state: next, staleDate: stale)) }
      return
    }
    let wait = Self.minYardsUpdateS - now.timeIntervalSince(lastSentAt)
    if !force, let sent = lastSent, sameText(sent, next), wait > 0 {
      // Throttled: send the latest yards once the interval is up, so a golfer who
      // stops walking still sees where they stopped.
      if !flushScheduled {
        flushScheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in
          self?.flushScheduled = false
          self?.push(force: false)
        }
      }
      return
    }
    lastSent = next
    lastSentStaleDate = stale
    lastSentAt = now
    Task { await current.update(ActivityContent(state: next, staleDate: stale)) }
  }

  private func sameText(_ a: ShotTraxxRoundAttributes.ContentState, _ b: ShotTraxxRoundAttributes.ContentState) -> Bool {
    a.hole == b.hole && a.par == b.par && a.scoreLine == b.scoreLine && a.lastShot == b.lastShot
      && a.groupLine == b.groupLine && a.hasGreen == b.hasGreen && a.hasEnds == b.hasEnds
  }

  // MARK: Location

  private var backgroundModeEnabled: Bool {
    let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
    return modes.contains("location")
  }

  private var authorized: Bool {
    let status = manager.authorizationStatus
    return status == .authorizedWhenInUse || status == .authorizedAlways
  }

  private func startLocation() {
    guard !tracking, authorized else { return }
    // Setting this without the background mode in Info.plist crashes, so check first.
    if backgroundModeEnabled {
      manager.allowsBackgroundLocationUpdates = true
      manager.showsBackgroundLocationIndicator = true
    }
    manager.startUpdatingLocation()
    tracking = true
  }

  private func stopLocation() {
    guard tracking else { return }
    manager.stopUpdatingLocation()
    if backgroundModeEnabled {
      manager.allowsBackgroundLocationUpdates = false
    }
    tracking = false
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let fix = locations.last else { return }
    lastFix = fix
    push(force: false)
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if authorized, activity?.activityState == .active {
      startLocation()
    } else if !authorized {
      stopLocation()
      push(force: true)
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    // Keep the last yards until the fix is too old; the next push shows — then.
  }
}
