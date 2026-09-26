import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatTrendChange,
  formatTrendValue,
  planTrend,
  trendChartReady,
  trendClubs,
  trendRoundCounts,
  trendScaledReadoutSuffix,
  trendScaledRowSuffix,
  trendScale,
  trendValue,
  trendWindowRounds,
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

test('per-18 charts drop rounds under 9 holes; a 9-hole round scales by 2', () => {
  const one = round('one', 1, { holesPlayed: 1, toPar: 0, putts: 2, penaltyStrokes: 1 });
  const eight = round('eight', 2, { holesPlayed: 8, toPar: 4, putts: 16, penaltyStrokes: 2 });
  const nine = round('nine', 3, { holesPlayed: 9, toPar: 5, putts: 17, penaltyStrokes: 1 });
  const ten = round('ten', 4, { holesPlayed: 10, toPar: 5, putts: 20, penaltyStrokes: 1 });
  const full = round('full', 5, { holesPlayed: 18, toPar: 8, putts: 30, penaltyStrokes: 2 });
  const rounds = [one, eight, nine, ten, full];

  for (const metric of ['toPar', 'putts', 'penalties'] as const) {
    assert.equal(trendRoundCounts(one, metric), false);
    assert.equal(trendRoundCounts(eight, metric), false);
    assert.equal(trendValue(one, metric).value, null);
    assert.equal(trendValue(eight, metric).value, null);
    const series = planTrend({ rounds, metric, window: 5 });
    assert.deepEqual(
      series.points.map((point) => point.roundId),
      ['nine', 'ten', 'full'],
    );
    assert.equal(trendChartReady(series), true);
  }

  const toPar = planTrend({ rounds, metric: 'toPar', window: 5 });
  const ninePoint = toPar.points[0];
  const tenPoint = toPar.points[1];
  const fullPoint = toPar.points[2];
  assert.deepEqual(
    { value: ninePoint.value, scaled: ninePoint.scaled, holesPlayed: ninePoint.holesPlayed },
    { value: 10, scaled: true, holesPlayed: 9 },
  );
  assert.equal(ninePoint.value, 5 * 2);
  assert.equal(trendScaledRowSuffix(ninePoint), ' · 9');
  assert.equal(trendScaledReadoutSuffix(ninePoint), ' (9 holes, per 18)');
  assert.equal(tenPoint.value, 9);
  assert.equal(tenPoint.scaled, true);
  assert.equal(tenPoint.holesPlayed, 10);
  assert.equal(trendScaledRowSuffix(tenPoint), ' · 10');
  assert.equal(trendScaledReadoutSuffix(tenPoint), ' (10 holes, per 18)');
  assert.notEqual(trendScaledRowSuffix(tenPoint), ' · 9');
  assert.equal(fullPoint.value, 8);
  assert.equal(fullPoint.scaled, false);
  assert.equal(fullPoint.holesPlayed, 18);
  assert.equal(trendScaledRowSuffix(fullPoint), '');
  assert.equal(trendScaledReadoutSuffix(fullPoint), '');

  const putts = planTrend({ rounds, metric: 'putts', window: 5 });
  assert.equal(putts.points.find((point) => point.roundId === 'nine')?.value, 34);
  const penalties = planTrend({ rounds, metric: 'penalties', window: 5 });
  assert.equal(penalties.points.find((point) => point.roundId === 'nine')?.value, 2);

  // A 1-hole or 8-hole round never picks up a hardcoded 9.
  for (const holes of [1, 8, 10, 12, 15, 17, 18]) {
    const suffix = trendScaledRowSuffix({ scaled: holes >= 9 && holes < 18, holesPlayed: holes });
    const readout = trendScaledReadoutSuffix({ scaled: holes >= 9 && holes < 18, holesPlayed: holes });
    if (holes !== 9) {
      assert.notEqual(suffix, ' · 9');
      assert.notEqual(readout, ' (9 holes, per 18)');
    }
    if (holes < 9 || holes >= 18) {
      assert.equal(suffix, '');
      assert.equal(readout, '');
    } else {
      assert.equal(suffix, ` · ${holes}`);
      assert.equal(readout, ` (${holes} holes, per 18)`);
    }
  }
  assert.equal(trendScaledRowSuffix({ scaled: true, holesPlayed: 1 }), '');
  assert.equal(trendScaledReadoutSuffix({ scaled: true, holesPlayed: 1 }), '');
});

test('the window is the last N finished rounds; short rounds keep their slot', () => {
  const rounds = [
    round('a', 1, { holesPlayed: 18, toPar: 20 }),
    round('b', 2, { holesPlayed: 18, toPar: 18 }),
    round('c', 3, { holesPlayed: 1, toPar: 0 }),
    round('d', 4, { holesPlayed: 18, toPar: 10 }),
    round('e', 5, { holesPlayed: 8, toPar: 40 }),
    round('f', 6, { holesPlayed: 9, toPar: 5 }),
    round('g', 7, { holesPlayed: 18, toPar: 14 }),
  ];
  const window = trendWindowRounds(rounds, 5);
  assert.deepEqual(
    window.map((row) => row.id),
    ['c', 'd', 'e', 'f', 'g'],
  );
  const series = planTrend({ rounds, metric: 'toPar', window: 5 });
  assert.deepEqual(
    series.points.map((point) => point.roundId),
    ['d', 'f', 'g'],
  );
  assert.equal(series.average, 11.3);
  // Previous window is a and b. The 1-hole round is not pulled in, and it is not a zero.
  assert.equal(series.previousAverage, 19);
  assert.equal(series.change, -7.7);
  const onlyShort = planTrend({
    rounds: [round('s1', 1, { holesPlayed: 1, toPar: 0 }), round('s2', 2, { holesPlayed: 4, toPar: 3 })],
    metric: 'toPar',
    window: 5,
  });
  assert.equal(onlyShort.points.length, 0);
  assert.equal(onlyShort.average, null);
  assert.equal(onlyShort.change, null);
  assert.equal(trendChartReady(onlyShort), false);
  const oneQualifying = planTrend({
    rounds: [round('full', 1, { toPar: 4 }), round('short', 2, { holesPlayed: 1, toPar: 0 })],
    metric: 'putts',
    window: 5,
  });
  assert.equal(oneQualifying.points.length, 1);
  assert.equal(trendChartReady(oneQualifying), false);
});

test('fairways, greens, and carry still include a round under 9 holes', () => {
  const fg = {
    ...emptyFg,
    fairwaysHit: 1,
    fairwayHoles: 1,
    greensHit: 0,
    greenHoles: 1,
  };
  const short = round('short', 1, {
    holesPlayed: 1,
    fairwayGir: fg,
    clubAverages: [{ id: 'club_dr', name: 'Driver', count: 1, avgYards: 250 }],
  });
  const full = round('full', 2, {
    fairwayGir: { ...emptyFg, fairwaysHit: 7, fairwayHoles: 14, greensHit: 9, greenHoles: 18 },
    clubAverages: [{ id: 'club_dr', name: 'Driver', count: 8, avgYards: 240 }],
  });
  const fairways = planTrend({ rounds: [short, full], metric: 'fairways', window: 5 });
  assert.deepEqual(
    fairways.points.map((point) => [point.roundId, point.value, point.scaled]),
    [
      ['short', 100, false],
      ['full', 50, false],
    ],
  );
  assert.equal(trendScaledRowSuffix(fairways.points[0]), '');
  const gir = planTrend({ rounds: [short, full], metric: 'gir', window: 5 });
  assert.deepEqual(
    gir.points.map((point) => point.roundId),
    ['short', 'full'],
  );
  assert.equal(gir.points[0].value, 0);
  const carry = planTrend({ rounds: [short, full], metric: 'carry', window: 5, clubId: 'club_dr' });
  assert.deepEqual(
    carry.points.map((point) => [point.roundId, point.value]),
    [
      ['short', 250],
      ['full', 240],
    ],
  );
  assert.equal(trendChartReady(carry), true);
});

test('trends screen reads saved rounds only and reuses round stats', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../../app/trends.tsx', import.meta.url), 'utf8');
  assert.match(page, /planRoundStats/);
  assert.match(page, /planTrend/);
  assert.match(page, /trendWindowRounds/);
  assert.match(page, /trendChartReady/);
  assert.match(page, /COPY\.trendsNoData/);
  assert.doesNotMatch(page, /useLiveFix|HoleMap|getActiveRound/);
  const bars = readFileSync(new URL('../../src/ui/TrendBars.tsx', import.meta.url), 'utf8');
  assert.match(bars, /trendScaledRowSuffix/);
  assert.match(bars, /trendScaledReadoutSuffix/);
  assert.doesNotMatch(bars, /· 9/);
  assert.doesNotMatch(bars, /9 holes, per 18/);
  const stats = readFileSync(new URL('../../app/review/[id]/stats.tsx', import.meta.url), 'utf8');
  assert.match(stats, /strokesGainedForStats/);
  assert.match(stats, /COPY\.strokesGainedEmpty/);
  const nerd = readFileSync(new URL('../../app/nerd-out.tsx', import.meta.url), 'utf8');
  assert.match(nerd, /'\/trends'/);
});
