import { strokesByHole, strokesOffLow, type GroupHoleIn, type GroupPlayerIn, type GroupResult } from './groupGames';

/**
 * Hole-by-hole group scorecard: every player's score on each hole, the net
 * strokes they get there (off the group's lowest handicap, the same strokes as
 * the net leaderboard and skins), and which skins were won where. Totals add
 * only the holes a player has scored; `scored` says how many that is.
 */

export type GroupCardCell = {
  playerId: string;
  score: number | null;
  /** Net strokes on this hole off the group low. 0 when net is off. */
  strokes: number;
  /** Skins won on this hole (carry-overs included), when this player won it. */
  skinValue: number | null;
  /** Score vs par; null when either is missing. */
  toPar: number | null;
};

export type GroupCardRow = {
  number: number;
  par: number | null;
  strokeIndex: number | null;
  cells: GroupCardCell[];
};

export type GroupCardTotal = {
  label: 'Out' | 'In' | 'Total';
  par: number | null;
  cells: { playerId: string; strokes: number | null; scored: number }[];
};

export type GroupCard = {
  players: { id: string; name: string; handicap: number | null }[];
  net: boolean;
  /** Rows with an Out subtotal after hole 9 and In after 18 (18-hole rounds). */
  front: GroupCardRow[];
  back: GroupCardRow[];
  totals: GroupCardTotal[];
};

function validScore(n: number | null | undefined): n is number {
  return n != null && Number.isInteger(n) && n >= 1 && n <= 20;
}

function total(label: GroupCardTotal['label'], rows: GroupCardRow[], players: readonly GroupPlayerIn[]): GroupCardTotal {
  const pars = rows.map((r) => r.par);
  return {
    label,
    par: pars.every((p) => p != null) ? pars.reduce<number>((sum, p) => sum + (p as number), 0) : null,
    cells: players.map((player) => {
      const scores = rows
        .map((r) => r.cells.find((c) => c.playerId === player.id)?.score ?? null)
        .filter((s): s is number => s != null);
      return {
        playerId: player.id,
        strokes: scores.length ? scores.reduce((sum, s) => sum + s, 0) : null,
        scored: scores.length,
      };
    }),
  };
}

export function planGroupScorecard(args: {
  holes: readonly GroupHoleIn[];
  players: readonly GroupPlayerIn[];
  result: Pick<GroupResult, 'net' | 'skins'>;
}): GroupCard {
  const { players, result } = args;
  const holes = [...args.holes].sort((a, b) => a.number - b.number);
  const off = result.net ? strokesOffLow(players) : null;
  const perHole = new Map(players.map((p) => [p.id, off ? strokesByHole(holes, off[p.id] ?? 0) : null]));
  const skinByHole = new Map((result.skins?.holes ?? []).map((h) => [h.number, h]));

  const rows: GroupCardRow[] = holes.map((hole) => ({
    number: hole.number,
    par: hole.par,
    strokeIndex: hole.strokeIndex,
    cells: players.map((player) => {
      const raw = player.scores[hole.number];
      const score = validScore(raw) ? raw : null;
      const skin = skinByHole.get(hole.number);
      return {
        playerId: player.id,
        score,
        strokes: perHole.get(player.id)?.get(hole.number) ?? 0,
        skinValue: skin?.winnerId === player.id ? skin.value : null,
        toPar: score != null && hole.par != null ? score - hole.par : null,
      };
    }),
  }));

  const eighteen = rows.length === 18;
  const front = eighteen ? rows.slice(0, 9) : rows;
  const back = eighteen ? rows.slice(9) : [];
  return {
    players: players.map((p) => ({ id: p.id, name: p.name, handicap: p.handicap })),
    net: result.net,
    front,
    back,
    totals: eighteen
      ? [total('Out', front, players), total('In', back, players), total('Total', rows, players)]
      : [total('Total', rows, players)],
  };
}
