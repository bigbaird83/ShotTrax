import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import { YARD_TEST_COURSE_ID } from '../course/yardTestCourse';
import {
  applyClosedShot,
  collectRoundCsv,
  collectRoundHistoryExport,
  deleteRound,
  finishRound,
  getRound,
  insertOpenShot,
  listClubAverages,
  listDispersionShots,
  listHandicapRounds,
  listHoles,
  listPenaltiesForHole,
  listRounds,
  listShotsForHole,
  listStatRounds,
  readSettingStore,
  restoreRoundHistory,
  setHoleGreen,
  startRound,
  updateClubCarry,
  updateHoleFairway,
  updateHolePutts,
  updateHoleScore,
} from '../db/repo';
import { migrate } from '../db/schema';
import { planDispersion } from './dispersion';
import { planFairwayGir, sumFairwayGir } from './fairwayGir';
import { planHandicap } from './handicap';
import { planNerdOutLifetime } from './nerdOut';
import { COPY } from './playerCopy';
import { formatHistoryRow } from './roundHistory';
import { planReviewRounds, planRoundStats } from './roundReview';
import { serializeRoundHistory } from './roundTransfer';
import { haversineYards } from './haversine';
import { planTrend } from './trends';
import { FAVORITES_SETTING_KEY, listFavorites, OFFLINE_PACKS_SETTING_KEY } from './favorites';

const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();
const needsSqlite = { skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+' };

const GREEN = { lat: 10, lng: 10 };
const TEE = { lat: 10.002, lng: 10 };

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

function layout(apiId: string) {
  return {
    apiId,
    teeRating: 70.2,
    teeSlope: 125,
    holes: Array.from({ length: 9 }, (_, index) => ({
      number: index + 1,
      par: 4,
      yards: 300,
      handicap: index + 1,
      greenCentroid: GREEN,
      teeCentroid: TEE,
    })),
  };
}

/** Start sits this many yards north of the green, so backup import (haversine of the two marks) keeps the same yards. */
function startForYards(yards: number): { lat: number; lng: number } {
  const perDegree = haversineYards(GREEN, { lat: GREEN.lat + 1, lng: GREEN.lng });
  return { lat: GREEN.lat + yards / perDegree, lng: GREEN.lng };
}

function closeShot(db: SQLiteDatabase, holeId: string, seq: number, yards: number, clubId: string): string {
  const start = startForYards(yards);
  const id = insertOpenShot(db, {
    holeId,
    clubId,
    seq,
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
  return id;
}

function scoreRound(db: SQLiteDatabase, roundId: string, score: number, fairway: 'hit' | 'left'): void {
  const holes = listHoles(db, roundId);
  for (const hole of holes) {
    updateHoleScore(db, hole.id, score);
  }
  const first = holes[0];
  assert.ok(first);
  updateHoleFairway(db, first.id, fairway);
  updateHolePutts(db, first.id, 2, [], true);
  updateHoleScore(db, first.id, score);
  setHoleGreen(db, first.id, { lat: GREEN.lat, lng: GREEN.lng, source: 'course_centroid' });
  finishRound(db, roundId);
}

function statSnapshot(db: SQLiteDatabase) {
  const clubs = new Map(
    listClubAverages(db).map((row) => [
      row.club.id,
      {
        count: row.count,
        avgYards: row.avgYards,
        bagKind: row.bag.kind,
        bagYards: row.bag.yards,
        suggestion: row.suggestion
          ? { yards: row.suggestion.yards, newestShotId: row.suggestion.newestShotId }
          : null,
      },
    ]),
  );
  const shots = listDispersionShots(db);
  const statRounds = listStatRounds(db);
  const gir = sumFairwayGir(
    statRounds
      .filter((round) => round.finishedAt != null)
      .map((round) =>
        planFairwayGir(
          listHoles(db, round.id).map((hole) => ({
            par: hole.par,
            score: hole.score,
            putts: hole.putts,
            puttsDone: hole.puttsDone,
            fairway: hole.fairway,
            shotCount: listShotsForHole(db, hole.id).length,
            penaltyStrokes: listPenaltiesForHole(db, hole.id).reduce((sum, row) => sum + row.strokes, 0),
          })),
        ),
      ),
  );
  const lifetime = planNerdOutLifetime(
    statRounds.map((round) => {
      const holes = listHoles(db, round.id);
      return {
        finished: round.finishedAt != null,
        holePutts: holes.map((hole) => hole.putts),
        holeScores: holes.map((hole) => hole.score),
      };
    }),
  );
  const review = planReviewRounds(
    statRounds.map((round) => ({
      id: round.id,
      courseName: round.courseName,
      startedAt: round.startedAt,
      finishedAt: round.finishedAt,
      holes: listHoles(db, round.id).map((hole) => ({ score: hole.score, par: hole.par })),
    })),
  );
  const clubMap = Object.fromEntries(listClubAverages(db).map((row) => [row.club.id, row.club]));
  const trend = planTrend({
    metric: 'gir',
    window: 10,
    rounds: statRounds
      .filter((round) => round.finishedAt != null)
      .map((round) => ({
        id: round.id,
        courseName: round.courseName,
        playedAt: round.finishedAt ?? round.startedAt,
        stats: planRoundStats({
          holes: listHoles(db, round.id).map((hole) => ({
            number: hole.number,
            par: hole.par,
            score: hole.score,
            putts: hole.putts,
            startedAt: hole.startedAt,
            completedAt: hole.completedAt,
            shots: listShotsForHole(db, hole.id),
            penaltyStrokes: 0,
            puttsDone: hole.puttsDone,
            fairway: hole.fairway,
          })),
          clubs: clubMap,
        }),
      })),
  });
  return {
    clubs: Object.fromEntries(clubs),
    dispersionShots: shots.map((shot) => shot.shotId),
    dispersion: planDispersion(shots, 'club_7i').avgAlong,
    handicap: planHandicap(listHandicapRounds(db)),
    gir,
    lifetime,
    reviewIds: review.map((row) => row.id),
    trendIds: trend.points.map((point) => point.roundId),
  };
}

test('a yard-test round leaves every stat unchanged and stays in history', needsSqlite, () => {
  const db = memoryDb();
  updateClubCarry(db, 'club_7i', 200);
  const real = startRound(db, 9, 'Fixture', layout('course-real'));
  assert.equal(real.isTest, false);
  const realHole = listHoles(db, real.id)[0];
  assert.ok(realHole);
  const realShotIds: string[] = [];
  for (let i = 0; i < 5; i += 1) realShotIds.push(closeShot(db, realHole.id, i + 1, 150, 'club_7i'));
  scoreRound(db, real.id, 4, 'hit');

  const before = statSnapshot(db);
  assert.equal(before.clubs.club_7i?.count, 0);
  assert.equal(before.clubs.club_7i?.suggestion?.yards, 150);
  assert.equal(before.clubs.club_7i?.suggestion?.newestShotId, realShotIds[4]);
  assert.equal(before.gir.greensHit, 1);
  assert.equal(before.gir.fairwaysHit, 1);
  assert.equal(before.handicap.pendingNine, true);

  const testRound = startRound(db, 9, 'Yard Test', layout(YARD_TEST_COURSE_ID));
  assert.equal(testRound.isTest, true);
  assert.equal(getRound(db, testRound.id)?.isTest, true);
  const testHole = listHoles(db, testRound.id)[0];
  assert.ok(testHole);
  for (let i = 0; i < 5; i += 1) closeShot(db, testHole.id, i + 1, 170, 'club_7i');
  scoreRound(db, testRound.id, 8, 'left');

  const storedShots = (
    db.getAllSync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM shots
       JOIN holes ON holes.id = shots.hole_id
       JOIN rounds ON rounds.id = holes.round_id
       WHERE rounds.is_test = 1 AND shots.club_id = 'club_7i' AND shots.distance_yards = 170`,
    ) as { n: number }[]
  )[0];
  assert.equal(Number(storedShots?.n), 5);

  const after = statSnapshot(db);
  assert.deepEqual(after, before);
  assert.equal(listStatRounds(db).some((round) => round.id === testRound.id), false);
  assert.equal(listRounds(db).some((round) => round.id === testRound.id), true);

  const history = formatHistoryRow({
    startedAt: testRound.startedAt,
    courseName: 'Yard Test',
    teeName: null,
    score: 72,
    test: true,
  });
  assert.equal(history.testLabel, COPY.testRound);
  assert.equal(history.courseName, 'Yard Test');
  assert.equal(
    formatHistoryRow({ startedAt: real.startedAt, courseName: 'Fixture', teeName: null, score: 36 }).testLabel,
    null,
  );

  const csv = collectRoundCsv(db).roundsCsv;
  assert.match(csv, /round_label/);
  const lines = csv.split(/\r\n/).filter((line) => line.includes(testRound.id) || line.includes(real.id));
  const testLine = lines.find((line) => line.includes(testRound.id));
  const realLine = lines.find((line) => line.includes(real.id));
  assert.ok(testLine);
  assert.ok(realLine);
  assert.match(testLine, /"Test"/);
  assert.doesNotMatch(realLine, /"Test"/);

  const exported = collectRoundHistoryExport(db, '2026-09-25T00:00:00.000Z');
  assert.equal(exported.rounds.find((round) => round.id === testRound.id)?.test, true);
  assert.equal(exported.rounds.find((round) => round.id === real.id)?.test, false);
  const raw = JSON.parse(serializeRoundHistory(exported)) as {
    favorites: { id: string; name: string; city: null; state: null; location: null }[];
  };
  raw.favorites.push({ id: YARD_TEST_COURSE_ID, name: 'Yard Test', city: null, state: null, location: null });
  const fresh = memoryDb();
  fresh.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
    FAVORITES_SETTING_KEY,
    JSON.stringify([{ id: YARD_TEST_COURSE_ID, name: 'Yard Test', city: null, state: null, country: null, location: null }]),
  ]);
  fresh.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
    OFFLINE_PACKS_SETTING_KEY,
    JSON.stringify([{ courseId: YARD_TEST_COURSE_ID, status: 'ready', updatedAt: '2026-09-01T00:00:00.000Z' }]),
  ]);
  const restored = restoreRoundHistory(fresh, raw);
  assert.equal(restored.ok, true);
  assert.equal(getRound(fresh, testRound.id)?.isTest, true);
  assert.equal(listFavorites(readSettingStore(fresh)).some((favorite) => favorite.id === YARD_TEST_COURSE_ID), false);
  assert.equal(
    listStatRounds(fresh).some((round) => round.id === testRound.id),
    false,
  );
  updateClubCarry(fresh, 'club_7i', 200);
  const freshSeven = listClubAverages(fresh).find((row) => row.club.id === 'club_7i');
  assert.equal(freshSeven?.count, 0);
  assert.equal(freshSeven?.suggestion?.yards, 150);

  deleteRound(db, testRound.id);
  assert.equal(getRound(db, testRound.id), null);
  assert.equal(listRounds(db).some((round) => round.id === real.id), true);
  assert.deepEqual(statSnapshot(db), before);

  const trends = readFileSync(new URL('../../app/trends.tsx', import.meta.url), 'utf8');
  const nerd = readFileSync(new URL('../../app/nerd-out.tsx', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../../app/review-rounds.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  assert.match(trends, /listStatRounds/);
  assert.doesNotMatch(trends, /listRounds\(/);
  assert.match(nerd, /listStatRounds/);
  assert.doesNotMatch(nerd, /listRounds\(/);
  assert.match(review, /listStatRounds/);
  assert.match(home, /row\.testLabel/);
  assert.match(repo, /IFNULL\(rounds\.is_test, 0\) = 0/);
  assert.match(
    repo.slice(repo.indexOf('export function listDispersionShots'), repo.indexOf('export function listHandicapRounds')),
    /listStatRounds/,
  );
  assert.match(
    repo.slice(repo.indexOf('export function listHandicapRounds'), repo.indexOf('export function listHoles')),
    /listStatRounds/,
  );
});
