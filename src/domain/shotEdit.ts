import { isPutterClubId } from './defaultBag';
import { isValidLatLng, type LatLng } from './latLng';
import { planPlacedShot, type PlacedShotPlan } from './shotSource';
import type { Shot } from './types';

export type ShotEditSnapshot = {
  id: string;
  clubId: string | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  startAccuracyM: number | null;
  endAccuracyM: number | null;
  startFixQuality: Shot['startFixQuality'];
  endFixQuality: Shot['endFixQuality'];
  distanceYards: number | null;
  typedYards: number | null;
  fixQuality: Shot['fixQuality'];
  impossibleJump: boolean;
  source: Shot['source'];
  endedAt: string | null;
  suggested: boolean;
};

/** Edit uses stored pins or a map tap. Never the phone GPS. */
export function editReadsPhoneFix(): false {
  return false;
}

export function editRunsAcceptFix(): false {
  return false;
}

export function snapshotShot(shot: Shot): ShotEditSnapshot {
  return {
    id: shot.id,
    clubId: shot.clubId,
    startLat: shot.startLat,
    startLng: shot.startLng,
    endLat: shot.endLat,
    endLng: shot.endLng,
    startAccuracyM: shot.startAccuracyM,
    endAccuracyM: shot.endAccuracyM,
    startFixQuality: shot.startFixQuality,
    endFixQuality: shot.endFixQuality,
    distanceYards: shot.distanceYards,
    typedYards: shot.typedYards,
    fixQuality: shot.fixQuality,
    impossibleJump: shot.impossibleJump,
    source: shot.source,
    endedAt: shot.endedAt,
    suggested: shot.suggested,
  };
}

export function shotFromPin(shot: { startLat: number | null; startLng: number | null }): LatLng | null {
  if (shot.startLat == null || shot.startLng == null) return null;
  const point = { lat: shot.startLat, lng: shot.startLng };
  return isValidLatLng(point) ? point : null;
}

export function shotToPin(shot: { endLat: number | null; endLng: number | null }): LatLng | null {
  if (shot.endLat == null || shot.endLng == null) return null;
  const point = { lat: shot.endLat, lng: shot.endLng };
  return isValidLatLng(point) ? point : null;
}

/** Move from needs both pins so yards recompute. Never invents a missing landing. */
export function canMoveFromPin(shot: Shot): boolean {
  return shotFromPin(shot) != null && shotToPin(shot) != null;
}

/** Move to needs a from pin. Landing may be missing — that tap closes the shot as Placed. */
export function canMoveToPin(shot: Shot): boolean {
  return shotFromPin(shot) != null;
}

/**
 * Club-only change: keep coordinates and source. Putter stays out (scoring only).
 * Averages follow the new `clubId` on the next read.
 */
export function planChangeShotClub(
  shot: Shot,
  clubId: string,
): { ok: false } | { ok: true; snapshot: ShotEditSnapshot; clubId: string; keepsCoordinates: true } {
  if (!clubId || isPutterClubId(clubId)) return { ok: false };
  return { ok: true, snapshot: snapshotShot(shot), clubId, keepsCoordinates: true };
}

/**
 * Move from or to. Yards = haversine between the two pins. Shot becomes Placed
 * with no GPS quality — never acceptFix, never invented GPS.
 */
export function planMoveShotPin(
  shot: Shot,
  which: 'from' | 'to',
  point: LatLng,
):
  | { ok: false }
  | {
      ok: true;
      snapshot: ShotEditSnapshot;
      from: LatLng;
      to: LatLng;
      plan: { ok: true } & PlacedShotPlan;
    } {
  if (!isValidLatLng(point)) return { ok: false };
  if (which === 'from' && !canMoveFromPin(shot)) return { ok: false };
  if (which === 'to' && !canMoveToPin(shot)) return { ok: false };
  const from = which === 'from' ? point : shotFromPin(shot);
  const to = which === 'to' ? point : shotToPin(shot);
  if (!from || !to) return { ok: false };
  const plan = planPlacedShot(from, to);
  if (!plan.ok) return { ok: false };
  return { ok: true, snapshot: snapshotShot(shot), from, to, plan };
}
