import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  getHole,
  insertPenalty,
  listHoles,
  listPenaltiesForHole,
  listShotsForHole,
  startRound,
  undoLastShot,
  updateHolePutts,
} from '../db/repo';
import { migrate } from '../db/schema';
import type { Shot } from './types';
import {
  clubListPayload,
  clubListPushKey,
  parseClubList,
  parseShotUndo,
  parseWatchInboundIntent,
  shotUndoPayload,
  watchPayloadRunsAcceptFix,
} from './watchMessages';
import {
  resolveWatchLastShotId,
  watchClubListIsStale,
  planWatchShotUndo,
  WATCH_SHOT_ALREADY_UNDONE,
  WATCH_SHOT_UNDO_SKIPPED,
  WATCH_SHOT_UNDONE,
  watchLastShotId,
  watchShotUndoStartsShotHold,
  watchShotUndoTouchesPuttsOrPenalties,
} from './watchShotUndo';

const AT = '2026-09-26T12:00:00.000Z';

function shot(partial: Partial<Shot> & { id: string; seq: number }): Shot {
  return {
    holeId: 'h2',
    clubId: 'club_7i',
    startLat: 35.51,
    startLng: -92.11,
    startAccuracyM: 8,
    startFixQuality: 'good',
    endLat: 35.52,
    endLng: -92.1,
    endAccuracyM: 8,
    endFixQuality: 'good',
    distanceYards: 150,
    typedYards: null,
    fixQuality: 'good',
    impossibleJump: false,
    startedAt: AT,
    endedAt: AT,
    source: 'gps',
    suggested: false,
    holeOut: false,
    ...partial,
  };
}

test('shotUndo parses with a stable id and the shot it targets; never a club mark', () => {
  const payload = shotUndoPayload({ id: 'undo-1', shotId: 'shot-b', at: AT, holeNumber: 2 });
  assert.deepEqual(parseShotUndo(payload), payload);
  // NSNumber / string hole from Watch Connectivity.
  assert.equal(parseShotUndo({ ...payload, holeNumber: '2' })?.holeNumber, 2);
  assert.equal(parseShotUndo({ ...payload, id: '' }), null);
  assert.equal(parseShotUndo({ ...payload, shotId: 'has space' }), null);
  assert.equal(parseShotUndo({ ...payload, holeNumber: 0 }), null);
  assert.equal(parseShotUndo({ ...payload, at: 'yesterday' }), null);
  const intent = parseWatchInboundIntent(payload);
  assert.equal(intent?.kind, 'undo');
  assert.equal(watchPayloadRunsAcceptFix(payload), false);
  assert.equal(watchShotUndoStartsShotHold(), false);
  assert.equal(watchShotUndoTouchesPuttsOrPenalties(), false);
});

test('clubList carries lastShotId so the Watch can dim Undo and name the shot', () => {
  const base = {
    top3: ['club_7i'],
    bag: ['club_7i'],
    labels: { club_7i: '7i · 150' },
    holeNumber: 2,
    yardsToGreen: 150,
    yardsQuality: 'good' as const,
  };
  const withShot = clubListPayload({ ...base, lastShotId: 'shot-b' });
  assert.equal(withShot.lastShotId, 'shot-b');
  assert.equal(parseClubList(withShot)?.lastShotId, 'shot-b');
  const empty = clubListPayload({ ...base, lastShotId: null });
  assert.equal('lastShotId' in empty, false);
  assert.equal(parseClubList(empty)?.lastShotId, undefined);
  // An undo that changes the last shot pushes a fresh list to the Watch.
  assert.notEqual(clubListPushKey(withShot), clubListPushKey(empty));
  assert.equal(watchLastShotId([]), null);
  assert.equal(watchLastShotId([shot({ id: 'a', seq: 1 }), shot({ id: 'b', seq: 2 })]), 'b');
});

test('Hole Out and a hole change do not drop a last shot the phone still has', () => {
  // Same hole, key omitted: a yard refresh must not gray Edit shot.
  assert.equal(
    resolveWatchLastShotId({ previousHole: 1, previousId: 'shot-a', nextHole: 1, incoming: undefined }),
    'shot-a',
  );
  // Explicit empty: the phone says this hole has no shot.
  assert.equal(resolveWatchLastShotId({ previousHole: 1, previousId: 'shot-a', nextHole: 1, incoming: '' }), null);
  // Hole change with the key omitted does not carry hole N's shot onto hole N+1.
  assert.equal(
    resolveWatchLastShotId({ previousHole: 1, previousId: 'shot-a', nextHole: 2, incoming: undefined }),
    null,
  );
  // Hole Out names the destination hole's shot, including a hole that already has one.
  assert.equal(
    resolveWatchLastShotId({ previousHole: 1, previousId: 'shot-a', nextHole: 2, incoming: 'shot-on-2' }),
    'shot-on-2',
  );
  assert.equal(resolveWatchLastShotId({ previousHole: 1, previousId: 'shot-a', nextHole: 2, incoming: '' }), null);
  // A late Hole Out / complication list is older than the list already on the Watch.
  assert.equal(watchClubListIsStale({ currentSeq: 4, incomingSeq: 2 }), true);
  assert.equal(watchClubListIsStale({ currentSeq: 4, incomingSeq: 4 }), false);
  assert.equal(watchClubListIsStale({ currentSeq: 0, incomingSeq: 0 }), false);
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const apply = session.slice(session.indexOf('private func applyClubList'), session.indexOf('private func applyPuttSheet'));
  assert.match(apply, /incomingSeq < list\.listSeq/);
  assert.match(apply, /message\["lastShotId"\] != nil/);
  assert.match(apply, /next\.lastShotId = list\.lastShotId/);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /watchAdvanceNamedShot\(db, id, targetHole, round\.holeCount\)/);
  assert.match(hole, /lastShotId: advance\.lastShotId/);
});

test('undo removes only the named shot, only while it is last, only on the current hole', () => {
  const shots = [shot({ id: 'a', seq: 1 }), shot({ id: 'b', seq: 2 })];
  const undo = planWatchShotUndo({ shotId: 'b', holeNumber: 2, currentHole: 2, shots });
  assert.equal(undo.action, 'undo');
  assert.equal(undo.feedback, WATCH_SHOT_UNDONE);
  assert.ok(undo.feedback.includes('✓'));
  if (undo.action === 'undo') assert.equal(undo.plan.deleteShotId, 'b');
  // Resend after the first delivery removed it: nothing more is removed.
  const again = planWatchShotUndo({ shotId: 'b', holeNumber: 2, currentHole: 2, shots: [shots[0]] });
  assert.deepEqual(again, { action: 'done', feedback: WATCH_SHOT_ALREADY_UNDONE });
  // A newer shot landed first (queued undo delivered late): never a middle shot.
  const newer = planWatchShotUndo({
    shotId: 'b',
    holeNumber: 2,
    currentHole: 2,
    shots: [...shots, shot({ id: 'c', seq: 3 })],
  });
  assert.deepEqual(newer, { action: 'skip', feedback: WATCH_SHOT_UNDO_SKIPPED });
  // Phone moved on to the next hole: never an earlier hole.
  const earlier = planWatchShotUndo({ shotId: 'b', holeNumber: 2, currentHole: 3, shots });
  assert.deepEqual(earlier, { action: 'skip', feedback: WATCH_SHOT_UNDO_SKIPPED });
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

function insertMarkedShot(db: SQLiteDatabase, args: { id: string; holeId: string; clubId: string; seq: number }): void {
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq, start_lat, start_lng, end_lat, end_lng,
      distance_yards, fix_quality, impossible_jump, started_at, ended_at, source
    ) VALUES (?, ?, ?, ?, 35.51, -92.11, 35.52, -92.1, 150, 'good', 0, ?, ?, 'gps')`,
    [args.id, args.holeId, args.clubId, args.seq, AT, AT],
  );
}

test('the phone undo removes one shot; putts, penalties and earlier holes stay; a resend removes nothing', needsSqlite, () => {
  const db = memoryDb();
  const round = startRound(db, 9, 'Watch undo');
  const [hole1, hole2] = listHoles(db, round.id);
  assert.ok(hole1 && hole2);
  const clubId = db.getFirstSync<{ id: string }>('SELECT id FROM clubs WHERE id != ? LIMIT 1', ['club_putter'])?.id;
  assert.ok(clubId);
  insertMarkedShot(db, { id: 'h1-drive', holeId: hole1.id, clubId, seq: 1 });
  insertMarkedShot(db, { id: 'h2-drive', holeId: hole2.id, clubId, seq: 1 });
  insertMarkedShot(db, { id: 'h2-approach', holeId: hole2.id, clubId, seq: 2 });
  insertPenalty(db, {
    id: 'pen-water',
    holeId: hole2.id,
    par: 4,
    currentScore: null,
    strokes: 1,
    reason: 'water',
    note: null,
    kind: 'penalty',
    afterShotId: 'h2-drive',
    afterShotSeq: 1,
  });
  updateHolePutts(db, hole2.id, 2, ['3_to_10', 'inside_3']);
  const puttsBefore = getHole(db, round.id, 2);

  const run = (shotId: string) => {
    const current = getHole(db, round.id, 2);
    assert.ok(current);
    const decision = planWatchShotUndo({
      shotId,
      holeNumber: 2,
      currentHole: 2,
      shots: listShotsForHole(db, current.id),
    });
    if (decision.action === 'undo') assert.equal(undoLastShot(db, round.id, 2, shotId).ok, true);
    return decision.action;
  };

  const target = watchLastShotId(listShotsForHole(db, hole2.id));
  assert.equal(target, 'h2-approach');
  assert.equal(run('h2-approach'), 'undo');
  // sendMessage and transferUserInfo both deliver the same tap: the second removes nothing.
  assert.equal(run('h2-approach'), 'done');
  assert.deepEqual(
    listShotsForHole(db, hole2.id).map((row) => row.id),
    ['h2-drive'],
  );
  assert.deepEqual(listShotsForHole(db, hole1.id).map((row) => row.id), ['h1-drive']);
  assert.deepEqual(listPenaltiesForHole(db, hole2.id).map((row) => row.id), ['pen-water']);
  const puttsAfter = getHole(db, round.id, 2);
  assert.equal(puttsAfter?.putts, puttsBefore?.putts);
  assert.deepEqual(puttsAfter?.puttLengths, puttsBefore?.puttLengths);
  // The repo checks the target too: a stale id removes nothing.
  assert.deepEqual(undoLastShot(db, round.id, 2, 'h2-approach'), { ok: false, reason: 'changed' });
  assert.deepEqual(listShotsForHole(db, hole2.id).map((row) => row.id), ['h2-drive']);
});

test('phone handler applies Watch Undo through the planner and the phone undo, never a shot hold', () => {
  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  const fn = service.slice(service.indexOf('async function applyWatchShotUndo'), service.indexOf('async function flushPendingShotUndos'));
  assert.match(fn, /planWatchShotUndo\(/);
  assert.match(fn, /currentHole: ctx\.holeNumber/);
  assert.match(fn, /undoLastShot\(ctx\.db, ctx\.roundId, undo\.holeNumber, undo\.shotId\)/);
  assert.doesNotMatch(fn, /insertPenalty|updateHolePutts|markShotWithClub|acceptFix/);
  assert.match(service, /queueWatchShotUndoEvent/);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /lastShotId: readOnly \? null : watchNamedLastShot\(shots\)\.lastShotId/);
});

test('Watch Undo: stable id, same queue as Penalty, no shot hold, never putts or penalties', () => {
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const undo = session.slice(session.indexOf('func undoLastShot()'), session.indexOf('func retryUndo()'));
  assert.match(undo, /guard canUndoShot, let shotId = list\.lastShotId/);
  assert.match(undo, /"type": "shotUndo"/);
  assert.match(undo, /"id": UUID\(\)\.uuidString/);
  assert.match(undo, /"shotId": shotId/);
  assert.match(undo, /"holeNumber": list\.holeNumber/);
  assert.match(undo, /sendUndoReliable\(payload\)/);
  assert.doesNotMatch(undo, /beginShotHold|attachWatchFix|puttPick|penaltyPick|lat|lng/);
  // Retry resends the queued payload — same id, never a new one.
  const retry = session.slice(session.indexOf('func retryUndo()'), session.indexOf('func openPenaltyChoices'));
  assert.match(retry, /pendingQueue\.filter \{ isShotUndo\(\$0\) \}/);
  assert.doesNotMatch(retry, /UUID\(\)|beginShotHold/);
  const send = session.slice(session.indexOf('private func sendUndoReliable'), session.indexOf('private func showUndoRetry'));
  assert.match(send, /enqueuePending\(payload\)/);
  assert.match(send, /transferUserInfo\(payload\)/);
  assert.match(send, /dequeuePending\(at: payload\["at"\] as\? String\)/);
  assert.match(send, /showUndoRetry\("Queued · will sync"\)/);
  assert.doesNotMatch(send, /beginShotHold/);
  // Reconnect resends queued undos without a second transfer; a new hole drops them.
  const flush = session.slice(session.indexOf('private func flushPending()'), session.indexOf('private func syncRoundStay'));
  assert.match(flush, /isShotUndo\(payload\)[\s\S]*sendUndoReliable\(payload, transfer: false\)/);
  const drop = session.slice(session.indexOf('private func dropStaleClubPicks'), session.indexOf('private func flushPending()'));
  assert.match(drop, /isShotUndo\(payload\)/);
  // Dim while there is no shot, or this shot's undo is on the way.
  const can = session.slice(session.indexOf('var canUndoShot: Bool'), session.indexOf('func undoLastShot()'));
  assert.match(can, /list\.lastShotId/);
  assert.match(can, /undoPendingShotIds\.contains\(shotId\)/);
  // A queued club tap would make the phone's last shot stale: Undo waits for it.
  assert.match(can, /pendingQueue\.contains \{ isClubPick\(\$0\)/);
});

test('Watch Row B: Edit shot in the middle slot; Retry takes it while a penalty, undo, or club change is pending', () => {
  const ui = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const pick = ui.slice(ui.indexOf('private var clubPick'), ui.indexOf('private var editShotMenu'));
  const rowB = pick.slice(pick.indexOf('actionPill("Hole Out")'), pick.indexOf('GeometryReader { wheelGeo'));
  const retryAt = rowB.indexOf('actionPill("Retry")');
  const editAt = rowB.indexOf('actionPill(watchEditShotLabel)');
  assert.ok(retryAt > 0 && editAt > retryAt, 'Retry wins the slot, Edit shot is the else branch');
  assert.match(rowB, /if session\.penaltyRetry \|\| session\.undoRetry \|\| session\.clubChangeRetry \{/);
  assert.match(rowB, /session\.retryPenalty\(\)/);
  assert.match(rowB, /session\.retryUndo\(\)/);
  assert.match(rowB, /session\.retryClubChange\(\)/);
  assert.match(ui, /private let watchEditShotLabel = "Edit shot"/);
  assert.match(rowB, /session\.openEditShot\(\)/);
  assert.doesNotMatch(rowB, /beginShotHold|undoLastShot|changeShotClub/);
  assert.match(rowB, /\.allowsHitTesting\(session\.canEditShot\)/);
  assert.match(rowB, /\.opacity\(session\.canEditShot \? 1 : 0\.4\)/);
  assert.ok(editAt < rowB.indexOf('emptyPillSlot'));
});
