import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseWatchConfirm, watchConfirmPayload } from './watchMessages';
import { clearWatchUnconfirmed, watchRowBMiddleSlot, WATCH_EDIT_SHOT_LABEL, type WatchUnconfirmed } from './watchPendingConfirm';

const penalty = (id: string): WatchUnconfirmed => ({ type: 'penaltyPick', id });
const undo = (id: string): WatchUnconfirmed => ({ type: 'shotUndo', id });

test('a penalty the phone confirmed clears Retry so Undo shows', () => {
  const queued = [penalty('pen-water')];
  assert.equal(watchRowBMiddleSlot(queued), 'Retry');
  const ack = watchConfirmPayload('penalty', 'pen-water');
  assert.deepEqual(ack, { type: 'watchConfirm', kind: 'penalty', id: 'pen-water', ok: true });
  assert.deepEqual(parseWatchConfirm(ack), ack);
  const cleared = clearWatchUnconfirmed(queued, { kind: 'penalty', id: 'pen-water', ok: true });
  assert.deepEqual(cleared, []);
  assert.equal(watchRowBMiddleSlot(cleared), WATCH_EDIT_SHOT_LABEL);
});

test('a confirmed duplicate penalty id also clears Retry', () => {
  const queued = [penalty('pen-water')];
  const once = clearWatchUnconfirmed(queued, { kind: 'penalty', id: 'pen-water', ok: true });
  const twice = clearWatchUnconfirmed(once, { kind: 'penalty', id: 'pen-water', ok: true });
  assert.deepEqual(twice, []);
  assert.equal(watchRowBMiddleSlot(twice), WATCH_EDIT_SHOT_LABEL);
  // The other queued row is a different id and stays.
  const other = clearWatchUnconfirmed([penalty('pen-water'), penalty('pen-ob')], {
    kind: 'penalty',
    id: 'pen-water',
    ok: true,
  });
  assert.deepEqual(other, [penalty('pen-ob')]);
  assert.equal(watchRowBMiddleSlot(other), 'Retry');
});

test('a confirmed undo clears undoRetry so Undo shows', () => {
  const queued = [undo('undo-1')];
  assert.equal(watchRowBMiddleSlot(queued), 'Retry');
  const cleared = clearWatchUnconfirmed(queued, { kind: 'undo', id: 'undo-1', ok: true });
  assert.deepEqual(cleared, []);
  assert.equal(watchRowBMiddleSlot(cleared), WATCH_EDIT_SHOT_LABEL);
  // A penalty confirm does not drop an undo, and the reverse is also true.
  const both = [penalty('pen-water'), undo('undo-1')];
  const penaltyOnly = clearWatchUnconfirmed(both, { kind: 'penalty', id: 'pen-water', ok: true });
  assert.deepEqual(penaltyOnly, [undo('undo-1')]);
  assert.equal(watchRowBMiddleSlot(penaltyOnly), 'Retry');
  assert.equal(watchRowBMiddleSlot(clearWatchUnconfirmed(penaltyOnly, { kind: 'undo', id: 'undo-1', ok: true })), WATCH_EDIT_SHOT_LABEL);
});

test('a confirmed club change clears Retry, and a failed one keeps it', () => {
  const queued: WatchUnconfirmed[] = [{ type: 'shotClubChange', id: 'club-1' }];
  assert.equal(watchRowBMiddleSlot(queued), 'Retry');
  const cleared = clearWatchUnconfirmed(queued, { kind: 'club', id: 'club-1', ok: true });
  assert.deepEqual(cleared, []);
  assert.equal(watchRowBMiddleSlot(cleared), WATCH_EDIT_SHOT_LABEL);
  const failed = clearWatchUnconfirmed(queued, { kind: 'club', id: 'club-1', ok: false });
  assert.equal(watchRowBMiddleSlot(failed), 'Retry');
  const mixed: WatchUnconfirmed[] = [
    { type: 'penaltyPick', id: 'pen' },
    { type: 'shotUndo', id: 'undo' },
    { type: 'shotClubChange', id: 'club-1' },
  ];
  assert.equal(watchRowBMiddleSlot(clearWatchUnconfirmed(mixed, { kind: 'club', id: 'club-1', ok: true })), 'Retry');
  const noPenalty = clearWatchUnconfirmed(mixed, { kind: 'penalty', id: 'pen', ok: true });
  const noUndo = clearWatchUnconfirmed(noPenalty, { kind: 'undo', id: 'undo', ok: true });
  assert.equal(watchRowBMiddleSlot(clearWatchUnconfirmed(noUndo, { kind: 'club', id: 'club-1', ok: true })), WATCH_EDIT_SHOT_LABEL);
});

test('a failed or still-queued penalty keeps Retry', () => {
  const queued = [penalty('pen-water')];
  assert.equal(watchRowBMiddleSlot(queued), 'Retry');
  const failed = clearWatchUnconfirmed(queued, { kind: 'penalty', id: 'pen-water', ok: false });
  assert.deepEqual(failed, queued);
  assert.equal(watchRowBMiddleSlot(failed), 'Retry');
  assert.equal(parseWatchConfirm({ type: 'watchConfirm', kind: 'penalty', id: 'pen-water', ok: false }), null);
  assert.equal(watchConfirmPayload('penalty', '   '), null);
  assert.equal(watchRowBMiddleSlot(clearWatchUnconfirmed(queued, { kind: 'penalty', id: 'pen-other', ok: true })), 'Retry');
});

test('Watch clears a confirmed id from the phone ack, not only on the next hole', () => {
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const ack = session.slice(session.indexOf('private func applyWatchAck'), session.indexOf('private func acceptConfirmed'));
  assert.match(ack, /"watchConfirm"/);
  assert.match(ack, /kind == "penalty"/);
  assert.match(ack, /acceptConfirmed\(kind: "penalty", id: id\)/);
  assert.match(ack, /finishPenaltySend\(\)/);
  assert.match(ack, /kind == "undo"/);
  assert.match(ack, /finishUndoSend\(shotId: shotId\)/);
  assert.match(ack, /kind == "club"/);
  assert.match(ack, /acceptConfirmed\(kind: "club", id: id\)/);
  assert.match(ack, /finishClubChangeSend/);
  assert.ok(ack.indexOf('acceptConfirmed(kind: "penalty"') < ack.indexOf('finishPenaltySend()'));
  assert.ok(ack.indexOf('acceptConfirmed(kind: "undo"') < ack.indexOf('finishUndoSend'));
  const penaltySend = session.slice(
    session.indexOf('private func sendPenaltyReliable'),
    session.indexOf('private func isShotUndo'),
  );
  assert.match(penaltySend, /acceptConfirmed\(kind: "penalty"/);
  assert.match(penaltySend, /stillQueued\(kind: "penalty"/);
  assert.ok(penaltySend.indexOf('if ok') < penaltySend.indexOf('acceptConfirmed'));
  const undoSend = session.slice(session.indexOf('private func sendUndoReliable'), session.indexOf('private func showUndoRetry'));
  assert.match(undoSend, /acceptConfirmed\(kind: "undo"/);
  assert.match(undoSend, /stillQueued\(kind: "undo"/);
  const bridge = readFileSync(new URL('../../modules/watch-bridge/ios/WatchBridgeModule.swift', import.meta.url), 'utf8');
  assert.match(bridge, /type == "shotUndo"/);
  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  const penalty = service.slice(service.indexOf('async function applyWatchPenalty'), service.indexOf('async function applyWatchShotUndo'));
  assert.match(penalty, /pushWatchConfirm\('penalty', pick\.id\)/);
  assert.ok(penalty.indexOf("saved.replay === 'deleted'") < penalty.indexOf("pushWatchConfirm('penalty'"));
  const shotUndo = service.slice(service.indexOf('async function applyWatchShotUndo'), service.indexOf('async function flushPendingShotUndos'));
  assert.match(shotUndo, /pushWatchConfirm\('undo', undo\.id/);
  const undoFailed = shotUndo.slice(shotUndo.indexOf('} catch'));
  assert.doesNotMatch(undoFailed, /pushWatchConfirm/);
  const penaltyFailed = penalty.slice(penalty.indexOf('} catch'));
  assert.doesNotMatch(penaltyFailed, /pushWatchConfirm/);
});
