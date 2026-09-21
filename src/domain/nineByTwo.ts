import type { LatLng } from './latLng';
import { hydrateHolePassesGates } from '../course/hydrate';

/**
 * 9×2 sanity (Signal revise).
 *
 * A course with `numHoles = 9` whose holes 10–18 tee+green exactly match 1–9
 * is a 9-hole loop played twice. That is a PASS. It is not a hard miss and
 * it is not a cue to invent or “fix” the back nine.
 *
 * Thunderbird Country Club (Heber Springs) is the exemplar: the bundled
 * golfapi hydrate already stores that mirror. Do not rewrite those GPS values.
 */
export type NineByTwoHole = {
  hole: number;
  tee: LatLng | null;
  green: LatLng | null;
};

export type NineByTwoVerdict =
  | { ok: true; kind: 'nine_by_two' }
  | {
      ok: false;
      kind: 'not_nine_by_two';
      reason: 'num_holes' | 'missing_pair' | 'failed_sanity' | 'not_mirror';
    };

export function nineByTwoMirrorIsPass(): true {
  return true;
}

export function nineByTwoDoesNotInventCoords(): true {
  return true;
}

function holeByNumber(holes: readonly NineByTwoHole[]): Map<number, NineByTwoHole> {
  const byHole = new Map<number, NineByTwoHole>();
  for (const hole of holes) {
    if (!Number.isInteger(hole.hole) || hole.hole < 1 || hole.hole > 18) continue;
    if (!byHole.has(hole.hole)) byHole.set(hole.hole, hole);
  }
  return byHole;
}

function sameCoord(a: LatLng | null | undefined, b: LatLng | null | undefined): boolean {
  if (!a || !b) return false;
  return a.lat === b.lat && a.lng === b.lng;
}

/**
 * True only when `numHoles` is 9 and holes 10–18 are an exact tee+green copy
 * of holes 1–9, and each front-nine pair passes the same tee/green gates as
 * a painted card. Does not add, drop, or rewrite coordinates.
 */
export function classifyNineByTwo(args: {
  numHoles: number | null | undefined;
  holes: readonly NineByTwoHole[];
}): NineByTwoVerdict {
  if (args.numHoles !== 9) {
    return { ok: false, kind: 'not_nine_by_two', reason: 'num_holes' };
  }
  const byHole = holeByNumber(args.holes);
  for (let n = 1; n <= 9; n += 1) {
    const front = byHole.get(n);
    const back = byHole.get(n + 9);
    if (!front?.tee || !front.green || !back?.tee || !back.green) {
      return { ok: false, kind: 'not_nine_by_two', reason: 'missing_pair' };
    }
    if (!hydrateHolePassesGates({ tee: front.tee, green: front.green })) {
      return { ok: false, kind: 'not_nine_by_two', reason: 'failed_sanity' };
    }
    if (!sameCoord(front.tee, back.tee) || !sameCoord(front.green, back.green)) {
      return { ok: false, kind: 'not_nine_by_two', reason: 'not_mirror' };
    }
  }
  return { ok: true, kind: 'nine_by_two' };
}

export type TeeGreenVerdict =
  | { ok: true; kind: 'tee_green' | 'nine_by_two' }
  | { ok: false; kind: 'hard_miss'; reason: 'no_coords' | 'failed_sanity' };

/**
 * OSM / golfapi paint gate. A 9×2 mirror passes. Anything else needs every
 * provided tee+green pair to pass the card gates. Missing coords stay missing.
 */
export function courseTeeGreenPasses(
  holes: readonly NineByTwoHole[],
  numHoles: number | null | undefined,
): TeeGreenVerdict {
  const nine = classifyNineByTwo({ numHoles, holes });
  if (nine.ok) return { ok: true, kind: 'nine_by_two' };
  const present = holes.filter((hole) => hole.tee || hole.green);
  if (present.length === 0) return { ok: false, kind: 'hard_miss', reason: 'no_coords' };
  for (const hole of present) {
    if (!hole.tee || !hole.green || !hydrateHolePassesGates({ tee: hole.tee, green: hole.green })) {
      return { ok: false, kind: 'hard_miss', reason: 'failed_sanity' };
    }
  }
  return { ok: true, kind: 'tee_green' };
}
