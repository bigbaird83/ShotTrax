import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDropRow, planDrop } from './drop';

test('drop is one penalty stroke and never a distance shot', () => {
  const drop = planDrop({ reason: 'water' });
  assert.equal(drop.kind, 'drop');
  assert.equal(drop.strokes, 1);
  assert.equal(drop.isDistanceShot, false);
  assert.equal(formatDropRow({ kind: 'drop', strokes: 1, reasonLabel: 'Water', note: null }), 'Drop +1 · Water');
});

test('score-only penalty stays a penalty row', () => {
  assert.equal(
    formatDropRow({ kind: 'penalty', strokes: 2, reasonLabel: 'OB', note: null }),
    '+2 OB',
  );
});
