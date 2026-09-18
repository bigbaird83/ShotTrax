import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clubStripOpeningIds, planClubStrip, WATCH_WHEEL_PILL_HEIGHT } from './clubStrip';
import {
  addShotFramePoints,
  addShotMapUsesPhoneFix,
  addShotMapWaitsForPhoneFix,
  courseTeeFromHole,
  holeCameraHeading,
  lockFramePointsNeedTeeAndGreen,
  lockHoleCamera,
  resolvePlayHoleTee,
} from './holeCamera';
import { showWaitingOnLocationLine } from './playerCopy';
import {
  WATCH_BACK_HOME_MIN_HEIGHT,
  WATCH_CONTROL_RATIO,
  WATCH_MAP_RATIO,
  WATCH_UNDER_WHEEL_MIN_HEIGHT,
  watchControlBandIsAboutFortyPercent,
  watchLayoutAddsToOne,
  watchMapAreaIsAboutSixtyPercent,
} from './watchLayout';
import { planWatchClubStrip } from './watchClubPick';

test('282 opening window includes Dr; Watch control band is ~40%; round start frames tee+green with no phone fix', () => {
  assert.equal(watchControlBandIsAboutFortyPercent(), true);
  assert.equal(watchMapAreaIsAboutSixtyPercent(), true);
  assert.equal(watchLayoutAddsToOne(), true);
  assert.equal(WATCH_MAP_RATIO, 0.6);
  assert.equal(WATCH_CONTROL_RATIO, 0.4);
  assert.equal(WATCH_BACK_HOME_MIN_HEIGHT, 44);
  assert.equal(WATCH_UNDER_WHEEL_MIN_HEIGHT, 40);
  assert.equal(WATCH_WHEEL_PILL_HEIGHT, 44);

  const bag = [
    { id: 'club_driver', carry: 280 },
    { id: 'club_3w', carry: 261 },
    { id: 'club_2i', carry: 243 },
    { id: 'club_pw', carry: 130 },
    { id: 'club_gw', carry: 110 },
  ];
  const phone = planClubStrip({ clubs: bag, yardsLeft: 282 });
  const watch = planWatchClubStrip({
    bag: bag.map((club) => club.id),
    labels: {
      club_driver: 'Dr · 280',
      club_3w: '3W · 261',
      club_2i: '2i · 243',
      club_pw: 'PW · 130',
      club_gw: 'GW · 110',
    },
    holeYards: 282,
  });
  assert.equal(phone.pickId, 'club_driver');
  assert.equal(watch.pickId, 'club_driver');
  assert.deepEqual(clubStripOpeningIds(phone.ids, phone.windowStart), [
    'club_2i',
    'club_3w',
    'club_driver',
  ]);
  assert.deepEqual(clubStripOpeningIds(watch.ids, watch.windowStart), [
    'club_2i',
    'club_3w',
    'club_driver',
  ]);
  assert.equal(phone.windowStart, watch.windowStart);
  assert.ok(clubStripOpeningIds(phone.ids, phone.windowStart).includes('club_driver'));
  assert.ok(!clubStripOpeningIds(phone.ids, phone.windowStart).includes('club_pw'));

  const tee = { lat: 34.11, lng: -85.64 };
  const green = { lat: 34.1124, lng: -85.64 };
  const home = { lat: 40.7128, lng: -74.006 };
  assert.equal(addShotMapWaitsForPhoneFix(), false);
  assert.equal(addShotMapUsesPhoneFix(), false);
  assert.equal(lockFramePointsNeedTeeAndGreen(), true);
  assert.deepEqual(addShotFramePoints({ tee, green, phone: home }), [tee, green]);
  assert.deepEqual(addShotFramePoints({ tee, green, phone: null }), [tee, green]);
  const fromHome = lockHoleCamera({ tee, green, shotPins: [], phone: home });
  const noFix = lockHoleCamera({ tee, green, shotPins: [], phone: null });
  assert.ok(fromHome);
  assert.ok(noFix);
  assert.equal(fromHome.mode, 'tee_green');
  assert.deepEqual(fromHome.center, noFix.center);
  assert.equal(fromHome.heading, holeCameraHeading(tee, green));
  assert.notEqual(fromHome.heading, holeCameraHeading(home, green));
  assert.deepEqual(courseTeeFromHole({ teeLat: tee.lat, teeLng: tee.lng }), tee);
  assert.equal(courseTeeFromHole({ teeLat: null, teeLng: null }), null);
  assert.deepEqual(resolvePlayHoleTee({ courseTee: tee, overlayTee: null, cachedTee: null, green }), tee);
  assert.equal(
    showWaitingOnLocationLine({ yards: 282, quality: 'good', hasFix: false, hasGreen: true }),
    false,
  );

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watchUi, /geo\.size\.height \* 0\.6/);
  assert.match(watchUi, /geo\.size\.height \* 0\.4/);
  assert.match(watchUi, /minHeight: 44/);
  assert.match(watchUi, /minHeight: 40/);
  assert.match(watchUi, /height: 44/);
  assert.match(watchUi, /stripWindowStart/);
  assert.match(watchUi, /max\(n - 3, 0\)/);
  assert.match(watchUi, /stripWindowStart/);
  assert.doesNotMatch(watchUi, /max\(44\.0,/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /courseTeeFromHole/);
  assert.match(hole, /resolvePlayHoleTee/);
  assert.match(hole, /saveHoleTee/);
  assert.match(hole, /phone: null/);
  assert.match(hole, /addShotFramePoints/);
  assert.doesNotMatch(hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate')), /getCurrentFix/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /A lone green is the house/);
  assert.doesNotMatch(map.slice(map.indexOf('const lockedPoints'), map.indexOf('const holeUpCamera')), /return \[green\]/);
  assert.match(map, /lockFrame && !holeCameraReady \? \(/);
  assert.match(map, /showWaitingOnLocationLine/);
  assert.match(map, /!yardsOnCard/);

  const homeSrc = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(homeSrc, /fillLayoutTeesFromOsm/);
});
