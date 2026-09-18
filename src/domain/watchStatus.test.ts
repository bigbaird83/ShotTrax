import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatWatchStatusLine } from './watchStatus';

test('Watch status is Hole N · XXX yd when quality is live', () => {
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 3, yardsToGreen: 164, yardsQuality: 'good' }), {
    line: 'Hole 3 · 164 yd',
    soft: false,
    chip: null,
  });
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 3, yardsToGreen: 150, yardsQuality: 'soft' }), {
    line: 'Hole 3 · 150 yd',
    soft: true,
    chip: 'Approximate',
  });
});

test('Watch soft quality uses Approximate, never SOFT', () => {
  const row = formatWatchStatusLine({ holeNumber: 7, yardsToGreen: 142, yardsQuality: 'soft' });
  assert.equal(row.chip, 'Approximate');
  assert.doesNotMatch(row.chip ?? '', /SOFT/i);
  assert.doesNotMatch(row.line, /SOFT/i);
});

test('Watch status hides yards-to-green over 400', () => {
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 1, yardsToGreen: 14167, yardsQuality: 'good' }), {
    line: 'Hole 1 · —',
    soft: false,
    chip: null,
  });
  assert.equal(formatWatchStatusLine({ holeNumber: 1, yardsToGreen: 400, yardsQuality: 'good' }).line, 'Hole 1 · 400 yd');
});

test('Watch status uses an em dash when quality is none', () => {
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 1, yardsToGreen: null, yardsQuality: 'none' }), {
    line: 'Hole 1 · —',
    soft: false,
    chip: null,
  });
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 1, yardsToGreen: 90, yardsQuality: 'none' }), {
    line: 'Hole 1 · —',
    soft: false,
    chip: null,
  });
});
