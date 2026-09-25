import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import { EARTH_RADIUS_M, METERS_PER_YARD } from '../config/sensing';
import {
  applyClosedShot,
  getBagCarrySuggestionDismissals,
  insertOpenShot,
  listClubAverages,
  listHoles,
  setBagCarrySuggestionDismissals,
  setHoleGreen,
  startRound,
  updateClubCarry,
} from '../db/repo';
import { migrate } from '../db/schema';
import { AVERAGE_OUTLIER_RATIO, clubAverageFromShots } from './averages';
import { resolveBagCarry } from './bagDistance';
import {
  bagSuggestionIsDismissed,
  dismissBagSuggestion,
  suggestBagCarry,
  type BagSuggestionShot,
} from './bagSuggestion';
import { PUTTER_CLUB_ID } from './defaultBag';
import { haversineYards } from './haversine';
import { COPY, formatBagCarrySuggestion } from './playerCopy';

const GREEN = { lat: 33.45, lng: -111.96 };

function northOfGreen(yards: number): { lat: number; lng: number } {
  const dLat = ((yards * METERS_PER_YARD) / EARTH_RADIUS_M) * (180 / Math.PI);
  return { lat: GREEN.lat + dLat, lng: GREEN.lng };
}

function shots(
  yards: number[],
  opts: {
    fromGreenYards?: number | null;
    green?: { lat: number; lng: number } | null;
    front?: { lat: number; lng: number } | null;
    back?: { lat: number; lng: number } | null;
    start?: { lat: number; lng: number } | null;
    idPrefix?: string;
  } = {},
): BagSuggestionShot[] {
  const fromGreenYards = opts.fromGreenYards === undefined ? 160 : opts.fromGreenYards;
  const green = opts.green === undefined ? GREEN : opts.green;
  const start = opts.start !== undefined ? opts.start : fromGreenYards == null ? null : northOfGreen(fromGreenYards);
  const prefix = opts.idPrefix ?? 's';
  return yards.map((n, index) => ({
    id: `${prefix}${index + 1}`,
    yards: n,
    fixQuality: 'good' as const,
    startLat: start?.lat ?? null,
    startLng: start?.lng ?? null,
    greenFrontLat: opts.front?.lat ?? null,
    greenFrontLng: opts.front?.lng ?? null,
    greenLat: green?.lat ?? null,
    greenLng: green?.lng ?? null,
    greenBackLat: opts.back?.lat ?? null,
    greenBackLng: opts.back?.lng ?? null,
  }));
}

function suggest(
  clubId: string,
  rows: BagSuggestionShot[],
  typed: number | null,
  estimated: number | null = null,
) {
  return suggestBagCarry({
    clubId,
    shots: rows,
    typedCarryYards: typed,
    estimatedCarryYards: estimated,
  });
}

test('green fixture: 30 yards is the chip line, full swings start well outside it', () => {
  assert.ok(haversineYards(northOfGreen(12), GREEN) < 30);
  assert.ok(haversineYards(northOfGreen(29.9), GREEN) < 30);
  assert.ok(haversineYards(northOfGreen(30), GREEN) >= 30);
  assert.ok(haversineYards(northOfGreen(160), GREEN) > 30);
});

test('7-iron typed 200, five full shots ~150 suggest 150; applying it makes the club live', () => {
  assert.equal(AVERAGE_OUTLIER_RATIO, 0.2);
  const rows = shots([148, 149, 150, 151, 152]);
  const before = clubAverageFromShots(rows, { typedCarryYards: 200, estimatedCarryYards: null });
  assert.equal(before.count, 0);

  const suggestion = suggest('club_7i', rows, 200);
  assert.equal(suggestion?.yards, 150);
  assert.equal(suggestion?.sampleCount, 5);
  assert.equal(suggestion?.newestShotId, 's5');

  const after = clubAverageFromShots(rows, {
    typedCarryYards: suggestion!.yards,
    estimatedCarryYards: null,
  });
  assert.equal(after.count, 5);
  const bag = resolveBagCarry({
    id: 'club_7i',
    liveCount: after.count,
    liveAvgYards: after.avgYards,
    typedYards: suggestion!.yards,
    estimatedYards: null,
  });
  assert.equal(bag.kind, 'live');
  assert.equal(bag.yards, 150);
  assert.equal(suggest('club_7i', rows, suggestion!.yards), null);
});

test('7-iron typed 120, five shots ~150 suggest 150 (typed too short)', () => {
  const suggestion = suggest('club_7i', shots([148, 149, 150, 151, 152]), 120);
  assert.equal(suggestion?.yards, 150);
  assert.equal(suggestion?.sampleCount, 5);
});

test('estimated baseline suggests; stock seed never does; typed wins over estimated', () => {
  const cluster = shots([148, 149, 150, 151, 152]);
  assert.equal(suggest('club_7i', cluster, null, 200)?.yards, 150);
  assert.equal(suggest('club_7i', cluster, 200, 400)?.yards, 150);

  const offStock = shots([100, 100, 100, 100, 100]);
  assert.equal(suggest('club_7i', offStock, null, null), null);
  const kept = clubAverageFromShots(offStock, { typedCarryYards: null, estimatedCarryYards: null });
  assert.equal(kept.count, 5);
  assert.equal(
    resolveBagCarry({
      id: 'club_7i',
      liveCount: kept.count,
      liveAvgYards: kept.avgYards,
      typedYards: null,
      estimatedYards: null,
    }).kind,
    'live',
  );
  assert.equal(suggest('club_7i', shots([100, 101, 102, 103]), null, null), null);
});

test('sand wedge chips under half the typed carry do not suggest, on or off the green', () => {
  const chips = [24, 25, 26, 27, 28];
  assert.equal(suggest('club_sw', shots(chips, { fromGreenYards: 160 }), 90), null);
  assert.equal(suggest('club_sw', shots(chips, { fromGreenYards: 12 }), 90), null);
});

test('sand wedge 50–55 inside 30 yards of the green does not suggest; no green point does', () => {
  const pitches = [50, 51, 52, 53, 55];
  assert.equal(suggest('club_sw', shots(pitches, { fromGreenYards: 12 }), 90), null);
  assert.equal(suggest('club_sw', shots(pitches, { fromGreenYards: 29.9 }), 90), null);
  // Exactly 30 yards is not "less than 30", so the chip check does not drop them.
  assert.equal(suggest('club_sw', shots(pitches, { fromGreenYards: 30 }), 90)?.yards, 52);
  // No green on the hole: the green check is skipped. Same shots suggest.
  const noGreen = suggest('club_sw', shots(pitches, { fromGreenYards: 12, green: null }), 90);
  assert.equal(noGreen?.yards, 52);
  assert.equal(noGreen?.sampleCount, 5);
  // No start coordinates: the green check is skipped even when the hole has a green.
  assert.equal(suggest('club_sw', shots(pitches, { fromGreenYards: null }), 90)?.yards, 52);
});

test('30 yards is to the nearest saved green point, not only the center', () => {
  const pitches = [50, 51, 52, 53, 55];
  const front = northOfGreen(-15);
  const back = northOfGreen(20);
  const shortOfFront = northOfGreen(-40);
  const pastBack = northOfGreen(40);
  assert.ok(haversineYards(shortOfFront, front) < 30);
  assert.ok(haversineYards(shortOfFront, GREEN) > 30);
  assert.ok(haversineYards(pastBack, back) < 30);
  assert.ok(haversineYards(pastBack, GREEN) > 30);

  // 25 yards short of the front, 40 from center: a chip off the front edge.
  assert.equal(
    suggest('club_sw', shots(pitches, { start: shortOfFront, front, back }), 90),
    null,
  );
  // 20 yards past the back point: a chip behind the green.
  assert.equal(
    suggest('club_sw', shots(pitches, { start: pastBack, front, back }), 90),
    null,
  );
  // Only a center point: 25 yards from center is inside the line, 40 is not.
  assert.equal(suggest('club_sw', shots(pitches, { fromGreenYards: 25 }), 90), null);
  assert.equal(suggest('club_sw', shots(pitches, { fromGreenYards: 40 }), 90)?.yards, 52);
});

test('a mix of chips and full swings on a wedge does not suggest', () => {
  assert.equal(suggest('club_sw', shots([24, 26, 55, 70, 110]), 90), null);
  const chipsAndSwings = [
    ...shots([24, 25, 26], { fromGreenYards: 12, idPrefix: 'chip' }),
    ...shots([80, 84, 88], { fromGreenYards: 40, idPrefix: 'full' }),
  ];
  assert.equal(suggest('club_sw', chipsAndSwings, 90), null);
});

test('spread over 10% suggests nothing; exactly 10% of the mean does', () => {
  assert.equal(suggest('club_7i', shots([120, 140, 150, 155, 160]), 200), null);
  assert.equal(suggest('club_7i', shots([134, 150, 150, 150, 166]), 100), null);
  assert.equal(suggest('club_7i', shots([135, 150, 150, 150, 165]), 100)?.yards, 150);
});

test('fewer than 5 candidates, a live club, and the putter suggest nothing', () => {
  assert.equal(suggest('club_7i', shots([148, 149, 150, 151]), 200), null);
  const live = [
    ...shots([150, 150, 150, 150, 150], { idPrefix: 'kept' }),
    ...shots([100, 100, 100, 100, 100], { idPrefix: 'drop' }),
  ];
  assert.equal(suggest('club_7i', live, 150), null);
  assert.equal(
    resolveBagCarry({
      id: 'club_7i',
      liveCount: 5,
      liveAvgYards: 150,
      typedYards: 150,
      estimatedYards: null,
    }).kind,
    'live',
  );
  assert.equal(suggest(PUTTER_CLUB_ID, shots([148, 149, 150, 151, 152]), 200), null);
});

test('a kept shot sitting among dropped ones is not part of the suggestion', () => {
  const rows = shots([150, 150, 200, 150, 150, 150]);
  const kept = clubAverageFromShots(rows, { typedCarryYards: 200, estimatedCarryYards: null });
  assert.equal(kept.count, 1);
  const suggestion = suggest('club_7i', rows, 200);
  assert.equal(suggestion?.yards, 150);
  assert.equal(suggestion?.sampleCount, 5);
  assert.equal(suggestion?.newestShotId, 's6');
});

test('only the 5 most recent dropped shots count; half the baseline is the floor', () => {
  const rows = shots([80, 148, 149, 150, 151, 152]);
  const suggestion = suggest('club_7i', rows, 200);
  assert.equal(suggestion?.yards, 150);
  assert.equal(suggestion?.newestShotId, 's6');

  assert.equal(suggest('club_sw', shots([50, 50, 50, 50, 50]), 100)?.yards, 50);
  assert.equal(suggest('club_sw', shots([49, 49, 49, 49, 49]), 100), null);
});

test('Not now stays dismissed until a newer dropped shot changes the set', () => {
  const first = suggest('club_7i', shots([148, 149, 150, 151, 152]), 200);
  assert.ok(first);
  const stored = dismissBagSuggestion(null, 'club_7i', first.newestShotId);
  assert.equal(bagSuggestionIsDismissed(stored, 'club_7i', first.newestShotId), true);
  assert.equal(bagSuggestionIsDismissed(stored, 'club_sw', first.newestShotId), false);

  const again = suggest('club_7i', shots([148, 149, 150, 151, 152, 150]), 200);
  assert.equal(again?.yards, 150);
  assert.notEqual(again?.newestShotId, first.newestShotId);
  assert.equal(bagSuggestionIsDismissed(stored, 'club_7i', again!.newestShotId), false);
  assert.equal(bagSuggestionIsDismissed('not-json', 'club_7i', first.newestShotId), false);
});

test('bag copy and club data disclaimer', () => {
  assert.equal(
    formatBagCarrySuggestion('7 Iron', 150),
    'Your last 5 7 Iron shots averaged 150. Update your 7 Iron to 150?',
  );
  assert.equal(COPY.bagCarrySuggestionUpdate, 'Update');
  assert.equal(COPY.bagCarrySuggestionNotNow, 'Not now');
  assert.equal(
    COPY.averagesDisclaimer,
    'Averages are only as good as the numbers you enter and the GPS data from your rounds.',
  );

  const bag = readFileSync(new URL('../ui/BagCarryList.tsx', import.meta.url), 'utf8');
  assert.match(bag, /formatBagCarrySuggestion\(club\.name/);
  assert.match(bag, /updateClubCarry\(db, club\.id, suggestion\.yards\)/);
  assert.match(bag, /dismissBagSuggestion\(/);
  assert.match(bag, /COPY\.bagCarrySuggestionUpdate/);
  assert.match(bag, /COPY\.bagCarrySuggestionNotNow/);
  assert.doesNotMatch(bag, /stockAvgCarryForSuggestion/);

  const clubData = readFileSync(new URL('../../app/club-data.tsx', import.meta.url), 'utf8');
  assert.match(clubData, /COPY\.averagesDisclaimer/);

  const suggestionSrc = readFileSync(new URL('./bagSuggestion.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(suggestionSrc, /stockAvgCarry|STOCK_AVG/);
  assert.match(suggestionSrc, /yardsToNearestGreenPoint/);
  assert.doesNotMatch(suggestionSrc, /paintCache|osmOverlay|COURSE_PAINT/);
  const repoSrc = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  assert.match(repoSrc, /holes\.green_front_lat, holes\.green_front_lng/);
  assert.match(repoSrc, /holes\.green_back_lat, holes\.green_back_lng/);
  const averagesSrc = readFileSync(new URL('./averages.ts', import.meta.url), 'utf8');
  assert.match(averagesSrc, /AVERAGE_OUTLIER_RATIO = 0\.2/);
  assert.doesNotMatch(averagesSrc, /suggestBagCarry/);
});

const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();
const needsSqlite = { skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+' };

function memoryDb(): SQLiteDatabase {
  if (!DatabaseSync) throw new Error('node:sqlite unavailable');
  const raw = new DatabaseSync(':memory:');
  const args = (params?: unknown[]) => (params ?? []) as (string | number | null)[];
  const db = {
    execSync: (sql: string) => raw.exec(sql),
    runSync: (sql: string, params?: unknown[]) => raw.prepare(sql).run(...args(params)),
    getAllSync: (sql: string, params?: unknown[]) => raw.prepare(sql).all(...args(params)),
    getFirstSync: (sql: string, params?: unknown[]) => raw.prepare(sql).get(...args(params)) ?? null,
    prepareSync: (sql: string) => {
      const statement = raw.prepare(sql);
      return { executeSync: (params?: unknown[]) => statement.run(...args(params)), finalizeSync: () => {} };
    },
    withTransactionSync: (run: () => void) => {
      raw.exec('BEGIN');
      try {
        run();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
  migrate(db as unknown as SQLiteDatabase);
  return db as unknown as SQLiteDatabase;
}

test('saved 7-iron shots suggest 150, then the typed update makes the club live', needsSqlite, () => {
  const db = memoryDb();
  updateClubCarry(db, 'club_7i', 200);
  const round = startRound(db, 9, 'Fixture');
  const hole = listHoles(db, round.id)[0];
  assert.ok(hole);
  setHoleGreen(db, hole.id, { lat: GREEN.lat, lng: GREEN.lng, source: 'course_centroid' });
  const start = northOfGreen(160);
  const yards = [148, 149, 150, 151, 152];
  const ids: string[] = [];
  for (let i = 0; i < yards.length; i += 1) {
    const id = insertOpenShot(db, {
      holeId: hole.id,
      clubId: 'club_7i',
      seq: i + 1,
      lat: start.lat,
      lng: start.lng,
      accuracyM: 5,
      startFixQuality: 'good',
    });
    applyClosedShot(db, {
      shotId: id,
      endLat: GREEN.lat,
      endLng: GREEN.lng,
      endAccuracyM: 5,
      endFixQuality: 'good',
      distanceYards: yards[i]!,
      impossibleJump: false,
      fixQuality: 'good',
    });
    db.runSync('UPDATE shots SET started_at = ? WHERE id = ?', [`2026-01-0${i + 1}T12:00:00.000Z`, id]);
    ids.push(id);
  }

  const before = listClubAverages(db).find((row) => row.club.id === 'club_7i');
  assert.equal(before?.count, 0);
  assert.equal(before?.bag.kind, 'typed');
  assert.equal(before?.bag.yards, 200);
  assert.equal(before?.suggestion?.yards, 150);
  assert.equal(before?.suggestion?.sampleCount, 5);
  assert.equal(before?.suggestion?.newestShotId, ids[4]);

  db.runSync('UPDATE shots SET average_eligible_at = ? WHERE id = ?', [
    new Date(Date.now() + 60_000).toISOString(),
    ids[4],
  ]);
  assert.equal(listClubAverages(db).find((row) => row.club.id === 'club_7i')?.suggestion, null);
  db.runSync('UPDATE shots SET average_eligible_at = NULL WHERE id = ?', [ids[4]]);
  assert.equal(listClubAverages(db).find((row) => row.club.id === 'club_7i')?.suggestion?.yards, 150);

  assert.equal(bagSuggestionIsDismissed(getBagCarrySuggestionDismissals(db), 'club_7i', ids[4]!), false);
  setBagCarrySuggestionDismissals(db, dismissBagSuggestion(null, 'club_7i', ids[4]!));
  assert.equal(bagSuggestionIsDismissed(getBagCarrySuggestionDismissals(db), 'club_7i', ids[4]!), true);
  assert.equal(bagSuggestionIsDismissed(getBagCarrySuggestionDismissals(db), 'club_7i', 'newer'), false);

  updateClubCarry(db, 'club_7i', 150);
  const after = listClubAverages(db).find((row) => row.club.id === 'club_7i');
  assert.equal(after?.count, 5);
  assert.equal(after?.bag.kind, 'live');
  assert.equal(after?.bag.yards, 150);
  assert.equal(after?.suggestion, null);
});

test('listClubAverages measures 30 yards to the nearest saved green point', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Fixture');
  const holes = listHoles(db, round.id);
  const front = northOfGreen(-15);
  const back = northOfGreen(20);
  const pitches = [50, 51, 52, 53, 55];

  function closeFive(
    holeId: string,
    clubId: string,
    start: { lat: number; lng: number },
    greens: {
      front: { lat: number; lng: number } | null;
      center: { lat: number; lng: number } | null;
      back: { lat: number; lng: number } | null;
    },
  ) {
    updateClubCarry(db, clubId, 90);
    db.runSync(
      `UPDATE holes SET green_front_lat = ?, green_front_lng = ?, green_lat = ?, green_lng = ?,
        green_back_lat = ?, green_back_lng = ? WHERE id = ?`,
      [
        greens.front?.lat ?? null,
        greens.front?.lng ?? null,
        greens.center?.lat ?? null,
        greens.center?.lng ?? null,
        greens.back?.lat ?? null,
        greens.back?.lng ?? null,
        holeId,
      ],
    );
    pitches.forEach((yards, index) => {
      const id = insertOpenShot(db, {
        holeId,
        clubId,
        seq: index + 1,
        lat: start.lat,
        lng: start.lng,
        accuracyM: 5,
        startFixQuality: 'good',
      });
      applyClosedShot(db, {
        shotId: id,
        endLat: GREEN.lat,
        endLng: GREEN.lng,
        endAccuracyM: 5,
        endFixQuality: 'good',
        distanceYards: yards,
        impossibleJump: false,
        fixQuality: 'good',
      });
    });
  }

  const hole0 = holes[0];
  const hole1 = holes[1];
  const hole2 = holes[2];
  assert.ok(hole0 && hole1 && hole2);
  closeFive(hole0.id, 'club_sw', northOfGreen(-40), { front, center: GREEN, back });
  closeFive(hole1.id, 'club_lw', northOfGreen(40), { front, center: GREEN, back });
  closeFive(hole2.id, 'club_gw', northOfGreen(25), { front: null, center: GREEN, back: null });

  const rows = listClubAverages(db);
  assert.equal(rows.find((row) => row.club.id === 'club_sw')?.suggestion, null);
  assert.equal(rows.find((row) => row.club.id === 'club_lw')?.suggestion, null);
  assert.equal(rows.find((row) => row.club.id === 'club_gw')?.suggestion, null);
});
