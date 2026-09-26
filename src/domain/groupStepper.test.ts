import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stepperClear, stepperShown, stepperStep, stepperToggle } from './groupStepper';

test('starts at par, or 4 when par is unknown', () => {
  assert.equal(stepperShown(null, null, 3), 3);
  assert.equal(stepperShown(null, undefined, null), 4);
  assert.equal(stepperShown(null, 6, 4), 6);
  assert.equal(stepperShown(5, 6, 4), 5);
});

test('before Save, − / + move a draft; Save stores what is shown', () => {
  assert.deepEqual(stepperStep(null, null, 4, 1), { kind: 'draft', value: 5 });
  assert.deepEqual(stepperStep(null, 5, 4, 1), { kind: 'draft', value: 6 });
  assert.deepEqual(stepperToggle(null, 6, 4), { kind: 'save', value: 6 });
  assert.deepEqual(stepperToggle(null, null, 4), { kind: 'save', value: 4 });
});

test('after Save, − / + change the saved score; a plain tap on Saved does nothing', () => {
  assert.deepEqual(stepperStep(5, null, 4, -1), { kind: 'save', value: 4 });
  assert.deepEqual(stepperToggle(5, null, 4), { kind: 'none' });
  assert.deepEqual(stepperToggle(5, 7, 4), { kind: 'none' });
});

test('clearing is its own action, and only clears a saved score', () => {
  assert.deepEqual(stepperClear(5), { kind: 'clear' });
  assert.deepEqual(stepperClear(null), { kind: 'none' });
});

test('any score from 1 to 20: an ace and a 9 on a par 4', () => {
  assert.deepEqual(stepperStep(null, 2, 4, -1), { kind: 'draft', value: 1 });
  assert.deepEqual(stepperStep(null, 1, 4, -1), { kind: 'draft', value: 1 });
  assert.deepEqual(stepperStep(null, 8, 4, 1), { kind: 'draft', value: 9 });
  assert.deepEqual(stepperStep(20, null, 4, 1), { kind: 'save', value: 20 });
});
