import { MAX_SHOT_YD, WALK_BLOCK } from '../config/sensing';
import { classifyAccuracyM } from '../domain/fixQuality';
import { haversineYards, roundYards } from '../domain/haversine';
import type { GpsFix } from '../domain/types';

export type LatLng = { lat: number; lng: number };

export type AcceptFixOk = {
  ok: true;
  fixQuality: 'good' | 'soft';
  yards: number | null;
  impossibleJump: false;
};

export type AcceptFixNeedsForce =
  | { ok: false; reason: 'poor_gps'; accuracyM: number | null }
  | { ok: false; reason: 'impossible_jump'; yards: number };

export type AcceptFixResult = AcceptFixOk | AcceptFixNeedsForce;

export type ForceMarkResult = {
  ok: true;
  fixQuality: 'forced';
  yards: number | null;
  impossibleJump: boolean;
};

/**
 * Auto-accept a real GPS fix.
 * good (<15 m) and soft (15–25 m) pass. Poor GPS and >400 yd jumps need forceMark.
 * WALK_BLOCK is false: short walking distances are accepted.
 */
export function acceptFix(fix: GpsFix, prior: LatLng | null = null): AcceptFixResult {
  const acc = classifyAccuracyM(fix.accuracyM);
  if (acc === 'poor') {
    return { ok: false, reason: 'poor_gps', accuracyM: fix.accuracyM };
  }

  if (!prior) {
    return { ok: true, fixQuality: acc, yards: null, impossibleJump: false };
  }

  const yardsRaw = haversineYards(prior, { lat: fix.lat, lng: fix.lng });
  const yards = roundYards(yardsRaw);
  if (yardsRaw > MAX_SHOT_YD) {
    return { ok: false, reason: 'impossible_jump', yards };
  }

  if (WALK_BLOCK) {
    throw new Error('WALK_BLOCK is locked false in P1');
  }

  return { ok: true, fixQuality: acc, yards, impossibleJump: false };
}

/** After UI confirm: keep the shot as forced (still counts in averages). */
export function forceMark(fix: GpsFix, prior: LatLng | null = null): ForceMarkResult {
  if (!prior) {
    return { ok: true, fixQuality: 'forced', yards: null, impossibleJump: false };
  }
  const yardsRaw = haversineYards(prior, { lat: fix.lat, lng: fix.lng });
  const yards = roundYards(yardsRaw);
  return {
    ok: true,
    fixQuality: 'forced',
    yards,
    impossibleJump: yardsRaw > MAX_SHOT_YD,
  };
}
