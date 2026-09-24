import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { haversineYards, roundYards } from './haversine';
import { COPY } from './playerCopy';
import {
  buildRoundHistoryExport,
  planRoundHistoryImport,
  ROUND_HISTORY_EXPORT_KIND,
  ROUND_HISTORY_EXPORT_VERSION,
  serializeRoundHistory,
} from './roundTransfer';
import {
  durableClosedShot,
  formatReplayMissingLine,
  planReplay,
  planReplayFramePoints,
  replayAnimates,
  replayFliesCamera,
  replayHoleHref,
  replayPinsAreStatic,
  replayPinTracksViewChanges,
  replayReviewRequested,
  type ClosedShotPointInput,
} from './roundReplay';

function shot(over: Partial<ClosedShotPointInput> & Pick<ClosedShotPointInput, 'seq'>): ClosedShotPointInput {
  return {
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    distanceYards: null,
    endedAt: '2026-09-24T15:12:00.000Z',
    ...over,
  };
}

test('closed shots keep real pins and stored distance, and skip anything missing', () => {
  assert.equal(replayPinsAreStatic(), true);
  assert.equal(replayAnimates(), false);
  assert.equal(replayFliesCamera(), false);
  assert.equal(replayPinTracksViewChanges(), false);

  const start = { lat: 35.51, lng: -92.11 };
  const end = { lat: 35.513, lng: -92.11 };
  const yards = roundYards(haversineYards(start, end));
  const closed = durableClosedShot(
    shot({
      seq: 1,
      startLat: start.lat,
      startLng: start.lng,
      endLat: end.lat,
      endLng: end.lng,
      distanceYards: yards,
    }),
  );
  assert.equal(closed?.missing, false);
  assert.equal(closed?.distanceYards, yards);
  assert.deepEqual(closed?.points, [
    { role: 'start', ...start },
    { role: 'end', ...end },
  ]);

  const sealed = durableClosedShot(
    shot({
      seq: 2,
      startLat: 35.514,
      startLng: -92.111,
      distanceYards: 140,
    }),
  );
  assert.equal(sealed?.distanceYards, null);
  assert.deepEqual(sealed?.points, [{ role: 'start', lat: 35.514, lng: -92.111 }]);

  const blank = durableClosedShot(shot({ seq: 3 }));
  assert.equal(blank?.missing, true);
  assert.deepEqual(blank?.points, []);
  assert.equal(blank?.distanceYards, null);

  const open = durableClosedShot(shot({ seq: 4, endedAt: null, startLat: start.lat, startLng: start.lng }));
  assert.equal(open, null);

  const placeholder = durableClosedShot(shot({ seq: 5, startLat: 0, startLng: 0, distanceYards: 200 }));
  assert.equal(placeholder?.missing, true);
  assert.equal(placeholder?.distanceYards, null);

  const plan = planReplay([
    shot({
      seq: 1,
      startLat: start.lat,
      startLng: start.lng,
      endLat: end.lat,
      endLng: end.lng,
      distanceYards: yards,
    }),
    shot({ seq: 2, startLat: 35.514, startLng: -92.111, distanceYards: 140 }),
    shot({ seq: 3 }),
    shot({ seq: 4, endedAt: null, startLat: 35.52, startLng: -92.12 }),
    shot({ seq: 5, startLat: 0, startLng: 0 }),
  ]);
  assert.equal(plan.staticPins, true);
  assert.equal(plan.animates, false);
  assert.equal(plan.fliesCamera, false);
  assert.deepEqual(
    plan.pins.map((pin) => ({ seq: pin.seq, role: pin.role, lat: pin.lat, lng: pin.lng })),
    [
      { seq: 1, role: 'start', ...start },
      { seq: 1, role: 'end', ...end },
      { seq: 2, role: 'start', lat: 35.514, lng: -92.111 },
    ],
  );
  assert.deepEqual(plan.missing, [{ seq: 3 }, { seq: 5 }]);
  assert.equal(formatReplayMissingLine(3), `Shot 3 · ${COPY.replayNoPin}`);
  assert.equal(plan.pins.some((pin) => pin.lat === 0 && pin.lng === 0), false);
});

test('replay frame uses stored tee, green, and pins — never a lone invented point', () => {
  const tee = { lat: 35.5, lng: -92.1 };
  const green = { lat: 35.503, lng: -92.1 };
  const pin = { lat: 35.501, lng: -92.101 };
  const framed = planReplayFramePoints({ tee, green, pins: [pin] });
  assert.deepEqual(framed, [tee, green, pin]);
  assert.deepEqual(planReplayFramePoints({ tee: null, green, pins: [pin] }), [green, pin]);
  assert.equal(planReplayFramePoints({ tee: null, green: null, pins: [pin] }), null);
  const pinsOnly = planReplayFramePoints({
    tee: { lat: 0, lng: 0 },
    green: null,
    pins: [pin, { lat: 35.502, lng: -92.102 }],
  });
  assert.deepEqual(pinsOnly, [pin, { lat: 35.502, lng: -92.102 }]);
  assert.equal(replayHoleHref('round-1', 3), '/round/round-1/hole/3?review=1');
  assert.equal(replayReviewRequested('1'), true);
  assert.equal(replayReviewRequested(undefined), false);
});

test('round history keeps a sealed shot pin and does not invent its yards', () => {
  const start = { lat: 35.51, lng: -92.11 };
  const end = { lat: 35.513, lng: -92.11 };
  const yards = roundYards(haversineYards(start, end));
  const exported = buildRoundHistoryExport({
    exportedAt: '2026-09-24T18:00:00.000Z',
    rounds: [
      {
        id: 'r1',
        startedAt: '2026-09-24T15:00:00.000Z',
        finishedAt: '2026-09-24T18:00:00.000Z',
        courseName: 'Little River',
        holeCount: 9,
        courseApiId: null,
        courseLat: null,
        courseLng: null,
        teeName: 'Blue',
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
            shots: [
              {
                clubId: 'club_7i',
                seq: 1,
                startLat: start.lat,
                startLng: start.lng,
                endLat: end.lat,
                endLng: end.lng,
                startAccuracyM: 4,
                endAccuracyM: 5,
                startFixQuality: 'good',
                endFixQuality: 'good',
                distanceYards: 9999,
                typedYards: null,
                fixQuality: 'good',
                impossibleJump: false,
                startedAt: '2026-09-24T15:10:00.000Z',
                endedAt: '2026-09-24T15:12:00.000Z',
                source: 'gps',
                suggested: false,
                holeOut: false,
              },
              {
                clubId: 'club_pw',
                seq: 2,
                startLat: 35.514,
                startLng: -92.111,
                endLat: null,
                endLng: null,
                startAccuracyM: 8,
                endAccuracyM: null,
                startFixQuality: 'soft',
                endFixQuality: null,
                distanceYards: 140,
                typedYards: null,
                fixQuality: 'soft',
                impossibleJump: false,
                startedAt: '2026-09-24T15:20:00.000Z',
                endedAt: '2026-09-24T15:22:00.000Z',
                source: 'gps',
                suggested: false,
                holeOut: false,
              },
              {
                clubId: 'club_sw',
                seq: 3,
                startLat: null,
                startLng: null,
                endLat: null,
                endLng: null,
                startAccuracyM: null,
                endAccuracyM: null,
                startFixQuality: null,
                endFixQuality: null,
                distanceYards: 90,
                typedYards: null,
                fixQuality: null,
                impossibleJump: false,
                startedAt: '2026-09-24T15:30:00.000Z',
                endedAt: '2026-09-24T15:31:00.000Z',
                source: 'gps',
                suggested: false,
                holeOut: false,
              },
              {
                clubId: 'club_7i',
                seq: 4,
                startLat: 35.52,
                startLng: -92.12,
                endLat: null,
                endLng: null,
                startAccuracyM: 5,
                endAccuracyM: null,
                startFixQuality: 'good',
                endFixQuality: null,
                distanceYards: null,
                typedYards: null,
                fixQuality: 'good',
                impossibleJump: false,
                startedAt: '2026-09-24T15:40:00.000Z',
                endedAt: null,
                source: 'gps',
                suggested: false,
                holeOut: false,
              },
              {
                clubId: 'club_7i',
                seq: 5,
                startLat: 0,
                startLng: 0,
                endLat: 0,
                endLng: 0,
                startAccuracyM: null,
                endAccuracyM: null,
                startFixQuality: null,
                endFixQuality: null,
                distanceYards: 10,
                typedYards: null,
                fixQuality: null,
                impossibleJump: false,
                startedAt: '2026-09-24T15:50:00.000Z',
                endedAt: '2026-09-24T15:51:00.000Z',
                source: 'gps',
                suggested: false,
                holeOut: false,
              },
            ],
          },
        ],
      },
    ],
  });
  const back = planRoundHistoryImport(serializeRoundHistory(exported));
  assert.equal(back.ok, true);
  if (!back.ok) return;
  const shots = back.rounds[0]?.holes[0]?.shots ?? [];
  assert.deepEqual(
    shots.map((row) => row.seq),
    [1, 2, 3, 5],
  );
  assert.deepEqual(shots[0]?.start, start);
  assert.deepEqual(shots[0]?.end, end);
  assert.equal(shots[0]?.distanceYards, yards);
  assert.notEqual(shots[0]?.distanceYards, 9999);
  assert.deepEqual(shots[1]?.start, { lat: 35.514, lng: -92.111 });
  assert.equal(shots[1]?.end, null);
  assert.equal(shots[1]?.distanceYards, null);
  assert.equal(shots[2]?.start, null);
  assert.equal(shots[2]?.end, null);
  assert.equal(shots[2]?.distanceYards, null);
  assert.equal(shots[3]?.start, null);
  assert.equal(shots[3]?.distanceYards, null);
  assert.equal(back.rejectedShots, 0);
  assert.deepEqual(
    exported.rounds[0]?.holes[0]?.shots.map((row) => row.seq),
    [1, 2, 3, 5],
  );

  const replay = planReplay(
    shots.map((row) => ({
      seq: row.seq,
      startLat: row.start?.lat ?? null,
      startLng: row.start?.lng ?? null,
      endLat: row.end?.lat ?? null,
      endLng: row.end?.lng ?? null,
      distanceYards: row.distanceYards,
      endedAt: row.endedAt,
    })),
  );
  assert.equal(replay.pins.length, 3);
  assert.deepEqual(replay.missing.map((row) => row.seq), [3, 5]);

  const raw = {
    kind: ROUND_HISTORY_EXPORT_KIND,
    version: ROUND_HISTORY_EXPORT_VERSION,
    rounds: exported.rounds,
  };
  assert.equal(planRoundHistoryImport(raw).ok, true);
});

test('sealing a shot does not clear its start, and review opens static pins', () => {
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const seal = repo.slice(
    repo.indexOf('export function sealOpenShotWithoutGps'),
    repo.indexOf('export function attachHolePuttLength'),
  );
  assert.match(seal, /ended_at/);
  assert.doesNotMatch(seal, /start_lat\s*=/);
  assert.doesNotMatch(seal, /distance_yards\s*=/);

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /replayHoleHref\(round\.id, 1\)/);
  assert.match(home, /testID="history-review"/);
  assert.match(home, /COPY\.reviewRound/);

  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  assert.match(summary, /replayHoleHref\(id, hole\.number\)/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /planReplay\(shots\)/);
  assert.match(hole, /replay=\{replayPlan\}/);
  assert.match(hole, /playHrefAfterHoleChange\(id, nextNumber, marksOnly, review\)/);
  assert.doesNotMatch(hole, /animateToRegion|animateCamera/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /showPhonePin && userDot && !replay/);
  const pinAt = map.indexOf('replay.pins.map');
  const pins = map.slice(pinAt, pinAt + 700);
  assert.match(pins, /replayPinTracksViewChanges\(\)/);
  assert.match(map, /formatReplayMissingLine/);
  assert.match(map, /testID="replay-missing-pins"/);
  assert.doesNotMatch(pins, /animateToRegion|animateCamera/);
  assert.match(map, /center: userFix \? \{ lat: userFix\.lat, lng: userFix\.lng \} : null/);
});
