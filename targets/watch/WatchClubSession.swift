import CoreLocation
import Foundation
import WatchConnectivity
import WatchKit

struct ClubListState {
  var top3: [String] = []
  var bag: [String] = []
  var labels: [String: String] = [:]
  var holeNumber: Int = 1
  var yardsToGreen: Int? = nil
  var yardsQuality: String = "none"
  var lastClubId: String? = nil

  var statusLine: String {
    if yardsQuality != "none", let yards = yardsToGreen {
      return "Hole \(holeNumber) · \(yards) yd"
    }
    return "Hole \(holeNumber) · —"
  }

  var showSoft: Bool { yardsQuality == "soft" }

  func label(for clubId: String) -> String {
    labels[clubId] ?? clubId
  }
}

final class WatchClubSession: NSObject, ObservableObject, WCSessionDelegate, CLLocationManagerDelegate {
  @Published var list = ClubListState()
  @Published var feedback: String = ""
  @Published var sending = false

  private var pendingPick: [String: Any]?
  private let location = CLLocationManager()
  private var lastFix: CLLocation?

  override init() {
    super.init()
    location.delegate = self
    location.desiredAccuracy = kCLLocationAccuracyBest
    location.requestWhenInUseAuthorization()
    location.startUpdatingLocation()

    if WCSession.isSupported() {
      let session = WCSession.default
      session.delegate = self
      session.activate()
    }
    loadFromDefaults()
  }

  func pick(clubId: String) {
    sending = true
    feedback = ""
    var payload: [String: Any] = [
      "type": "clubPick",
      "clubId": clubId,
      "at": isoNow(),
    ]
    if let fix = lastFix, Date().timeIntervalSince(fix.timestamp) <= 3, fix.horizontalAccuracy > 0 {
      payload["lat"] = fix.coordinate.latitude
      payload["lng"] = fix.coordinate.longitude
      payload["accuracyM"] = fix.horizontalAccuracy
    }
    sendPick(payload)
  }

  func pickSameClub() {
    let clubId = list.lastClubId ?? list.top3.first ?? list.bag.first
    guard let clubId else {
      feedback = "Phone unavailable"
      haptic(.failure)
      return
    }
    pick(clubId: clubId)
  }

  private func isoNow() -> String {
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fmt.string(from: Date())
  }

  private func sendPick(_ payload: [String: Any]) {
    guard WCSession.isSupported() else {
      failUnavailable(payload)
      return
    }
    let session = WCSession.default
    if session.isReachable {
      session.sendMessage(payload, replyHandler: { [weak self] reply in
        DispatchQueue.main.async {
          self?.handleReply(reply, fallbackClubId: payload["clubId"] as? String)
        }
      }, errorHandler: { [weak self] _ in
        DispatchQueue.main.async {
          self?.failUnavailable(payload)
        }
      })
    } else {
      pendingPick = payload
      failUnavailable(payload, keepPending: true)
    }
  }

  private func handleReply(_ reply: [String: Any], fallbackClubId: String?) {
    sending = false
    let ok = reply["ok"] as? Bool ?? false
    let text = reply["feedback"] as? String ?? (ok ? "marked ✓" : "Phone unavailable")
    feedback = text
    haptic(ok ? .success : .failure)
    if ok, let clubId = fallbackClubId {
      list.lastClubId = clubId
      UserDefaults.standard.set(clubId, forKey: "lastClubId")
    }
  }

  private func failUnavailable(_ payload: [String: Any], keepPending: Bool = false) {
    sending = false
    feedback = "Phone unavailable"
    haptic(.failure)
    if keepPending {
      pendingPick = payload
    }
  }

  private func haptic(_ type: WKHapticType) {
    WKInterfaceDevice.current().play(type)
  }

  private func applyClubList(_ message: [String: Any]) {
    guard (message["type"] as? String) == "clubList" else { return }
    var next = ClubListState()
    next.top3 = message["top3"] as? [String] ?? []
    next.bag = message["bag"] as? [String] ?? []
    next.labels = message["labels"] as? [String: String] ?? [:]
    if let hole = message["holeNumber"] as? Int {
      next.holeNumber = hole
    } else if let hole = message["holeNumber"] as? NSNumber {
      next.holeNumber = hole.intValue
    }
    if let yards = message["yardsToGreen"] as? Int {
      next.yardsToGreen = yards
    } else if let yards = message["yardsToGreen"] as? NSNumber {
      next.yardsToGreen = yards.intValue
    } else {
      next.yardsToGreen = nil
    }
    next.yardsQuality = message["yardsQuality"] as? String ?? "none"
    next.lastClubId = message["lastClubId"] as? String ?? list.lastClubId
    list = next
    persist(next)
  }

  private func persist(_ state: ClubListState) {
    let defaults = UserDefaults(suiteName: "group.com.shottrax.app")
    defaults?.set(state.holeNumber, forKey: "holeNumber")
    if let yards = state.yardsToGreen, state.yardsQuality != "none" {
      defaults?.set(yards, forKey: "yardsToGreen")
    } else {
      defaults?.removeObject(forKey: "yardsToGreen")
    }
    defaults?.set(state.yardsQuality, forKey: "yardsQuality")
    if let last = state.lastClubId {
      defaults?.set(last, forKey: "lastClubId")
    }
    defaults?.synchronize()
  }

  private func loadFromDefaults() {
    let defaults = UserDefaults(suiteName: "group.com.shottrax.app")
    var next = ClubListState()
    let hole = defaults?.integer(forKey: "holeNumber") ?? 0
    if hole > 0 { next.holeNumber = hole }
    if defaults?.object(forKey: "yardsToGreen") != nil {
      next.yardsToGreen = defaults?.integer(forKey: "yardsToGreen")
    }
    next.yardsQuality = defaults?.string(forKey: "yardsQuality") ?? "none"
    next.lastClubId = defaults?.string(forKey: "lastClubId")
    if hole > 0 {
      list = next
    }
  }

  private func flushPending() {
    guard let pendingPick, WCSession.default.isReachable else { return }
    self.pendingPick = nil
    sendPick(pendingPick)
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    applyClubList(session.receivedApplicationContext)
    if activationState == .activated {
      flushPending()
    }
  }

  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    DispatchQueue.main.async {
      self.applyClubList(applicationContext)
    }
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    DispatchQueue.main.async {
      self.applyClubList(message)
    }
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    if session.isReachable {
      DispatchQueue.main.async {
        self.flushPending()
      }
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    lastFix = locations.last
  }
}
