import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversineYards } from './haversine';
import {
  addShotPlaceHintShowsAsFooter,
  addShotPlaceHintShowsOnMap,
  applyHoleMapCamera,
  holeCameraFramedAfterApply,
  holeCameraHeading,
  holeCameraIncludesPhoneFix,
  holeCameraIsCameraOnly,
  holeCameraLeavesAloneAfterOpen,
  holeCameraReframesOnGps,
  holeCameraReframesOnPinDrag,
  holeCameraTeeBelowGreenOnScreen,
  holeCameraUsesDeviceHeading,
  holeCameraUsesPhoneHeading,
  holeFrameRegion,
  holeCameraNullRefIsFramed,
  holeMapFitsToCoordinates,
  holeMapRevealsBeforeHoleFrame,
  holeMapShowsUserLocation,
  holeNativeCamera,
  keepLastGoodHoleCamera,
  keepLastGoodHoleFrameWhenGreenMissing,
  lockFrameRegionIncludesPhone,
  lockHoleCamera,
  missingGreenCentersOnPhone,
  nerdOutTrailUsesLockFrame,
  openingCameraRequiresTeeAndGreen,
  openingHoleRegionContainsTeeAndGreen,
  planHoleCamera,
  regionIsHoleFrame,
  resolveHoleTee,
  shotPinsForHoleCamera,
  editShotMapUsesLockFrame,
  everyHoleMapUsesLockFrame,
  holeMapInventPhonePoint,
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
  const deviceHeading = 274;
  assert.equal(holeUp, 0);
  assert.notEqual(holeUp, fromPhone);
  assert.notEqual(holeUp, deviceHeading);
  assert.equal(holeCameraUsesPhoneHeading(), false);
  assert.equal(holeCameraUsesDeviceHeading(), false);
  assert.equal(holeCameraIsCameraOnly(), true);
  const east = planHoleCamera({ tee, green: greenEast, shotPins: [] });
  assert.equal(east?.heading, holeCameraHeading(tee, greenEast));
  assert.notEqual(east?.heading, deviceHeading);
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

test('home-scale phone does not change camera center, span, or heading when tee and green exist', () => {
  const home = { lat: 40.7128, lng: -74.006 }; // NYC — miles from the CA hole
  const onCourse = { lat: 37.004, lng: -122.001 };
  const base = lockHoleCamera({ tee, green: greenNorth, shotPins: [pin] });
  const fromHome = lockHoleCamera({ tee, green: greenNorth, shotPins: [pin], phone: home });
  const fromFairway = lockHoleCamera({
    tee,
    green: greenNorth,
    shotPins: [pin],
    phone: onCourse,
  });

  assert.ok(base);
  assert.deepEqual(fromHome?.center, base?.center);
  assert.equal(fromHome?.spanYards, base?.spanYards);
  assert.equal(fromHome?.heading, base?.heading);
  assert.deepEqual(fromFairway?.center, base?.center);
  assert.equal(fromFairway?.spanYards, base?.spanYards);
  assert.equal(fromFairway?.heading, base?.heading);

  assert.ok(base);
  assert.ok(Math.abs(base.center.lat - (tee.lat + greenNorth.lat) / 2) < 1e-12);
  assert.equal(base.center.lng, tee.lng);
  assert.equal(base?.heading, 0);
  assert.ok((base?.spanYards ?? 0) > 1000);
  assert.deepEqual(base?.points, [tee, greenNorth]);
  assert.equal(
    base?.points.some((point) => point.lat === home.lat && point.lng === home.lng),
    false,
  );
  assert.notEqual(fromHome?.heading, holeCameraHeading(home, greenNorth));
  assert.notEqual(fromHome?.center.lat, home.lat);
  assert.notEqual(fromHome?.center.lng, home.lng);
  assert.equal(holeCameraIncludesPhoneFix(), false);

  const homeRegion = holeFrameRegion(fromHome?.points ?? []);
  const baseRegion = holeFrameRegion(base?.points ?? []);
  assert.deepEqual(homeRegion, baseRegion);
  assert.ok(homeRegion);
  assert.notEqual(homeRegion?.latitude, home.lat);
  assert.notEqual(homeRegion?.longitude, home.lng);
});

test('missing tee or green does not invent a camera point from the phone', () => {
  const home = { lat: 40.7128, lng: -74.006 };
  const greenOnly = lockHoleCamera({
    tee: null,
    green: greenNorth,
    shotPins: [],
    phone: home,
  });
  assert.equal(greenOnly, null);
  assert.equal(openingCameraRequiresTeeAndGreen(), true);

  assert.equal(
    lockHoleCamera({ tee: null, green: null, shotPins: [], phone: home }),
    null,
  );
});

test('null map ref does not stick framed; home GPS stays out; hole tee still frames', () => {
  const home = { lat: 40.7128, lng: -74.006 };
  const holeTee = { lat: 37.0, lng: -122.0 };
  const osmTee = null;
  const tee = resolveHoleTee({ holeTee, osmTee });
  assert.deepEqual(tee, holeTee);

  const locked = lockHoleCamera({
    tee,
    green: greenNorth,
    shotPins: [],
    phone: home,
  });
  assert.ok(locked);
  assert.equal(locked.mode, 'tee_green');
  assert.deepEqual(locked.points, [holeTee, greenNorth]);
  assert.equal(locked.heading, 0);
  assert.notEqual(locked.center.lat, home.lat);
  assert.notEqual(locked.center.lng, home.lng);
  assert.equal(locked.spanYards, lockHoleCamera({ tee: holeTee, green: greenNorth, shotPins: [] })?.spanYards);
  assert.equal(locked.heading, lockHoleCamera({ tee: holeTee, green: greenNorth, shotPins: [] })?.heading);
  assert.deepEqual(locked.center, lockHoleCamera({ tee: holeTee, green: greenNorth, shotPins: [] })?.center);

  const camera = holeNativeCamera(locked.points, locked.heading ?? 0);
  const region = holeFrameRegion(locked.points);
  assert.ok(camera);
  assert.ok(region);

  let framed = holeCameraFramedAfterApply(applyHoleMapCamera(null, camera, region));
  assert.equal(framed, false);

  let appliedCamera: unknown = null;
  let appliedRegion: unknown = null;
  const live = {
    setCamera(next: typeof camera) {
      appliedCamera = next;
    },
    animateToRegion(next: typeof region) {
      appliedRegion = next;
    },
  };
  framed = holeCameraFramedAfterApply(applyHoleMapCamera(live, camera, region));
  assert.equal(framed, true);
  assert.deepEqual(appliedCamera, camera);
  assert.equal(appliedRegion, null);
  assert.notEqual((appliedCamera as { center: { latitude: number } }).center.latitude, home.lat);

  assert.equal(regionIsHoleFrame({ latitude: home.lat, longitude: home.lng }, locked.center), false);
  assert.equal(
    regionIsHoleFrame({ latitude: locked.center.lat, longitude: locked.center.lng }, locked.center),
    true,
  );
  assert.equal(resolveHoleTee({ holeTee: null, osmTee: null }), null);
  const nearGreen = { lat: 37.0098, lng: -122.0 };
  const farTee = { lat: 36.995, lng: -122.0 };
  assert.deepEqual(resolveHoleTee({ holeTee: nearGreen, osmTee: farTee, green: greenNorth }), farTee);
  assert.equal(holeMapRevealsBeforeHoleFrame(), false);
  assert.equal(holeMapShowsUserLocation(true), false);
  assert.equal(holeMapFitsToCoordinates(true), false);
  assert.equal(lockFrameRegionIncludesPhone(), false);
  assert.equal(holeCameraNullRefIsFramed(), false);
  assert.equal(everyHoleMapUsesLockFrame(), true);
  assert.equal(editShotMapUsesLockFrame(), true);
  assert.equal(nerdOutTrailUsesLockFrame(), true);
  assert.equal(holeMapInventPhonePoint(), false);
  assert.deepEqual(
    shotPinsForHoleCamera([
      { startLat: tee.lat, startLng: tee.lng, endLat: greenNorth.lat, endLng: greenNorth.lng },
    ]),
    [tee, greenNorth],
  );
});

test('opening region contains tee and green; heading is tee-to-green, not device heading', () => {
  const deviceHeading = 274;
  const home = { lat: 40.7128, lng: -74.006 };
  const locked = lockHoleCamera({ tee, green: greenEast, shotPins: [], phone: home });
  assert.ok(locked);
  assert.equal(locked.mode, 'tee_green');
  assert.equal(locked.heading, holeCameraHeading(tee, greenEast));
  assert.notEqual(locked.heading, deviceHeading);
  assert.notEqual(locked.heading, holeCameraHeading(home, greenEast));
  assert.equal(holeCameraUsesDeviceHeading(), false);
  assert.equal(openingCameraRequiresTeeAndGreen(), true);
  const region = holeFrameRegion(locked.points);
  assert.equal(openingHoleRegionContainsTeeAndGreen(region, tee, greenEast), true);
  assert.equal(openingHoleRegionContainsTeeAndGreen(region, home, greenEast), false);
  assert.notEqual(locked.center.lat, home.lat);
  assert.equal(addShotPlaceHintShowsOnMap(), true);
  assert.equal(addShotPlaceHintShowsAsFooter(), false);
});

test('opening camera puts tee below green and fits both, not sideways', () => {
  assert.equal(holeCameraLeavesAloneAfterOpen(), true);
  assert.equal(holeCameraReframesOnGps(), false);
  assert.equal(holeCameraReframesOnPinDrag(), false);
  assert.equal(openingCameraRequiresTeeAndGreen(), true);

  for (const green of [greenNorth, greenSouth, greenEast, greenWest]) {
    const locked = lockHoleCamera({ tee, green, shotPins: [] });
    assert.ok(locked);
    assert.equal(locked.mode, 'tee_green');
    assert.equal(locked.heading, holeCameraHeading(tee, green));
    assert.equal(holeCameraTeeBelowGreenOnScreen(tee, green, locked.heading), true);
    const region = holeFrameRegion(locked.points);
    assert.equal(openingHoleRegionContainsTeeAndGreen(region, tee, green), true);
    const sideways = locked.heading != null && (locked.heading === 90 || locked.heading === 270);
    if (sideways) {
      assert.equal(holeCameraTeeBelowGreenOnScreen(tee, green, 0), false);
    }
  }
});

test('missing green keeps the last hole frame and never centers on the phone', () => {
  const home = { lat: 40.7128, lng: -74.006 };
  const good = lockHoleCamera({ tee, green: greenNorth, shotPins: [], phone: home });
  assert.ok(good);
  assert.equal(good.mode, 'tee_green');

  const missing = lockHoleCamera({
    tee,
    green: null,
    shotPins: [],
    phone: home,
    previous: good,
  });
  assert.equal(missing?.mode, 'tee_green');
  assert.deepEqual(missing?.points, [tee, greenNorth]);
  assert.equal(missing?.heading, 0);
  assert.notEqual(missing?.center.lat, home.lat);
  assert.notEqual(missing?.center.lng, home.lng);
  assert.equal(missingGreenCentersOnPhone(), false);
  assert.equal(keepLastGoodHoleFrameWhenGreenMissing(), true);

  assert.equal(lockHoleCamera({ tee, green: null, shotPins: [], phone: home }), null);
  assert.deepEqual(keepLastGoodHoleCamera(null, good), good);
  assert.equal(keepLastGoodHoleCamera(null, null), null);
});
