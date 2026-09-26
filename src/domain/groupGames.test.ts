import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_GROUP_GAMES,
  formatMatchLine,
  formatToPar,
  netAvailable,
  parseGroupGameSettings,
  parseGroupHandicap,
  planGroupGames,
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

test('net gives strokes on the hardest holes', () => {
  // B gets 1 stroke on SI 1 (hole 1): net 4 ties A's 4, so the skin carries; hole 2 A wins both skins.
  const r = planGroupGames({
    holes: holes(2),
    players: [player('a', [4, 4]), player('b', [5, 5], 1)],
    settings: { ...DEFAULT_GROUP_GAMES, net: true },
  });
  assert.equal(r.net, true);
  assert.deepEqual(r.skins?.won, { a: 2, b: 0 });
  assert.equal(r.strokePlay.find((row) => row.playerId === 'b')?.net, 9);
});

test('net without a stroke index stays gross and says so', () => {
  const players = [player('a', [4]), player('b', [5], 3)];
  assert.equal(netAvailable(holes(1, false), players), false);
  assert.equal(netAvailable(holes(1, false), [player('a', [4]), player('b', [5])]), true);
  const r = planGroupGames({ holes: holes(1, false), players, settings: { ...DEFAULT_GROUP_GAMES, net: true } });
  assert.equal(r.net, false);
  assert.equal(r.netBlocked, true);
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
