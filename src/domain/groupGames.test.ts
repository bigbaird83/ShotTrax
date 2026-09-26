import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_GROUP_GAMES,
  formatMatchLine,
  formatToPar,
  netAvailable,
  netBlockReason,
  parseGroupGameSettings,
  parseGroupHandicap,
  planGroupGames,
  roundStrokes,
  strokesByHole,
  strokesOffLow,
  type GroupHoleIn,
  type GroupPlayerIn,
} from './groupGames';

/** Par 4s with stroke index = hole number. */
function holes(n: number, si = true): GroupHoleIn[] {
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: si ? i + 1 : null }));
}

function player(id: string, scores: (number | null)[], handicap: number | null = null): GroupPlayerIn {
  return {
    id,
    name: id.toUpperCase(),
    handicap,
    scores: Object.fromEntries(scores.map((s, i) => [i + 1, s])),
  };
}

const ALL = { ...DEFAULT_GROUP_GAMES, stableford: true, matchPlay: true, nassau: true };

test('stroke play ranks by to-par and shares ties', () => {
  const r = planGroupGames({
    holes: holes(3),
    players: [player('a', [4, 4, 4]), player('b', [5, 4, 3]), player('c', [5, 5, null])],
    settings: DEFAULT_GROUP_GAMES,
  });
  assert.deepEqual(
    r.strokePlay.map((row) => [row.playerId, row.place, row.thru, row.gross, row.toPar]),
    [
      ['a', 1, 3, 12, 0],
      ['b', 1, 3, 12, 0],
      ['c', 3, 2, 10, 2],
    ],
  );
});

test('skins carry on ties and stop at the first unscored hole', () => {
  const r = planGroupGames({
    holes: holes(5),
    players: [player('a', [4, 4, 3, 4, 4]), player('b', [4, 4, 5, 3, null])],
    settings: DEFAULT_GROUP_GAMES,
  });
  assert.ok(r.skins);
  // Holes 1–2 tie (carry 2), A wins hole 3 worth 3, B wins hole 4 worth 1; hole 5 is open.
  assert.deepEqual(r.skins.won, { a: 3, b: 1 });
  assert.deepEqual(
    r.skins.holes.map((h) => [h.number, h.winnerId, h.value]),
    [
      [1, null, 1],
      [2, null, 2],
      [3, 'a', 3],
      [4, 'b', 1],
    ],
  );
  assert.equal(r.skins.carrying, 0);

  const noCarry = planGroupGames({
    holes: holes(3),
    players: [player('a', [4, 4, 3]), player('b', [4, 4, 5])],
    settings: { ...DEFAULT_GROUP_GAMES, skinsCarry: false },
  });
  assert.deepEqual(noCarry.skins?.won, { a: 1, b: 0 });

  const open = planGroupGames({
    holes: holes(2),
    players: [player('a', [4, 4]), player('b', [4, 4])],
    settings: DEFAULT_GROUP_GAMES,
  });
  assert.equal(open.skins?.carrying, 2);
});

test('net: the low plays off scratch and net equals gross for them', () => {
  // B is 1 off A: one stroke on SI 1 (hole 1). Net 4 ties A's 4, so the skin carries; A wins hole 2 for both.
  const r = planGroupGames({
    holes: holes(2),
    players: [player('a', [4, 4], 3), player('b', [5, 5], 4)],
    settings: { ...DEFAULT_GROUP_GAMES, net: true },
  });
  assert.equal(r.net, true);
  assert.deepEqual(r.skins?.won, { a: 2, b: 0 });
  const a = r.strokePlay.find((row) => row.playerId === 'a');
  const b = r.strokePlay.find((row) => row.playerId === 'b');
  assert.equal(a?.net, a?.gross);
  assert.equal(b?.net, 9);
});

test('10 vs 4: strokes go on SI 1–6, not SI 5–10', () => {
  assert.deepEqual(strokesOffLow([player('a', [], 4), player('b', [], 10)]), { a: 0, b: 6 });
  const given = strokesByHole(holes(18), 6);
  assert.deepEqual(
    [...given.entries()].filter(([, n]) => n > 0).map(([hole]) => hole),
    [1, 2, 3, 4, 5, 6],
  );
  // Hole 1 is SI 8. Off the low, B gets no stroke there, so A's 4 beats B's 5 outright.
  // Full handicaps would give B (10) a stroke on SI 8 and A (4) none, tying the hole.
  const course = holes(18).map((h) => (h.number === 1 ? { ...h, strokeIndex: 8 } : h.number === 8 ? { ...h, strokeIndex: 1 } : h));
  const r = planGroupGames({
    holes: course,
    players: [player('a', [4], 4), player('b', [5], 10)],
    settings: { ...DEFAULT_GROUP_GAMES, net: true },
  });
  assert.deepEqual(r.skins?.won, { a: 1, b: 0 });
});

test('a match inside a foursome goes off the pair\'s low, not the group low', () => {
  // B 12 vs C 20: C gets 8, on SI 1–8. Hole 1 is SI 12: no stroke for C, so B's 4 beats C's 5.
  // Off the group low (A = 2) C would get 18 and B 10, putting a stroke for C (not B) on SI 12 — a halve.
  const course = holes(18).map((h) => (h.number === 1 ? { ...h, strokeIndex: 12 } : h.number === 12 ? { ...h, strokeIndex: 1 } : h));
  const r = planGroupGames({
    holes: course,
    players: [player('a', [4], 2), player('b', [4], 12), player('c', [5], 20), player('d', [4], 8)],
    settings: { ...ALL, net: true, matchPlayerIds: ['b', 'c'] },
  });
  assert.equal(r.net, true);
  assert.equal(r.match?.lead, 1);
  assert.equal(r.match?.label, '1 UP thru 1');
});

test('a blank handicap blocks net instead of counting as 0', () => {
  const players = [player('a', [4], 5), player('b', [5], null)];
  assert.equal(netBlockReason(holes(1), players, { net: true, stableford: false }), 'handicap');
  assert.equal(netAvailable(holes(1), players), false);
  const r = planGroupGames({ holes: holes(1), players, settings: { ...DEFAULT_GROUP_GAMES, net: true } });
  assert.equal(r.net, false);
  assert.equal(r.netBlocked, true);
  assert.equal(r.netBlockReason, 'handicap');
  assert.equal(netBlockReason(holes(1), players, { net: false, stableford: false }), null);
});

test('9-hole rounds halve the strokes, rounded', () => {
  assert.equal(roundStrokes(7, 9), 4);
  assert.equal(roundStrokes(6, 9), 3);
  assert.equal(roundStrokes(7, 18), 7);
  // B is 7 off A: 4 strokes on the 9-hole round, on SI 1–4.
  const r = planGroupGames({
    holes: holes(9),
    players: [player('a', Array(9).fill(4), 0), player('b', Array(9).fill(5), 7)],
    settings: { ...DEFAULT_GROUP_GAMES, net: true },
  });
  assert.equal(r.strokePlay.find((row) => row.playerId === 'b')?.net, 45 - 4);
});

test('net without a stroke index blocks only when someone gets strokes off the low', () => {
  const even = [player('a', [4], 10), player('b', [5], 10)];
  assert.equal(netAvailable(holes(1, false), even), true);
  assert.equal(netBlockReason(holes(1, false), even, { net: true, stableford: false }), null);
  // Stableford uses full handicaps, so the same group needs an index there.
  assert.equal(netBlockReason(holes(1, false), even, { net: true, stableford: true }), 'stroke_index');

  const uneven = [player('a', [4], 0), player('b', [5], 3)];
  assert.equal(netAvailable(holes(1, false), uneven), false);
  const r = planGroupGames({ holes: holes(1, false), players: uneven, settings: { ...DEFAULT_GROUP_GAMES, net: true } });
  assert.equal(r.net, false);
  assert.equal(r.netBlockReason, 'stroke_index');
});

test('stableford net uses each full course handicap', () => {
  // A 1 and B 2 on two par 4s (SI 1, 2): A gets a stroke on hole 1, B on both. Off the low, A would get none.
  const r = planGroupGames({
    holes: holes(2),
    players: [player('a', [5, 4], 1), player('b', [5, 5], 2)],
    settings: { ...DEFAULT_GROUP_GAMES, net: true, stableford: true },
  });
  // A: net 4, 4 → 2 + 2. B: net 4, 4 → 2 + 2.
  assert.deepEqual(
    r.stableford?.map((row) => [row.playerId, row.points]),
    [
      ['a', 4],
      ['b', 4],
    ],
  );
});

test('skins waiting on a missing score say where', () => {
  const r = planGroupGames({
    holes: holes(3),
    players: [player('a', [4, 4, 4]), player('b', [3, null, 4])],
    settings: DEFAULT_GROUP_GAMES,
  });
  assert.deepEqual(r.skins?.waitingOn, { holeNumber: 2, playerIds: ['b'] });
  const fresh = planGroupGames({
    holes: holes(3),
    players: [player('a', [4]), player('b', [3])],
    settings: DEFAULT_GROUP_GAMES,
  });
  assert.equal(fresh.skins?.waitingOn, null);
});

test('stableford points: par 2, birdie 3, double 0', () => {
  const r = planGroupGames({
    holes: holes(3),
    players: [player('a', [4, 3, 6]), player('b', [5, 5, 5])],
    settings: ALL,
  });
  assert.deepEqual(
    r.stableford?.map((row) => [row.playerId, row.points]),
    [
      ['a', 5],
      ['b', 3],
    ],
  );
});

test('match play status, close-out, and names', () => {
  const nameOf = (id: string) => id.toUpperCase();
  const early = planGroupGames({
    holes: holes(18),
    players: [player('a', [3, 4, 4]), player('b', [4, 4, 5])],
    settings: ALL,
  });
  assert.equal(early.match?.label, '2 UP thru 3');
  assert.equal(formatMatchLine(early.match!, nameOf), 'A 2 UP thru 3');

  // A wins holes 1–10: 10 up with 8 left → closed out as 10 & 8.
  const a = Array(18).fill(3);
  const b = Array(18).fill(4);
  const closed = planGroupGames({ holes: holes(18), players: [player('a', a), player('b', b)], settings: ALL });
  assert.equal(closed.match?.label, '10 & 8');
  assert.equal(closed.match?.decided, true);
  assert.equal(formatMatchLine(closed.match!, nameOf), 'A wins 10 & 8');

  const level = planGroupGames({ holes: holes(18), players: [player('a', [4]), player('b', [4])], settings: ALL });
  assert.equal(level.match?.label, 'AS thru 1');
  const none = planGroupGames({ holes: holes(18), players: [player('a', []), player('b', [])], settings: ALL });
  assert.equal(none.match?.label, 'Not started');
});

test('nassau splits front, back, and overall; needs 18 holes', () => {
  // A wins front 9 holes 1–2, B wins back holes 10–12.
  const a = [3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 4, 4, 4, 4, 4, 4];
  const b = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
  const r = planGroupGames({ holes: holes(18), players: [player('a', a), player('b', b)], settings: ALL });
  assert.ok(r.nassau);
  // 2 up with one to play closes the front out.
  assert.equal(r.nassau.front.label, '2 & 1');
  assert.equal(r.nassau.front.lead, 2);
  assert.equal(r.nassau.back.lead, -3);
  assert.equal(r.nassau.overall.lead, -1);
  assert.equal(r.nassau.overall.label, '1 UP');

  const nine = planGroupGames({ holes: holes(9), players: [player('a', a), player('b', b)], settings: ALL });
  assert.equal(nine.nassau, null);
});

test('match needs a pair: two players, or the chosen two of more', () => {
  const three = [player('a', [4]), player('b', [5]), player('c', [3])];
  assert.equal(planGroupGames({ holes: holes(18), players: three, settings: ALL }).match, null);
  const picked = planGroupGames({
    holes: holes(18),
    players: three,
    settings: { ...ALL, matchPlayerIds: ['c', 'a'] },
  });
  assert.equal(picked.match?.aId, 'c');
  assert.equal(picked.match?.lead, 1);
});

test('one player has no skins', () => {
  assert.equal(planGroupGames({ holes: holes(1), players: [player('a', [4])], settings: DEFAULT_GROUP_GAMES }).skins, null);
});

test('settings and handicap parsing', () => {
  assert.deepEqual(parseGroupGameSettings(null), DEFAULT_GROUP_GAMES);
  const parsed = parseGroupGameSettings({ net: true, skins: false, matchPlayerIds: ['x', 'y'], junk: 1 });
  assert.equal(parsed.net, true);
  assert.equal(parsed.skins, false);
  assert.deepEqual(parsed.matchPlayerIds, ['x', 'y']);
  assert.equal(parseGroupGameSettings({ matchPlayerIds: ['x', 'x'] }).matchPlayerIds, null);
  assert.equal(parseGroupHandicap('12'), 12);
  assert.equal(parseGroupHandicap(' 7.6 '), 8);
  assert.equal(parseGroupHandicap(''), null);
  assert.equal(parseGroupHandicap('60'), null);
  assert.equal(parseGroupHandicap(-2), null);
  assert.equal(formatToPar(0), 'E');
  assert.equal(formatToPar(3), '+3');
  assert.equal(formatToPar(-2), '−2');
});
