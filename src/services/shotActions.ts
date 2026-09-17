import { Alert } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  applyClosedShot,
  getHole,
  getOpenShotForHole,
  insertNoGpsShot,
  insertOpenShot,
  insertPenalty,
  nextShotSeq,
  setRoundLastClub,
  undoLastShot as undoLastShotInRepo,
} from '../db/repo';
import { planDrop } from '../domain/drop';
import { worstFixQuality } from '../domain/fixQuality';
import type { ClosedShotPlan, MarkPlan } from '../domain/markShot';
import { preferWatchFix } from '../domain/preferWatchFix';
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
  },
): Promise<{ plan: MarkPlan; fix: GpsFix }> {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const fix = await resolveMarkFix(args.watchFix);
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

export function undoLastShot(
  db: SQLiteDatabase,
  args: { roundId: string; holeNumber: number },
): boolean {
  return undoLastShotInRepo(db, args.roundId, args.holeNumber).ok;
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
