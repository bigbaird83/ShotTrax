import { midpointLatLng } from './placeToDrag';
import { isValidLatLng, type LatLng } from './latLng';
import type { ShotFixQuality } from './types';

/** Dashed trail — same pattern as the Add-shot preview. */
export const SHOT_TRAIL_DASH = [8, 6] as const;

/** Soft club tints. Not lime — lime is selected club / primary CTA only. */
export const SHOT_TRAIL_TINTS = [
  'rgba(232, 224, 196, 0.88)',
  'rgba(125, 207, 122, 0.78)',
  'rgba(138, 154, 142, 0.92)',
  'rgba(196, 184, 142, 0.86)',
  'rgba(110, 168, 148, 0.84)',
] as const;

export function shotTrailIsDashed(): true {
  return true;
}

export function shotTrailUsesLime(): false {
  return false;
}

export function shotTrailShowsStackedLabels(): false {
  return false;
}

export function shotTrailShowsYardChip(): true {
  return true;
}

/** Chip is that shot's logged pin-to-pin yards — never card / to-green. */
export function trailChipUsesLoggedYards(): true {
  return true;
}

export function trailChipUsesCardYards(): false {
  return false;
}

export function trailChipUsesToGreenYards(): false {
  return false;
}

/** Soft or forced GPS still shows the quality badge on that shot. */
export function trailShowsQualityBadge(quality?: ShotFixQuality | null): boolean {
  return quality === 'soft' || quality === 'forced';
}

export function shotTrailDash(): readonly [number, number] {
  return SHOT_TRAIL_DASH;
}

function hashClubKey(clubId: string | null | undefined): number {
  const raw = clubId?.trim() || 'club';
  let n = 0;
  for (let i = 0; i < raw.length; i += 1) n = (n + raw.charCodeAt(i) * (i + 1)) % 997;
  return n;
}

/** Soft tint from the club. Last shot is a touch stronger, never lime. */
export function trailTintForClub(clubId: string | null | undefined, last = false): string {
  const tint = SHOT_TRAIL_TINTS[hashClubKey(clubId) % SHOT_TRAIL_TINTS.length] ?? SHOT_TRAIL_TINTS[0];
  if (!last) return tint;
  return tint.replace(/0\.\d+\)$/, '0.98)');
}

export function formatTrailYardChip(yards: number | null | undefined): string | null {
  if (yards == null || !Number.isFinite(yards) || yards <= 0) return null;
  return `${Math.round(yards)} yd`;
}

export type ShotTrailPlan = {
  from: LatLng;
  to: LatLng;
  mid: LatLng;
  tint: string;
  dash: readonly [number, number];
  chip: string | null;
  width: number;
  showQualityBadge: boolean;
};

export function planShotTrail(args: {
  start: LatLng | null | undefined;
  end: LatLng | null | undefined;
  clubId?: string | null;
  /** Logged pin-to-pin yards. Never card / to-green. */
  distanceYards?: number | null;
  fixQuality?: ShotFixQuality | null;
  last?: boolean;
}): ShotTrailPlan | null {
  if (!isValidLatLng(args.start) || !isValidLatLng(args.end)) return null;
  return {
    from: args.start,
    to: args.end,
    mid: midpointLatLng(args.start, args.end),
    tint: trailTintForClub(args.clubId, args.last === true),
    dash: SHOT_TRAIL_DASH,
    chip: formatTrailYardChip(args.distanceYards),
    width: args.last === true ? 4 : 3,
    showQualityBadge: trailShowsQualityBadge(args.fixQuality),
  };
}
