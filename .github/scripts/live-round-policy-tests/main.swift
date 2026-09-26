import Foundation

// Compiled with modules/live-activity/ios/LiveRoundPolicy.swift and run on the
// Mac runner by the Watch compile workflow. Exits non-zero on any failure.

var failures = 0
func check(_ ok: Bool, _ name: String, line: Int = #line) {
  if ok {
    print("ok - \(name)")
  } else {
    failures += 1
    print("not ok - \(name) (line \(line))")
  }
}

let t0 = Date(timeIntervalSince1970: 1_800_000_000)

// Stale yards
check(LiveRoundPolicy.staleDate(fixTime: t0) == t0.addingTimeInterval(60), "stale 60 s after the fix")
check(LiveRoundPolicy.staleDate(fixTime: nil) == nil, "no fix, no stale date")
check(
  LiveRoundPolicy.needsStaleRefresh(sentStaleDate: nil, newStaleDate: t0.addingTimeInterval(60), now: t0),
  "first stale date is sent"
)
check(
  !LiveRoundPolicy.needsStaleRefresh(
    sentStaleDate: t0.addingTimeInterval(60), newStaleDate: t0.addingTimeInterval(65), now: t0.addingTimeInterval(5)),
  "standing still: no resend while 55 s remain"
)
check(
  LiveRoundPolicy.needsStaleRefresh(
    sentStaleDate: t0.addingTimeInterval(60), newStaleDate: t0.addingTimeInterval(95), now: t0.addingTimeInterval(35)),
  "standing still: resend once under 30 s remain"
)
check(
  !LiveRoundPolicy.needsStaleRefresh(
    sentStaleDate: t0.addingTimeInterval(60), newStaleDate: t0.addingTimeInterval(60), now: t0.addingTimeInterval(45)),
  "no newer fix: let it go stale"
)
check(
  !LiveRoundPolicy.needsStaleRefresh(sentStaleDate: t0.addingTimeInterval(60), newStaleDate: nil, now: t0),
  "no usable fix: nothing to refresh"
)

// Swipe-away
var dismissed: String? = nil
dismissed = LiveRoundPolicy.dismissedRoundId(afterLeaving: "r1", userDismissed: false, endedByApp: true, current: dismissed)
check(dismissed == nil, "app ending the activity is not a dismissal")
dismissed = LiveRoundPolicy.dismissedRoundId(afterLeaving: "r1", userDismissed: true, endedByApp: true, current: dismissed)
check(dismissed == nil, "dismissed after the app ended it is not the golfer's swipe")
dismissed = LiveRoundPolicy.dismissedRoundId(afterLeaving: "r1", userDismissed: true, endedByApp: false, current: dismissed)
check(dismissed == "r1", "golfer swipe remembers the round")
dismissed = LiveRoundPolicy.dismissedRoundId(afterSyncOf: "r1", current: dismissed)
check(dismissed == "r1", "next hole in the same round keeps the dismissal")
check(!LiveRoundPolicy.mayStart(roundId: "r1", dismissedRoundId: dismissed), "same round does not start again")
dismissed = LiveRoundPolicy.dismissedRoundId(afterSyncOf: "r2", current: dismissed)
check(dismissed == nil, "a different round clears it")
check(LiveRoundPolicy.mayStart(roundId: "r2", dismissedRoundId: dismissed), "a different round starts")

if failures > 0 {
  print("\(failures) failed")
  exit(1)
}
print("all passed")
