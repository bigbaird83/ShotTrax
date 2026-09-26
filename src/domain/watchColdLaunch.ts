/**
 * Cold-launch guards for the Watch app.
 * Mirrors `WatchClubSession.mayCreateGolfWorkout` and the `startActivity`
 * state check in targets/watch/WatchClubSession.swift.
 *
 * A second HKWorkoutSession throws. startActivity on one that is already
 * running, paused, or ended raises. Both happen before the first frame when
 * a fresh round calls them from init, or a few seconds later when the
 * WCSession activation callback used to start them off the main thread.
 */

export function watchMayCreateGolfWorkout(args: {
  launchGate: boolean;
  recovering: boolean;
  ending: boolean;
  creating: boolean;
  hasSession: boolean;
  sessionEnded: boolean;
}): boolean {
  if (args.launchGate || args.recovering || args.ending || args.creating) return false;
  if (args.hasSession && !args.sessionEnded) return false;
  return true;
}

/** States where `HKWorkoutSession.startActivity` is safe to call once. */
export type WatchGolfActivityState = 'prepared' | 'stopped' | 'notStarted' | 'running' | 'paused' | 'ended' | 'other';

export function watchGolfShouldStartActivity(state: WatchGolfActivityState): boolean {
  return state !== 'running' && state !== 'paused' && state !== 'ended';
}
