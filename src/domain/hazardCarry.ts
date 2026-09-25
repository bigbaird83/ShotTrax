import type { OsmFeature } from '../course/types';
import { isValidLatLng, type LatLng } from './latLng';
import { lineFrame } from './lineFrame';

/**
 * Reach / carry yards for mapped hazards in play, from the live GPS fix along
 * the line to the green. Only OSM `golf=bunker|water_hazard|lateral_water_hazard`
 * outlines count — unmapped holes show nothing, never a guessed hazard.
 *
 * A hazard is in play when part of its outline lies within CORRIDOR_YARDS of the
 * fix → green line, ahead of the player (≥ MIN_AHEAD_YARDS) and no farther than
 * BEYOND_GREEN_YARDS past the green. Reach = nearest in-corridor point, carry =
 * farthest. Outline edges are sampled every SAMPLE_YARDS so long edges count.
 */

export const CORRIDOR_YARDS = 35;
export const MIN_AHEAD_YARDS = 5;
export const BEYOND_GREEN_YARDS = 20;
export const SAMPLE_YARDS = 3;
export const MAX_HAZARDS = 3;
/** Average offset beyond this reads as left / right; inside it the hazard is in line. */
export const SIDE_YARDS = 8;

export type HazardKind = 'bunker' | 'water';
export type HazardSide = 'left' | 'right' | 'center';

export type HazardCarry = {
  kind: HazardKind;
  side: HazardSide;
  reach: number;
  carry: number;
};

function hazardKind(feature: OsmFeature): HazardKind | null {
  if (feature.kind === 'bunker') return 'bunker';
  if (feature.kind === 'water_hazard' || feature.kind === 'lateral_water_hazard') return 'water';
  return null;
}

/** Outline points plus samples along each edge. */
function samplePoints(frame: NonNullable<ReturnType<typeof lineFrame>>, coords: LatLng[]) {
  const out: { along: number; lateral: number }[] = [];
  const measured = coords.filter(isValidLatLng).map((point) => frame.measure(point));
  for (let i = 0; i < measured.length; i += 1) {
    const a = measured[i]!;
    out.push(a);
    const b = measured[i + 1];
    if (!b) continue;
    const len = Math.hypot(b.along - a.along, b.lateral - a.lateral);
    const steps = Math.floor(len / SAMPLE_YARDS);
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      out.push({ along: a.along + (b.along - a.along) * t, lateral: a.lateral + (b.lateral - a.lateral) * t });
    }
  }
  return out;
}

export function planHazardCarries(args: {
  fix: LatLng | null;
  green: LatLng | null;
  features: readonly OsmFeature[];
}): HazardCarry[] {
  if (!isValidLatLng(args.fix) || !isValidLatLng(args.green)) return [];
  const frame = lineFrame(args.fix, args.green);
  if (!frame) return [];
  const farthest = frame.length + BEYOND_GREEN_YARDS;
  const out: HazardCarry[] = [];
  for (const feature of args.features) {
    const kind = hazardKind(feature);
    if (!kind || feature.coordinates.length < 2) continue;
    const inPlay = samplePoints(frame, feature.coordinates).filter(
      (p) => Math.abs(p.lateral) <= CORRIDOR_YARDS && p.along >= MIN_AHEAD_YARDS && p.along <= farthest,
    );
    if (inPlay.length === 0) continue;
    const reach = Math.round(Math.min(...inPlay.map((p) => p.along)));
    const carry = Math.round(Math.max(...inPlay.map((p) => p.along)));
    const avgLateral = inPlay.reduce((sum, p) => sum + p.lateral, 0) / inPlay.length;
    const side: HazardSide = avgLateral > SIDE_YARDS ? 'right' : avgLateral < -SIDE_YARDS ? 'left' : 'center';
    out.push({ kind, side, reach, carry });
  }
  return out.sort((a, b) => a.reach - b.reach || a.carry - b.carry).slice(0, MAX_HAZARDS);
}

/** `Bunker R · 212 / 231` — reach / carry yards. */
export function formatHazardCarry(row: HazardCarry): string {
  const name = row.kind === 'water' ? 'Water' : 'Bunker';
  const side = row.side === 'left' ? ' L' : row.side === 'right' ? ' R' : '';
  const yards = row.reach === row.carry ? `${row.reach}` : `${row.reach} / ${row.carry}`;
  return `${name}${side} · ${yards}`;
}

export function hazardCarryAccessibilityLabel(row: HazardCarry): string {
  const name = row.kind === 'water' ? 'Water' : 'Bunker';
  const side = row.side === 'center' ? 'in line' : `on the ${row.side}`;
  return `${name} ${side}: ${row.reach} yards to reach, ${row.carry} to carry`;
}
