import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PUTTER_CLUB_ID } from './defaultBag';
import { planReviewRounds, planRoundStats, roundStatsShowsFirGir, type ReviewHoleIn } from './roundReview';

test('review list shows finished saved rounds only, newest first', () => {
  const rows = planReviewRounds([
    {
      id: 'old',
      courseName: 'North Hills',
      startedAt: '2026-05-01T14:00:00Z',
      finishedAt: '2026-05-01T18:00:00Z',
      holes: [
        { score: 4, par: 4 },
        { score: 6, par: 5 },
      ],
    },
    {
      id: 'live',
      courseName: 'Mountain Ranch',
      startedAt: '2026-06-02T14:00:00Z',
      finishedAt: null,
      holes: [{ score: 3, par: 4 }],
    },
    {
      id: 'new',
      courseName: '  ',
      startedAt: '2026-06-01T14:00:00Z',
      finishedAt: '2026-06-01T18:00:00Z',
      holes: [
        { score: 5, par: 4 },
        { score: null, par: 3 },
        { score: 4, par: null },
      ],
    },
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['new', 'old'],
  );
  assert.deepEqual(rows[0], {
    id: 'new',
    courseName: 'Round',
    date: 'Jun 1, 2026',
    score: 9,
    toPar: 1,
  });
  assert.equal(rows[1]?.score, 10);
  assert.equal(rows[1]?.toPar, 1);
  assert.deepEqual(planReviewRounds([]), []);
});

const clubs = {
  club_dr: { id: 'club_dr', name: 'Driver', sortOrder: 0 },
  club_7i: { id: 'club_7i', name: '7 Iron', sortOrder: 7 },
  club_pw: { id: 'club_pw', name: 'Pitching Wedge', sortOrder: 10 },
  [PUTTER_CLUB_ID]: { id: PUTTER_CLUB_ID, name: 'Putter', sortOrder: 20 },
};

function hole(over: Partial<ReviewHoleIn> & { number: number }): ReviewHoleIn {
  return {
    par: null,
    score: null,
    putts: 0,
    startedAt: null,
    completedAt: null,
    shots: [],
    penaltyStrokes: 0,
    ...over,
  };
}

test('round stats come from the saved holes and shots passed in', () => {
  const stats = planRoundStats({
    clubs,
    holes: [
      hole({
        number: 1,
        par: 4,
        score: 4,
        putts: 2,
        shots: [
          { clubId: 'club_dr', source: 'gps', distanceYards: 281.4, fixQuality: 'good' },
          { clubId: 'club_pw', source: 'placed', distanceYards: 112, fixQuality: null },
          { clubId: PUTTER_CLUB_ID, source: 'gps', distanceYards: 9, fixQuality: 'good' },
        ],
      }),
      hole({
        number: 2,
        par: 3,
        score: 2,
        putts: 1,
        shots: [{ clubId: 'club_7i', source: 'gps', distanceYards: 150, fixQuality: 'good' }],
      }),
      hole({
        number: 3,
        par: 5,
        score: 7,
        putts: 2,
        penaltyStrokes: 1,
        shots: [
          { clubId: 'club_dr', source: 'gps', distanceYards: 265, fixQuality: 'soft' },
          { clubId: 'club_7i', source: 'no_gps', distanceYards: null, fixQuality: 'none' },
          { clubId: 'club_7i', source: 'gps', distanceYards: 400, fixQuality: 'good', impossibleJump: true },
        ],
      }),
      hole({ number: 4, par: 4, score: 5, putts: 2 }),
    ],
  });
  assert.equal(stats.score, 18);
  assert.equal(stats.toPar, 2);
  assert.equal(stats.holesPlayed, 4);
  assert.deepEqual(stats.marks, { eagle: 0, birdie: 1, par: 1, bogey: 1, double: 1 });
  assert.equal(stats.putts, 7);
  assert.equal(stats.puttsPerHole, 1.8);
  assert.deepEqual(stats.longest, { yards: 281, clubId: 'club_dr', clubName: 'Driver' });
  // Putter is never a full swing; 9 yd putt is ignored.
  assert.deepEqual(stats.shortestFullSwing, { yards: 112, clubId: 'club_pw', clubName: 'Pitching Wedge' });
  assert.deepEqual(stats.clubAverages, [
    { id: 'club_dr', name: 'Driver', count: 2, avgYards: 273 },
    { id: 'club_7i', name: '7 Iron', count: 1, avgYards: 150 },
    { id: 'club_pw', name: 'Pitching Wedge', count: 1, avgYards: 112 },
  ]);
  assert.deepEqual(stats.parAverages, [
    { par: 3, holes: 1, avg: 2 },
    { par: 4, holes: 2, avg: 4.5 },
    { par: 5, holes: 1, avg: 7 },
  ]);
  assert.equal(stats.penaltyStrokes, 1);
  assert.deepEqual(stats.holeTimes, []);
  assert.equal('gir' in stats, false);
  assert.equal('fir' in stats, false);
  assert.equal(roundStatsShowsFirGir(), false);
});

test('round stats leave rows blank when nothing is stored', () => {
  const stats = planRoundStats({
    clubs,
    holes: [hole({ number: 1 }), hole({ number: 2 })],
  });
  assert.equal(stats.score, null);
  assert.equal(stats.toPar, null);
  assert.equal(stats.holesPlayed, 0);
  assert.equal(stats.puttsPerHole, null);
  assert.equal(stats.longest, null);
  assert.equal(stats.shortestFullSwing, null);
  assert.deepEqual(stats.clubAverages, []);
  assert.deepEqual(stats.parAverages, []);
  assert.deepEqual(stats.holeTimes, []);
  assert.equal(stats.penaltyStrokes, 0);
});

test('hole times appear only for holes with stored stamps', () => {
  const stats = planRoundStats({
    clubs,
    holes: [
      hole({ number: 1, startedAt: '2026-06-01T14:00:00Z', completedAt: '2026-06-01T14:12:00Z' }),
      hole({ number: 2 }),
    ],
  });
  assert.deepEqual(
    stats.holeTimes.map((row) => row.number),
    [1],
  );
  assert.match(stats.holeTimes[0]?.span ?? '', /–/);
});

test('review screens read saved rounds only — no live GPS, no club book', () => {
  const list = readFileSync(new URL('../../app/review-rounds.tsx', import.meta.url), 'utf8');
  assert.match(list, /listRounds/);
  assert.match(list, /planReviewRounds/);
  assert.doesNotMatch(list, /useLiveFix|getActiveRound|listClubAverages/);
  const stats = readFileSync(new URL('../../app/review/[id]/stats.tsx', import.meta.url), 'utf8');
  assert.match(stats, /getRound/);
  assert.match(stats, /planRoundStats/);
  assert.doesNotMatch(stats, /useLiveFix|listClubAverages|HoleMap/);
  assert.doesNotMatch(stats, /\bGIR\b|\bFIR\b|fairway|greens? in reg/i);
  const card = readFileSync(new URL('../../app/review/[id]/scorecard.tsx', import.meta.url), 'utf8');
  assert.match(card, /ScorecardBody/);
  assert.match(card, /shareRoundSnapshot/);
  assert.doesNotMatch(card, /shareLiveBoard|onShare=/);
});
