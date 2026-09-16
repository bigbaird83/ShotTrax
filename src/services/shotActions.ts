import { Alert } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  applyClosedShot,
  getHole,
  getOpenShotForHole,
  insertNoGpsShot,
  insertOpenShot,
  nextShotSeq,
} from '../db/repo';
import { worstFixQuality } from '../domain/fixQuality';
import type { ClosedShotPlan, MarkPlan } from '../domain/markShot';
import type { GpsFix, OpenShot } from '../domain/types';
import { acceptFix, forceMark, getFix } from '../sensing/api';

function describePoorGps(accuracyM: number | null): string {
  const acc = accuracyM == null ? 'unknown' : `${Math.round(accuracyM)} m`;
  return `GPS accuracy is ${acc} (soft window is 15–25 m; worse than 25 m needs Force). Forcing stores this shot as FORCED. It still counts in club averages.`;
}

function describeJump(yards: number): string {
  return `${yards} yd is over the 400 yd impossible-jump gate. Forcing stores the distance as FORCED. It still counts in club averages.`;
}

export function promptForPlan(plan: MarkPlan, onForce: () => void): boolean {
  if (plan.status === 'needs_force_poor_gps') {
    Alert.alert('Weak GPS', describePoorGps(plan.accuracyM), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Force mark', onPress: onForce },
    ]);
    return true;
  }
  if (plan.status === 'needs_force_impossible_jump') {
    Alert.alert('Impossible jump', describeJump(plan.yards), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Force anyway', onPress: onForce },
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

export async function markShotWithClub(
  db: SQLiteDatabase,
  args: { roundId: string; holeNumber: number; clubId: string; force?: boolean },
): Promise<{ plan: MarkPlan; fix: GpsFix }> {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const fix = await getFix();
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
  const fix = await getFix();
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
  // Sensing lock: missed-mark does not call getFix / acceptFix / haversine.
  return insertNoGpsShot(db, {
    holeId: hole.id,
    clubId: args.clubId,
    seq: nextShotSeq(db, hole.id),
    typedYards: args.typedYards ?? null,
  });
}
