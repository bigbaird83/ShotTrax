import CoreLocation
import Foundation
import WatchConnectivity
import WatchKit

// Club-pick only. No motion detection, no mic, no sensor auto-mark.
// Tap → phone club=mark GPS. Undo stays on the phone.

struct ClubListState {
  var top3: [String] = []
  var bag: [String] = []
  var labels: [String: String] = [:]
  var holeNumber: Int = 1
  var yardsToGreen: Int? = nil
  var yardsQuality: String = "none"
  var lastClubId: String? = nil
  var selectedClubId: String? = nil

  var statusLine: String {
    if yardsQuality != "none", let yards = yardsToGreen, yards > 0 {
      return "Hole \(holeNumber) · \(yards) yd"
    }
    return "Hole \(holeNumber) · —"
  }

  /// Player-voice chip is Approximate (never SOFT).
  var showSoft: Bool { yardsQuality == "soft" }

  func label(for clubId: String) -> String {
    labels[clubId] ?? clubId
  }
}

struct NearbyCourse: Identifiable, Equatable {
  var id: String
  var name: String
}

struct NearbyTee: Identifiable, Equatable {
  var id: String { name }
  var name: String
}

struct NearbyState {
  var active: Bool = false
  var awaitingSelect: Bool = true
  var openPhone: Bool = false
  var line: String = "open the phone"
  var courses: [NearbyCourse] = []
  var tees: [NearbyTee] = []
  var courseId: String?
  var courseName: String?
  var holeCount: Int?
}

struct PuttSheetState {
  var open: Bool = false
  var holeNumber: Int = 1
  var lengths: [String] = []
  var labels: [String: String] = [
    "inside_3": "Under 3 ft",
    "3_to_10": "3–10",
    "10_to_20": "10–20",
    "over_20": "20+",
  ]
  var canAdd: Bool = true
  var canMake: Bool = true
  var pending: String? = nil

  func label(for lengthId: String) -> String {
    labels[lengthId] ?? lengthId
  }
}

final class WatchClubSession: NSObject, ObservableObject, WCSessionDelegate, CLLocationManagerDelegate, WKExtendedRuntimeSessionDelegate {
  @Published var list = ClubListState()
  @Published var putt = PuttSheetState()
  @Published var nearby = NearbyState()
  @Published var feedback: String = ""
  @Published var sending = false
  @Published var nearbyFromHome = false
  private var receivedClubList = false

  var hasLiveHole: Bool {
    receivedClubList || !list.bag.isEmpty
  }

  var showsNearby: Bool {
    nearby.active && (!hasLiveHole || nearbyFromHome)
  }

  private var pendingPick: [String: Any]?
  private var pendingQueue: [[String: Any]] = []
  private let pendingKey = "pendingClubPick"
  private let pendingQueueKey = "pendingWatchQueue"
  private var staySession: WKExtendedRuntimeSession?
  private var wantsStay = false
  private var userLeftApp = false
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
    loadPending()
    syncRoundStay()
  }

  func requestNearby() {
    sending = true
    feedback = ""
    nearby.awaitingSelect = false
    sendPick([
      "type": "nearbyRequest",
      "at": isoNow(),
    ], keepPending: false)
  }

  func pickHoleCount(_ count: Int) {
    guard count == 9 || count == 18 else { return }
    nearby.holeCount = count
    if nearby.tees.isEmpty {
      startPickedRound(teeName: nil)
    }
  }

  func pickCourse(courseId: String) {
    sending = true
    feedback = ""
    nearby.courseId = courseId
    sendPick([
      "type": "nearbyCoursePick",
      "courseId": courseId,
      "at": isoNow(),
    ], keepPending: false)
  }

  func pickTee(name: String) {
    startPickedRound(teeName: name)
  }

  private func startPickedRound(teeName: String?) {
    sending = true
    feedback = ""
    guard let courseId = nearby.courseId else {
      feedback = "open the phone"
      sending = false
      return
    }
    let holeCount = nearby.holeCount == 9 ? 9 : 18
    var payload: [String: Any] = [
      "type": "startRound",
      "courseId": courseId,
      "holeCount": holeCount,
      "at": isoNow(),
    ]
    if let teeName, !teeName.isEmpty {
      payload["teeName"] = teeName
    }
    sendPick(payload, keepPending: false)
  }

  func pick(clubId: String) {
    sending = true
    feedback = ""
    var next = list
    next.selectedClubId = clubId
    list = next
    persist(next)
    // Putter opens the putt sheet locally so Made it is on-screen without
    // waiting on a phone push (TF 53: Doc never saw Made it).
    if clubId == "club_putter" {
      var sheet = putt
      sheet.open = true
      if sheet.holeNumber < 1 {
        sheet.holeNumber = list.holeNumber
      }
      sheet.canMake = true
      sheet.canAdd = sheet.lengths.count < 5
      putt = sheet
      syncRoundStay()
    }
    var payload: [String: Any] = [
      "type": "clubPick",
      "clubId": clubId,
      "at": isoNow(),
    ]
    // Putter opens the putt sheet / select only — never attach Watch GPS.
    if clubId != "club_putter" {
      attachWatchFix(&payload)
    }
    sendPick(payload)
  }

  func select(_ clubId: String) {
    list.selectedClubId = clubId
    sendPick([
      "type": "clubSelect",
      "clubId": clubId,
      "at": isoNow(),
    ], keepPending: false)
  }

  func pickPuttLength(_ lengthId: String) {
    guard putt.canAdd else { return }
    var next = putt
    next.pending = lengthId
    next.canMake = true
    putt = next
  }

  func addPutt(lengthId: String? = nil) {
    guard let lengthId = lengthId ?? putt.pending else { return }
    sending = true
    feedback = ""
    if putt.lengths.count < 5 {
      var next = putt
      next.lengths.append(lengthId)
      next.canAdd = next.lengths.count < 5
      next.pending = nil
      next.canMake = true
      putt = next
    }
    sendPick([
      "type": "puttPick",
      "action": "add",
      "lengthId": lengthId,
      "at": isoNow(),
    ])
  }

  func undoPutt() {
    sending = true
    feedback = ""
    sendPick([
      "type": "puttPick",
      "action": "undo",
      "at": isoNow(),
    ])
  }

  func madeIt() {
    sending = true
    feedback = ""
    var payload: [String: Any] = [
      "type": "puttPick",
      "action": "made",
      "at": isoNow(),
    ]
    if let pending = putt.pending {
      payload["lengthId"] = pending
    }
    sendPick(payload)
  }

  /// Stretch: attach Watch GPS only when the sample is fresh and accurate. Never invent.
  private func attachWatchFix(_ payload: inout [String: Any]) {
    guard let loc = lastFix else { return }
    let age = Date().timeIntervalSince(loc.timestamp)
    let acc = loc.horizontalAccuracy
    guard age <= 3, acc > 0, CLLocationCoordinate2DIsValid(loc.coordinate) else { return }
    payload["lat"] = loc.coordinate.latitude
    payload["lng"] = loc.coordinate.longitude
    payload["accuracyM"] = acc
  }

  func pickSameClub() {
    guard let clubId = list.lastClubId else { return }
    pick(clubId: clubId)
  }

  func leave(_ action: String) {
    sending = true
    feedback = ""
    userLeftApp = true
    putt.open = false
    stopRoundStay()
    if action == "home", hasLiveHole {
      nearbyFromHome = true
      nearby.active = true
      nearby.awaitingSelect = true
      nearby.courseId = nil
      nearby.courseName = nil
      nearby.tees = []
      nearby.courses = []
      nearby.holeCount = nil
      nearby.openPhone = false
    }
    sendPick([
      "type": "clubNav",
      "action": action,
      "at": isoNow(),
    ], keepPending: false)
  }

  func dismissNearbyToHole() {
    nearbyFromHome = false
    nearby.active = false
    userLeftApp = false
    feedback = ""
    syncRoundStay()
  }

  private func isoNow() -> String {
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fmt.string(from: Date())
  }

  private func isPuttPick(_ payload: [String: Any]) -> Bool {
    payload["type"] as? String == "puttPick"
  }

  private func sendPick(_ payload: [String: Any], keepPending: Bool = true) {
    if isPuttPick(payload) {
      sendPuttPickReliable(payload)
      return
    }
    guard WCSession.isSupported() else {
      failUnavailable(payload, keepPending: keepPending)
      return
    }
    let session = WCSession.default
    if session.isReachable {
      session.sendMessage(payload, replyHandler: { [weak self] reply in
        DispatchQueue.main.async {
          self?.clearPending()
          self?.handleReply(
            reply,
            fallbackClubId: payload["clubId"] as? String,
            type: payload["type"] as? String
          )
        }
      }, errorHandler: { [weak self] _ in
        DispatchQueue.main.async {
          self?.failUnavailable(payload, keepPending: keepPending)
        }
      })
    } else {
      failUnavailable(payload, keepPending: keepPending)
    }
  }

  /// TF 53 D: puttPick must not depend on isReachable / one pendingClubPick slot.
  /// transferUserInfo queues in order; sendMessage is extra when the phone is awake.
  private func sendPuttPickReliable(_ payload: [String: Any]) {
    enqueuePending(payload)
    sending = false
    guard WCSession.isSupported() else { return }
    let session = WCSession.default
    session.transferUserInfo(payload)
    if session.isReachable {
      session.sendMessage(payload, replyHandler: { [weak self] reply in
        DispatchQueue.main.async {
          self?.dequeuePending(at: payload["at"] as? String)
          self?.handleReply(reply, fallbackClubId: nil, type: "puttPick")
        }
      }, errorHandler: { _ in
        // userInfo already queued — do not wipe later taps
      })
    }
  }

  private func handleReply(_ reply: [String: Any], fallbackClubId: String?, type: String? = nil) {
    sending = false
    let ok = reply["ok"] as? Bool ?? false
    let text: String
    if ok {
      text = reply["feedback"] as? String ?? "marked ✓"
    } else {
      text = "Phone unavailable"
    }
    feedback = text
    haptic(ok ? .success : .failure)
    if ok, type == "startRound" || text.hasPrefix("Started") {
      nearbyFromHome = false
      nearby.active = false
    }
    if ok, let clubId = fallbackClubId, clubId != "club_putter" {
      list.lastClubId = clubId
      UserDefaults.standard.set(clubId, forKey: "lastClubId")
    }
    if ok, (reply["feedback"] as? String)?.contains("Hole Out") == true {
      putt.open = false
      putt.lengths = []
      putt.canMake = true
      putt.canAdd = true
      putt.pending = nil
      syncRoundStay()
    }
  }

  private func failUnavailable(_ payload: [String: Any], keepPending: Bool = false) {
    sending = false
    feedback = "Phone unavailable"
    haptic(.failure)
    if keepPending {
      storePending(payload)
    }
  }

  private func storePending(_ payload: [String: Any]) {
    pendingPick = payload
    UserDefaults.standard.set(payload, forKey: pendingKey)
    enqueuePending(payload)
  }

  private func enqueuePending(_ payload: [String: Any]) {
    if let at = payload["at"] as? String,
       pendingQueue.contains(where: { $0["at"] as? String == at }) {
      return
    }
    pendingQueue.append(payload)
    savePendingQueue()
  }

  private func dequeuePending(at: String?) {
    guard let at, !at.isEmpty else { return }
    pendingQueue.removeAll { $0["at"] as? String == at }
    savePendingQueue()
  }

  private func savePendingQueue() {
    UserDefaults.standard.set(pendingQueue, forKey: pendingQueueKey)
  }

  private func clearPending() {
    pendingPick = nil
    UserDefaults.standard.removeObject(forKey: pendingKey)
  }

  private func loadPending() {
    if let rows = UserDefaults.standard.array(forKey: pendingQueueKey) as? [[String: Any]] {
      pendingQueue = rows
    }
    if let legacy = UserDefaults.standard.dictionary(forKey: pendingKey) {
      enqueuePending(legacy)
      pendingPick = nil
      UserDefaults.standard.removeObject(forKey: pendingKey)
    }
  }

  private func haptic(_ type: WKHapticType) {
    WKInterfaceDevice.current().play(type)
  }

  private func applyNearbyCourses(_ message: [String: Any]) {
    if hasLiveHole && !nearbyFromHome { return }
    var next = NearbyState()
    next.active = true
    next.awaitingSelect = false
    let status = message["status"] as? String ?? "open_phone"
    next.openPhone = status != "ok"
    next.line = (message["line"] as? String) ?? "open the phone"
    var courses: [NearbyCourse] = []
    if let rows = message["courses"] as? [[String: Any]] {
      for row in rows {
        guard let id = row["id"] as? String, !id.isEmpty,
              let name = row["name"] as? String, !name.isEmpty else { continue }
        courses.append(NearbyCourse(id: id, name: name))
      }
    }
    next.courses = courses
    if courses.isEmpty {
      next.openPhone = true
      next.line = "open the phone"
    }
    nearby = next
    putt.open = false
  }

  private func applyNearbyTees(_ message: [String: Any]) {
    if hasLiveHole && !nearbyFromHome { return }
    var next = nearby
    next.active = true
    next.awaitingSelect = false
    next.openPhone = false
    if let id = message["courseId"] as? String {
      next.courseId = id
    }
    if let name = message["courseName"] as? String {
      next.courseName = name
    }
    var tees: [NearbyTee] = []
    if let rows = message["tees"] as? [[String: Any]] {
      for row in rows {
        guard let name = row["name"] as? String, !name.isEmpty else { continue }
        tees.append(NearbyTee(name: name))
      }
    }
    next.tees = tees
    nearby = next
  }

  private func applyClubList(_ message: [String: Any]) {
    let type = message["type"] as? String
    if type == "puttSheet" {
      applyPuttSheet(message)
      return
    }
    if type == "nearbyCourses" {
      applyNearbyCourses(message)
      return
    }
    if type == "nearbyTees" {
      applyNearbyTees(message)
      return
    }
    guard type == "clubList" else { return }
    receivedClubList = true
    if !nearbyFromHome {
      nearby.active = false
    }
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
    if let last = message["lastClubId"] as? String, !last.isEmpty {
      next.lastClubId = last
    } else {
      next.lastClubId = nil
    }
    if let selected = message["selectedClubId"] as? String, !selected.isEmpty {
      next.selectedClubId = selected
    } else {
      next.selectedClubId = nil
    }
    list = next
    persist(next)
    syncRoundStay()
  }

  private func applyPuttSheet(_ message: [String: Any]) {
    let priorPending = putt.pending
    let priorLengths = putt.lengths
    var next = PuttSheetState()
    if let hole = message["holeNumber"] as? Int {
      next.holeNumber = hole
    } else if let hole = message["holeNumber"] as? NSNumber {
      next.holeNumber = hole.intValue
    }
    next.lengths = message["lengths"] as? [String] ?? []
    if let labels = message["labels"] as? [String: String] {
      next.labels = labels
    }
    next.canAdd = message["canAdd"] as? Bool ?? (next.lengths.count < 5)
    next.canMake = true
    let incomingOpen = message["open"] as? Bool ?? false
    // Phone add/undo can race puttOpen=false and close a Watch-opened sheet.
    // Keep the putt sheet up while putter still owns it (Made it stays on-screen).
    next.open = incomingOpen || (putt.open && list.selectedClubId == "club_putter")
    if next.canAdd, next.lengths == priorLengths {
      next.pending = priorPending
    }
    putt = next
    syncRoundStay()
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
    defaults?.set(state.bag, forKey: "bag")
    defaults?.set(state.top3, forKey: "top3")
    defaults?.set(state.labels, forKey: "labels")
    if let last = state.lastClubId {
      defaults?.set(last, forKey: "lastClubId")
    } else {
      defaults?.removeObject(forKey: "lastClubId")
    }
    if let selected = state.selectedClubId {
      defaults?.set(selected, forKey: "selectedClubId")
    } else {
      defaults?.removeObject(forKey: "selectedClubId")
    }
    var obj: [String: Any] = [
      "type": "clubList",
      "top3": state.top3,
      "bag": state.bag,
      "labels": state.labels,
      "holeNumber": state.holeNumber,
      "yardsQuality": state.yardsQuality,
    ]
    if let yards = state.yardsToGreen, state.yardsQuality != "none" {
      obj["yardsToGreen"] = yards
    }
    if let last = state.lastClubId { obj["lastClubId"] = last }
    if let selected = state.selectedClubId { obj["selectedClubId"] = selected }
    if let data = try? JSONSerialization.data(withJSONObject: obj),
       let text = String(data: data, encoding: .utf8) {
      defaults?.set(text, forKey: "clubListJSON")
    }
    defaults?.synchronize()
  }

  private func loadFromDefaults() {
    let defaults = UserDefaults(suiteName: "group.com.shottrax.app")
    if let text = defaults?.string(forKey: "clubListJSON"),
       let data = text.data(using: .utf8),
       let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      applyClubList(obj)
      if receivedClubList { return }
    }
    var next = ClubListState()
    let hole = defaults?.integer(forKey: "holeNumber") ?? 0
    if hole > 0 { next.holeNumber = hole }
    if defaults?.object(forKey: "yardsToGreen") != nil {
      next.yardsToGreen = defaults?.integer(forKey: "yardsToGreen")
    }
    next.yardsQuality = defaults?.string(forKey: "yardsQuality") ?? "none"
    next.bag = defaults?.stringArray(forKey: "bag") ?? []
    next.top3 = defaults?.stringArray(forKey: "top3") ?? []
    next.labels = defaults?.dictionary(forKey: "labels") as? [String: String] ?? [:]
    next.lastClubId = defaults?.string(forKey: "lastClubId")
    next.selectedClubId = defaults?.string(forKey: "selectedClubId")
    if hole > 0 || !next.bag.isEmpty {
      list = next
      receivedClubList = true
    }
  }

  private func flushPending() {
    guard WCSession.isSupported(), WCSession.default.isReachable else { return }
    if let legacy = pendingPick {
      clearPending()
      enqueuePending(legacy)
    }
    let batch = pendingQueue
    guard !batch.isEmpty else { return }
    sending = true
    for payload in batch {
      sendPick(payload, keepPending: true)
    }
  }

  private func syncRoundStay() {
    wantsStay = !userLeftApp && (hasLiveHole || putt.open)
    if wantsStay {
      startRoundStay()
    } else {
      stopRoundStay()
    }
  }

  private func startRoundStay() {
    if let staySession, staySession.state == .running || staySession.state == .scheduled {
      return
    }
    let next = WKExtendedRuntimeSession()
    next.delegate = self
    staySession = next
    next.start()
  }

  private func stopRoundStay() {
    staySession?.invalidate()
    staySession = nil
  }

  func extendedRuntimeSessionDidStart(_ extendedRuntimeSession: WKExtendedRuntimeSession) {}

  func extendedRuntimeSessionWillExpire(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
    // Chain a replacement before the current session dies so idle does not dump.
    if wantsStay, !userLeftApp {
      staySession = nil
      startRoundStay()
    }
  }

  func extendedRuntimeSession(
    _ extendedRuntimeSession: WKExtendedRuntimeSession,
    didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason,
    error: Error?
  ) {
    if staySession === extendedRuntimeSession {
      staySession = nil
    }
    if wantsStay, !userLeftApp, reason == .expired {
      DispatchQueue.main.async { self.startRoundStay() }
    }
  }

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    applyClubList(session.receivedApplicationContext)
    if activationState == .activated {
      flushPending()
      DispatchQueue.main.async {
        self.syncRoundStay()
        if self.hasLiveHole && !self.nearbyFromHome {
          self.nearby.active = false
          return
        }
        self.nearby.active = true
        self.nearby.awaitingSelect = true
        self.nearby.openPhone = false
      }
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

  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
    DispatchQueue.main.async {
      self.applyClubList(userInfo)
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

  /// Crown / app switch is an explicit leave. Idle / wrist-down (.inactive)
  /// is not — keep ShotTraxx up for the round.
  func noteScenePhase(_ phase: String) {
    if phase == "active" {
      userLeftApp = false
      syncRoundStay()
      return
    }
    if phase == "inactive" {
      // Wrist-down dim. Do not treat as leave. Restart stay if it never started.
      if wantsStay || hasLiveHole || putt.open {
        startRoundStay()
      }
      return
    }
    if phase == "background" {
      // Session running → crown / app switch. Session not running → do not
      // mark leave (idle used to dump here when start() failed without WKBackgroundModes).
      if staySession?.state == .running || staySession?.state == .scheduled {
        userLeftApp = true
        stopRoundStay()
        return
      }
      if !userLeftApp, hasLiveHole || putt.open {
        startRoundStay()
      }
    }
  }
}
