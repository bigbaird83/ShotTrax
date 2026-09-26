import {
  clubAverageFromShots,
  type AverageSeed,
  type AverageShot,
  type ClubAverage,
} from './averages';
import { isPutterClubId } from './defaultBag';
import { planDispersion, type DispersionShotIn } from './dispersion';
import { isValidLatLng, type LatLng } from './latLng';
import { includeInDistanceAverages, planPlacedShot, type PlacedShotPlan } from './shotSource';
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

/**
 * The spot the next shot measures from: the landing when one is stored,
 * otherwise the only stored pin. Missing both is "no stored position".
 */
export function shotStoredPosition(shot: {
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
}): LatLng | null {
  return shotToPin(shot) ?? shotFromPin(shot);
}

/** Move spot never pulls the pin onto a tee, green, fairway, or neighbor. */
export function moveSpotSnaps(): false {
  return false;
}

/** The draft pin is not a save. Drop and confirm both have to happen. */
export function moveSpotSavesBeforeConfirm(): false {
  return false;
}

export function moveSpotRewritesPutts(): false {
  return false;
}

export function moveSpotRewritesPenaltyOrder(): false {
  return false;
}

export type MoveSpotDraftOrigin = {
  point: LatLng;
  /** Stored pin, else the device, else the hole map center. Never a guessed save. */
  kind: 'stored' | 'device' | 'map_center';
};

/**
 * Where the draggable pin starts. A device or map-center pin is only a draft —
 * nothing is written until that pin is dropped and confirmed.
 */
export function moveSpotDraftOrigin(args: {
  stored: LatLng | null;
  device: LatLng | null;
  mapCenter: LatLng | null;
}): MoveSpotDraftOrigin | null {
  if (isValidLatLng(args.stored)) {
    return { point: { lat: args.stored.lat, lng: args.stored.lng }, kind: 'stored' };
  }
  if (isValidLatLng(args.device)) {
    return { point: { lat: args.device.lat, lng: args.device.lng }, kind: 'device' };
  }
  if (isValidLatLng(args.mapCenter)) {
    return { point: { lat: args.mapCenter.lat, lng: args.mapCenter.lng }, kind: 'map_center' };
  }
  return null;
}

/** Center of the hole map's frame points. Not the phone and not a course guess. */
export function frameMapCenter(points: readonly (LatLng | null | undefined)[]): LatLng | null {
  const valid = points.filter((point): point is LatLng => isValidLatLng(point));
  if (valid.length === 0) return null;
  const lat = valid.reduce((sum, point) => sum + point.lat, 0) / valid.length;
  const lng = valid.reduce((sum, point) => sum + point.lng, 0) / valid.length;
  const center = { lat, lng };
  return isValidLatLng(center) ? center : null;
}

function cloneShot(shot: Shot): Shot {
  return { ...shot };
}

function samePoint(a: LatLng | null, b: LatLng | null): boolean {
  return a != null && b != null && a.lat === b.lat && a.lng === b.lng;
}

/** Hand-moved pins use the same source and quality as a Dispersion placed shot. */
function markPlaced(shot: Shot): void {
  shot.source = 'placed';
  shot.fixQuality = null;
  shot.startFixQuality = null;
  shot.endFixQuality = null;
  shot.startAccuracyM = null;
  shot.endAccuracyM = null;
  shot.impossibleJump = false;
}

function recomputeDistance(shot: Shot): void {
  const from = shotFromPin(shot);
  const to = shotToPin(shot);
  if (!from || !to) {
    shot.distanceYards = null;
    return;
  }
  const plan = planPlacedShot(from, to);
  shot.distanceYards = plan.ok ? plan.distanceYards : null;
  if (shot.distanceYards != null) shot.typedYards = null;
}

export type MoveSpotApply =
  | { status: 'cancel'; shots: Shot[] }
  | { status: 'missing' }
  | { status: 'rejected'; shots: Shot[] }
  | {
      status: 'commit';
      shots: Shot[];
      editedId: string;
      /** Next shot, only when its start was this landing and both were rewritten. */
      nextId: string | null;
      point: LatLng;
    };

/**
 * Save the dropped pin as this shot's spot. Coordinates are the pin's lat/lng.
 * This shot's distance and, when the next shot was measured from this landing,
 * the next shot's distance are recomputed from the stored pins. Putts, scores,
 * and penalty order are not part of this plan. Cancel writes nothing.
 */
export function applyMoveShotSpot(args: {
  shots: Shot[];
  shotId: string;
  point: LatLng | null | undefined;
  dropped: boolean;
  confirmed: boolean;
}): MoveSpotApply {
  const original = args.shots.map(cloneShot);
  if (!args.confirmed || !args.dropped) {
    return { status: 'cancel', shots: original };
  }
  const ordered = original.map(cloneShot).sort((a, b) => a.seq - b.seq);
  const index = ordered.findIndex((shot) => shot.id === args.shotId);
  if (index < 0) return { status: 'missing' };
  if (!isValidLatLng(args.point)) return { status: 'rejected', shots: original };
  const point = { lat: args.point.lat, lng: args.point.lng };

  const current = ordered[index]!;
  const movingEnd = shotToPin(current) != null;
  const oldEnd = shotToPin(current);
  const edited = cloneShot(current);
  if (movingEnd || shotStoredPosition(current) == null) {
    edited.endLat = point.lat;
    edited.endLng = point.lng;
  } else {
    edited.startLat = point.lat;
    edited.startLng = point.lng;
  }
  markPlaced(edited);
  edited.suggested = false;
  recomputeDistance(edited);

  const byId = new Map(ordered.map((shot) => [shot.id, shot]));
  byId.set(edited.id, edited);

  let nextId: string | null = null;
  const next = ordered[index + 1];
  if (movingEnd && next && samePoint(shotFromPin(next), oldEnd)) {
    const neighbor = cloneShot(next);
    neighbor.startLat = point.lat;
    neighbor.startLng = point.lng;
    markPlaced(neighbor);
    recomputeDistance(neighbor);
    byId.set(neighbor.id, neighbor);
    nextId = neighbor.id;
  }

  return {
    status: 'commit',
    shots: original.map((shot) => byId.get(shot.id) ?? shot),
    editedId: edited.id,
    nextId,
    point,
  };
}

/** Club change keeps every pin and yard. Averages follow the new clubId. */
export function applyChangeShotClub(
  shots: Shot[],
  shotId: string,
  clubId: string,
): { ok: false } | { ok: true; shots: Shot[] } {
  const shot = shots.find((row) => row.id === shotId);
  if (!shot) return { ok: false };
  const plan = planChangeShotClub(shot, clubId);
  if (!plan.ok) return { ok: false };
  return {
    ok: true,
    shots: shots.map((row) => (row.id === shotId ? { ...row, clubId, suggested: false } : { ...row })),
  };
}

function averageSample(shot: Shot): AverageShot {
  const quality =
    shot.fixQuality === 'good' || shot.fixQuality === 'soft' || shot.fixQuality === 'forced'
      ? shot.fixQuality
      : null;
  return {
    yards: shot.distanceYards ?? 0,
    fixQuality: shot.source === 'placed' ? null : quality,
  };
}

/** Club average from these stored rows. Putter / no-GPS / none stay out. */
export function clubAverageForShots(shots: Shot[], clubId: string, seed: AverageSeed): ClubAverage {
  const samples = shots
    .filter(
      (shot) =>
        shot.clubId === clubId &&
        includeInDistanceAverages({
          source: shot.source,
          distanceYards: shot.distanceYards,
          fixQuality: shot.fixQuality,
          clubId: shot.clubId,
        }),
    )
    .map(averageSample);
  return clubAverageFromShots(samples, seed);
}

/** Dispersion for one stored shot. Placed edits count as placed; no green → skipped. */
export function dispersionForShot(
  shot: Shot,
  green: LatLng | null,
): { placed: boolean; along: number; lateral: number } | null {
  const input: DispersionShotIn = {
    shotId: shot.id,
    clubId: shot.clubId,
    source: shot.source,
    fixQuality: shot.fixQuality,
    distanceYards: shot.distanceYards,
    impossibleJump: shot.impossibleJump,
    start: shotFromPin(shot),
    end: shotToPin(shot),
    green: isValidLatLng(green) ? green : null,
    playedAt: shot.startedAt,
    courseName: null,
    holeNumber: 1,
  };
  const plan = planDispersion([input], shot.clubId ?? '');
  const point = plan.points[0];
  if (!point) return null;
  return { placed: point.placed, along: point.along, lateral: point.lateral };
}
