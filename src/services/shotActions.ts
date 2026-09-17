import { Alert } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  applyClosedShot,
  getHole,
  getOpenShotForHole,
  insertNoGpsShot,
  insertOpenShot,
  insertPenalty,
  applyShotPlacement,
  getShot,
  insertPlacedShot,
  insertPlacedShotAtSeq,
  nextShotSeq,
  restoreShotSnapshot,
  sealOpenShotWithoutGps,
  setRoundLastClub,
  undoLastShot as undoLastShotInRepo,
  updateShotClub,
} from '../db/repo';
import { planDrop } from '../domain/drop';
import { worstFixQuality } from '../domain/fixQuality';
import type { ClosedShotPlan, MarkPlan } from '../domain/markShot';
import { preferWatchFix } from '../domain/preferWatchFix';
import { isPutterClubId } from '../domain/defaultBag';
import type { LatLng } from '../domain/latLng';
import { planChangeShotClub, planMoveShotPin, type ShotEditSnapshot } from '../domain/shotEdit';
import { confirmPlacedShot, placedShotRunsAcceptFix, planPlacedShot } from '../domain/shotSource';
import type { GpsFix, OpenShot, PenaltyReason } from '../domain/types';
import { COPY } from '../domain/playerCopy';
import { acceptFix, forceMark } from '../sensing/api';
import { getCurrentFix } from './location';

export function promptForPlan(plan: MarkPlan, onForce: () => void): boolean {
  if (plan.status === 'needs_force_poor_gps') {
    Alert.alert(COPY.weakLocation, '', [
      { text: COPY.cancel, style: 'cancel' },
      { text: COPY.markAnyway, onPress: onForce },
    ]);
    return true;
  }
  if (plan.status === 'needs_force_impossible_jump') {
    Alert.alert(COPY.tooFar, '', [
      { text: COPY.cancel, style: 'cancel' },
      { text: COPY.markAnyway, onPress: onForce },
    ]);
    return true;
  }
  return false;
}

function priorOf(open: OpenShot | null) {
  return open ? { lat: open.startLat, lng: open.startLng } : null;
}

function closePriorFrom(
  open: OpenShot,
  fix: GpsFix,
  quality: ClosedShotPlan['fixQuality'],
  yards: number,
  impossibleJump: boolean,
): ClosedShotPlan {
  const overall = impossibleJump ? 'forced' : worstFixQuality(open.startFixQuality, quality);
  return {
    shotId: open.id,
    endLat: fix.lat,
    endLng: fix.lng,
    endAccuracyM: fix.accuracyM,
    endFixQuality: quality,
    distanceYards: yards,
    impossibleJump,
    fixQuality: overall,
  };
}

function decide(fix: GpsFix, open: OpenShot | null, force: boolean): MarkPlan {
  const prior = priorOf(open);
  const result = force ? forceMark(fix, prior) : acceptFix(fix, prior);
  if (!result.ok) {
    if (result.reason === 'poor_gps') {
      return { status: 'needs_force_poor_gps', accuracyM: result.accuracyM };
    }
    return { status: 'needs_force_impossible_jump', yards: result.yards };
  }
  return {
    status: 'commit',
    startFixQuality: result.fixQuality,
    closePrior:
      open && result.yards != null
        ? closePriorFrom(open, fix, result.fixQuality, result.yards, result.impossibleJump)
        : null,
  };
}

export async function resolveMarkFix(watchFix?: GpsFix | null): Promise<GpsFix> {
  let phoneFix: GpsFix | null = null;
  let phoneError: unknown = null;
  try {
    phoneFix = await getCurrentFix();
  } catch (err) {
    phoneError = err;
  }
  const chosen = preferWatchFix({
    watchFix: watchFix ?? null,
    phoneFix,
    nowMs: Date.now(),
  });
  if (chosen.fix) return chosen.fix;
  if (phoneError instanceof Error) throw phoneError;
  throw new Error(COPY.locationOff);
}

export async function markShotWithClub(
  db: SQLiteDatabase,
  args: {
    roundId: string;
    holeNumber: number;
    clubId: string | null;
    force?: boolean;
    watchFix?: GpsFix | null;
    fixOverride?: GpsFix | null;
    suggested?: boolean;
  },
): Promise<{ plan: MarkPlan; fix: GpsFix }> {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const fix = args.fixOverride ?? (await resolveMarkFix(args.watchFix));
  const open = getOpenShotForHole(db, hole.id);
  const plan = decide(fix, open, Boolean(args.force));
  if (plan.status !== 'commit') {
    return { plan, fix };
  }

  db.withTransactionSync(() => {
    if (plan.closePrior) {
      applyClosedShot(db, plan.closePrior);
    }
    insertOpenShot(db, {
      holeId: hole.id,
      clubId: args.clubId,
      seq: nextShotSeq(db, hole.id),
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
      startFixQuality: plan.startFixQuality,
      suggested: Boolean(args.suggested),
    });
    if (args.clubId) {
      setRoundLastClub(db, args.roundId, args.clubId);
    }
  });
  return { plan, fix };
}

export async function endOpenShot(
  db: SQLiteDatabase,
  args: { roundId: string; holeNumber: number; force?: boolean },
): Promise<{ plan: MarkPlan; fix: GpsFix }> {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const open = getOpenShotForHole(db, hole.id);
  if (!open) {
    throw new Error('No open shot to close. Mark a shot first.');
  }
  const fix = await resolveMarkFix();
  const plan = decide(fix, open, Boolean(args.force));
  if (plan.status !== 'commit' || !plan.closePrior) {
    return { plan, fix };
  }
  applyClosedShot(db, plan.closePrior);
  return { plan, fix };
}

/**
 * Close the approach before the putt sheet. Never inserts a putter GPS shot and
 * never invents an end pin. If GPS cannot close the shot, seal it without coords
 * so the next tee cannot steal the approach's yards.
 */
export async function closeApproachBeforePutts(
  db: SQLiteDatabase,
  args: { roundId: string; holeNumber: number },
): Promise<void> {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) return;
  const open = getOpenShotForHole(db, hole.id);
  if (!open) return;
  try {
    const { plan } = await endOpenShot(db, { roundId: args.roundId, holeNumber: args.holeNumber });
    if (plan.status === 'commit') return;
    const forced = await endOpenShot(db, {
      roundId: args.roundId,
      holeNumber: args.holeNumber,
      force: true,
    });
    if (forced.plan.status === 'commit') return;
  } catch {
    // fall through to seal without coords
  }
  const stillOpen = getOpenShotForHole(db, hole.id);
  if (stillOpen) sealOpenShotWithoutGps(db, stillOpen.id);
}

export function addNoGpsShot(
  db: SQLiteDatabase,
  args: { roundId: string; holeNumber: number; clubId: string; typedYards?: number | null },
): string {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const id = insertNoGpsShot(db, {
    holeId: hole.id,
    clubId: args.clubId,
    seq: nextShotSeq(db, hole.id),
    typedYards: args.typedYards ?? null,
  });
  setRoundLastClub(db, args.roundId, args.clubId);
  return id;
}

export type AddPlacedShotResult =
  | { status: 'commit'; id: string }
  | { status: 'needs_confirm'; yards: number }
  | { status: 'rejected' };

export function addPlacedShot(
  db: SQLiteDatabase,
  args: {
    roundId: string;
    holeNumber: number;
    clubId: string;
    from: LatLng;
    to: LatLng;
    force?: boolean;
    /** When set, insert at this seq (between or append). Otherwise append after last. */
    seq?: number;
  },
): AddPlacedShotResult {
  if (isPutterClubId(args.clubId)) return { status: 'rejected' };
  if (placedShotRunsAcceptFix()) return { status: 'rejected' };
  const plan = planPlacedShot(args.from, args.to);
  if (!plan.ok) return { status: 'rejected' };
  const gate = confirmPlacedShot(plan, Boolean(args.force));
  if (gate.status !== 'commit') return gate;
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const seq = args.seq ?? nextShotSeq(db, hole.id);
  const id =
    args.seq != null
      ? insertPlacedShotAtSeq(db, {
          holeId: hole.id,
          clubId: args.clubId,
          seq,
          from: args.from,
          to: args.to,
        })
      : insertPlacedShot(db, {
          holeId: hole.id,
          clubId: args.clubId,
          seq,
          from: args.from,
          to: args.to,
        });
  if (!id) return { status: 'rejected' };
  setRoundLastClub(db, args.roundId, args.clubId);
  return { status: 'commit', id };
}

export function undoLastShot(
  db: SQLiteDatabase,
  args: { roundId: string; holeNumber: number },
): boolean {
  return undoLastShotInRepo(db, args.roundId, args.holeNumber).ok;
}

export type ShotEditResult =
  | { status: 'commit'; snapshot: ShotEditSnapshot }
  | { status: 'needs_confirm'; yards: number }
  | { status: 'rejected' };

export function changeShotClub(
  db: SQLiteDatabase,
  args: { roundId: string; shotId: string; clubId: string },
): ShotEditResult {
  const shot = getShot(db, args.shotId);
  if (!shot) return { status: 'rejected' };
  const plan = planChangeShotClub(shot, args.clubId);
  if (!plan.ok) return { status: 'rejected' };
  updateShotClub(db, args.shotId, args.clubId);
  setRoundLastClub(db, args.roundId, args.clubId);
  return { status: 'commit', snapshot: plan.snapshot };
}

export function moveShotPin(
  db: SQLiteDatabase,
  args: { shotId: string; which: 'from' | 'to'; point: LatLng; force?: boolean },
): ShotEditResult {
  const shot = getShot(db, args.shotId);
  if (!shot) return { status: 'rejected' };
  const planned = planMoveShotPin(shot, args.which, args.point);
  if (!planned.ok) return { status: 'rejected' };
  const gate = confirmPlacedShot(planned.plan, Boolean(args.force));
  if (gate.status !== 'commit') return gate;
  const ok = applyShotPlacement(db, args.shotId, planned.from, planned.to);
  if (!ok) return { status: 'rejected' };
  return { status: 'commit', snapshot: planned.snapshot };
}

export function undoShotEdit(db: SQLiteDatabase, snapshot: ShotEditSnapshot): boolean {
  const shot = getShot(db, snapshot.id);
  if (!shot) return false;
  restoreShotSnapshot(db, snapshot);
  return true;
}

export async function takeDrop(
  db: SQLiteDatabase,
  args: {
    roundId: string;
    holeNumber: number;
    reason: PenaltyReason;
    note?: string | null;
    force?: boolean;
  },
): Promise<{ plan: MarkPlan; fix: GpsFix }> {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const drop = planDrop({ reason: args.reason, note: args.note });
  const fix = await resolveMarkFix();
  const open = getOpenShotForHole(db, hole.id);
  const plan = decide(fix, open, Boolean(args.force));
  if (open && plan.status !== 'commit') {
    return { plan, fix };
  }
  db.withTransactionSync(() => {
    if (plan.status === 'commit' && plan.closePrior) {
      applyClosedShot(db, plan.closePrior);
    }
    insertPenalty(db, {
      holeId: hole.id,
      par: hole.par,
      currentScore: hole.score,
      strokes: drop.strokes,
      reason: drop.reason,
      note: drop.note,
      kind: 'drop',
      lat: fix.lat,
      lng: fix.lng,
    });
  });
  return { plan: { status: 'commit', startFixQuality: 'good', closePrior: null }, fix };
}
