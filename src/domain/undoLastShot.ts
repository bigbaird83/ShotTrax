import { isValidLatLng, type LatLng } from './latLng';
import type { Shot } from './types';

export type UndoPlan = {
  deleteShotId: string;
  reopenShotId: string | null;
  nextLastClubId: string | null;
};

export type PlacePinState = {
  from: LatLng | null;
  to: LatLng | null;
};

export type UndoPlacePinsPlan = {
  from: LatLng | null;
  to: LatLng | null;
  mode: 'from' | 'to';
};

/** Undo the last placed from/to pin while catch-up is still open. */
export function planUndoPlacePins(state: PlacePinState): UndoPlacePinsPlan | null {
  if (state.to && isValidLatLng(state.to)) {
    return { from: state.from && isValidLatLng(state.from) ? state.from : null, to: null, mode: 'to' };
  }
  if (state.from && isValidLatLng(state.from)) {
    return { from: null, to: null, mode: 'from' };
  }
  return null;
}

/**
 * Undo the last shot on a hole.
 * Open GPS mark → delete it and reopen the prior GPS shot if that mark closed it.
 * Closed GPS / no-GPS → delete the last row (or reopen if it was an "end last shot").
 */
export function planUndoLastShot(shots: Shot[]): UndoPlan | null {
  if (shots.length === 0) return null;
  const ordered = [...shots].sort((a, b) => a.seq - b.seq);
  const last = ordered[ordered.length - 1];
  const prior = ordered[ordered.length - 2] ?? null;

  const lastIsOpenGps = last.source === 'gps' && last.endedAt == null && last.startLat != null;
  if (lastIsOpenGps) {
    const reopen =
      prior && prior.source === 'gps' && prior.endedAt != null && prior.startLat != null
        ? prior.id
        : null;
    const remaining = ordered.slice(0, -1);
    const nextLastClubId =
      [...remaining].reverse().find((shot) => shot.clubId)?.clubId ??
      (reopen ? prior?.clubId ?? null : null);
    return {
      deleteShotId: last.id,
      reopenShotId: reopen,
      nextLastClubId,
    };
  }

  const remaining = ordered.slice(0, -1);
  const nextLastClubId = [...remaining].reverse().find((shot) => shot.clubId)?.clubId ?? null;
  return {
    deleteShotId: last.id,
    reopenShotId: null,
    nextLastClubId,
  };
}
