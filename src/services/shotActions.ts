import { Alert } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { MarkFlags, MarkPlan } from '../domain/markShot';
import { planEndShot, planMarkShot } from '../domain/markShot';
import type { GpsFix } from '../domain/types';
import {
  applyClosedShot,
  getHole,
  getOpenShotForHole,
  insertOpenShot,
  nextShotSeq,
} from '../db/repo';
import { getCurrentFix } from './location';

export type ForceState = MarkFlags;

function describePoorGps(accuracyM: number | null): string {
  const acc = accuracyM == null ? 'unknown' : `${Math.round(accuracyM)} m`;
  return `GPS accuracy is ${acc} (soft window is 15–25 m; worse than 25 m needs Force). Forcing stores this shot as FORCED. It still counts in club averages.`;
}

function describeJump(yards: number): string {
  return `${yards} yd is over the 400 yd impossible-jump gate. Forcing stores the distance as FORCED. It still counts in club averages.`;
}

export function promptForPlan(
  plan: MarkPlan,
  onForce: (flags: ForceState) => void,
): boolean {
  if (plan.status === 'needs_force_poor_gps') {
    Alert.alert('Weak GPS', describePoorGps(plan.accuracyM), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Force mark', onPress: () => onForce({ forcePoorGps: true }) },
    ]);
    return true;
  }
  if (plan.status === 'needs_force_impossible_jump') {
    Alert.alert('Impossible jump', describeJump(plan.yards), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Force anyway', onPress: () => onForce({ forceJump: true }) },
    ]);
    return true;
  }
  return false;
}

export async function markShotWithClub(
  db: SQLiteDatabase,
  args: { roundId: string; holeNumber: number; clubId: string; flags?: ForceState },
): Promise<{ plan: MarkPlan; fix: GpsFix }> {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const fix = await getCurrentFix();
  const open = getOpenShotForHole(db, hole.id);
  const plan = planMarkShot(fix, open, args.flags);
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
  args: { roundId: string; holeNumber: number; flags?: ForceState },
): Promise<{ plan: MarkPlan; fix: GpsFix }> {
  const hole = getHole(db, args.roundId, args.holeNumber);
  if (!hole) {
    throw new Error(`Hole ${args.holeNumber} not found`);
  }
  const open = getOpenShotForHole(db, hole.id);
  if (!open) {
    throw new Error('No open shot to close. Mark a shot first.');
  }
  const fix = await getCurrentFix();
  const plan = planEndShot(fix, open, args.flags);
  if (plan.status !== 'commit' || !plan.closePrior) {
    return { plan, fix };
  }
  applyClosedShot(db, plan.closePrior);
  return { plan, fix };
}
