import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { shotPinsForHoleCamera } from './holeCamera';
import { shotReviewEnteredPuttCount, shotReviewPuttSummaryLine } from './shotReviewPutts';

test('shot review putt count is 0, 1, or several, and null when the hole has no putt data', () => {
  assert.equal(shotReviewEnteredPuttCount({ putts: 0 }), 0);
  assert.equal(shotReviewEnteredPuttCount({ putts: 1 }), 1);
  assert.equal(shotReviewEnteredPuttCount({ putts: 2 }), 2);
  assert.equal(shotReviewEnteredPuttCount({ putts: 5 }), 5);

  assert.equal(shotReviewEnteredPuttCount(null), null);
  assert.equal(shotReviewEnteredPuttCount(undefined), null);
  assert.equal(shotReviewEnteredPuttCount({}), null);
  assert.equal(shotReviewEnteredPuttCount({ putts: null }), null);
  assert.equal(shotReviewEnteredPuttCount({ putts: undefined }), null);
  assert.equal(shotReviewEnteredPuttCount({ putts: Number.NaN }), null);
});

test('shot review putt line is a single + N putts sentence and is absent without entered putts', () => {
  assert.equal(shotReviewPuttSummaryLine({ putts: 0 }), null);
  assert.equal(shotReviewPuttSummaryLine({ putts: 0, puttsDone: true }), null);
  assert.equal(shotReviewPuttSummaryLine({ putts: 1 }), '+ 1 putt');
  assert.equal(shotReviewPuttSummaryLine({ putts: 1, puttsDone: true }), '+ 1 putt');
  assert.equal(shotReviewPuttSummaryLine({ putts: 2, puttsDone: true }), '+ 2 putts');
  assert.equal(shotReviewPuttSummaryLine({ putts: 4 }), '+ 4 putts');

  assert.equal(shotReviewPuttSummaryLine(null), null);
  assert.equal(shotReviewPuttSummaryLine(undefined), null);
  assert.equal(shotReviewPuttSummaryLine({}), null);
  assert.equal(shotReviewPuttSummaryLine({ putts: null }), null);
  // Draft count before Made it is not entered yet.
  assert.equal(shotReviewPuttSummaryLine({ putts: 2, puttsDone: false }), null);
});

test('shot review putt line adds no shot pins', () => {
  const shots = [
    { startLat: 37, startLng: -122, endLat: 37.002, endLng: -122 },
    { startLat: 37.002, startLng: -122, endLat: 37.004, endLng: -122 },
  ];
  const before = shotPinsForHoleCamera(shots);
  const hole = { putts: 2, puttsDone: true, puttLengths: ['3_to_10', 'inside_3'] };
  const line = shotReviewPuttSummaryLine(hole);
  assert.equal(line, '+ 2 putts');
  assert.equal(shotReviewEnteredPuttCount(hole), 2);
  assert.deepEqual(shotPinsForHoleCamera(shots), before);
  assert.equal(before.length, 4);
  assert.doesNotMatch(line ?? '', /lat|lng|yd/i);
});

test('shot review screen puts the putt line in the scrolling list and keeps it off the map', () => {
  const src = readFileSync(new URL('../../app/review/[id]/shots.tsx', import.meta.url), 'utf8');
  const list = src.slice(src.indexOf('function ReviewShotList'), src.indexOf('function makeStyles'));
  assert.match(src, /shotReviewPuttSummaryLine\(hole\)/);
  assert.match(list, /puttLine/);
  assert.ok(list.indexOf('shots.map') < list.indexOf('shot-review-putts'));
  assert.match(list, /<ScrollView/);
  assert.match(src, /shots=\{shots\}/);
  assert.doesNotMatch(src, /shotPinsForHoleCamera\([^)]*putt/i);
  assert.doesNotMatch(src, /<HoleMap[^>]*putt/is);
  assert.doesNotMatch(src, /#[0-9A-Fa-f]{3,8}/);
});
