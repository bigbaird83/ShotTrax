import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatWatchStatusLine } from './watchStatus';

test('Watch status is Hole N · XXX yd when quality is live', () => {
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 3, yardsToGreen: 164, yardsQuality: 'good' }), {
    line: 'Hole 3 · 164 yd',
    soft: false,
  });
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 3, yardsToGreen: 150, yardsQuality: 'soft' }), {
    line: 'Hole 3 · 150 yd',
    soft: true,
  });
});

test('Watch status uses an em dash when quality is none', () => {
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 1, yardsToGreen: null, yardsQuality: 'none' }), {
    line: 'Hole 1 · —',
    soft: false,
  });
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 1, yardsToGreen: 90, yardsQuality: 'none' }), {
    line: 'Hole 1 · —',
    soft: false,
  });
});
