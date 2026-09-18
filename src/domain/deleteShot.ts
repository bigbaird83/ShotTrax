import {
  clubAverageFromShots,
  shotsForClubAverage,
  type AverageSeed,
  type AverageShot,
  type ClubAverage,
} from './averages';
import { includeInDistanceAverages } from './shotSource';
import { yardsFromShotPins, type NeighborSnapshot } from './insertShot';
import { clubBookCarry, type ClubBookCarry } from './nerdOut';
import { COPY } from './playerCopy';
import { MIN_CLOSED_SHOTS_FOR_RANK, rankDistanceYards } from './rankClubs';
import type { Shot } from './types';

/** Player-facing confirm. Cancel is the default. Not a swipe and not undo-only. */
export const DELETE_SHOT_PROMPT = 'Delete this shot?';

export type ShotPinSnapshot = NeighborSnapshot & {
  seq: number;
};

export type DeleteYardsUpdate = {
  id: string;
  distanceYards: number | null;
};

export type DeleteShotPlan =
  | { ok: false }
  | {
      ok: true;
      deleteShotId: string;
      deleted: Shot;
      /** Original hole, including the shot that would be removed. */
      shots: Shot[];
      remaining: Shot[];
      renumber: { id: string; seq: number }[];
      /** Previous and next shots. Pins stay exactly as stored. */
      neighbors: ShotPinSnapshot[];
      /** Only when a neighbor's end was the deleted shot's start and yards actually change. */
      yardsUpdates: DeleteYardsUpdate[];
      nextLastClubId: string | null;
    };

export type DeleteShotPrompt = {
  title: typeof DELETE_SHOT_PROMPT;
  cancel: typeof COPY.cancel;
  confirm: typeof COPY.deleteShot;
  cancelIsDefault: true;
};

/** Same confirm on phone and on Watch if a shot list is already there. */
export function deleteShotPrompt(): DeleteShotPrompt {
  return {
    title: DELETE_SHOT_PROMPT,
    cancel: COPY.cancel,
    confirm: COPY.deleteShot,
    cancelIsDefault: true,
  };
}

export function deleteMovesNeighborPins(): false {
  return false;
}

export function deleteFillsGap(): false {
  return false;
}

export function deleteInventsPoints(): false {
  return false;
}

/** Delete is not undo. Removing a middle or live shot does not reopen a neighbor. */
export function deleteReopensNeighbor(): false {
  return false;
}

export function planRenumberAfterDelete(
  shots: { id: string; seq: number }[],
  deleteShotId: string,
): { id: string; seq: number }[] {
  const remaining = [...shots].filter((shot) => shot.id !== deleteShotId).sort((a, b) => a.seq - b.seq);
  return remaining
    .map((shot, index) => ({ id: shot.id, seq: index + 1 }))
    .filter((row, index) => row.seq !== remaining[index].seq);
}

function pinSnapshot(shot: Shot): ShotPinSnapshot {
  return {
    id: shot.id,
    startLat: shot.startLat,
    startLng: shot.startLng,
    endLat: shot.endLat,
    endLng: shot.endLng,
    distanceYards: shot.distanceYards,
    seq: shot.seq,
  };
}

function sameStoredPoint(
  a: { lat: number | null; lng: number | null },
  b: { lat: number | null; lng: number | null },
): boolean {
  return a.lat != null && a.lng != null && a.lat === b.lat && a.lng === b.lng;
}

/** Previous shot closed by this mark: its landing is the deleted shot's start. */
export function neighborEndWasDeletedStart(neighbor: Shot, deleted: Shot): boolean {
  return sameStoredPoint(
    { lat: neighbor.endLat, lng: neighbor.endLng },
    { lat: deleted.startLat, lng: deleted.startLng },
  );
}

/**
 * Neighbor pins stay put. Yards rewrite only when that neighbor's end was the
 * deleted shot's start and the pin-to-pin number actually changed. Never invent
 * a point or stretch a neighbor across the gap.
 */
export function neighborYardsUpdate(neighbor: Shot, deleted: Shot): DeleteYardsUpdate | null {
  if (!neighborEndWasDeletedStart(neighbor, deleted)) return null;
  const next = yardsFromShotPins(neighbor);
  if (next === neighbor.distanceYards) return null;
  return { id: neighbor.id, distanceYards: next };
}

export function planDeleteShot(shots: Shot[], shotId: string): DeleteShotPlan {
  if (!shotId) return { ok: false };
  const ordered = [...shots].sort((a, b) => a.seq - b.seq).map((shot) => ({ ...shot }));
  const index = ordered.findIndex((shot) => shot.id === shotId);
  if (index < 0) return { ok: false };

  const deleted = ordered[index];
  const remainingRaw = ordered.filter((shot) => shot.id !== shotId);
  const remaining = remainingRaw.map((shot, seqIndex) => ({ ...shot, seq: seqIndex + 1 }));
  const neighborShots = [ordered[index - 1], ordered[index + 1]].filter((shot): shot is Shot => Boolean(shot));
  const yardsUpdates: DeleteYardsUpdate[] = [];
  for (const neighbor of neighborShots) {
    const update = neighborYardsUpdate(neighbor, deleted);
    if (!update) continue;
    yardsUpdates.push(update);
    const row = remaining.find((shot) => shot.id === update.id);
    if (row) row.distanceYards = update.distanceYards;
  }

  return {
    ok: true,
    deleteShotId: deleted.id,
    deleted,
    shots: ordered,
    remaining,
    renumber: planRenumberAfterDelete(ordered, deleted.id),
    neighbors: neighborShots.map(pinSnapshot),
    yardsUpdates,
    nextLastClubId: [...remaining].reverse().find((shot) => shot.clubId)?.clubId ?? null,
  };
}

export function applyDeleteShot(args: {
  shots: Shot[];
  shotId: string;
  confirmed: boolean;
}):
  | { status: 'cancel'; shots: Shot[] }
  | { status: 'missing' }
  | {
      status: 'commit';
      remaining: Shot[];
      plan: Extract<DeleteShotPlan, { ok: true }>;
    } {
  const plan = planDeleteShot(args.shots, args.shotId);
  if (!plan.ok) return { status: 'missing' };
  if (!args.confirmed) {
    return { status: 'cancel', shots: plan.shots.map((shot) => ({ ...shot })) };
  }
  return { status: 'commit', remaining: plan.remaining.map((shot) => ({ ...shot })), plan };
}

/** Average samples after a delete. Putter / no-GPS / none stay out. Caller still applies the 20% filter. */
export function remainingAverageShots(shots: Shot[]): AverageShot[] {
  return shots
    .filter((shot) =>
      includeInDistanceAverages({
        source: shot.source,
        distanceYards: shot.distanceYards,
        fixQuality: shot.fixQuality,
        clubId: shot.clubId,
      }),
    )
    .map((shot) => ({
      yards: shot.distanceYards ?? 0,
      fixQuality: shot.source === 'placed' ? null : shot.fixQuality === 'none' ? null : shot.fixQuality,
    }));
}

export type CarryAfterDelete = {
  kept: AverageShot[];
  average: ClubAverage;
  /** Suggested rank yards. Live average only after five kept shots; else the seed. */
  rankYards: number | null;
  book: ClubBookCarry;
};

/**
 * Recompute the club after a delete. The shot leaves the average and the five
 * real shots that replace the seed. No real shots left → typed or estimated
 * carry comes back. Never a carry → blank. Never invent one.
 */
export function carryAfterDelete(args: {
  remainingForClub: AverageShot[];
  seed: AverageSeed;
}): CarryAfterDelete {
  const kept = shotsForClubAverage(args.remainingForClub, args.seed);
  const average = clubAverageFromShots(args.remainingForClub, args.seed);
  const typical =
    args.seed.typedCarryYards != null
      ? args.seed.typedCarryYards
      : args.seed.estimatedCarryYards;
  const carrySource =
    args.seed.typedCarryYards != null
      ? 'typed'
      : args.seed.estimatedCarryYards != null
        ? 'estimated'
        : null;
  const book = clubBookCarry({
    count: average.count,
    avgYards: average.avgYards,
    typicalCarryYards: typical,
    carrySource,
  });
  const rankYards = rankDistanceYards({
    id: 'club',
    name: 'Club',
    shortName: 'C',
    loftRank: 0,
    avgYards: average.avgYards,
    count: average.count,
    typicalCarryYards: typical,
  });
  return { kept, average, rankYards, book };
}

export function deleteReplacesSeedAt(): number {
  return MIN_CLOSED_SHOTS_FOR_RANK;
}
