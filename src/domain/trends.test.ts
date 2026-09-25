import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatTrendChange,
  formatTrendValue,
  planTrend,
  trendClubs,
  trendScale,
  trendValue,
  type TrendRoundIn,
} from './trends';

const emptyFg = {
  fairwaysHit: 0,
  fairwayHoles: 0,
  missLeft: 0,
  missRight: 0,
  missShort: 0,
  greensHit: 0,
  greenHoles: 0,
};

function round(
  id: string,
  day: number,
  stats: Partial<TrendRoundIn['stats']> = {},
): TrendRoundIn {
  return {
    id,
    courseName: 'North Hills',
    playedAt: new Date(Date.UTC(2026, 4, day, 18)).toISOString(),
    stats: {
      holesPlayed: 18,
      toPar: 10,
      putts: 32,
      penaltyStrokes: 1,
      fairwayGir: emptyFg,
      clubAverages: [],
      ...stats,
    },
  };
}

test('9-hole rounds scale to per-18; nothing stored is a gap, not zero', () => {
  const nine = round('n', 1, { holesPlayed: 9, toPar: 5, putts: 17, penaltyStrokes: 1 });
  assert.deepEqual(trendValue(nine, 'toPar'), { value: 10, scaled: true });
  assert.deepEqual(trendValue(nine, 'putts'), { value: 34, scaled: true });
  assert.deepEqual(trendValue(nine, 'penalties'), { value: 2, scaled: true });
  const blank = round('b', 2, { holesPlayed: 0, toPar: null, putts: 0 });
  assert.equal(trendValue(blank, 'toPar').value, null);
  assert.equal(trendValue(blank, 'putts').value, null);
  assert.equal(trendValue(blank, 'penalties').value, null);
  assert.equal(trendValue(round('p', 3, { putts: 0 }), 'putts').value, null);
});

test('fairway and GIR are percents; carry is the club average that round', () => {
  const r = round('r', 1, {
    fairwayGir: { ...emptyFg, fairwaysHit: 7, fairwayHoles: 14, greensHit: 6, greenHoles: 18 },
    clubAverages: [{ id: 'club_dr', name: 'Driver', count: 9, avgYards: 241 }],
  });
  assert.equal(trendValue(r, 'fairways').value, 50);
  assert.equal(trendValue(r, 'gir').value, 33);
  assert.equal(trendValue(r, 'carry', 'club_dr').value, 241);
  assert.equal(trendValue(r, 'carry', 'club_7i').value, null);
  assert.equal(trendValue(round('x', 2), 'fairways').value, null);
});

test('window keeps the newest N, oldest first, and compares with the N before', () => {
  const rounds = [
    round('a', 1, { toPar: 20 }),
    round('b', 2, { toPar: 18 }),
    round('c', 3, { toPar: 12 }),
    round('d', 4, { toPar: 10 }),
    round('e', 5, { toPar: 8 }),
    round('f', 6, { toPar: 16 }),
    round('g', 7, { toPar: 14 }),
  ].reverse();
  const series = planTrend({ rounds, metric: 'toPar', window: 5 });
  assert.deepEqual(
    series.points.map((p) => p.roundId),
    ['c', 'd', 'e', 'f', 'g'],
  );
  assert.equal(series.average, 12);
  // Only 2 rounds before the window.
  assert.equal(series.previousAverage, 19);
  assert.equal(series.change, -7);
  assert.equal(series.tone, 'good');
  assert.equal(formatTrendChange(series, 5), '↓ 7 vs previous 5');
});

test('higher is better for fairways; carry change is neutral; no history → no change', () => {
  const fg = (hit: number) => ({ ...emptyFg, fairwaysHit: hit, fairwayHoles: 10 });
  const rounds = [
    round('a', 1, { fairwayGir: fg(8) }),
    round('b', 2, { fairwayGir: fg(4) }),
  ];
  const down = planTrend({ rounds, metric: 'fairways', window: 5 });
  assert.equal(down.change, null);
  assert.equal(down.tone, null);
  assert.equal(formatTrendChange(down, 5), null);
  const fairways = planTrend({
    rounds: [...rounds, ...[3, 4, 5, 6, 7].map((d) => round(`n${d}`, d, { fairwayGir: fg(3) }))],
    metric: 'fairways',
    window: 5,
  });
  assert.equal(fairways.average, 30);
  assert.equal(fairways.previousAverage, 60);
  assert.equal(fairways.tone, 'bad');
  const carry = planTrend({
    rounds: [1, 2, 3, 4, 5, 6].map((d) =>
      round(`c${d}`, d, { clubAverages: [{ id: 'club_7i', name: '7 Iron', count: 3, avgYards: 140 + d }] }),
    ),
    metric: 'carry',
    window: 5,
    clubId: 'club_7i',
  });
  assert.equal(carry.unit, 'yards');
  assert.equal(carry.tone, 'even');
});

test('club list counts rounds in the window, most-used first', () => {
  const dr = { id: 'club_dr', name: 'Driver', count: 5, avgYards: 240 };
  const i7 = { id: 'club_7i', name: '7 Iron', count: 2, avgYards: 150 };
  const clubs = trendClubs(
    [round('a', 1, { clubAverages: [i7] }), round('b', 2, { clubAverages: [dr, i7] }), round('c', 3, { clubAverages: [dr, i7] })],
    5,
  );
  assert.deepEqual(clubs, [
    { id: 'club_7i', name: '7 Iron', rounds: 3 },
    { id: 'club_dr', name: 'Driver', rounds: 2 },
  ]);
});

test('formatting and bar scale', () => {
  assert.equal(formatTrendValue(null, 'strokes'), '—');
  assert.equal(formatTrendValue(3.4, 'strokes', true), '+3.4');
  assert.equal(formatTrendValue(-2, 'strokes', true), '-2');
  assert.equal(formatTrendValue(55, 'percent'), '55%');
  assert.equal(formatTrendValue(241, 'yards'), '241 yd');
  assert.deepEqual(trendScale([3, null, 8]), { max: 8, min: 0 });
  assert.deepEqual(trendScale([-2, 4]), { max: 4, min: -2 });
  assert.deepEqual(trendScale([null]), { max: 1, min: 0 });
});

test('trends screen reads saved rounds only and reuses round stats', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../app/trends.tsx', import.meta.url), 'utf8');
  assert.match(page, /planRoundStats/);
  assert.match(page, /planTrend/);
  assert.doesNotMatch(page, /useLiveFix|HoleMap|getActiveRound/);
  const nerd = readFileSync(new URL('../../app/nerd-out.tsx', import.meta.url), 'utf8');
  assert.match(nerd, /'\/trends'/);
});
