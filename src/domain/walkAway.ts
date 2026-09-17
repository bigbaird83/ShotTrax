import { classifyAccuracyM } from './fixQuality';
import { haversineYards } from './haversine';
import type { GpsFix } from './types';

/** Signal Lab walk-away auto-mark. Assist only — club tap / Watch still primary. */
export const DWELL_S = 10;
export const DWELL_YD = 8;
export const LEAVE_YD = 20;
export const LEAVE_CONFIRM_FIXES = 2;

export type WalkAwayState = {
  cluster: GpsFix[];
  liePin: GpsFix | null;
  leaveHits: number;
  fired: boolean;
};

export function emptyWalkAway(): WalkAwayState {
  return { cluster: [], liePin: null, leaveHits: 0, fired: false };
}

function centroid(fixes: GpsFix[]): { lat: number; lng: number } | null {
  if (fixes.length === 0) return null;
  const lat = fixes.reduce((sum, fix) => sum + fix.lat, 0) / fixes.length;
  const lng = fixes.reduce((sum, fix) => sum + fix.lng, 0) / fixes.length;
  return { lat, lng };
}

function bestAccuracyFix(fixes: GpsFix[]): GpsFix {
  return [...fixes].sort((a, b) => {
    const aa = a.accuracyM != null && a.accuracyM > 0 ? a.accuracyM : Number.POSITIVE_INFINITY;
    const bb = b.accuracyM != null && b.accuracyM > 0 ? b.accuracyM : Number.POSITIVE_INFINITY;
    return aa - bb;
  })[0];
}

function dwellQualityOk(fix: GpsFix): boolean {
  return classifyAccuracyM(fix.accuracyM) !== 'poor';
}

/**
 * Step the dwell/leave tracker with one GPS sample.
 * Fires only after 10s inside 8 yd, then 2 consecutive fixes ≥ 20 yd from the lie pin.
 * Returns the lie pin (not the cart position) when it fires.
 */
export function stepWalkAway(state: WalkAwayState, fix: GpsFix, nowMs: number = fix.timestamp): {
  state: WalkAwayState;
  firePin: GpsFix | null;
} {
  if (state.fired) return { state, firePin: null };

  if (!state.liePin) {
    const cluster = [...state.cluster];
    const center = centroid(cluster);
    if (!center || haversineYards(center, fix) <= DWELL_YD) {
      cluster.push(fix);
    } else {
      return {
        state: { cluster: [fix], liePin: null, leaveHits: 0, fired: false },
        firePin: null,
      };
    }
    const started = cluster[0]?.timestamp ?? nowMs;
    const dwellMs = nowMs - started;
    if (dwellMs >= DWELL_S * 1000) {
      const pin = bestAccuracyFix(cluster);
      if (!dwellQualityOk(pin)) {
        return { state: { cluster, liePin: null, leaveHits: 0, fired: false }, firePin: null };
      }
      return { state: { cluster, liePin: pin, leaveHits: 0, fired: false }, firePin: null };
    }
    return { state: { cluster, liePin: null, leaveHits: 0, fired: false }, firePin: null };
  }

  const yards = haversineYards(state.liePin, fix);
  if (yards < LEAVE_YD) {
    return { state: { ...state, leaveHits: 0 }, firePin: null };
  }
  const leaveHits = state.leaveHits + 1;
  if (leaveHits >= LEAVE_CONFIRM_FIXES) {
    return { state: { ...state, leaveHits, fired: true }, firePin: state.liePin };
  }
  return { state: { ...state, leaveHits }, firePin: null };
}
