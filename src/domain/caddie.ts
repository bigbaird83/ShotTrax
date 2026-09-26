import type { DispersionPlan } from './dispersion';
import type { BagCarryKind } from './bagDistance';
import type { HazardCarry, HazardSide } from './hazardCarry';

/**
 * Caddie: one club for the yards left, from the golfer's own numbers.
 *
 * - Distance: the same carry the club wheel shows (your average once you have
 *   enough shots, else your bag number). Distances are where the ball finished.
 * - Spread: the middle 80% of your measured shots with that club (Dispersion),
 *   once there are at least CADDIE_MIN_SPREAD_SHOTS. Fewer → no spread claimed.
 * - Hazards: mapped bunkers and water in play (live GPS only), as reach / far
 *   edge along the line to the green. Finishing past the far edge means the ball
 *   flew it; finishing short of the reach stays short. Nothing in between is safe.
 *
 * Pick: the club whose distance is closest to the yards left, unless its
 * spread finishes in water (or, less strongly, a bunker) on your miss side and
 * a club within CADDIE_SAFE_SWAP_YARDS of the target avoids it. Target is the
 * middle of the green (the flag is not known). Nothing is invented: no carry →
 * the club is skipped; no yards left → no advice.
 */

export const CADDIE_MIN_SPREAD_SHOTS = 5;
/** A safer club is taken only if it still finishes this close to the target. */
export const CADDIE_SAFE_SWAP_YARDS = 12;
/** A side hazard counts when your left/right misses reach this far that way. */
export const CADDIE_SIDE_MISS_YARDS = 8;

export type CaddieCarrySource = 'average' | 'bag' | 'estimate' | 'stock';

/** The bag row's carry kind in caddie words. Unknown → stock (a typical distance, not yours). */
export function caddieCarrySource(kind: BagCarryKind | null | undefined): CaddieCarrySource {
  if (kind === 'live') return 'average';
  if (kind === 'typed') return 'bag';
  if (kind === 'estimated') return 'estimate';
  return 'stock';
}

export type CaddieClubIn = {
  id: string;
  name: string;
  /** Wheel carry; null / missing → not suggested. */
  carry: number | null | undefined;
  /** Where the carry comes from, for the "based on" line. */
  source: CaddieCarrySource;
  /** Measured shots with this club (Dispersion). Null → none. */
  dispersion: Pick<DispersionPlan, 'count' | 'avgAlong' | 'alongRange' | 'lateralRange'> | null;
};

export type CaddieRisk = {
  hazard: HazardCarry;
  /** How the club's spread meets it. */
  kind: 'finishes_in' | 'might_finish_in';
};

export type CaddieOption = {
  clubId: string;
  name: string;
  carry: number;
  source: CaddieClubIn['source'];
  /** Middle-80% finish range, when there are enough shots. */
  range: { low: number; high: number } | null;
  shots: number;
  /** Carry minus yards left: + long, − short. */
  gap: number;
  risks: CaddieRisk[];
};

export type CaddieAdvice = {
  yardsLeft: number;
  pick: CaddieOption;
  /** The closest-distance club when the pick clubs away from a hazard. */
  instead: CaddieOption | null;
  /** Next clubs either side of the pick, for a quick look. */
  shorter: CaddieOption | null;
  longer: CaddieOption | null;
  /** One line each, plain words. */
  reasons: string[];
};

function sideReached(side: HazardSide, lateral: { low: number; high: number } | null): boolean {
  if (side === 'center') return true;
  if (!lateral) return true; // unknown miss pattern: a side hazard may be reached
  return side === 'right' ? lateral.high >= CADDIE_SIDE_MISS_YARDS : lateral.low <= -CADDIE_SIDE_MISS_YARDS;
}

/** Middle-80% finish range for the club, shifted to its wheel carry. */
function finishRange(club: CaddieClubIn, carry: number): { low: number; high: number } | null {
  const d = club.dispersion;
  if (!d || d.count < CADDIE_MIN_SPREAD_SHOTS || !d.alongRange || d.avgAlong == null) return null;
  return {
    low: Math.round(carry - (d.avgAlong - d.alongRange.low)),
    high: Math.round(carry + (d.alongRange.high - d.avgAlong)),
  };
}

function risksFor(
  carry: number,
  range: { low: number; high: number } | null,
  lateral: { low: number; high: number } | null,
  hazards: readonly HazardCarry[],
): CaddieRisk[] {
  const out: CaddieRisk[] = [];
  for (const hazard of hazards) {
    if (!sideReached(hazard.side, lateral)) continue;
    const typical = carry >= hazard.reach && carry <= hazard.carry;
    const spread = range != null && range.high >= hazard.reach && range.low <= hazard.carry;
    if (typical && hazard.side === 'center') out.push({ hazard, kind: 'finishes_in' });
    else if (typical || spread) out.push({ hazard, kind: 'might_finish_in' });
  }
  return out;
}

/** Water outweighs sand; "finishes in" outweighs "might". Lower is safer. */
function riskScore(risks: readonly CaddieRisk[]): number {
  return risks.reduce(
    (sum, r) => sum + (r.hazard.kind === 'water' ? 10 : 3) * (r.kind === 'finishes_in' ? 2 : 1),
    0,
  );
}

function hazardWords(h: HazardCarry): string {
  const name = h.kind === 'water' ? 'Water' : 'Bunker';
  const where = h.side === 'center' ? 'in line' : `on the ${h.side}`;
  return `${name} ${where} from ${h.reach} to ${h.carry}`;
}

function rangeWords(o: CaddieOption): string {
  return o.range ? `${o.range.low}–${o.range.high}` : `${o.carry}`;
}

function basedOn(o: CaddieOption): string {
  if (o.source === 'average') return o.range ? `your ${o.shots} measured shots` : 'your average';
  if (o.source === 'bag') return 'your bag number';
  return o.source === 'estimate' ? 'an estimate from your other clubs' : 'a typical distance for this club';
}

export function planCaddie(args: {
  yardsLeft: number | null | undefined;
  clubs: readonly CaddieClubIn[];
  hazards: readonly HazardCarry[];
}): CaddieAdvice | null {
  const yards = args.yardsLeft;
  if (yards == null || !Number.isFinite(yards) || yards <= 0) return null;
  const yardsLeft = Math.round(yards);

  const options: CaddieOption[] = args.clubs
    .filter((c) => c.carry != null && Number.isFinite(c.carry) && (c.carry as number) > 0)
    .map((club) => {
      const carry = Math.round(club.carry as number);
      const range = finishRange(club, carry);
      return {
        clubId: club.id,
        name: club.name,
        carry,
        source: club.source,
        range,
        shots: club.dispersion?.count ?? 0,
        gap: carry - yardsLeft,
        risks: risksFor(carry, range, club.dispersion?.lateralRange ?? null, args.hazards),
      };
    })
    .sort((a, b) => a.carry - b.carry);
  if (options.length === 0) return null;

  const closest = [...options].sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap) || a.carry - b.carry)[0];
  let pick = closest;
  if (riskScore(closest.risks) > 0) {
    const safer = options
      .filter((o) => Math.abs(o.gap) <= CADDIE_SAFE_SWAP_YARDS && riskScore(o.risks) < riskScore(closest.risks))
      .sort((a, b) => riskScore(a.risks) - riskScore(b.risks) || Math.abs(a.gap) - Math.abs(b.gap))[0];
    if (safer) pick = safer;
  }
  const at = options.indexOf(pick);

  const reasons: string[] = [];
  const gapWords =
    pick.gap === 0 ? 'right at the middle' : pick.gap > 0 ? `${pick.gap} long of the middle` : `${-pick.gap} short of the middle`;
  // The sheet shows the pick and its range above the reasons, so this line says where they come from.
  reasons.push(`From ${basedOn(pick)} — ${gapWords}.`);
  if (pick !== closest) {
    const why = closest.risks.map((r) => hazardWords(r.hazard)).join('; ');
    reasons.push(`Not ${closest.name} (${rangeWords(closest)}): ${why}.`);
  }
  for (const risk of pick.risks) {
    reasons.push(
      risk.kind === 'finishes_in'
        ? `${hazardWords(risk.hazard)} — this club usually finishes there.`
        : `${hazardWords(risk.hazard)} — your spread can reach it.`,
    );
  }
  if (!pick.range) reasons.push(`Fewer than ${CADDIE_MIN_SPREAD_SHOTS} measured shots with ${pick.name}, so no spread yet.`);
  if (args.hazards.length === 0) reasons.push('No mapped hazards in play from here.');

  return {
    yardsLeft,
    pick,
    instead: pick !== closest ? closest : null,
    shorter: at > 0 ? options[at - 1] : null,
    longer: at < options.length - 1 ? options[at + 1] : null,
    reasons,
  };
}

/** Chip text: "Caddie · 7 Iron". */
export function formatCaddieChip(advice: CaddieAdvice): string {
  return `Caddie · ${advice.pick.name}`;
}
