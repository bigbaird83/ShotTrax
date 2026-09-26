import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  collectRoundCsv,
  collectRoundHistoryExport,
  deletePenalty,
  getHole,
  insertPenalty,
  listClubAverages,
  listDispersionShots,
  listHoles,
  listPenaltiesForHole,
  listShotsForHole,
  restoreRoundHistory,
  startRound,
  updatePenaltyReason,
} from '../db/repo';
import { migrate } from '../db/schema';
import { planDispersion } from './dispersion';
import { planFinishedHoleMiniSummary } from './finishedHoleSummary';
import { reconcileHoleScore } from './scoreReconcile';
import { planRunningParBadge } from './runningPar';
import { planRoundShare } from '../services/roundScoreboard';
import { formatPenaltyRow, scoreAfterPenaltyRemoval, totalPenaltyStrokes } from './penalty';
import {
  penaltyEditOffersChangeClub,
  penaltyEditOffersMoveSpot,
  penaltyNoteForSave,
  penaltyStepActionSheet,
  planChangePenaltyReason,
} from './penaltyEdit';
import { defaultPenaltyAfterShot, formatHoleCountLine, orderHoleSteps } from './penaltySteps';
import { COPY } from './playerCopy';
import { planScorecard } from './scorecard';
import { serializeRoundHistory } from './roundTransfer';
import { planWatchPenaltyInsert } from './watchPenalty';

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
  args: { id: string; holeId: string; clubId: string; seq: number; startedAt: string; yards?: number },
): void {
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq, start_lat, start_lng, end_lat, end_lng,
      distance_yards, fix_quality, impossible_jump, started_at, ended_at, source
    ) VALUES (?, ?, ?, ?, 35.51, -92.11, 35.52, -92.1, ?, 'good', 0, ?, ?, 'gps')`,
    [args.id, args.holeId, args.clubId, args.seq, args.yards ?? 170, args.startedAt, args.startedAt],
  );
}

function tombstoneCount(db: SQLiteDatabase, id: string): number {
  return (
    db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM deleted_penalty_ids WHERE id = ?', [id])?.n ?? 0
  );
}

test('a penalty step offers Change penalty and Delete, plus Cancel', () => {
  const sheet = penaltyStepActionSheet();
  assert.deepEqual(sheet.options, [COPY.changePenalty, COPY.deletePenalty]);
  assert.equal(sheet.options.length, 2);
  assert.equal(sheet.cancel, COPY.cancel);
  assert.equal(sheet.changeClub, false);
  assert.equal(sheet.moveSpot, false);
  assert.equal(penaltyEditOffersChangeClub(), false);
  assert.equal(penaltyEditOffersMoveSpot(), false);
  assert.equal(COPY.changePenalty, 'Change penalty');
  assert.equal(COPY.deletePenalty, 'Delete');
  assert.equal(penaltyNoteForSave('other', '  cart path  '), 'cart path');
  assert.equal(penaltyNoteForSave('other', '   '), null);
  assert.equal(penaltyNoteForSave('water', 'creek'), 'creek');
  assert.equal(penaltyNoteForSave('ob', ''), null);
  const planned = planChangePenaltyReason({ reason: 'other', note: 'cart path' });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  assert.equal(planned.strokesUnchanged, true);
  assert.equal(planned.scoreUnchanged, true);
  assert.equal(planned.note, 'cart path');
  assert.equal(planChangePenaltyReason({ reason: 'lost', note: null }).ok, false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../../app/review/[id]/shots.tsx', import.meta.url), 'utf8');
  for (const src of [hole, review]) {
    assert.match(src, /penaltyStepActionSheet\(\)/);
    assert.match(src, /actions\.options\[0\]/);
    assert.match(src, /actions\.options\[1\]/);
    assert.match(src, /actions\.cancel/);
    assert.match(src, /openPenaltyActions/);
  }
  const holeChip = hole.slice(hole.indexOf("step.kind === 'penalty'"), hole.indexOf('const shot = shots.find'));
  assert.match(holeChip, /openPenaltyActions\(step\.id\)/);
  assert.doesNotMatch(holeChip, /openEdit|COPY\.changeClub|COPY\.moveSpot/);
  const holeChange = hole.slice(hole.indexOf('title={COPY.changePenalty}'), hole.indexOf('</Animated.View>'));
  assert.match(holeChange, /PENALTY_REASONS/);
  assert.match(holeChange, /COPY\.penaltyNote/);
  assert.match(holeChange, /COPY\.savePenaltyReason/);
  assert.doesNotMatch(holeChange, /COPY\.changeClub|COPY\.moveSpot|setPenaltyStrokes|COPY\.afterShot/);
  const reviewChange = review.slice(review.indexOf('title={COPY.changePenalty}'), review.indexOf('function ReviewShotList'));
  assert.match(reviewChange, /PENALTY_REASONS/);
  assert.match(reviewChange, /COPY\.penaltyNote/);
  assert.doesNotMatch(reviewChange, /COPY\.changeClub|COPY\.moveSpot/);
  const reviewList = review.slice(review.indexOf('function ReviewShotList'), review.indexOf('function makeStyles'));
  assert.match(reviewList, /step\.kind === 'penalty'/);
  assert.match(reviewList, /onPenaltyPress/);
  assert.doesNotMatch(reviewList, /COPY\.changeClub|COPY\.moveSpot/);
  assert.match(review, /shots=\{shots\}/);
});

test('deleting a penalty lowers the score and does not guess par', () => {
  assert.equal(
    scoreAfterPenaltyRemoval({
      currentScore: 8,
      removedStrokes: 1,
      shotCount: 2,
      puttCount: 2,
      remainingPenaltyStrokes: 0,
    }),
    7,
  );
  assert.equal(
    scoreAfterPenaltyRemoval({
      currentScore: 4,
      removedStrokes: 1,
      shotCount: 2,
      puttCount: 2,
      remainingPenaltyStrokes: 0,
    }),
    4,
  );
  assert.equal(
    scoreAfterPenaltyRemoval({
      currentScore: null,
      removedStrokes: 1,
      shotCount: 2,
      puttCount: 2,
      remainingPenaltyStrokes: 0,
    }),
    null,
  );
  assert.equal(
    scoreAfterPenaltyRemoval({
      currentScore: 1,
      removedStrokes: 1,
      shotCount: 0,
      puttCount: 0,
      remainingPenaltyStrokes: 0,
    }),
    null,
  );
});

test('change reason keeps the score, delete lowers it, and the count line follows', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Penalty edit');
  const hole = listHoles(db, round.id)[0];
  assert.ok(hole);
  const clubId = db.getFirstSync<{ id: string }>('SELECT id FROM clubs WHERE id != ? LIMIT 1', ['club_putter'])?.id;
  assert.ok(clubId);
  insertMarkedShot(db, { id: 'shot-8i', holeId: hole.id, clubId, seq: 1, startedAt: '2026-09-26T12:00:00.000Z' });
  insertMarkedShot(db, { id: 'shot-sw', holeId: hole.id, clubId, seq: 2, startedAt: '2026-09-26T12:04:00.000Z' });
  db.runSync(
    'UPDATE holes SET par = 4, par_source = ?, score = 6, putts = 2, putts_done = 1, green_lat = 35.52, green_lng = -92.1 WHERE id = ?',
    ['user', hole.id],
  );
  const saved = insertPenalty(db, {
    id: 'pen-water',
    holeId: hole.id,
    par: 4,
    currentScore: 6,
    strokes: 1,
    reason: 'water',
    note: null,
    kind: 'penalty',
    afterShotId: 'shot-8i',
    afterShotSeq: 1,
  });
  if (saved.replay === 'deleted') throw new Error('insert was a tombstone');
  db.runSync('UPDATE holes SET score = 8 WHERE id = ?', [hole.id]);
  const other = insertPenalty(db, {
    id: 'pen-ob',
    holeId: hole.id,
    par: 4,
    currentScore: 8,
    strokes: 2,
    reason: 'ob',
    note: null,
    kind: 'penalty',
    afterShotId: 'shot-sw',
    afterShotSeq: 2,
  });
  if (other.replay === 'deleted') throw new Error('second insert was a tombstone');
  db.runSync('UPDATE holes SET score = 8 WHERE id = ?', [hole.id]);

  const beforeShots = listShotsForHole(db, hole.id).map((shot) => ({
    id: shot.id,
    seq: shot.seq,
    clubId: shot.clubId,
    distanceYards: shot.distanceYards,
  }));
  const statsBefore = clubStatSnapshot(db, clubId);

  const changed = updatePenaltyReason(db, { penaltyId: 'pen-water', reason: 'other', note: 'cart path' });
  assert.equal(changed.status, 'updated');
  if (changed.status !== 'updated') return;
  assert.equal(changed.penalty.reason, 'other');
  assert.equal(changed.penalty.note, 'cart path');
  assert.equal(changed.penalty.strokes, 1);
  assert.equal(changed.penalty.afterShotId, 'shot-8i');
  assert.equal(changed.penalty.afterShotSeq, 1);
  assert.equal(changed.score, 8);
  assert.equal(getHole(db, round.id, hole.number)?.score, 8);
  assert.equal(formatPenaltyRow(changed.penalty), '+1 cart path');
  const afterChange = listPenaltiesForHole(db, hole.id);
  assert.equal(totalPenaltyStrokes(afterChange), 3);
  assert.equal(
    formatHoleCountLine({ shotCount: 2, penaltyStrokes: 3, puttCount: 2 }),
    '2 shots · 3 penalties · 2 putts',
  );
  assert.equal(
    orderHoleSteps(listShotsForHole(db, hole.id), afterChange).map((step) =>
      step.kind === 'penalty' ? step.label : step.id,
    ).join(' | '),
    'shot-8i | +1 cart path | shot-sw | +2 OB',
  );
  assertSurfaces(db, round.id, hole.id, {
    score: 8,
    penaltyStrokes: 3,
    countLine: '2 shots · 3 penalties · 2 putts',
    toPar: 4,
  });
  assert.deepEqual(clubStatSnapshot(db, clubId), statsBefore);

  const cleared = updatePenaltyReason(db, { penaltyId: 'pen-water', reason: 'unplayable', note: '   ' });
  assert.equal(cleared.status, 'updated');
  if (cleared.status !== 'updated') return;
  assert.equal(cleared.penalty.reason, 'unplayable');
  assert.equal(cleared.penalty.note, null);
  assert.equal(formatPenaltyRow(cleared.penalty), '+1 Unplayable');
  assert.equal(getHole(db, round.id, hole.number)?.score, 8);

  const removed = deletePenalty(db, 'pen-ob');
  assert.equal(removed.status, 'deleted');
  if (removed.status !== 'deleted') return;
  assert.equal(removed.score, 6);
  assert.equal(getHole(db, round.id, hole.number)?.score, 6);
  assert.equal(tombstoneCount(db, 'pen-ob'), 1);
  const left = listPenaltiesForHole(db, hole.id);
  assert.deepEqual(left.map((row) => row.id), ['pen-water']);
  assert.equal(left[0]?.afterShotId, 'shot-8i');
  assert.equal(left[0]?.afterShotSeq, 1);
  assert.equal(left[0]?.strokes, 1);
  assert.deepEqual(
    listShotsForHole(db, hole.id).map((shot) => ({
      id: shot.id,
      seq: shot.seq,
      clubId: shot.clubId,
      distanceYards: shot.distanceYards,
    })),
    beforeShots,
  );
  assert.equal(
    formatHoleCountLine({ shotCount: 2, penaltyStrokes: 1, puttCount: 2 }),
    '2 shots · 1 penalty · 2 putts',
  );
  const logged = reconcileHoleScore({ score: 6, shotCount: 2, puttCount: 2, penaltyStrokes: 1 });
  assert.equal(logged.logged, 5);
  assert.equal(logged.mismatch, true);
  assertSurfaces(db, round.id, hole.id, {
    score: 6,
    penaltyStrokes: 1,
    countLine: '2 shots · 1 penalty · 2 putts',
    toPar: 2,
  });
  assert.deepEqual(clubStatSnapshot(db, clubId), statsBefore);

  const nextAnchor = defaultPenaltyAfterShot(listShotsForHole(db, hole.id));
  assert.equal(nextAnchor?.id, 'shot-sw');
  const next = insertPenalty(db, {
    id: 'pen-next',
    holeId: hole.id,
    par: 4,
    currentScore: 6,
    strokes: 1,
    reason: 'water',
    note: null,
    kind: 'penalty',
    afterShotId: nextAnchor?.id ?? null,
    afterShotSeq: nextAnchor?.seq ?? null,
  });
  if (next.replay === 'deleted') throw new Error('new penalty hit a tombstone');
  assert.equal(next.penalty.afterShotId, 'shot-sw');
  assert.equal(next.penalty.afterShotSeq, 2);
  assert.equal(getHole(db, round.id, hole.number)?.score, 7);
  assert.deepEqual(
    orderHoleSteps(listShotsForHole(db, hole.id), listPenaltiesForHole(db, hole.id)).map((step) =>
      step.kind === 'penalty' ? step.id : step.id,
    ),
    ['shot-8i', 'pen-water', 'shot-sw', 'pen-next'],
  );
  assert.deepEqual(
    listShotsForHole(db, hole.id).map((shot) => shot.seq),
    [1, 2],
  );
});

test('a score already at the logged floor is not pushed below it, and a blank score stays blank', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Floor');
  const hole = listHoles(db, round.id)[0];
  assert.ok(hole);
  db.runSync('UPDATE holes SET par = 4, score = 4, putts = 2, putts_done = 1 WHERE id = ?', [hole.id]);
  const clubId = db.getFirstSync<{ id: string }>('SELECT id FROM clubs WHERE id != ? LIMIT 1', ['club_putter'])?.id;
  assert.ok(clubId);
  insertMarkedShot(db, { id: 's1', holeId: hole.id, clubId, seq: 1, startedAt: '2026-09-26T12:00:00.000Z' });
  insertMarkedShot(db, { id: 's2', holeId: hole.id, clubId, seq: 2, startedAt: '2026-09-26T12:04:00.000Z' });
  insertPenalty(db, {
    id: 'pen-floor',
    holeId: hole.id,
    par: 4,
    currentScore: 4,
    strokes: 1,
    reason: 'water',
    note: null,
  });
  db.runSync('UPDATE holes SET score = 4 WHERE id = ?', [hole.id]);
  const removed = deletePenalty(db, 'pen-floor');
  assert.equal(removed.status, 'deleted');
  assert.equal(getHole(db, round.id, hole.number)?.score, 4);
  assert.equal(listPenaltiesForHole(db, hole.id).length, 0);

  const blank = listHoles(db, round.id)[1];
  assert.ok(blank);
  db.runSync('UPDATE holes SET par = 5, score = NULL WHERE id = ?', [blank.id]);
  db.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind)
     VALUES ('pen-blank', ?, 1, 'ob', NULL, '2026-09-26T12:00:00.000Z', 'penalty')`,
    [blank.id],
  );
  const cleared = deletePenalty(db, 'pen-blank');
  assert.equal(cleared.status, 'deleted');
  assert.equal(getHole(db, round.id, blank.number)?.score, null);
  assert.equal(listPenaltiesForHole(db, blank.id).length, 0);
});

test('penalties never move club averages or dispersion, before or after an edit', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Club stats');
  const hole = listHoles(db, round.id)[0];
  assert.ok(hole);
  const clubId = db.getFirstSync<{ id: string }>('SELECT id FROM clubs WHERE id != ? LIMIT 1', ['club_putter'])?.id;
  assert.ok(clubId);
  db.runSync('UPDATE holes SET par = 4, score = 4, green_lat = 35.52, green_lng = -92.1 WHERE id = ?', [hole.id]);
  insertMarkedShot(db, { id: 'shot-1', holeId: hole.id, clubId, seq: 1, startedAt: '2026-09-26T12:00:00.000Z', yards: 170 });
  const before = clubStatSnapshot(db, clubId);
  assert.equal(before.averageCount, 1);
  assert.equal(before.dispersionCount, 1);
  insertPenalty(db, {
    id: 'pen-club',
    holeId: hole.id,
    par: 4,
    currentScore: 4,
    strokes: 1,
    reason: 'water',
    note: null,
    afterShotId: 'shot-1',
    afterShotSeq: 1,
  });
  assert.deepEqual(clubStatSnapshot(db, clubId), before);
  updatePenaltyReason(db, { penaltyId: 'pen-club', reason: 'ob', note: null });
  assert.deepEqual(clubStatSnapshot(db, clubId), before);
  deletePenalty(db, 'pen-club');
  assert.deepEqual(clubStatSnapshot(db, clubId), before);
  assert.deepEqual(
    listShotsForHole(db, hole.id).map((shot) => ({ id: shot.id, seq: shot.seq, clubId: shot.clubId, yards: shot.distanceYards })),
    [{ id: 'shot-1', seq: 1, clubId, yards: 170 }],
  );
  assert.equal(listDispersionShots(db).some((shot) => shot.shotId === 'pen-club'), false);
});

test('export and restore keep a changed reason, drop a deletion, and leave tombstones out', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Transfer');
  const hole = listHoles(db, round.id)[0];
  assert.ok(hole);
  db.runSync('UPDATE holes SET par = 4, score = 5, putts = 2, putts_done = 1 WHERE id = ?', [hole.id]);
  const saved = insertPenalty(db, {
    id: 'pen-export',
    holeId: hole.id,
    par: 4,
    currentScore: 5,
    strokes: 1,
    reason: 'water',
    note: null,
    kind: 'penalty',
    lat: 35.52,
    lng: -92.2,
  });
  if (saved.replay === 'deleted') throw new Error('insert was a tombstone');
  const older = serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-26T18:00:00.000Z'));
  const csvBefore = collectRoundCsv(db);

  updatePenaltyReason(db, { penaltyId: 'pen-export', reason: 'ob', note: 'path' });
  const changed = serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-26T18:05:00.000Z'));
  assert.match(changed, /"reason":"ob"/);
  assert.match(changed, /"note":"path"/);
  assert.doesNotMatch(changed, /deleted_penalty_ids|deletedPenalty/);
  const csvChanged = collectRoundCsv(db);
  assert.equal(csvChanged.roundsCsv, csvBefore.roundsCsv);
  assert.equal(csvChanged.shotsCsv, csvBefore.shotsCsv);
  assert.equal(csvChanged.shotsCsv.split('"Penalty"').length - 1, 1);

  deletePenalty(db, 'pen-export');
  assert.equal(getHole(db, round.id, hole.number)?.score, 5);
  const deleted = serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-26T18:10:00.000Z'));
  assert.doesNotMatch(deleted, /pen-export|deleted_penalty_ids|deletedPenalty/);
  const csvDeleted = collectRoundCsv(db);
  assert.equal(csvDeleted.shotsCsv.includes('"Penalty"'), false);
  assert.notEqual(csvDeleted.roundsCsv, csvBefore.roundsCsv);
  assert.equal(tombstoneCount(db, 'pen-export'), 1);

  const fresh = memoryDb();
  const restored = restoreRoundHistory(fresh, deleted);
  assert.equal(restored.ok, true);
  const freshHole = listHoles(fresh, round.id)[0];
  assert.ok(freshHole);
  assert.equal(listPenaltiesForHole(fresh, freshHole.id).length, 0);
  assert.equal(freshHole.score, 5);
  assert.equal(tombstoneCount(fresh, 'pen-export'), 0);

  const again = restoreRoundHistory(db, older);
  assert.equal(again.ok, true);
  const broughtBack = listPenaltiesForHole(db, listHoles(db, round.id)[0].id).find((row) => row.id === 'pen-export');
  assert.ok(broughtBack);
  assert.equal(broughtBack.reason, 'water');
  assert.equal(tombstoneCount(db, 'pen-export'), 1);
  const replay = insertPenalty(db, {
    id: 'pen-export',
    holeId: listHoles(db, round.id)[0].id,
    par: 4,
    currentScore: getHole(db, round.id, hole.number)?.score ?? null,
    strokes: 1,
    reason: 'unplayable',
    note: null,
  });
  assert.equal(replay.replay, 'existing');
  if (replay.replay === 'deleted') return;
  assert.equal(replay.penalty.reason, 'water');
  assert.equal(listPenaltiesForHole(db, listHoles(db, round.id)[0].id).length, 1);

  const legacy = memoryDb();
  const legacyRestore = restoreRoundHistory(legacy, older);
  assert.equal(legacyRestore.ok, true);
  const legacyHole = listHoles(legacy, round.id)[0];
  assert.ok(legacyHole);
  assert.equal(listPenaltiesForHole(legacy, legacyHole.id)[0]?.reason, 'water');
  assert.equal(tombstoneCount(legacy, 'pen-export'), 0);
});

test('a watch duplicate keeps an edited reason and does not resurrect a delete', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Watch edit');
  const hole = listHoles(db, round.id)[0];
  assert.ok(hole);
  const clubId = db.getFirstSync<{ id: string }>('SELECT id FROM clubs WHERE id != ? LIMIT 1', ['club_putter'])?.id;
  assert.ok(clubId);
  insertMarkedShot(db, { id: 'shot-8i', holeId: hole.id, clubId, seq: 1, startedAt: '2026-09-26T12:00:00.000Z' });
  insertMarkedShot(db, { id: 'shot-sw', holeId: hole.id, clubId, seq: 2, startedAt: '2026-09-26T12:04:00.000Z' });
  db.runSync('UPDATE holes SET par = 4, score = 4 WHERE id = ?', [hole.id]);
  const shots = listShotsForHole(db, hole.id);
  const planned = planWatchPenaltyInsert({ id: 'watch-water', reason: 'water', shots });
  const saved = insertPenalty(db, {
    id: planned.id,
    holeId: hole.id,
    par: 4,
    currentScore: 4,
    strokes: planned.strokes,
    reason: planned.reason,
    note: planned.note,
    kind: planned.kind,
    afterShotId: planned.afterShotId,
    afterShotSeq: planned.afterShotSeq,
  });
  if (saved.replay === 'deleted') throw new Error('first watch insert was a tombstone');
  assert.equal(saved.score, 5);
  updatePenaltyReason(db, { penaltyId: 'watch-water', reason: 'other', note: 'gallery' });

  const replay = insertPenalty(db, {
    id: 'watch-water',
    holeId: hole.id,
    par: 4,
    currentScore: 5,
    strokes: 1,
    reason: 'water',
    note: null,
    kind: 'penalty',
    afterShotId: 'shot-8i',
    afterShotSeq: 1,
  });
  assert.equal(replay.replay, 'existing');
  if (replay.replay !== 'existing') return;
  assert.equal(replay.penalty.reason, 'other');
  assert.equal(replay.penalty.note, 'gallery');
  assert.equal(replay.penalty.afterShotId, planned.afterShotId);
  assert.equal(replay.score, 5);
  assert.equal(listPenaltiesForHole(db, hole.id).length, 1);
  assert.equal(getHole(db, round.id, hole.number)?.score, 5);

  const removed = deletePenalty(db, 'watch-water');
  assert.equal(removed.status, 'deleted');
  assert.equal(getHole(db, round.id, hole.number)?.score, 4);
  const late = insertPenalty(db, {
    id: 'watch-water',
    holeId: hole.id,
    par: 4,
    currentScore: 4,
    strokes: 1,
    reason: 'water',
    note: null,
    kind: 'penalty',
    afterShotId: planned.afterShotId,
    afterShotSeq: planned.afterShotSeq,
  });
  assert.equal(late.replay, 'deleted');
  assert.equal(late.penalty, null);
  assert.equal(late.score, 4);
  assert.equal(listPenaltiesForHole(db, hole.id).length, 0);
  assert.equal(getHole(db, round.id, hole.number)?.score, 4);

  const queued = planWatchPenaltyInsert({
    id: 'watch-queued',
    reason: 'unplayable',
    shots: listShotsForHole(db, hole.id),
  });
  const inserted = insertPenalty(db, {
    id: queued.id,
    holeId: hole.id,
    par: 4,
    currentScore: 4,
    strokes: queued.strokes,
    reason: queued.reason,
    note: queued.note,
    kind: queued.kind,
    afterShotId: queued.afterShotId,
    afterShotSeq: queued.afterShotSeq,
  });
  if (inserted.replay === 'deleted') throw new Error('new watch id was tombstoned');
  assert.equal(inserted.replay, 'inserted');
  assert.equal(inserted.penalty.reason, 'unplayable');
  assert.equal(inserted.penalty.afterShotId, 'shot-sw');
  assert.equal(inserted.penalty.afterShotSeq, 2);
  assert.equal(inserted.score, 5);
  assert.equal(listPenaltiesForHole(db, hole.id).map((row) => row.id).join(','), 'watch-queued');
  assert.deepEqual(
    listShotsForHole(db, hole.id).map((shot) => shot.seq),
    [1, 2],
  );
  const exportJson = serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-26T18:00:00.000Z'));
  assert.doesNotMatch(exportJson, /watch-water|deleted_penalty_ids/);
  assert.match(exportJson, /watch-queued/);
});

function clubStatSnapshot(db: SQLiteDatabase, clubId: string) {
  const average = listClubAverages(db).find((row) => row.club.id === clubId);
  const dispersionShots = listDispersionShots(db);
  const dispersion = planDispersion(dispersionShots, clubId);
  return {
    averageCount: average?.count ?? 0,
    averageYards: average?.avgYards ?? null,
    dispersionCount: dispersion.count,
    dispersionShots: dispersionShots.map((shot) => shot.shotId),
    along: dispersion.avgAlong,
    lateral: dispersion.avgLateral,
  };
}

function assertSurfaces(
  db: SQLiteDatabase,
  roundId: string,
  holeId: string,
  expected: { score: number; penaltyStrokes: number; countLine: string; toPar: number },
) {
  const hole = listHoles(db, roundId).find((row) => row.id === holeId);
  assert.ok(hole);
  const shots = listShotsForHole(db, holeId);
  const penalties = listPenaltiesForHole(db, holeId);
  const penaltyStrokes = totalPenaltyStrokes(penalties);
  assert.equal(hole.score, expected.score);
  assert.equal(penaltyStrokes, expected.penaltyStrokes);
  assert.equal(
    formatHoleCountLine({
      shotCount: shots.length,
      penaltyStrokes,
      puttCount: hole.putts,
    }),
    expected.countLine,
  );
  const finished = planFinishedHoleMiniSummary({
    puttsDone: hole.puttsDone,
    score: hole.score,
    par: hole.par,
    shotCount: shots.length,
    putts: hole.putts,
    penaltyStrokes,
    shots,
  });
  assert.equal(finished.score, expected.score);
  assert.equal(finished.penaltyLabel, penaltyStrokes === 1 ? '1 penalty' : `${penaltyStrokes} penalties`);
  assert.match(finished.line, new RegExp(expected.countLine.replace(' · ', ' · ')));
  const card = planScorecard([
    {
      number: hole.number,
      par: hole.par,
      score: hole.score,
      putts: hole.putts,
      puttsDone: hole.puttsDone,
      shotCount: shots.length,
      penaltyStrokes,
    },
  ]);
  assert.equal(card[0]?.score, expected.score);
  const running = planRunningParBadge({
    holes: [
      {
        number: hole.number,
        par: hole.par,
        score: hole.score,
        puttsDone: hole.puttsDone,
        shotCount: shots.length,
        putts: hole.putts,
        penaltyStrokes,
      },
    ],
  });
  assert.equal(running.toPar, expected.toPar);
  const share = planRoundShare(db, roundId, { currentHoleNumber: hole.number });
  assert.ok(share);
  assert.match(share.message, new RegExp(`^${hole.number}  ${expected.score}$`, 'm'));
  assert.equal(share.scorecard.find((row) => row.number === hole.number)?.score, expected.score);
}
