import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catchUpFrameIncludesUserFix,
  catchUpPinFromTap,
  catchUpPinSeedsFromUserFix,
  planCancelCatchUp,
  planCatchUpFrame,
  planCatchUpSheet,
} from './catchUpMap';

const tee = { lat: 37.0, lng: -122.0 };
const green = { lat: 37.01, lng: -122.01 };
const pin = { lat: 37.005, lng: -122.005 };
const phone = { lat: 36.5, lng: -121.5 };

test('catch-up map frames tee to green when both exist', () => {
  const frame = planCatchUpFrame({
    tee,
    green,
    shotPins: [pin],
  });
  assert.deepEqual(frame, { mode: 'tee_green', points: [tee, green] });
});

test('missing tee or green frames existing shot pins', () => {
  const noTee = planCatchUpFrame({ tee: null, green, shotPins: [pin] });
  assert.deepEqual(noTee, { mode: 'shots', points: [pin] });
  const noGreen = planCatchUpFrame({ tee, green: null, shotPins: [pin] });
  assert.deepEqual(noGreen, { mode: 'shots', points: [pin] });
});

test('no pins frames the green', () => {
  const frame = planCatchUpFrame({ tee: null, green, shotPins: [] });
  assert.deepEqual(frame, { mode: 'green', points: [green] });
});

test('add-shot catch-up is fullscreen and hides hole buttons; cancel marks nothing', () => {
  assert.deepEqual(planCatchUpSheet(true), {
    map: 'fullscreen',
    holeButtons: 'hidden',
    cancelMarks: 'nothing',
  });
  assert.deepEqual(planCatchUpSheet(false), {
    map: 'fill',
    holeButtons: 'visible',
    cancelMarks: 'nothing',
  });
  const cancel = planCancelCatchUp();
  assert.equal(cancel.from, null);
  assert.equal(cancel.to, null);
  assert.equal(cancel.mode, 'off');
  assert.equal(cancel.clubOpen, false);
  assert.equal(cancel.insertSeq, null);
  assert.equal(cancel.marksShot, false);
  assert.equal(cancel.marksClub, false);
});

test('catch-up pins are taps, not the phone fix', () => {
  const tap = { lat: 37.002, lng: -122.003 };
  assert.deepEqual(catchUpPinFromTap(tap, phone), tap);
  assert.notDeepEqual(catchUpPinFromTap(tap, phone), phone);
  assert.equal(catchUpPinSeedsFromUserFix(), false);
  assert.equal(catchUpFrameIncludesUserFix(), false);
  assert.equal(catchUpPinFromTap({ lat: 0, lng: 0 }, phone), null);
});
