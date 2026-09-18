import { includeInDistanceAverages } from './shotSource';
import { yardsFromShotPins, type NeighborSnapshot } from './insertShot';
import { COPY } from './playerCopy';
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
      /** Only shots whose own pin-to-pin yards actually changed. */
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

function pinsUnchanged(before: Shot, after: Shot): boolean {
  return (
    before.startLat === after.startLat &&
    before.startLng === after.startLng &&
    before.endLat === after.endLat &&
    before.endLng === after.endLng
  );
}

/**
 * Keep stored yards when pins did not move. If pins did change, recompute from
 * those pins only — never invent a point or stretch a neighbor across the gap.
 * Skip the write when the number is the same.
 */
export function yardsIfDistanceChanged(before: Shot, after: Shot): number | null | undefined {
  if (pinsUnchanged(before, after)) return undefined;
  const next = yardsFromShotPins(after);
  return next !== after.distanceYards ? next : undefined;
}

export function planDeleteShot(shots: Shot[], shotId: string): DeleteShotPlan {
  if (!shotId) return { ok: false };
  const ordered = [...shots].sort((a, b) => a.seq - b.seq).map((shot) => ({ ...shot }));
  const index = ordered.findIndex((shot) => shot.id === shotId);
  if (index < 0) return { ok: false };

  const deleted = ordered[index];
  const remainingRaw = ordered.filter((shot) => shot.id !== shotId);
  const remaining = remainingRaw.map((shot, seqIndex) => ({ ...shot, seq: seqIndex + 1 }));
  const neighbors = [ordered[index - 1], ordered[index + 1]].filter(Boolean).map(pinSnapshot);
  const yardsUpdates: DeleteYardsUpdate[] = [];
  for (const after of remaining) {
    const before = remainingRaw.find((shot) => shot.id === after.id);
    if (!before) continue;
    const next = yardsIfDistanceChanged(before, after);
    if (next !== undefined) yardsUpdates.push({ id: after.id, distanceYards: next });
  }

  return {
    ok: true,
    deleteShotId: deleted.id,
    deleted,
    shots: ordered,
    remaining,
    renumber: planRenumberAfterDelete(ordered, deleted.id),
    neighbors,
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
export function remainingAverageShots(shots: Shot[]): { yards: number; fixQuality: Shot['fixQuality'] }[] {
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
