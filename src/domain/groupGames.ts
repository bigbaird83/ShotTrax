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
 * Net gives handicap strokes by stroke index, hardest hole first, and halves
 * them (rounded) on a 9-hole round. Leaderboard and skins play off the
 * group's lowest handicap; match play and Nassau off the lower of the two
 * match players; Stableford uses full course handicaps. Net needs every
 * handicap filled in, and a stroke index on every hole whenever someone gets
 * a stroke; otherwise games stay gross and say why. Nothing is invented: a
 * hole with no score is simply not played yet.
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
  /** Course handicap for this round. Null = not entered, which blocks net. */
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

/** Handicap strokes for the round: halved (rounded, .5 up) on a 9-hole round. */
export function roundStrokes(strokes: number, holeCount: number): number {
  const whole = Math.max(0, Math.round(strokes));
  return holeCount === 9 ? Math.round(whole / 2) : whole;
}

/** Each player's strokes off the lowest handicap among `players`. Null when any handicap is blank. */
export function strokesOffLow(players: readonly GroupPlayerIn[]): Record<string, number> | null {
  if (players.some((p) => p.handicap == null)) return null;
  const low = Math.min(...players.map((p) => p.handicap as number));
  return Object.fromEntries(players.map((p) => [p.id, (p.handicap as number) - low]));
}

function allStrokeIndexes(holes: readonly GroupHoleIn[]): boolean {
  return holes.length > 0 && holes.every((h) => h.strokeIndex != null && h.strokeIndex >= 1);
}

/**
 * Net can be scored off the low: every handicap is filled in, and either
 * nobody gets strokes after subtracting the lowest, or every hole has a
 * stroke index to place them on.
 */
export function netAvailable(holes: readonly GroupHoleIn[], players: readonly GroupPlayerIn[]): boolean {
  const off = strokesOffLow(players);
  if (!off) return false;
  const anyStrokes = Object.values(off).some((n) => roundStrokes(n, holes.length) > 0);
  return !anyStrokes || allStrokeIndexes(holes);
}

export type NetBlockReason = 'handicap' | 'stroke_index';

/** Why net cannot be scored with these settings, or null when it can (or net is off). */
export function netBlockReason(
  holes: readonly GroupHoleIn[],
  players: readonly GroupPlayerIn[],
  settings: Pick<GroupGameSettings, 'net' | 'stableford'>,
): NetBlockReason | null {
  if (!settings.net) return null;
  if (players.some((p) => p.handicap == null)) return 'handicap';
  if (netAvailable(holes, players)) {
    // Stableford uses full handicaps, so it can need an index when off-the-low does not.
    const fullStrokes =
      settings.stableford && players.some((p) => roundStrokes(p.handicap ?? 0, holes.length) > 0);
    return fullStrokes && !allStrokeIndexes(holes) ? 'stroke_index' : null;
  }
  return 'stroke_index';
}

type Scored = { gross: number; net: number };
type ScoreTable = Map<string, Map<number, Scored>>;

/**
 * Per player, hole number → gross and net for scored holes. `strokes` is each
 * player's handicap strokes for this game (before the 9-hole halving), given
 * out over `holes` by stroke index, hardest first. No entry → net = gross.
 */
function scoreTable(
  holes: readonly GroupHoleIn[],
  players: readonly GroupPlayerIn[],
  strokes: Record<string, number> | null,
): ScoreTable {
  const siHoles = holes.map((h) => ({ number: h.number, par: h.par, score: null, strokeIndex: h.strokeIndex }));
  const out: ScoreTable = new Map();
  for (const player of players) {
    const given = strokes?.[player.id] ?? 0;
    const perHole = given > 0 ? strokesReceived(siHoles, roundStrokes(given, holes.length)) : null;
    const row = new Map<number, Scored>();
    for (const hole of holes) {
      const gross = player.scores[hole.number];
      if (!validScore(gross)) continue;
      row.set(hole.number, { gross, net: gross - (perHole?.get(hole.number) ?? 0) });
    }
    out.set(player.id, row);
  }
  return out;
}

/** Strokes each player gets on each hole in a game, for display and tests. */
export function strokesByHole(
  holes: readonly GroupHoleIn[],
  strokes: number,
): Map<number, number> {
  const siHoles = holes.map((h) => ({ number: h.number, par: h.par, score: null, strokeIndex: h.strokeIndex }));
  return strokesReceived(siHoles, roundStrokes(strokes, holes.length));
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
  /**
   * The first hole someone has not scored, when a later hole (or another
   * player on that hole) already has a score — skins wait there until it is
   * entered. Null when nothing is waiting.
   */
  waitingOn: { holeNumber: number; playerIds: string[] } | null;
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
  /** Net was asked for but cannot be scored; games stay gross. */
  netBlocked: boolean;
  netBlockReason: NetBlockReason | null;
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
  table: ScoreTable,
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
  table: ScoreTable,
  useNet: boolean,
  carry: boolean,
): SkinsResult {
  const won: Record<string, number> = Object.fromEntries(players.map((p) => [p.id, 0]));
  const rows: SkinsResult['holes'] = [];
  const ordered = [...holes].sort((a, b) => a.number - b.number);
  let pot = 0;
  let waitingOn: SkinsResult['waitingOn'] = null;
  for (const [i, hole] of ordered.entries()) {
    const scores = players.map((p) => table.get(p.id)?.get(hole.number));
    if (scores.some((sc) => sc == null)) {
      const started =
        scores.some((sc) => sc != null) ||
        ordered.slice(i + 1).some((later) => players.some((p) => table.get(p.id)?.has(later.number)));
      if (started) {
        waitingOn = { holeNumber: hole.number, playerIds: players.filter((_, j) => scores[j] == null).map((p) => p.id) };
      }
      break;
    }
    pot += 1;
    const values = scores.map((sc) => (useNet ? (sc as Scored).net : (sc as Scored).gross));
    const best = Math.min(...values);
    const winners = players.filter((_, j) => values[j] === best);
    if (winners.length === 1) {
      won[winners[0].id] += pot;
      rows.push({ number: hole.number, winnerId: winners[0].id, value: pot });
      pot = 0;
    } else {
      rows.push({ number: hole.number, winnerId: null, value: pot });
      if (!carry) pot = 0;
    }
  }
  return { won, holes: rows, carrying: carry ? pot : 0, waitingOn };
}

function stableford(
  holes: readonly GroupHoleIn[],
  players: readonly GroupPlayerIn[],
  table: ScoreTable,
  useNet: boolean,
): StablefordRow[] {
  return players
    .map((player) => {
      let points = 0;
      let counted = 0;
      for (const hole of holes) {
        const sc = table.get(player.id)?.get(hole.number);
        if (!sc || !validPar(hole.par)) continue;
        points += Math.max(0, 2 + hole.par - (useNet ? sc.net : sc.gross));
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
  table: ScoreTable,
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

/** The two players in the match: the chosen pair, or the only two players. */
export function matchPair(
  players: readonly GroupPlayerIn[],
  settings: Pick<GroupGameSettings, 'matchPlayerIds'>,
): readonly [string, string] | null {
  const ids = settings.matchPlayerIds;
  if (ids && players.some((p) => p.id === ids[0]) && players.some((p) => p.id === ids[1])) return ids;
  return players.length === 2 ? [players[0].id, players[1].id] : null;
}

/**
 * Every game the settings turn on, for the players and holes given.
 *
 * Net strokes (halved on a 9-hole round):
 * - Leaderboard and skins: each player's handicap minus the group's lowest.
 * - Match play and Nassau: the difference between the two match players only.
 * - Stableford: each player's full course handicap.
 */
export function planGroupGames(args: {
  holes: readonly GroupHoleIn[];
  players: readonly GroupPlayerIn[];
  settings: GroupGameSettings;
}): GroupResult {
  const { holes, players, settings } = args;
  const blocked = netBlockReason(holes, players, settings);
  const useNet = settings.net && blocked == null;

  const groupTable = scoreTable(holes, players, useNet ? strokesOffLow(players) : null);
  const pair = matchPair(players, settings);
  const pairPlayers = pair ? players.filter((p) => p.id === pair[0] || p.id === pair[1]) : [];
  const pairTable = pair ? scoreTable(holes, pairPlayers, useNet ? strokesOffLow(pairPlayers) : null) : groupTable;
  const fullTable = settings.stableford
    ? scoreTable(
        holes,
        players,
        useNet ? Object.fromEntries(players.map((p) => [p.id, p.handicap ?? 0])) : null,
      )
    : groupTable;

  const ordered = [...holes].sort((a, b) => a.number - b.number);
  const nassauOk = pair != null && settings.nassau && ordered.length === 18;

  return {
    net: useNet,
    netBlocked: blocked != null,
    netBlockReason: blocked,
    strokePlay: strokePlay(holes, players, groupTable, useNet),
    skins: settings.skins && players.length >= 2 ? skins(holes, players, groupTable, useNet, settings.skinsCarry) : null,
    stableford: settings.stableford ? stableford(holes, players, fullTable, useNet) : null,
    match: pair && settings.matchPlay ? matchStatus(holes, pair[0], pair[1], pairTable, useNet) : null,
    nassau: nassauOk
      ? {
          front: matchStatus(ordered.slice(0, 9), pair[0], pair[1], pairTable, useNet),
          back: matchStatus(ordered.slice(9), pair[0], pair[1], pairTable, useNet),
          overall: matchStatus(ordered, pair[0], pair[1], pairTable, useNet),
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
