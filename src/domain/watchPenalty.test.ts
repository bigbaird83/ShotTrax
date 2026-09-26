import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  collectRoundHistoryExport,
  getHole,
  insertPenalty,
  listHoles,
  listPenaltiesForHole,
  listShotsForHole,
  restoreRoundHistory,
  startRound,
} from '../db/repo';
import { migrate } from '../db/schema';
import { PENALTY_REASONS, totalPenaltyStrokes } from './penalty';
import { formatHoleCountLine, orderHoleSteps } from './penaltySteps';
import { scorecardDiff, scorecardDiffLabel } from './scorecard';
import { serializeRoundHistory } from './roundTransfer';
import {
  drainWatchPenaltyQueue,
  formatWatchPenaltyFeedback,
  planWatchPenaltyInsert,
  queueWatchPenaltyEvent,
  WATCH_PENALTY_QUEUED,
  WATCH_PENALTY_RETRY_ACTION,
  WATCH_PENALTY_SAVE_FAILED,
  watchPenaltyQueueLength,
} from './watchPenalty';
import { watchMarkStartsShotHold, watchPenaltyStartsShotHold } from './watchLive';
import {
  parsePenaltyPick,
  parseWatchInboundIntent,
  penaltyPickPayload,
  watchPayloadRunsAcceptFix,
  type PenaltyPickMessage,
} from './watchMessages';

const AT = '2026-09-26T12:00:00.000Z';
const EXPORTED_AT = '2026-09-26T18:00:00.000Z';

test('penaltyPick parses the four phone reasons and only one stroke', () => {
  assert.deepEqual(
    PENALTY_REASONS.map((row) => row.reason),
    ['water', 'ob', 'unplayable', 'other'],
  );
  for (const row of PENALTY_REASONS) {
    const payload = penaltyPickPayload({
      id: `pen-${row.reason}`,
      reason: row.reason,
      at: AT,
      holeNumber: 7,
    });
    assert.equal(payload.strokes, 1);
    assert.equal(payload.type, 'penaltyPick');
    assert.deepEqual(parsePenaltyPick(JSON.parse(JSON.stringify(payload))), payload);
    assert.equal(parseWatchInboundIntent(payload)?.kind, 'penalty');
    assert.equal(watchPayloadRunsAcceptFix(payload), false);
    assert.equal(formatWatchPenaltyFeedback(row.reason).endsWith('✓'), true);
  }
  assert.equal(parsePenaltyPick({ type: 'penaltyPick', id: 'pen-water', reason: 'water', strokes: 2, at: AT, holeNumber: 1 }), null);
  assert.equal(parsePenaltyPick({ type: 'penaltyPick', id: 'pen-water', reason: 'lost', strokes: 1, at: AT, holeNumber: 1 }), null);
  assert.equal(parsePenaltyPick({ type: 'penaltyPick', id: '   ', reason: 'water', strokes: 1, at: AT, holeNumber: 1 }), null);
  assert.equal(parsePenaltyPick({ type: 'penaltyPick', id: 'pen-water', reason: 'water', strokes: 1, at: 'noon', holeNumber: 1 }), null);
  assert.equal(parsePenaltyPick({ type: 'penaltyPick', id: 'pen-water', reason: 'water', strokes: 1, at: AT, holeNumber: 0 }), null);
  assert.equal(parsePenaltyPick({ type: 'clubPick', id: 'pen-water', reason: 'water', strokes: 1, at: AT, holeNumber: 1 }), null);
  const intent = parseWatchInboundIntent(
    penaltyPickPayload({ id: 'pen-ob', reason: 'ob', at: AT, holeNumber: 3 }),
  );
  assert.equal(intent?.kind, 'penalty');
  if (intent?.kind === 'penalty') {
    assert.equal(intent.runsAcceptFix, false);
    assert.equal(intent.savesGps, false);
    assert.equal(intent.closesPendingShot, false);
    assert.equal(intent.pick.holeNumber, 3);
  }
});

test('a penalty does not start the live-yard hold', () => {
  assert.equal(watchPenaltyStartsShotHold(), false);
  assert.equal(watchMarkStartsShotHold({ kind: 'penalty' }), false);
  assert.equal(watchMarkStartsShotHold({ kind: 'club', clubId: 'club_7i' }), true);
  assert.equal(watchMarkStartsShotHold({ kind: 'club', clubId: 'club_putter' }), false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const pickPenalty = session.slice(session.indexOf('func pickPenalty'), session.indexOf('func retryPenalty'));
  assert.match(pickPenalty, /"strokes": 1/);
  assert.match(pickPenalty, /sendPenaltyReliable/);
  assert.doesNotMatch(pickPenalty, /beginShotHold|attachWatchFix|complication|reloadWidget|noteLuminance|appLiveYards|lat|lng|par|yards/i);
  const retry = session.slice(session.indexOf('func retryPenalty'), session.indexOf('private enum ShotHoldDecision'));
  assert.match(retry, /pendingQueue/);
  assert.doesNotMatch(retry, /UUID\(\)|beginShotHold|attachWatchFix/);
  const send = session.slice(session.indexOf('private func sendPenaltyReliable'), session.indexOf('private func showPenaltyRetry'));
  assert.match(send, /transferUserInfo\(payload\)/);
  assert.match(send, /enqueuePending\(payload\)/);
  assert.match(send, /Queued · will sync/);
  assert.ok(send.indexOf('if ok') < send.indexOf('dequeuePending'));
  assert.doesNotMatch(send.slice(0, send.indexOf('if ok')), /dequeuePending/);
  assert.doesNotMatch(send, /beginShotHold|failUnavailable/);
  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  assert.ok(clubPick.indexOf('actionPill("Penalty")') < clubPick.indexOf('actionPill("Hole Out")'));
  assert.ok(clubPick.indexOf('actionPill("Hole Out")') < clubPick.indexOf('ScrollView(.horizontal'));
  // Reasons live on their own penaltyMenu screen (see watchHoleLayout.test.ts).
  const menu = watch.slice(watch.indexOf('private var penaltyMenu'), watch.indexOf('private func penaltyTile'));
  for (const row of PENALTY_REASONS) {
    assert.match(menu, new RegExp(`penaltyTile\\("${row.label}"`));
    assert.match(menu, new RegExp(`pickPenalty\\("${row.reason}"\\)`));
  }
  assert.match(clubPick, new RegExp(`actionPill\\("${WATCH_PENALTY_RETRY_ACTION}"\\)`));
  assert.match(clubPick, /session\.penaltyNotice/);
  assert.ok(session.includes(WATCH_PENALTY_SAVE_FAILED));
  assert.ok(session.includes(WATCH_PENALTY_QUEUED));
  const bridge = readFileSync(new URL('../../modules/watch-bridge/ios/WatchBridgeModule.swift', import.meta.url), 'utf8');
  assert.match(bridge, /"penaltyPick"/);
  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  const apply = service.slice(service.indexOf('async function applyWatchPenalty'), service.indexOf('async function flushPendingPenalties'));
  assert.match(apply, /insertPenalty\(ctx\.db/);
  assert.match(apply, /planWatchPenaltyInsert/);
  assert.doesNotMatch(apply, /markShotWithClub|acceptFix|lat:|lng:/);
});

test('phone keeps a penalty queued until a round is open, without dropping the second delivery', () => {
  assert.equal(watchPenaltyQueueLength(), 0);
  const first: PenaltyPickMessage = penaltyPickPayload({ id: 'pen-water', reason: 'water', at: AT, holeNumber: 4 });
  queueWatchPenaltyEvent({ token: 'send', json: JSON.stringify(first), id: first.id });
  queueWatchPenaltyEvent({ token: 'user-info', json: JSON.stringify(first), id: first.id });
  queueWatchPenaltyEvent({ token: 'send', json: JSON.stringify(first), id: first.id });
  assert.equal(watchPenaltyQueueLength(), 2);
  const rows = drainWatchPenaltyQueue();
  assert.deepEqual(rows.map((row) => row.token), ['send', 'user-info']);
  assert.equal(watchPenaltyQueueLength(), 0);
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
  args: { id: string; holeId: string; clubId: string; seq: number; startedAt: string },
): void {
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq, start_lat, start_lng, end_lat, end_lng,
      distance_yards, fix_quality, impossible_jump, started_at, ended_at, source
    ) VALUES (?, ?, ?, ?, 35.51, -92.11, 35.52, -92.1, 170, 'good', 0, ?, ?, 'gps')`,
    [args.id, args.holeId, args.clubId, args.seq, args.startedAt, args.startedAt],
  );
}

test('watch penalty is one stroke after the last shot, idempotent, and survives export', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Watch penalty');
  const hole = listHoles(db, round.id)[0];
  const empty = listHoles(db, round.id)[1];
  assert.ok(hole && empty);
  db.runSync('UPDATE holes SET par = 4, par_source = ?, score = 4, putts = 2 WHERE id = ?', ['user', hole.id]);
  db.runSync('UPDATE holes SET par = 4, par_source = ? WHERE id = ?', ['user', empty.id]);
  const clubId = db.getFirstSync<{ id: string }>('SELECT id FROM clubs WHERE id != ? LIMIT 1', ['club_putter'])?.id;
  assert.ok(clubId);
  insertMarkedShot(db, { id: 'shot-sw', holeId: hole.id, clubId, seq: 2, startedAt: '2026-09-26T12:04:00.000Z' });
  insertMarkedShot(db, { id: 'shot-8i', holeId: hole.id, clubId, seq: 1, startedAt: '2026-09-26T12:00:00.000Z' });
  const shots = listShotsForHole(db, hole.id);
  const last = shots.reduce((best, shot) => (shot.seq >= best.seq ? shot : best));
  assert.equal(last.id, 'shot-sw');

  const none = planWatchPenaltyInsert({ id: 'pen-empty', reason: 'ob', shots: [] });
  assert.equal(none.afterShotId, null);
  assert.equal(none.afterShotSeq, null);
  assert.equal(none.strokes, 1);
  const planned = planWatchPenaltyInsert({ id: 'pen-water', reason: 'water', shots });
  assert.equal(planned.afterShotId, 'shot-sw');
  assert.equal(planned.afterShotSeq, 2);
  assert.equal(planned.kind, 'penalty');

  const live = getHole(db, round.id, hole.number);
  assert.ok(live);
  const beforeDiff = scorecardDiff(live.score, live.par);
  assert.equal(scorecardDiffLabel(beforeDiff), 'E');
  const saved = insertPenalty(db, {
    id: planned.id,
    holeId: hole.id,
    par: live.par,
    currentScore: live.score,
    strokes: planned.strokes,
    reason: planned.reason,
    note: planned.note,
    kind: planned.kind,
    afterShotId: planned.afterShotId,
    afterShotSeq: planned.afterShotSeq,
  });
  assert.equal(saved.score, 5);
  assert.equal(scorecardDiffLabel(scorecardDiff(saved.score, live.par)), '+1');
  const again = insertPenalty(db, {
    id: planned.id,
    holeId: hole.id,
    par: live.par,
    currentScore: 5,
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'penalty',
    afterShotId: 'shot-8i',
    afterShotSeq: 1,
  });
  if (again.replay === 'deleted') throw new Error('retry treated the penalty as deleted');
  assert.equal(again.replay, 'existing');
  assert.equal(again.score, 5);
  assert.equal(again.penalty.reason, 'water');
  assert.equal(again.penalty.afterShotId, 'shot-sw');
  assert.equal(listPenaltiesForHole(db, hole.id).length, 1);

  let running = getHole(db, round.id, hole.number)?.score ?? null;
  for (const row of PENALTY_REASONS) {
    if (row.reason === 'water') continue;
    const next = planWatchPenaltyInsert({ id: `pen-${row.reason}`, reason: row.reason, shots });
    const wrote = insertPenalty(db, {
      id: next.id,
      holeId: hole.id,
      par: live.par,
      currentScore: running,
      strokes: next.strokes,
      reason: next.reason,
      note: null,
      kind: 'penalty',
      afterShotId: next.afterShotId,
      afterShotSeq: next.afterShotSeq,
    });
    if (wrote.replay === 'deleted') throw new Error('new penalty was treated as deleted');
    running = wrote.score;
    assert.equal(wrote.penalty.strokes, 1);
    assert.equal(wrote.penalty.afterShotId, 'shot-sw');
  }
  const penalties = listPenaltiesForHole(db, hole.id);
  assert.equal(penalties.length, 4);
  assert.equal(totalPenaltyStrokes(penalties), 4);
  assert.deepEqual(
    penalties.map((row) => row.reason),
    ['water', 'ob', 'unplayable', 'other'],
  );
  const scored = getHole(db, round.id, hole.number);
  assert.equal(scored?.score, 8);
  assert.equal(
    formatHoleCountLine({
      shotCount: shots.length,
      penaltyStrokes: 1,
      puttCount: scored?.putts ?? 0,
    }),
    '2 shots · 1 penalty · 2 putts',
  );
  assert.equal(
    formatHoleCountLine({
      shotCount: shots.length,
      penaltyStrokes: totalPenaltyStrokes(penalties),
      puttCount: scored?.putts ?? 0,
      omitZeroPutts: true,
    }),
    '2 shots · 4 penalties · 2 putts',
  );
  assert.deepEqual(
    orderHoleSteps(shots, [penalties[0]!]).map((step) => (step.kind === 'penalty' ? step.label : step.id)),
    ['shot-8i', 'shot-sw', '+1 Water'],
  );

  const emptyPlan = planWatchPenaltyInsert({ id: 'pen-empty', reason: 'ob', shots: listShotsForHole(db, empty.id) });
  const emptySaved = insertPenalty(db, {
    id: emptyPlan.id,
    holeId: empty.id,
    par: 4,
    currentScore: null,
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'penalty',
    afterShotId: emptyPlan.afterShotId,
    afterShotSeq: emptyPlan.afterShotSeq,
  });
  if (emptySaved.replay === 'deleted') throw new Error('empty-hole penalty was treated as deleted');
  assert.equal(emptySaved.penalty.afterShotId, null);
  assert.equal(emptySaved.penalty.afterShotSeq, null);
  assert.equal(emptySaved.score, 5);
  assert.deepEqual(
    orderHoleSteps([], listPenaltiesForHole(db, empty.id)).map((step) => (step.kind === 'penalty' ? step.label : step.id)),
    ['+1 OB'],
  );

  const totals = listHoles(db, round.id).reduce((sum, row) => sum + (row.score ?? 0), 0);
  assert.equal(totals, 13);

  const json = serializeRoundHistory(collectRoundHistoryExport(db, EXPORTED_AT));
  const fresh = memoryDb();
  const restored = restoreRoundHistory(fresh, json);
  assert.equal(restored.ok, true);
  const back = listHoles(fresh, round.id);
  const backHole = back.find((row) => row.number === hole.number);
  const backEmpty = back.find((row) => row.number === empty.number);
  assert.ok(backHole && backEmpty);
  assert.equal(backHole.score, 8);
  assert.equal(backEmpty.score, 5);
  const backPenalty = listPenaltiesForHole(fresh, backHole.id).find((row) => row.id === 'pen-water');
  assert.ok(backPenalty);
  assert.equal(backPenalty.strokes, 1);
  assert.equal(backPenalty.kind, 'penalty');
  assert.equal(backPenalty.reason, 'water');
  assert.equal(backPenalty.afterShotId, 'shot-sw');
  assert.equal(backPenalty.afterShotSeq, 2);
  const backEmptyPenalty = listPenaltiesForHole(fresh, backEmpty.id)[0];
  assert.equal(backEmptyPenalty?.afterShotId, null);
  assert.equal(backEmptyPenalty?.afterShotSeq, null);
  assert.equal(scorecardDiffLabel(scorecardDiff(backHole.score, backHole.par)), '+4');
});
