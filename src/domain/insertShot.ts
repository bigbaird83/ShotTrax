import { isPutterClubId } from './defaultBag';
import { isValidLatLng, type LatLng } from './latLng';
import { planPlacedShot, type PlacedShotPlan } from './shotSource';
import { shotFromPin, shotToPin } from './shotEdit';
import type { Shot } from './types';

export type InsertSlot = {
  /** Shot this + sits after. Null only when the hole has no shots (append at seq 1). */
  afterShotId: string | null;
  /** Seq the new shot will take. Existing shots at this seq and after increment. */
  seq: number;
  append: boolean;
};

export type ShotSeq = { id: string; seq: number };

/**
 * + between each pair of shots and after the last one.
 * One shot → append after it. Two shots → insert between, then append.
 */
export function planInsertSlots(shots: ShotSeq[]): InsertSlot[] {
  const ordered = [...shots].sort((a, b) => a.seq - b.seq);
  if (ordered.length === 0) {
    return [{ afterShotId: null, seq: 1, append: true }];
  }
  return ordered.map((shot, index) => ({
    afterShotId: shot.id,
    seq: shot.seq + 1,
    append: index === ordered.length - 1,
  }));
}

export function planRenumberAfterInsert(shots: ShotSeq[], insertSeq: number): { id: string; seq: number }[] {
  return shots
    .filter((shot) => shot.seq >= insertSeq)
    .sort((a, b) => b.seq - a.seq)
    .map((shot) => ({ id: shot.id, seq: shot.seq + 1 }));
}

/** Haversine yards from the shot's own pins. Missing pin → null (never invent). */
export function yardsFromShotPins(shot: {
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
}): number | null {
  const from = shotFromPin(shot);
  const to = shotToPin(shot);
  if (!from || !to) return null;
  const plan = planPlacedShot(from, to);
  return plan.ok ? plan.distanceYards : null;
}

export type NeighborSnapshot = {
  id: string;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  distanceYards: number | null;
};

export type InsertPlacedPlan =
  | { ok: false }
  | {
      ok: true;
      seq: number;
      append: boolean;
      clubId: string;
      plan: { ok: true } & PlacedShotPlan;
      renumber: { id: string; seq: number }[];
      /** Neighbors stay exactly as stored. Do not move pins or rewrite yards. */
      neighbors: NeighborSnapshot[];
    };

/** Insert never shares endpoints or invents a gap-fill point. */
export function insertMovesNeighborPins(): false {
  return false;
}

export function insertSharesEndpoints(): false {
  return false;
}

export function insertRewritesNeighborYards(): false {
  return false;
}

/**
 * Insert a catch-up Placed shot at `seq` (between or append).
 * Yards = haversine of that shot's own from/to taps. Neighbors keep pins and yards.
 */
export function planInsertPlacedShot(args: {
  shots: Shot[];
  seq: number;
  from: LatLng;
  to: LatLng;
  clubId: string;
}): InsertPlacedPlan {
  if (!args.clubId || isPutterClubId(args.clubId)) return { ok: false };
  if (!isValidLatLng(args.from) || !isValidLatLng(args.to)) return { ok: false };
  if (!Number.isInteger(args.seq) || args.seq < 1) return { ok: false };
  const plan = planPlacedShot(args.from, args.to);
  if (!plan.ok) return { ok: false };
  const ordered = [...args.shots].sort((a, b) => a.seq - b.seq);
  const maxSeq = ordered.length === 0 ? 0 : ordered[ordered.length - 1].seq;
  const append = args.seq > maxSeq;
  const renumber = planRenumberAfterInsert(ordered, args.seq);
  const neighbors = ordered
    .filter((shot) => shot.seq === args.seq - 1 || shot.seq === args.seq)
    .map((shot) => ({
      id: shot.id,
      startLat: shot.startLat,
      startLng: shot.startLng,
      endLat: shot.endLat,
      endLng: shot.endLng,
      distanceYards: shot.distanceYards,
    }));
  return {
    ok: true,
    seq: args.seq,
    append,
    clubId: args.clubId,
    plan,
    renumber,
    neighbors,
  };
}
