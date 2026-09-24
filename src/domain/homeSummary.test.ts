import assert from 'node:assert/strict';
import { test } from 'node:test';
import { greetingForHour, summarizeHomeRound, toParTone } from './homeSummary';

test('home greeting follows the clock', () => {
  assert.equal(greetingForHour(6), 'Good morning');
  assert.equal(greetingForHour(12), 'Good afternoon');
  assert.equal(greetingForHour(17), 'Good evening');
});

test('live card counts posted scores and skips par-less holes for ± par', () => {
  const summary = summarizeHomeRound([
    { number: 1, par: 4, score: 5, putts: 2 },
    { number: 2, par: 3, score: 3, putts: 1 },
    { number: 3, par: null, score: 6, putts: 3 },
    { number: 4, par: 5, score: null, putts: 0 },
  ]);
  assert.equal(summary.thru, 3);
  assert.equal(summary.toPar, 1);
  assert.equal(summary.toParLabel, '+1');
  assert.equal(summary.putts, 6);
  assert.equal(summary.currentHole, 4);
});

test('empty and finished cards never invent ± par', () => {
  const empty = summarizeHomeRound([]);
  assert.equal(empty.toPar, null);
  assert.equal(empty.toParLabel, null);
  assert.equal(empty.currentHole, null);
  const noPar = summarizeHomeRound([{ number: 1, par: null, score: 4, putts: 2 }]);
  assert.equal(noPar.toPar, null);
  assert.equal(noPar.currentHole, 1);
});

test('history badge tone', () => {
  assert.equal(toParTone(null), 'none');
  assert.equal(toParTone(-1), 'good');
  assert.equal(toParTone(2), 'good');
  assert.equal(toParTone(4), 'warn');
  assert.equal(toParTone(9), 'bad');
});
