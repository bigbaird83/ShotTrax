import { MAX_SHOT_YD } from '../config/sensing';
import { classifyAccuracyM, qualityFromAccuracy, worstFixQuality } from './fixQuality';
import { haversineYards, roundYards } from './haversine';
import type { FixQuality, GpsFix, OpenShot } from './types';

export type ClosedShotPlan = {
  shotId: string;
  endLat: number;
  endLng: number;
  endAccuracyM: number | null;
  endFixQuality: FixQuality;
  distanceYards: number;
  impossibleJump: boolean;
  fixQuality: FixQuality;
};

export type MarkPlan =
  | { status: 'needs_force_poor_gps'; accuracyM: number | null }
  | { status: 'needs_force_impossible_jump'; yards: number }
  | { status: 'blocked' }
  | {
      status: 'commit';
      startFixQuality: FixQuality | null;
      closePrior: ClosedShotPlan | null;
    };

export type MarkFlags = {
  forcePoorGps?: boolean;
  forceJump?: boolean;
};

function isImpossibleJump(yards: number): boolean {
  return yards > MAX_SHOT_YD;
}

function endQualityForFix(fix: GpsFix, forcePoorGps: boolean, forceJump: boolean): FixQuality {
  const fromGps = qualityFromAccuracy(fix.accuracyM, forcePoorGps);
  return forceJump ? 'forced' : fromGps;
}

export function planCloseOpenShot(
  open: OpenShot,
  fix: GpsFix,
  flags: MarkFlags = {},
): Extract<MarkPlan, { status: 'needs_force_impossible_jump' }> | { status: 'ok'; close: ClosedShotPlan } {
  const yardsRaw = haversineYards(
    { lat: open.startLat, lng: open.startLng },
    { lat: fix.lat, lng: fix.lng },
  );
  const jump = isImpossibleJump(yardsRaw);
  if (jump && !flags.forceJump) {
    return { status: 'needs_force_impossible_jump', yards: roundYards(yardsRaw) };
  }
  const endFixQuality = endQualityForFix(fix, Boolean(flags.forcePoorGps), jump);
  const overall = jump
    ? 'forced'
    : open.startFixQuality
      ? worstFixQuality(open.startFixQuality, endFixQuality)
      : endFixQuality;
  return {
    status: 'ok',
    close: {
      shotId: open.id,
      endLat: fix.lat,
      endLng: fix.lng,
      endAccuracyM: fix.accuracyM,
      endFixQuality,
      distanceYards: roundYards(yardsRaw),
      impossibleJump: jump,
      fixQuality: overall,
    },
  };
}

/**
 * Club-pick mark: GPS now is the new shot start.
 * If a shot is still open on this hole, that shot's end is this same fix
 * (end = next mark) after the 400 yd / accuracy gates.
 */
export function planMarkShot(
  fix: GpsFix,
  openOnHole: OpenShot | null,
  flags: MarkFlags = {},
): MarkPlan {
  const acc = classifyAccuracyM(fix.accuracyM);
  if (acc === 'poor' && !flags.forcePoorGps) {
    return { status: 'needs_force_poor_gps', accuracyM: fix.accuracyM };
  }

  const startFixQuality = qualityFromAccuracy(fix.accuracyM, Boolean(flags.forcePoorGps));

  if (!openOnHole) {
    return { status: 'commit', startFixQuality, closePrior: null };
  }

  const closed = planCloseOpenShot(openOnHole, fix, flags);
  if (closed.status === 'needs_force_impossible_jump') {
    return closed;
  }
  return { status: 'commit', startFixQuality, closePrior: closed.close };
}

/** End the open shot at this GPS without starting a new one. */
export function planEndShot(fix: GpsFix, open: OpenShot, flags: MarkFlags = {}): MarkPlan {
  const acc = classifyAccuracyM(fix.accuracyM);
  if (acc === 'poor' && !flags.forcePoorGps) {
    return { status: 'needs_force_poor_gps', accuracyM: fix.accuracyM };
  }
  const closed = planCloseOpenShot(open, fix, flags);
  if (closed.status === 'needs_force_impossible_jump') {
    return closed;
  }
  return {
    status: 'commit',
    startFixQuality: closed.close.endFixQuality,
    closePrior: closed.close,
  };
}
