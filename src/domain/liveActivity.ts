import type { GroupResult } from './groupGames';
import { formatToPar } from './groupGames';
import { isCourseCardLatLng, type LatLng } from './latLng';

/**
 * Lock Screen / Dynamic Island round view (iOS Live Activity).
 *
 * The app sends one payload per change: the hole, par, the green points, and
 * three text lines. Yards to front / middle / back are worked out on the phone
 * itself from live GPS (native, so they keep counting down while locked) and
 * shown only from a fix of 25 m or better — never invented. Front and back go
 * out only when the course has both, the same rule as the hole screen.
 */

export type LiveActivityPayload = {
  courseName: string;
  hole: number;
  par: number | null;
  front: LatLng | null;
  middle: LatLng | null;
  back: LatLng | null;
  /** "thru 6, +3"; empty before any hole is finished (the hole line already says which hole). */
  scoreLine: string;
  /** "7 Iron · 152 yd" — the latest shot on this hole with a club and a distance. */
  lastShot: string | null;
  /** "Ann leads +1 · 3 skins riding" when playing with a group. */
  groupLine: string | null;
};

export type LiveActivityShotIn = {
  seq: number;
  clubId: string | null;
  distanceYards: number | null;
};

/** Latest shot with a club and a real distance, e.g. "7 Iron · 152 yd". */
export function formatLiveLastShot(
  shots: readonly LiveActivityShotIn[],
  clubName: (clubId: string) => string | null,
): string | null {
  const latest = [...shots]
    .filter((shot) => shot.clubId && shot.distanceYards != null && Number.isFinite(shot.distanceYards) && shot.distanceYards > 0)
    .sort((a, b) => b.seq - a.seq)[0];
  if (!latest?.clubId) return null;
  const name = clubName(latest.clubId);
  return name ? `${name} · ${Math.round(latest.distanceYards as number)} yd` : null;
}

/**
 * "Ann leads +1", "Ann & You lead E", plus "3 skins riding" when skins carry.
 * Null without a group or before anyone has a ranked hole.
 */
export function formatLiveGroupLine(
  result: Pick<GroupResult, 'net' | 'strokePlay' | 'skins'> | null,
  playerCount: number,
): string | null {
  if (!result || playerCount < 2) return null;
  const parts: string[] = [];
  const leaders = result.strokePlay.filter((row) => row.ranked && row.place === 1);
  if (leaders.length > 0) {
    const toPar = result.net ? leaders[0].netToPar : leaders[0].toPar;
    const total = result.net ? leaders[0].net : leaders[0].gross;
    const score = toPar != null ? formatToPar(toPar) : String(total);
    const names = leaders.map((row) => row.name);
    const who = names.length > 2 ? `${names.length} tied` : names.join(' & ');
    parts.push(`${who} ${names.length > 1 ? 'lead' : 'leads'} ${score}${result.net ? ' net' : ''}`);
  }
  const riding = result.skins?.carrying ?? 0;
  if (riding > 0) parts.push(`${riding} ${riding === 1 ? 'skin' : 'skins'} riding`);
  return parts.length ? parts.join(' · ') : null;
}

function point(p: LatLng | null | undefined): LatLng | null {
  return isCourseCardLatLng(p) ? { lat: p.lat, lng: p.lng } : null;
}

export function planLiveActivityPayload(args: {
  courseName: string | null;
  hole: { number: number; par: number | null };
  pins: { front: LatLng | null | undefined; middle: LatLng | null | undefined; back: LatLng | null | undefined };
  runningPar: { visible: boolean; line: string };
  lastShot: string | null;
  groupLine: string | null;
}): LiveActivityPayload {
  const front = point(args.pins.front);
  const back = point(args.pins.back);
  const bothEnds = front != null && back != null;
  return {
    courseName: args.courseName?.trim() || 'Round',
    hole: args.hole.number,
    par: args.hole.par != null && Number.isInteger(args.hole.par) ? args.hole.par : null,
    front: bothEnds ? front : null,
    middle: point(args.pins.middle),
    back: bothEnds ? back : null,
    scoreLine: args.runningPar.visible ? args.runningPar.line : '',
    lastShot: args.lastShot,
    groupLine: args.groupLine,
  };
}

/** Stable key so the app only calls native when something on the Lock Screen changes. */
export function liveActivityPayloadKey(payload: LiveActivityPayload | null): string {
  return payload == null ? 'none' : JSON.stringify(payload);
}
