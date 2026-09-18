import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversineYards } from './haversine';
import {
  holeCameraHeading,
  holeCameraIsCameraOnly,
  holeCameraUsesPhoneHeading,
  planHoleCamera,
} from './holeCamera';

const tee = { lat: 37.0, lng: -122.0 };
const greenNorth = { lat: 37.01, lng: -122.0 };
const greenEast = { lat: 37.0, lng: -121.99 };
const greenSouth = { lat: 36.99, lng: -122.0 };
const greenWest = { lat: 37.0, lng: -122.01 };
const pin = { lat: 37.005, lng: -122.005 };

test('tee-to-green north puts the green at the top (heading 0)', () => {
  assert.equal(holeCameraHeading(tee, greenNorth), 0);
});

test('tee-to-green south is 180 — green up, tee at the bottom', () => {
  assert.equal(holeCameraHeading(tee, greenSouth), 180);
});

test('tee-to-green east is around 90, not compass-north and not sideways-unrotated', () => {
  const heading = holeCameraHeading(tee, greenEast);
  assert.ok(heading != null);
  assert.ok(heading > 45 && heading < 135, `expected ~90, got ${heading}`);
});

test('tee-to-green west is around 270', () => {
  const heading = holeCameraHeading(tee, greenWest);
  assert.ok(heading != null);
  assert.ok(heading > 225 && heading < 315, `expected ~270, got ${heading}`);
});

test('bearing is tee-to-green, never the phone heading or compass north by default', () => {
  const phone = { lat: 36.5, lng: -121.5 };
  const holeUp = holeCameraHeading(tee, greenNorth);
  const fromPhone = holeCameraHeading(phone, greenNorth);
  assert.equal(holeUp, 0);
  assert.notEqual(holeUp, fromPhone);
  assert.equal(holeCameraUsesPhoneHeading(), false);
  assert.equal(holeCameraIsCameraOnly(), true);
});

test('missing tee or green means no rotation — do not invent a bearing', () => {
  assert.equal(holeCameraHeading(null, greenNorth), null);
  assert.equal(holeCameraHeading(tee, null), null);
  assert.equal(holeCameraHeading(undefined, greenNorth), null);
  assert.equal(holeCameraHeading(tee, undefined), null);
  assert.equal(holeCameraHeading({ lat: 0, lng: 0 }, greenNorth), null);
  assert.equal(holeCameraHeading(tee, { lat: 0, lng: 0 }), null);
  assert.equal(holeCameraHeading(tee, tee), null);
});

test('sensing lock: camera-only tee-to-green; pins and yards unchanged; missing point does not rotate', () => {
  const teePin = { lat: 37.0, lng: -122.0 };
  const greenPin = { lat: 37.01, lng: -122.0 };
  const shot = { lat: 37.005, lng: -122.005 };
  const phone = { lat: 36.5, lng: -121.5 };
  const yardsBefore = haversineYards(teePin, greenPin);

  assert.equal(holeCameraIsCameraOnly(), true);
  assert.equal(holeCameraUsesPhoneHeading(), false);

  const plan = planHoleCamera({ tee: teePin, green: greenPin, shotPins: [shot, phone] });
  assert.equal(plan?.heading, holeCameraHeading(teePin, greenPin));
  assert.equal(plan?.heading, 0);
  assert.notEqual(plan?.heading, holeCameraHeading(phone, greenPin));
  assert.deepEqual(plan?.points, [teePin, greenPin]);
  assert.equal(teePin.lat, 37.0);
  assert.equal(teePin.lng, -122.0);
  assert.equal(greenPin.lat, 37.01);
  assert.equal(greenPin.lng, -122.0);
  assert.equal(shot.lat, 37.005);
  assert.equal(shot.lng, -122.005);
  assert.equal(haversineYards(teePin, greenPin), yardsBefore);

  assert.equal(planHoleCamera({ tee: null, green: greenPin, shotPins: [shot] })?.heading, null);
  assert.equal(planHoleCamera({ tee: teePin, green: null, shotPins: [shot] })?.heading, null);
});

test('planHoleCamera rotates only on the tee-to-green line', () => {
  const holeUp = planHoleCamera({ tee, green: greenNorth, shotPins: [pin] });
  assert.deepEqual(holeUp, {
    mode: 'tee_green',
    points: [tee, greenNorth],
    heading: 0,
  });

  const noTee = planHoleCamera({ tee: null, green: greenNorth, shotPins: [pin] });
  assert.deepEqual(noTee, { mode: 'shots', points: [pin], heading: null });

  const noGreen = planHoleCamera({ tee, green: null, shotPins: [pin] });
  assert.deepEqual(noGreen, { mode: 'shots', points: [pin], heading: null });

  const greenOnly = planHoleCamera({ tee: null, green: greenNorth, shotPins: [] });
  assert.deepEqual(greenOnly, { mode: 'green', points: [greenNorth], heading: null });
});
