import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CONFIRM_UNDO_MS,
  confirmUndoIsDockRow,
  confirmUndoIsLive,
  confirmUndoWindowMs,
  planConfirmUndo,
} from './confirmUndo';

test('Confirm Undo is up for 5 seconds, then the shot sticks', () => {
  assert.equal(confirmUndoWindowMs(), 5000);
  assert.equal(CONFIRM_UNDO_MS, 5000);
  const window = planConfirmUndo('shot-1', 1_000);
  assert.equal(window.shotId, 'shot-1');
  assert.equal(window.expiresAt, 6_000);
  assert.equal(confirmUndoIsLive(window, 5_999), true);
  assert.equal(confirmUndoIsLive(window, 6_000), false);
  assert.equal(confirmUndoIsLive(null, 1_000), false);
});

test('Confirm Undo is not a dock row; it removes the just-confirmed shot', () => {
  assert.equal(confirmUndoIsDockRow(), false);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /planConfirmUndo/);
  assert.match(hole, /confirmUndoIsLive/);
  assert.match(hole, /deleteHoleShot/);
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.doesNotMatch(dock, /confirmUndo|COPY\.undoLast/);
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  const overlay = hole.slice(hole.indexOf('playLayout.shotLine'), hole.indexOf('!hideHoleButtons'));
  assert.match(overlay, /COPY\.undoLast/);
  assert.match(overlay, /onConfirmUndo/);
});
