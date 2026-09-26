import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import { YARD_TEST_COURSE_ID } from '../course/yardTestCourse';
import {
  getHole,
  getShot,
  insertPenalty,
  listClubAverages,
  listHoles,
  listPenaltiesForHole,
  listShotsForHole,
  startRound,
  updateHolePutts,
  updateShotClub,
} from '../db/repo';
import { migrate } from '../db/schema';
import { planChangeShotClub } from './shotEdit';
import {
  parseShotClubChange,
  parseWatchInboundIntent,
  shotClubChangePayload,
  watchPayloadRunsAcceptFix,
} from './watchMessages';
import {
  planWatchShotClubChange,
  rememberWatchClubChange,
  resetWatchClubChanges,
  WATCH_CLUB_CHANGED,
  WATCH_CLUB_CHANGE_UNCHANGED,
  watchClubChangeAlreadyApplied,
  watchShotClubChangeStartsShotHold,
  watchShotClubChangeTouchesPuttsOrPenalties,
} from './watchShotClubChange';

const AT = '2026-09-26T12:00:00.000Z';

test('shotClubChange parses on the same reliable path and is not a club mark', () => {
  const payload = shotClubChangePayload({
    id: 'chg-1',
    shotId: 'shot-b',
    clubId: 'club_8i',
    at: AT,
    holeNumber: 1,
  });
  assert.deepEqual(parseShotClubChange(payload), payload);
  assert.equal(parseShotClubChange({ ...payload, holeNumber: '1' })?.holeNumber, 1);
  assert.equal(parseShotClubChange({ ...payload, id: '' }), null);
  assert.equal(parseShotClubChange({ ...payload, clubId: '' }), null);
  const intent = parseWatchInboundIntent(payload);
  assert.equal(intent?.kind, 'shotClub');
  assert.equal(watchPayloadRunsAcceptFix(payload), false);
  assert.equal(watchShotClubChangeStartsShotHold(), false);
  assert.equal(watchShotClubChangeTouchesPuttsOrPenalties(), false);
  const bridge = readFileSync(new URL('../../modules/watch-bridge/ios/WatchBridgeModule.swift', import.meta.url), 'utf8');
  assert.match(bridge, /type == "shotClubChange"/);
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const send = session.slice(session.indexOf('func changeShotClub'), session.indexOf('func retryClubChange'));
  assert.match(send, /"type": "shotClubChange"/);
  assert.match(send, /"shotId": shotId/);
  assert.match(send, /"clubId": clubId/);
  assert.doesNotMatch(send, /beginShotHold|attachWatchFix|lat|lng/);
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
  const wrapped = db as unknown as SQLiteDatabase;
  migrate(wrapped);
  return wrapped;
}

function insertMarkedShot(
  db: SQLiteDatabase,
  args: { id: string; holeId: string; clubId: string; seq: number; yards: number },
): void {
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq, start_lat, start_lng, end_lat, end_lng,
      distance_yards, fix_quality, impossible_jump, started_at, ended_at, source
    ) VALUES (?, ?, ?, ?, 35.51, -92.11, 35.52, -92.1, ?, 'good', 0, ?, ?, 'gps')`,
    [args.id, args.holeId, args.clubId, args.seq, args.yards, AT, AT],
  );
}

test('shotClubChange moves stats for the last shot only and ignores a resend', needsSqlite, () => {
  resetWatchClubChanges();
  const db = memoryDb();
  const round = startRound(db, 9, 'Watch club change');
  const yard = startRound(db, 9, 'Yard Test', { apiId: YARD_TEST_COURSE_ID });
  assert.equal(yard.isTest, true);
  const [hole1, hole2] = listHoles(db, round.id);
  const [yardHole] = listHoles(db, yard.id);
  assert.ok(hole1 && hole2 && yardHole);
  const clubs = db.getAllSync<{ id: string }>('SELECT id FROM clubs WHERE id != ? ORDER BY id LIMIT 2', ['club_putter']);
  const clubA = clubs[0]?.id;
  const clubB = clubs[1]?.id;
  assert.ok(clubA && clubB);
  insertMarkedShot(db, { id: 'h1-drive', holeId: hole1.id, clubId: clubA, seq: 1, yards: 150 });
  insertMarkedShot(db, { id: 'h1-approach', holeId: hole1.id, clubId: clubB, seq: 2, yards: 140 });
  insertMarkedShot(db, { id: 'h2-drive', holeId: hole2.id, clubId: clubA, seq: 1, yards: 200 });
  insertMarkedShot(db, { id: 'yard-7i', holeId: yardHole.id, clubId: clubA, seq: 1, yards: 400 });
  insertPenalty(db, {
    id: 'pen-water',
    holeId: hole1.id,
    par: 4,
    currentScore: null,
    strokes: 1,
    reason: 'water',
    note: null,
    kind: 'penalty',
    afterShotId: 'h1-drive',
    afterShotSeq: 1,
  });
  updateHolePutts(db, hole1.id, 2, ['3_to_10', 'inside_3']);
  const puttsBefore = getHole(db, round.id, 1);
  const beforeA = listClubAverages(db).find((row) => row.club.id === clubA);
  const beforeB = listClubAverages(db).find((row) => row.club.id === clubB);
  assert.ok(beforeA && beforeB);

  const shots = () => listShotsForHole(db, hole1.id);
  const apply = (id: string, shotId: string, clubId: string, holeNumber: number, currentHole: number) => {
    const decision = planWatchShotClubChange({
      id,
      shotId,
      clubId,
      holeNumber,
      currentHole,
      shots: listShotsForHole(db, (holeNumber === 2 ? hole2 : hole1).id),
    });
    if (decision.action === 'apply') {
      const shot = getShot(db, shotId);
      assert.ok(shot);
      const planned = planChangeShotClub(shot, clubId);
      assert.equal(planned.ok, true);
      updateShotClub(db, shotId, clubId);
      rememberWatchClubChange(id);
    }
    return decision;
  };

  const first = apply('chg-1', 'h1-approach', clubA, 1, 1);
  assert.equal(first.action, 'apply');
  assert.equal(first.feedback, WATCH_CLUB_CHANGED);
  const moved = getShot(db, 'h1-approach');
  assert.equal(moved?.clubId, clubA);
  assert.equal(moved?.startLat, 35.51);
  assert.equal(moved?.endLat, 35.52);
  assert.equal(moved?.distanceYards, 140);
  assert.equal(getShot(db, 'h1-drive')?.clubId, clubA);
  assert.equal(getShot(db, 'h2-drive')?.clubId, clubA);
  assert.equal(getShot(db, 'yard-7i')?.clubId, clubA);

  const again = apply('chg-1', 'h1-approach', clubB, 1, 1);
  assert.equal(again.action, 'skip');
  assert.equal(again.feedback, WATCH_CLUB_CHANGE_UNCHANGED);
  assert.equal(watchClubChangeAlreadyApplied('chg-1'), true);
  assert.equal(getShot(db, 'h1-approach')?.clubId, clubA);

  const notLast = apply('chg-2', 'h1-drive', clubB, 1, 1);
  assert.equal(notLast.action, 'skip');
  assert.equal(getShot(db, 'h1-drive')?.clubId, clubA);

  const otherHole = apply('chg-3', 'h2-drive', clubB, 2, 1);
  assert.equal(otherHole.action, 'skip');
  assert.equal(getShot(db, 'h2-drive')?.clubId, clubA);

  const putter = apply('chg-4', 'h1-approach', 'club_putter', 1, 1);
  assert.equal(putter.action, 'skip');
  assert.equal(getShot(db, 'h1-approach')?.clubId, clubA);

  const afterA = listClubAverages(db).find((row) => row.club.id === clubA);
  const afterB = listClubAverages(db).find((row) => row.club.id === clubB);
  assert.ok(afterA && afterB);
  assert.equal(afterA.count, beforeA.count + 1);
  assert.equal(afterB.count, beforeB.count - 1);
  assert.ok(Math.abs(afterA.avgYards - (150 + 140) / 2) < 0.01);
  assert.ok(afterA.avgYards < 200);
  const puttsAfter = getHole(db, round.id, 1);
  assert.equal(puttsAfter?.putts, puttsBefore?.putts);
  assert.deepEqual(puttsAfter?.puttLengths, puttsBefore?.puttLengths);
  assert.deepEqual(listPenaltiesForHole(db, hole1.id).map((row) => row.id), ['pen-water']);
  assert.deepEqual(
    shots().map((row) => row.id),
    ['h1-drive', 'h1-approach'],
  );

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  const fn = service.slice(service.indexOf('async function applyWatchShotClubChange'), service.indexOf('async function flushPendingShotClubChanges'));
  assert.match(fn, /planWatchShotClubChange\(/);
  assert.match(fn, /changeShotClub\(ctx\.db/);
  assert.match(fn, /rememberWatchClubChange\(change\.id\)/);
  assert.match(fn, /pushWatchConfirm\('club', change\.id/);
  assert.doesNotMatch(fn, /insertPenalty|updateHolePutts|markShotWithClub|acceptFix|beginShotHold/);
  const failed = fn.slice(fn.indexOf('} catch'));
  assert.doesNotMatch(failed, /pushWatchConfirm/);
});
