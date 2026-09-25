import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  formatHoleClock,
  formatHoleTimeSpan,
  formatLivePaceLine,
  formatPaceDuration,
  formatRoundPaceLine,
  formatToPar,
  holeDurationMs,
  planLivePace,
  planHoleStartStamp,
  planLiveScoreTotals,
  type HoleStartStampInput,
  type LivePaceHole,
} from './livePace';
import {
  parseSpectatorPayload,
  planSpectatorPayload,
  spectatorPayloadHasCoordinates,
  type SpectatorHoleInput,
} from './spectator';
import { buildRoundHistoryExport, planRoundHistoryImport, serializeRoundHistory } from './roundTransfer';

const T0 = Date.parse('2026-09-23T14:00:00.000Z');
const at = (min: number) => new Date(T0 + min * 60000).toISOString();

function row(partial: Partial<LivePaceHole> & Pick<LivePaceHole, 'hole'>): LivePaceHole {
  return { score: null, par: null, startedAt: null, completedAt: null, ...partial };
}

test('live board payload carries hole start/finish, score, par, putts — no GPS', () => {
  const holes: SpectatorHoleInput[] = [
    {
      number: 1,
      score: 5,
      par: 4,
      putts: 2,
      startedAt: at(0),
      completedAt: at(14),
      shots: [
        {
          clubShortName: 'Dr',
          distanceYards: 250,
          endedAt: at(3),
          source: 'gps',
          fixQuality: 'good',
          startLat: 35.1,
          startLng: -92.1,
          endLat: 35.2,
          endLng: -92.2,
        },
      ],
    },
    { number: 2, score: null, par: 3, putts: null, startedAt: at(16), completedAt: null, shots: [] },
    { number: 3, score: null, shots: [] },
  ];
  const payload = planSpectatorPayload({
    token: 'AB12CD',
    courseName: 'Magnolia',
    finished: false,
    currentHoleNumber: 2,
    holes,
    updatedAt: at(17),
  });
  assert.deepEqual(
    payload.holes.map(({ hole, score, par, putts, startedAt, completedAt }) => ({
      hole,
      score,
      par,
      putts,
      startedAt,
      completedAt,
    })),
    [
      { hole: 1, score: 5, par: 4, putts: 2, startedAt: at(0), completedAt: at(14) },
      { hole: 2, score: null, par: 3, putts: null, startedAt: at(16), completedAt: null },
      { hole: 3, score: null, par: null, putts: null, startedAt: null, completedAt: null },
    ],
  );
  assert.equal(payload.updatedAt, at(17));
  assert.equal(spectatorPayloadHasCoordinates(payload), false);

  // Round-trips through the share host JSON.
  const parsed = parseSpectatorPayload(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(parsed, payload);

  // Old payloads (no stamps) still parse; junk stamps are dropped, not guessed.
  const legacy = parseSpectatorPayload({
    token: 'AB12CD',
    holes: [{ hole: 1, score: 4, startedAt: 'nope', completedAt: 12 }],
  });
  assert.deepEqual(legacy?.holes[0], {
    hole: 1,
    club: null,
    pinToPinYards: null,
    score: 4,
    approximate: false,
    par: null,
    putts: null,
    startedAt: null,
    completedAt: null,
  });
  assert.equal(legacy?.updatedAt, null);
});

test('share round only sends putts after Made it / Hole Out and stamps come from the hole row', () => {
  const share = readFileSync(new URL('../services/roundScoreboard.ts', import.meta.url), 'utf8');
  assert.match(share, /putts: hole\.puttsDone \? hole\.putts : null/);
  assert.match(share, /startedAt: hole\.startedAt/);
  assert.match(share, /completedAt: hole\.completedAt/);

  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const finishPutts = repo.slice(repo.indexOf('export function finishHolePutts'), repo.indexOf('export function finishHoleOut'));
  const finishOut = repo.slice(repo.indexOf('export function finishHoleOut'), repo.indexOf('export function sealOpenShotWithoutGps'));
  assert.match(finishPutts, /stampHoleCompleted/);
  assert.match(finishOut, /stampHoleCompleted/);
  assert.match(repo, /completed_at = COALESCE\(completed_at, \?\)/);
  const start = repo.slice(repo.indexOf('export function markHoleStarted'), repo.indexOf('function stampHoleCompleted'));
  assert.match(start, /planHoleStartStamp/);
  assert.match(start, /finishedAt != null/);
  assert.match(start, /started_at IS NULL/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.ok(hole.indexOf('markHoleStarted(db, id, holeNumber)') < hole.indexOf('publishRoundScoreboard(db, id, { currentHoleNumber'));

  const follower = readFileSync(new URL('../../app/s/[token].tsx', import.meta.url), 'utf8');
  assert.match(follower, /planLivePace/);
  assert.match(follower, /COPY\.liveFollowSameDevice/);
  assert.match(follower, /getShareBoard\(db, code\)/);
  assert.doesNotMatch(follower, /MapView|react-native-maps|getCurrentFix|expo-location/);
});

test('pace: thru N, elapsed, rough time left from average hole time', () => {
  const holes = [
    row({ hole: 1, score: 5, par: 4, startedAt: at(0), completedAt: at(14) }),
    row({ hole: 2, score: 3, par: 3, startedAt: at(15), completedAt: at(25) }),
    row({ hole: 3, par: 5, startedAt: at(26) }),
    row({ hole: 4, par: 4 }),
  ];
  const pace = planLivePace({ holes, nowMs: T0 + 30 * 60000 });
  assert.equal(pace.thru, 2);
  assert.equal(pace.holeCount, 4);
  assert.equal(pace.elapsedMs, 30 * 60000);
  assert.equal(pace.avgHoleMs, 12 * 60000);
  assert.equal(pace.timedHoles, 2);
  assert.equal(pace.remainingMs, 24 * 60000);
  assert.equal(formatLivePaceLine(pace), 'Thru 2 · 30m elapsed · ~24m left');
  assert.equal(holeDurationMs(holes[2]), null);
});

test('pace never invents: no stamps → no elapsed / remaining', () => {
  const holes = [row({ hole: 1, score: 4 }), row({ hole: 2 })];
  const pace = planLivePace({ holes, nowMs: T0 });
  assert.equal(pace.thru, 1);
  assert.equal(pace.elapsedMs, null);
  assert.equal(pace.avgHoleMs, null);
  assert.equal(pace.remainingMs, null);
  assert.equal(formatLivePaceLine(pace), 'Thru 1');

  const started = planLivePace({ holes: [row({ hole: 1, startedAt: at(0) }), row({ hole: 2 })], nowMs: T0 + 5 * 60000 });
  assert.equal(started.thru, 0);
  assert.equal(started.elapsedMs, 5 * 60000);
  assert.equal(started.remainingMs, null);
  assert.equal(formatLivePaceLine(started), 'Thru 0 · 5m elapsed');

  // Out-of-order stamps are ignored, not clamped.
  assert.equal(holeDurationMs(row({ hole: 1, startedAt: at(10), completedAt: at(5) })), null);
});

test('pace: finished round stops the clock at the last finish', () => {
  const holes = [
    row({ hole: 1, score: 4, startedAt: at(0), completedAt: at(12) }),
    row({ hole: 2, score: 4, startedAt: at(13), completedAt: at(75) }),
  ];
  const pace = planLivePace({ holes, nowMs: T0 + 600 * 60000 });
  assert.equal(pace.thru, 2);
  assert.equal(pace.elapsedMs, 75 * 60000);
  assert.equal(pace.remainingMs, 0);
  assert.equal(formatLivePaceLine(pace), 'Final · 1h 15m elapsed');
});

test('totals and to-par use posted scores and known par only', () => {
  assert.deepEqual(
    planLiveScoreTotals([row({ hole: 1, score: 5, par: 4 }), row({ hole: 2, score: 2, par: 3 }), row({ hole: 3, par: 4 })]),
    { total: 7, toPar: 0 },
  );
  assert.deepEqual(planLiveScoreTotals([row({ hole: 1, score: 5, par: 4 }), row({ hole: 2, score: 4 })]), {
    total: 9,
    toPar: null,
  });
  assert.deepEqual(planLiveScoreTotals([row({ hole: 1 })]), { total: null, toPar: null });
  assert.equal(formatToPar(0), 'E');
  assert.equal(formatToPar(3), '+3');
  assert.equal(formatToPar(-2), '-2');
  assert.equal(formatToPar(null), null);
});

test('duration and clock formatting', () => {
  assert.equal(formatPaceDuration(null), '—');
  assert.equal(formatPaceDuration(20000), '<1m');
  assert.equal(formatPaceDuration(42 * 60000), '42m');
  assert.equal(formatPaceDuration(65 * 60000), '1h 05m');
  assert.equal(formatHoleClock(null), '—');
  assert.equal(formatHoleClock('bad'), '—');
  assert.equal(formatHoleClock(new Date(2026, 8, 23, 14, 5).toISOString()), '2:05 PM');
  assert.equal(formatHoleClock(new Date(2026, 8, 23, 0, 30).toISOString()), '12:30 AM');
});

function stampRow(number: number, partial: Partial<HoleStartStampInput> = {}): HoleStartStampInput {
  return { number, score: null, puttsDone: false, startedAt: null, completedAt: null, ...partial };
}

test('start time: only when the player moves on after finishing the prior hole — peeking never stamps', () => {
  // Fresh round: hole 1 is where play begins.
  const fresh = [stampRow(1), stampRow(2), stampRow(3), stampRow(4)];
  assert.equal(planHoleStartStamp(fresh, 1), true);

  // On hole 1 (started, not finished): peeking at 2, 3, 4 stamps nothing.
  const onOne = [stampRow(1, { startedAt: at(0) }), stampRow(2), stampRow(3), stampRow(4)];
  assert.equal(planHoleStartStamp(onOne, 2), false);
  assert.equal(planHoleStartStamp(onOne, 3), false);
  assert.equal(planHoleStartStamp(onOne, 4), false);
  // Going back to hole 1 never restamps it.
  assert.equal(planHoleStartStamp(onOne, 1), false);

  // Made it on hole 1, then move to hole 2 → stamp. Jumping to 3 or 4 still does not.
  const madeOne = [
    stampRow(1, { startedAt: at(0), completedAt: at(12), puttsDone: true, score: 4 }),
    stampRow(2),
    stampRow(3),
    stampRow(4),
  ];
  assert.equal(planHoleStartStamp(madeOne, 2), true);
  assert.equal(planHoleStartStamp(madeOne, 3), false);
  assert.equal(planHoleStartStamp(madeOne, 4), false);

  // A finished hole is never given a start time after the fact.
  assert.equal(planHoleStartStamp(madeOne, 1), false);
  assert.equal(planHoleStartStamp([stampRow(1, { score: 4 })], 1), false);

  // Hole Out on 2 (finish stamp, putts done) opens hole 3.
  const outTwo = [
    madeOne[0],
    stampRow(2, { startedAt: at(13), completedAt: at(20), puttsDone: true, score: 3 }),
    stampRow(3),
    stampRow(4),
  ];
  assert.equal(planHoleStartStamp(outTwo, 3), true);
  assert.equal(planHoleStartStamp(outTwo, 4), false);

  // Unknown hole number is a no-op.
  assert.equal(planHoleStartStamp(fresh, 19), false);
});

test('past-round pace line and per-hole time span for history / summary', () => {
  const holes = [
    row({ hole: 1, score: 4, startedAt: at(0), completedAt: at(12) }),
    row({ hole: 2, score: 5, startedAt: at(13), completedAt: at(27) }),
  ];
  const pace = planLivePace({ holes, nowMs: T0 + 999 * 60000, finished: true });
  assert.equal(formatRoundPaceLine(pace), '27m · 13m a hole');

  const long = planLivePace({
    holes: [row({ hole: 1, score: 4, startedAt: at(0), completedAt: at(242) })],
    nowMs: T0,
    finished: true,
  });
  assert.equal(formatRoundPaceLine(long), '4h 02m · 4h 02m a hole');

  // Old round with no stamps shows no pace at all.
  assert.equal(
    formatRoundPaceLine(planLivePace({ holes: [row({ hole: 1, score: 4 })], nowMs: T0, finished: true })),
    null,
  );

  const start = new Date(2026, 8, 23, 14, 5).toISOString();
  const end = new Date(2026, 8, 23, 14, 18).toISOString();
  assert.equal(formatHoleTimeSpan({ startedAt: start, completedAt: end }), '2:05 PM – 2:18 PM · 13m');
  assert.equal(formatHoleTimeSpan({ startedAt: start, completedAt: null }), '2:05 PM –');
  assert.equal(formatHoleTimeSpan({ startedAt: null, completedAt: end }), '— – 2:18 PM');
  assert.equal(formatHoleTimeSpan({ startedAt: null, completedAt: null }), null);
});

test('round history export / restore keeps hole start and finish times', () => {
  const doc = buildRoundHistoryExport({
    exportedAt: at(300),
    rounds: [
      {
        startedAt: at(0),
        finishedAt: at(250),
        courseName: 'Magnolia',
        holeCount: 9,
        courseApiId: null,
        courseLat: null,
        courseLng: null,
        teeName: null,
        teeRating: null,
        teeSlope: null,
        teeTotalYards: null,
        holes: [
          {
            number: 1,
            par: 4,
            parSource: 'course',
            score: 4,
            yards: null,
            handicap: null,
            teeLat: null,
            teeLng: null,
            greenLat: null,
            greenLng: null,
            greenSource: null,
            greenFrontLat: null,
            greenFrontLng: null,
            greenBackLat: null,
            greenBackLng: null,
            greenDepthYards: null,
            putts: 2,
            puttLengths: [],
            puttsDone: true,
            startedAt: at(0),
            completedAt: at(12),
            shots: [],
          },
          {
            number: 2,
            par: 3,
            parSource: 'course',
            score: null,
            yards: null,
            handicap: null,
            teeLat: null,
            teeLng: null,
            greenLat: null,
            greenLng: null,
            greenSource: null,
            greenFrontLat: null,
            greenFrontLng: null,
            greenBackLat: null,
            greenBackLng: null,
            greenDepthYards: null,
            putts: 0,
            puttLengths: [],
            puttsDone: false,
            shots: [],
          },
        ],
      },
    ],
  });
  assert.equal(doc.rounds[0].holes[0].startedAt, at(0));
  assert.equal(doc.rounds[0].holes[0].completedAt, at(12));
  assert.equal(doc.rounds[0].holes[1].startedAt, null);
  assert.equal(doc.rounds[0].holes[1].completedAt, null);

  const back = planRoundHistoryImport(serializeRoundHistory(doc));
  assert.equal(back.ok, true);
  if (!back.ok) return;
  assert.equal(back.rounds[0].holes[0].startedAt, at(0));
  assert.equal(back.rounds[0].holes[0].completedAt, at(12));

  // Files from before this change (no stamps) and junk stamps import as null.
  const legacy = JSON.parse(serializeRoundHistory(doc));
  delete legacy.rounds[0].holes[0].startedAt;
  legacy.rounds[0].holes[0].completedAt = 'not a time';
  const old = planRoundHistoryImport(legacy);
  assert.equal(old.ok, true);
  if (!old.ok) return;
  assert.equal(old.rounds[0].holes[0].startedAt, null);
  assert.equal(old.rounds[0].holes[0].completedAt, null);

  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const collect = repo.slice(repo.indexOf('export function collectRoundHistoryExport'), repo.indexOf('export function restoreRoundHistory'));
  assert.match(collect, /startedAt: hole\.startedAt/);
  assert.match(collect, /completedAt: hole\.completedAt/);
  const insert = repo.slice(repo.indexOf('function insertTransferredRound'), repo.indexOf('export function finishRound'));
  assert.match(insert, /started_at, completed_at\)/);
  assert.match(insert, /hole\.startedAt,\s*hole\.completedAt/);

  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  assert.match(summary, /formatRoundPaceLine/);
  assert.match(summary, /formatHoleTimeSpan/);
  const history = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(history, /formatRoundPaceLine/);
});
