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

    AsyncFunction("pushClubListJson") { (json: String) in
      PhoneWatchSession.shared.pushClubListJson(json)
    }

    AsyncFunction("pushWatchMessageJson") { (json: String) in
      PhoneWatchSession.shared.pushWatchMessageJson(json)
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
  private let lock = NSLock()

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
    try? session.updateApplicationContext(safe)
    if session.isReachable {
      session.sendMessage(safe, replyHandler: nil, errorHandler: nil)
    }
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
    if session.isReachable {
      session.sendMessage(safe, replyHandler: nil, errorHandler: nil)
    }
  }

  func reply(token: String, json: String) {
    let payload: [String: Any]
    if let data = json.data(using: .utf8),
       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      payload = obj
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
    if type == "clubPick" || type == "clubNav" {
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
      } else {
        out[key] = value
      }
    }
    return out
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if let pendingClubList, activationState == .activated {
      try? session.updateApplicationContext(pendingClubList)
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
