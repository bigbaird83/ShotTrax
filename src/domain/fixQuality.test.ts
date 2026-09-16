import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAccuracyM, qualityFromAccuracy, worstFixQuality } from './fixQuality';

test('accuracy < 15 m is good', () => {
  assert.equal(classifyAccuracyM(0), 'good');
  assert.equal(classifyAccuracyM(14.99), 'good');
});

test('accuracy 15–25 m inclusive is soft', () => {
  assert.equal(classifyAccuracyM(15), 'soft');
  assert.equal(classifyAccuracyM(20), 'soft');
  assert.equal(classifyAccuracyM(25), 'soft');
});

test('accuracy > 25 m or unknown is poor', () => {
  assert.equal(classifyAccuracyM(25.01), 'poor');
  assert.equal(classifyAccuracyM(40), 'poor');
  assert.equal(classifyAccuracyM(null), 'poor');
  assert.equal(classifyAccuracyM(undefined), 'poor');
});

test('qualityFromAccuracy maps poor or forced to forced', () => {
  assert.equal(qualityFromAccuracy(8, false), 'good');
  assert.equal(qualityFromAccuracy(18, false), 'soft');
  assert.equal(qualityFromAccuracy(40, false), 'forced');
  assert.equal(qualityFromAccuracy(8, true), 'forced');
});

test('worstFixQuality prefers forced over soft over good', () => {
  assert.equal(worstFixQuality('good', 'soft'), 'soft');
  assert.equal(worstFixQuality('soft', 'forced'), 'forced');
  assert.equal(worstFixQuality('good', 'forced'), 'forced');
});
