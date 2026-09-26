import WatchConnectivity
import ExpoModulesCore
#if canImport(WidgetKit)
import WidgetKit
#endif

private let appGroupId = "group.com.shottrax.app"

public class WatchBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WatchBridge")

    Events("onClubPick", "onPuttPick", "onReachabilityChange")

    OnCreate {
      PhoneWatchSession.shared.attach(self)
    }

    Function("isSupported") { () -> Bool in
      WCSession.isSupported()
    }

    Function("isReachable") { () -> Bool in
      guard WCSession.isSupported() else { return false }
      return WCSession.default.isReachable
    }

    /// Diagnostics only. Reads the session. Does not activate it or send.
    Function("readLinkStatus") { () -> [String: Any] in
      guard WCSession.isSupported() else {
        return ["supported": false]
      }
      let session = WCSession.default
      var status: [String: Any] = [
        "supported": true,
        "activated": session.activationState == .activated,
      ]
      if session.activationState == .activated {
        status["paired"] = session.isPaired
        status["reachable"] = session.isReachable
        status["remainingComplicationTransfers"] = session.remainingComplicationUserInfoTransfers
      }
      if let sentAt = PhoneWatchSession.shared.diagnosticsTimestampMs() {
        status["lastSentAtMs"] = sentAt
      }
      return status
    }

    AsyncFunction("pushClubListJson") { (json: String) in
      PhoneWatchSession.shared.pushClubListJson(json)
    }

    AsyncFunction("pushWatchMessageJson") { (json: String) in
      PhoneWatchSession.shared.pushWatchMessageJson(json)
    }

    AsyncFunction("pushWatchHomeJson") { (json: String) in
      PhoneWatchSession.shared.pushWatchHomeJson(json)
    }

    AsyncFunction("replyClubPick") { (token: String, json: String) in
      PhoneWatchSession.shared.reply(token: token, json: json)
    }
  }
}

final class PhoneWatchSession: NSObject, WCSessionDelegate {
  static let shared = PhoneWatchSession()

  private weak var module: WatchBridgeModule?
  private var replies: [String: ([String: Any]) -> Void] = [:]
  private var pendingClubList: [String: Any]?
  /// Latest Watch Home (favorites + nearby). Nested under "watchHome" in the
  /// application context so it never overwrites the clubList a live hole needs.
  private var lastWatchHome: [String: Any]?
  private let lock = NSLock()
  /// Last hole / quality / yards sent with transferCurrentComplicationUserInfo.
  private var sentComplicationHole = 0
  private var sentComplicationQuality = ""
  private var sentComplicationYards: Int?
  /// Diagnostics clock. Set only after a clubList context update or a
  /// complication transfer is accepted. Never read by the send path.
  private var lastSuccessfulClubOrComplicationAtMs: Double?

  func attach(_ module: WatchBridgeModule) {
    self.module = module
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.delegate = self
    session.activate()
  }

  func pushClubListJson(_ json: String) {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return
    }
    let safe = plistSafe(obj)
    pendingClubList = safe
    persistStatus(obj)
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    do {
      try session.updateApplicationContext(applicationContext())
      noteSuccessfulClubOrComplicationSend()
    } catch {
      // Same as the previous try?: a failed context update does not block the live message.
    }
    if session.isReachable {
      session.sendMessage(safe, replyHandler: nil, errorHandler: nil)
    }
    transferComplicationIfNeeded(safe, session: session)
  }

  /// Epoch milliseconds of the last accepted clubList context update or complication transfer.
  func diagnosticsTimestampMs() -> Double? {
    lock.lock()
    defer { lock.unlock() }
    return lastSuccessfulClubOrComplicationAtMs
  }

  private func noteSuccessfulClubOrComplicationSend() {
    let ms = Date().timeIntervalSince1970 * 1000
    lock.lock()
    lastSuccessfulClubOrComplicationAtMs = ms
    lock.unlock()
  }

  /// ShotTraxxHole on the active face: wake the Watch app in the background so it
  /// writes the app group and reloads the widget even when the Watch app is not in
  /// front. Same clubList payload — no second yardage. watchOS budgets these
  /// transfers, so hole / quality flips always go and yard drift only in ≥20 yd steps.
  private func transferComplicationIfNeeded(_ safe: [String: Any], session: WCSession) {
    // WidgetKit faces leave isComplicationEnabled false, so that flag must not
    // block the wake. The remaining-transfer budget applies only when ClockKit
    // reports the complication is actually on the face.
    guard session.activationState == .activated,
          session.isPaired,
          session.isWatchAppInstalled,
          let quality = safe["complicationQuality"] as? String else { return }
    let hole = Self.intValue(safe["holeNumber"]) ?? 0
    let yards = Self.intValue(safe["complicationYards"])
    let flipped = hole != sentComplicationHole || quality != sentComplicationQuality
    var moved = false
    if let yards, let sent = sentComplicationYards {
      moved = abs(yards - sent) >= 20
    } else {
      moved = (yards == nil) != (sentComplicationYards == nil)
    }
    guard flipped || moved else { return }
    // Keep a few transfers for the next hole change. WidgetKit (flag false) is not budgeted here.
    if session.isComplicationEnabled, !flipped, session.remainingComplicationUserInfoTransfers <= 5 { return }
    for transfer in session.outstandingUserInfoTransfers where transfer.isCurrentComplicationInfo {
      transfer.cancel()
    }
    session.transferCurrentComplicationUserInfo(safe)
    noteSuccessfulClubOrComplicationSend()
    sentComplicationHole = hole
    sentComplicationQuality = quality
    sentComplicationYards = yards
  }

  private static func intValue(_ value: Any?) -> Int? {
    if let number = value as? Int { return number }
    if let number = value as? NSNumber { return number.intValue }
    return nil
  }

  /// Watch Home: live message when the Watch is awake, plus the application
  /// context so a Watch that was asleep opens on the newest favorites.
  func pushWatchHomeJson(_ json: String) {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return
    }
    let safe = plistSafe(obj)
    lastWatchHome = safe
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    guard session.activationState == .activated else { return }
    try? session.updateApplicationContext(applicationContext())
    if session.isReachable {
      session.sendMessage(safe, replyHandler: nil, errorHandler: nil)
    }
  }

  private func applicationContext() -> [String: Any] {
    var context = pendingClubList ?? [:]
    if let lastWatchHome {
      context["watchHome"] = lastWatchHome
    }
    return context
  }

  /// Putt sheet (and other live UI) — send only. Do not overwrite the clubList context.
  func pushWatchMessageJson(_ json: String) {
    guard let data = json.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return
    }
    let safe = plistSafe(obj)
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.transferUserInfo(safe)
    if session.isReachable {
      session.sendMessage(safe, replyHandler: nil, errorHandler: nil)
    }
  }

  func reply(token: String, json: String) {
    let payload: [String: Any]
    if let data = json.data(using: .utf8),
       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      payload = plistSafe(obj)
    } else {
      payload = ["ok": false, "feedback": "Check phone"]
    }
    lock.lock()
    let handler = replies.removeValue(forKey: token)
    lock.unlock()
    handler?(payload)
  }

  private func persistStatus(_ obj: [String: Any]) {
    let defaults = UserDefaults(suiteName: appGroupId)
    if let hole = obj["holeNumber"] as? Int {
      defaults?.set(hole, forKey: "holeNumber")
    } else if let hole = obj["holeNumber"] as? NSNumber {
      defaults?.set(hole.intValue, forKey: "holeNumber")
    }
    if obj["yardsToGreen"] is NSNull {
      defaults?.removeObject(forKey: "yardsToGreen")
    } else if let yards = obj["yardsToGreen"] as? Int {
      defaults?.set(yards, forKey: "yardsToGreen")
    } else if let yards = obj["yardsToGreen"] as? NSNumber {
      defaults?.set(yards.intValue, forKey: "yardsToGreen")
    }
    if let quality = obj["yardsQuality"] as? String {
      defaults?.set(quality, forKey: "yardsQuality")
    }
    if let lastClubId = obj["lastClubId"] as? String {
      defaults?.set(lastClubId, forKey: "lastClubId")
    }
    // Hole + live yards + quality for the ShotTraxxHole face (same keys the Watch writes).
    if let quality = obj["complicationQuality"] as? String {
      if let hole = Self.intValue(obj["holeNumber"]), hole >= 1 {
        defaults?.set(hole, forKey: "complicationHole")
      } else {
        defaults?.removeObject(forKey: "complicationHole")
      }
      if quality == "good" || quality == "soft",
         let yards = Self.intValue(obj["complicationYards"]), yards > 0 {
        defaults?.set(yards, forKey: "complicationYards")
        defaults?.set(quality, forKey: "complicationQuality")
      } else {
        defaults?.removeObject(forKey: "complicationYards")
        defaults?.set("none", forKey: "complicationQuality")
      }
    }
    if let json = try? JSONSerialization.data(withJSONObject: obj),
       let text = String(data: json, encoding: .utf8) {
      defaults?.set(text, forKey: "clubListJSON")
    }
    defaults?.synchronize()
    if #available(iOS 14.0, *) {
      WidgetCenterReloader.reload()
    }
  }

  private func emitWatchMessage(_ message: [String: Any], replyHandler: (([String: Any]) -> Void)?) {
    let type = message["type"] as? String
    let event: String
    if type == "clubPick" || type == "clubNav" || type == "penaltyPick" || type == "shotUndo" || type == "nearbyRequest" || type == "nearbyCoursePick" || type == "startRound" || type == "homeRequest" || type == "favoriteToggle" {
      event = "onClubPick"
    } else if type == "puttPick" {
      event = "onPuttPick"
    } else {
      return
    }
    let token = UUID().uuidString
    if let replyHandler {
      lock.lock()
      replies[token] = replyHandler
      lock.unlock()
    }
    let json: String
    if let data = try? JSONSerialization.data(withJSONObject: message),
       let text = String(data: data, encoding: .utf8) {
      json = text
    } else {
      json = "{\"type\":\"\(type ?? "")\"}"
    }
    module?.sendEvent(event, [
      "token": token,
      "json": json,
    ])
  }

  private func plistSafe(_ obj: [String: Any]) -> [String: Any] {
    var out: [String: Any] = [:]
    for (key, value) in obj {
      if value is NSNull { continue }
      if let nested = value as? [String: Any] {
        out[key] = plistSafe(nested)
      } else if let rows = value as? [Any] {
        out[key] = rows.compactMap { row -> Any? in
          if row is NSNull { return nil }
          if let nested = row as? [String: Any] { return plistSafe(nested) }
          return row
        }
      } else {
        out[key] = value
      }
    }
    return out
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if activationState == .activated {
      if let pending = pendingClubList {
        transferComplicationIfNeeded(pending, session: session)
      }
      if pendingClubList != nil || lastWatchHome != nil {
        try? session.updateApplicationContext(applicationContext())
      }
    }
    module?.sendEvent("onReachabilityChange", [
      "reachable": session.isReachable,
    ])
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    module?.sendEvent("onReachabilityChange", [
      "reachable": session.isReachable,
    ])
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    emitWatchMessage(message, replyHandler: nil)
  }

  func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
    emitWatchMessage(message, replyHandler: replyHandler)
  }

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    emitWatchMessage(userInfo, replyHandler: nil)
  }
}

enum WidgetCenterReloader {
  static func reload() {
    #if canImport(WidgetKit)
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
    #endif
  }
}
