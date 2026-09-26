import { strokesReceived } from './handicap';

/**
 * Group scoring and side games for one round, from posted hole scores only.
 *
 * - Stroke play: gross and net totals over the holes each player has scored.
 * - Skins: lowest unique score on a hole wins it. Ties carry to the next hole
 *   when carry-over is on. Holes are settled in order and stop at the first
 *   hole where anyone is missing a score, so a carry never skips a gap.
 * - Stableford: points per hole = max(0, 2 + par − score). Needs par.
 * - Match play (two players): lower score wins the hole. "2 UP thru 7",
 *   closes out as "3 & 2", "AS" when level.
 * - Nassau (two players, 18 holes): front 9, back 9, and overall matches.
 *
 * Net uses each player's course handicap for this round, given out by stroke
 * index (hardest hole first). Net needs a stroke index on every hole; without
 * one, games stay gross and say so. Nothing is invented: a hole with no score
 * is simply not played yet.
 */

export const GROUP_MAX_PLAYERS = 4;
export const GROUP_MAX_HANDICAP = 54;

export type GroupHoleIn = {
  number: number;
  par: number | null;
  strokeIndex: number | null;
};

export type GroupPlayerIn = {
  id: string;
  name: string;
  /** Course handicap for this round. Null / 0 → plays off scratch. */
  handicap: number | null;
  /** Hole number → strokes. Missing / null → not scored yet. */
  scores: Readonly<Record<number, number | null | undefined>>;
};

export type GroupGameSettings = {
  net: boolean;
  skins: boolean;
  skinsCarry: boolean;
  stableford: boolean;
  /** Match play and Nassau run between these two player ids. */
  matchPlay: boolean;
  nassau: boolean;
  matchPlayerIds: readonly [string, string] | null;
};

export const DEFAULT_GROUP_GAMES: GroupGameSettings = {
  net: false,
  skins: true,
  skinsCarry: true,
  stableford: false,
  matchPlay: false,
  nassau: false,
  matchPlayerIds: null,
};

export function parseGroupGameSettings(raw: unknown): GroupGameSettings {
  const rec = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof GroupGameSettings) =>
    typeof rec[key] === 'boolean' ? (rec[key] as boolean) : (DEFAULT_GROUP_GAMES[key] as boolean);
  const ids = rec.matchPlayerIds;
  const matchPlayerIds =
    Array.isArray(ids) && ids.length === 2 && ids.every((id) => typeof id === 'string') && ids[0] !== ids[1]
      ? ([ids[0], ids[1]] as const)
      : null;
  return {
    net: bool('net'),
    skins: bool('skins'),
    skinsCarry: bool('skinsCarry'),
    stableford: bool('stableford'),
    matchPlay: bool('matchPlay'),
    nassau: bool('nassau'),
    matchPlayerIds,
  };
}

/** Whole strokes, 0–54. Blank / junk → null. */
export function parseGroupHandicap(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  const whole = Math.round(n);
  return whole >= 0 && whole <= GROUP_MAX_HANDICAP ? whole : null;
}

function validScore(n: number | null | undefined): n is number {
  return n != null && Number.isInteger(n) && n >= 1 && n <= 20;
}

function validPar(n: number | null): n is number {
  return n != null && Number.isInteger(n) && n >= 3 && n <= 6;
}

/** Net needs a stroke index on every hole whenever someone gets strokes. */
export function netAvailable(holes: readonly GroupHoleIn[], players: readonly GroupPlayerIn[]): boolean {
  const anyStrokes = players.some((p) => (p.handicap ?? 0) > 0);
  if (!anyStrokes) return true;
  return holes.length > 0 && holes.every((h) => h.strokeIndex != null && h.strokeIndex >= 1);
}

type Scored = { gross: number; net: number };

/** Per player, hole number → gross and net for scored holes. */
function scoreTable(
  holes: readonly GroupHoleIn[],
  players: readonly GroupPlayerIn[],
  useNet: boolean,
): Map<string, Map<number, Scored>> {
  const siHoles = holes.map((h) => ({ number: h.number, par: h.par, score: null, strokeIndex: h.strokeIndex }));
  const out = new Map<string, Map<number, Scored>>();
  for (const player of players) {
    const shots = useNet ? strokesReceived(siHoles, player.handicap ?? 0) : null;
    const row = new Map<number, Scored>();
    for (const hole of holes) {
      const gross = player.scores[hole.number];
      if (!validScore(gross)) continue;
      row.set(hole.number, { gross, net: gross - (shots?.get(hole.number) ?? 0) });
    }
    out.set(player.id, row);
  }
  return out;
}

export type StrokePlayRow = {
  playerId: string;
  name: string;
  thru: number;
  gross: number;
  net: number;
  /** Gross vs par over scored holes with a par. Null when none. */
  toPar: number | null;
  netToPar: number | null;
  /** 1-based, ties share a place. By net when net is on, else gross, then to-par. */
  place: number;
};

export type SkinsResult = {
  /** Skins won per player id. */
  won: Record<string, number>;
  /** One row per settled hole. */
  holes: { number: number; winnerId: string | null; value: number }[];
  /** Skins riding on the next hole (ties still open). */
  carrying: number;
};

export type StablefordRow = { playerId: string; name: string; points: number; holes: number };

export type MatchStatus = {
  aId: string;
  bId: string;
  /** Holes played in this match. */
  thru: number;
  /** Holes in the match (9 or 18). */
  length: number;
  /** Positive: A is up. */
  lead: number;
  /** True when the lead can no longer be caught. */
  decided: boolean;
  label: string;
};

export type GroupResult = {
  net: boolean;
  /** Net was asked for but a hole has no stroke index. */
  netBlocked: boolean;
  strokePlay: StrokePlayRow[];
  skins: SkinsResult | null;
  stableford: StablefordRow[] | null;
  match: MatchStatus | null;
  nassau: { front: MatchStatus; back: MatchStatus; overall: MatchStatus } | null;
};

function placeRows<T extends { place: number }>(rows: T[], key: (row: T) => number): T[] {
  const sorted = [...rows].sort((a, b) => key(a) - key(b));
  sorted.forEach((row, i) => {
    row.place = i > 0 && key(sorted[i - 1]) === key(row) ? sorted[i - 1].place : i + 1;
  });
  return sorted;
}

function strokePlay(
  holes: readonly GroupHoleIn[],
  players: readonly GroupPlayerIn[],
  table: Map<string, Map<number, Scored>>,
  useNet: boolean,
): StrokePlayRow[] {
  const par = new Map(holes.map((h) => [h.number, h.par]));
  const rows = players.map((player) => {
    const scored = [...(table.get(player.id) ?? new Map<number, Scored>()).entries()];
    const withPar = scored.filter(([n]) => validPar(par.get(n) ?? null));
    const parSum = withPar.reduce((sum, [n]) => sum + (par.get(n) as number), 0);
    return {
      playerId: player.id,
      name: player.name,
      thru: scored.length,
      gross: scored.reduce((sum, [, s]) => sum + s.gross, 0),
      net: scored.reduce((sum, [, s]) => sum + s.net, 0),
      toPar: withPar.length ? withPar.reduce((sum, [, s]) => sum + s.gross, 0) - parSum : null,
      netToPar: withPar.length ? withPar.reduce((sum, [, s]) => sum + s.net, 0) - parSum : null,
      place: 0,
    };
  });
  // Compare to par when everyone has one (fair across different "thru"), else raw strokes.
  const allToPar = rows.every((r) => r.toPar != null || r.thru === 0);
  return placeRows(rows, (r) =>
    r.thru === 0
      ? Number.MAX_SAFE_INTEGER
      : allToPar
        ? ((useNet ? r.netToPar : r.toPar) ?? 0)
        : useNet
          ? r.net
          : r.gross,
  );
}

function skins(
  holes: readonly GroupHoleIn[],
  players: readonly GroupPlayerIn[],
  table: Map<string, Map<number, Scored>>,
  useNet: boolean,
  carry: boolean,
): SkinsResult {
  const won: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  const rows: SkinsResult['holes'] = [];
  let pot = 0;
  for (const hole of [...holes].sort((a, b) => a.number - b.number)) {
    const scores = players.map((p) => table.get(p.id)?.get(hole.number));
    if (scores.some((s) => s == null)) break;
    pot += 1;
    const values = scores.map((s) => (useNet ? (s as Scored).net : (s as Scored).gross));
    const best = Math.min(...values);
    const winners = players.filter((_, i) => values[i] === best);
    if (winners.length === 1) {
      won[winners[0].id] += pot;
      rows.push({ number: hole.number, winnerId: winners[0].id, value: pot });
      pot = 0;
    } else {
      rows.push({ number: hole.number, winnerId: null, value: pot });
      if (!carry) pot = 0;
    }
  }
  return { won, holes: rows, carrying: carry ? pot : 0 };
}

function stableford(
  holes: readonly GroupHoleIn[],
  players: readonly GroupPlayerIn[],
  table: Map<string, Map<number, Scored>>,
  useNet: boolean,
): StablefordRow[] {
  return players
    .map((player) => {
      let points = 0;
      let counted = 0;
      for (const hole of holes) {
        const s = table.get(player.id)?.get(hole.number);
        if (!s || !validPar(hole.par)) continue;
        points += Math.max(0, 2 + hole.par - (useNet ? s.net : s.gross));
        counted += 1;
      }
      return { playerId: player.id, name: player.name, points, holes: counted };
    })
    .sort((a, b) => b.points - a.points);
}

/** Match over `holes` (in order). Stops at the first hole either player has not scored. */
function matchStatus(
  holes: readonly GroupHoleIn[],
  aId: string,
  bId: string,
  table: Map<string, Map<number, Scored>>,
  useNet: boolean,
): MatchStatus {
  const ordered = [...holes].sort((x, y) => x.number - y.number);
  let lead = 0;
  let thru = 0;
  for (const hole of ordered) {
    const a = table.get(aId)?.get(hole.number);
    const b = table.get(bId)?.get(hole.number);
    if (!a || !b) break;
    const av = useNet ? a.net : a.gross;
    const bv = useNet ? b.net : b.gross;
    if (av < bv) lead += 1;
    else if (bv < av) lead -= 1;
    thru += 1;
    if (Math.abs(lead) > ordered.length - thru) break;
  }
  const left = ordered.length - thru;
  const decided = Math.abs(lead) > left || (left === 0 && thru > 0);
  let label: string;
  if (thru === 0) label = 'Not started';
  else if (lead === 0) label = left === 0 ? 'Halved' : `AS thru ${thru}`;
  else if (left === 0) label = `${Math.abs(lead)} UP`;
  else if (Math.abs(lead) > left) label = `${Math.abs(lead)} & ${left}`;
  else label = `${Math.abs(lead)} UP thru ${thru}`;
  return { aId, bId, thru, length: ordered.length, lead, decided, label };
}

/** Every game the settings turn on, for the players and holes given. */
export function planGroupGames(args: {
  holes: readonly GroupHoleIn[];
  players: readonly GroupPlayerIn[];
  settings: GroupGameSettings;
}): GroupResult {
  const { holes, players, settings } = args;
  const netOk = netAvailable(holes, players);
  const useNet = settings.net && netOk;
  const table = scoreTable(holes, players, useNet);

  const pair =
    settings.matchPlayerIds &&
    players.some((p) => p.id === settings.matchPlayerIds?.[0]) &&
    players.some((p) => p.id === settings.matchPlayerIds?.[1])
      ? settings.matchPlayerIds
      : players.length === 2
        ? ([players[0].id, players[1].id] as const)
        : null;

  const ordered = [...holes].sort((a, b) => a.number - b.number);
  const nassauOk = pair != null && settings.nassau && ordered.length === 18;

  return {
    net: useNet,
    netBlocked: settings.net && !netOk,
    strokePlay: strokePlay(holes, players, table, useNet),
    skins: settings.skins && players.length >= 2 ? skins(holes, players, table, useNet, settings.skinsCarry) : null,
    stableford: settings.stableford ? stableford(holes, players, table, useNet) : null,
    match: pair && settings.matchPlay ? matchStatus(holes, pair[0], pair[1], table, useNet) : null,
    nassau: nassauOk
      ? {
          front: matchStatus(ordered.slice(0, 9), pair[0], pair[1], table, useNet),
          back: matchStatus(ordered.slice(9), pair[0], pair[1], table, useNet),
          overall: matchStatus(ordered, pair[0], pair[1], table, useNet),
        }
      : null,
  };
}

/** "Sam 2 UP thru 7" / "AS thru 4" / "Sam wins 3 & 2" from a match status. */
export function formatMatchLine(status: MatchStatus, nameOf: (id: string) => string): string {
  if (status.thru === 0 || status.lead === 0) return status.label;
  const leader = nameOf(status.lead > 0 ? status.aId : status.bId);
  return status.decided ? `${leader} wins ${status.label}` : `${leader} ${status.label}`;
}

/** "+3", "E", "−2". */
export function formatToPar(value: number | null): string {
  if (value == null) return '—';
  if (value === 0) return 'E';
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}
