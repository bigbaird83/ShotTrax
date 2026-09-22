/**
 * Phone stores the offline paint pack. The watch does not.
 *
 * WCSession on this app is already taken:
 * - `updateApplicationContext` is the club list. Replacing it would drop clubs.
 * - `transferUserInfo` / `sendMessage` carry club, putt, nearby, and startRound.
 *   The watch applies application context as a club list and ignores other types.
 *
 * There is no channel that can deliver a course paint pack without pretending
 * the watch is ready. Until a dedicated pack transfer exists and the watch
 * reads it, this stays unsupported.
 *
 * TODO: add a Watch paint-pack message the watch actually applies, on a path
 * that does not overwrite the club-list application context. Then flip
 * `watchPaintPackSyncSupported` and send the saved pack. Do not show a
 * Watch-ready badge before that ships.
 */

export type WatchPaintPackSync = {
  supported: false;
  reason: 'wcsession-club-list-context';
};

export function watchPaintPackSync(): WatchPaintPackSync {
  return { supported: false, reason: 'wcsession-club-list-context' };
}

export function watchPaintPackSyncSupported(): false {
  return false;
}

/** Never claim the watch has the course. Phone offline state is the only one. */
export function watchShowsReadyOffline(): false {
  return false;
}

export function queueWatchPaintPack(): null {
  return null;
}
