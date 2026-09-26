/**
 * Which Watch surface is up while editing the last shot.
 * The hole face is where the confirmation flash is drawn.
 * None of these moves start the 30-second shot hold.
 */

import { WATCH_CLUB_CHANGED } from './watchShotClubChange';
import { WATCH_SHOT_DELETED } from './watchShotUndo';

export type WatchEditPlace = 'hole' | 'edit' | 'changeClub';

export type WatchEditAction = 'openEdit' | 'back' | 'openChangeClub' | 'pickClub' | 'deleteShot';

export type WatchEditNavigation = {
  place: WatchEditPlace;
  /** Confirmation line the hole screen shows. Back has none. */
  flash: typeof WATCH_CLUB_CHANGED | typeof WATCH_SHOT_DELETED | null;
  startsShotHold: false;
};

/**
 * After Change club or Delete shot, the wrist is back on the hole and the
 * confirmation flash belongs on that screen. Back from Edit shot returns to
 * the hole. Back from the club list also returns to the hole.
 */
export function planWatchEditNavigation(place: WatchEditPlace, action: WatchEditAction): WatchEditNavigation {
  if (action === 'openEdit') {
    return { place: 'edit', flash: null, startsShotHold: false };
  }
  if (action === 'openChangeClub') {
    return { place: 'changeClub', flash: null, startsShotHold: false };
  }
  if (action === 'pickClub') {
    return { place: 'hole', flash: WATCH_CLUB_CHANGED, startsShotHold: false };
  }
  if (action === 'deleteShot') {
    return { place: 'hole', flash: WATCH_SHOT_DELETED, startsShotHold: false };
  }
  // Back from Edit shot or from the club list.
  return { place: 'hole', flash: null, startsShotHold: false };
}

export function watchEditNavigationStartsShotHold(): false {
  return false;
}
