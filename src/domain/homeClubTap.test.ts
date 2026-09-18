import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { haversineYards } from './haversine';
import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import {
  HOME_CLUB_TAP_MAX_YD,
  clubTapMeasuresChosenFix,
  clubTapSkipsOnCourseAccuracyGates,
  homeClubTapMaxYards,
  homeClubTapPaths,
  homeClubTapRunsAcceptFix,
  homeClubTapUsesHouseStart,
  homeClubTapUsesShotSaveGate,
  phoneIsHomeFromTee,
  placedStartRunsAccuracyGates,
  planClubTapAfterChosenFix,
  planClubTapStart,
} from './homeClubTap';
import { preferWatchFix } from './preferWatchFix';
import type { GpsFix } from './types';

const tee = { lat: 37.0, lng: -122.0 };
const onCourse = { lat: 37.0 + (80 * 0.9144) / 111_320, lng: -122.0 };
const home = { lat: 40.7128, lng: -74.006 };

test('home-scale phone starts the shot at the tee, not the house', () => {
  assert.equal(homeClubTapMaxYards(), 600);
  assert.equal(HOME_CLUB_TAP_MAX_YD, 600);
  assert.equal(homeClubTapUsesShotSaveGate(), false);
  assert.notEqual(HOME_CLUB_TAP_MAX_YD, MAX_SHOT_YD);
  assert.ok(haversineYards(home, tee) > 600);
  assert.equal(phoneIsHomeFromTee(home, tee), true);
  assert.equal(homeClubTapRunsAcceptFix(), false);
  assert.equal(placedStartRunsAccuracyGates(), false);
  assert.equal(homeClubTapUsesHouseStart(), false);

  const start = planClubTapStart({ phone: home, tee });
  assert.deepEqual(start, { kind: 'tee', start: tee, source: 'placed', runsAcceptFix: false });
  assert.notEqual(start?.start.lat, home.lat);
  assert.notEqual(start?.start.lng, home.lng);
});

test('on-course phone within 600 yards of the tee still uses the phone', () => {
  assert.ok(haversineYards(onCourse, tee) < 600);
  assert.equal(phoneIsHomeFromTee(onCourse, tee), false);
  const start = planClubTapStart({ phone: onCourse, tee });
  assert.deepEqual(start, { kind: 'phone', start: onCourse, source: 'gps', runsAcceptFix: true });
  assert.equal(start?.start.lat, onCourse.lat);
  assert.equal(start?.start.lng, onCourse.lng);
});

test('a 500-yard-from-tee fix still uses the phone', () => {
  assert.equal(homeClubTapUsesShotSaveGate(), false);
  assert.notEqual(HOME_CLUB_TAP_MAX_YD, MAX_SHOT_YD);
  const fiveHundred = { lat: 37.0 + (500 * 0.9144) / 111_320, lng: -122.0 };
  const yards = haversineYards(fiveHundred, tee);
  assert.ok(yards > MAX_SHOT_YD);
  assert.ok(yards < HOME_CLUB_TAP_MAX_YD);
  const start = planClubTapStart({ phone: fiveHundred, tee });
  assert.equal(start?.kind, 'phone');
  assert.equal(start?.source, 'gps');
  assert.equal(start?.runsAcceptFix, true);
  assert.deepEqual(start?.start, fiveHundred);
});

test('a Watch pick that shares the phone home location starts at the tee', () => {
  assert.equal(clubTapMeasuresChosenFix(), true);
  const phoneHome: GpsFix = {
    lat: home.lat,
    lng: home.lng,
    accuracyM: 8,
    mocked: false,
    isSimulator: false,
    timestamp: 1_000_000,
  };
  const watchHome: GpsFix = {
    ...phoneHome,
    accuracyM: 6,
  };
  const chosen = preferWatchFix({
    watchFix: watchHome,
    phoneFix: phoneHome,
    nowMs: 1_001_000,
  });
  assert.equal(chosen.usedWatch, true);
  assert.equal(chosen.fix?.lat, home.lat);
  assert.equal(chosen.fix?.lng, home.lng);
  const tap = planClubTapAfterChosenFix({
    chosenFix: chosen.fix ? { lat: chosen.fix.lat, lng: chosen.fix.lng } : null,
    tee,
  });
  assert.equal(tap?.kind, 'tee');
  assert.equal(tap?.source, 'placed');
  assert.equal(tap?.runsAcceptFix, false);
  assert.equal(placedStartRunsAccuracyGates(), false);
  assert.deepEqual(tap && 'start' in tap ? tap.start : null, tee);
  assert.notEqual(tap && 'start' in tap ? tap.start.lat : null, home.lat);
});

test('on-course chosen fix still runs 15 m good and 25 m soft gates', () => {
  assert.equal(clubTapSkipsOnCourseAccuracyGates(), false);
  assert.equal(SOFT_GPS_MIN_M, 15);
  assert.equal(SOFT_GPS_MAX_M, 25);
  const tap = planClubTapAfterChosenFix({ chosenFix: onCourse, tee });
  assert.equal(tap?.kind, 'phone');
  assert.equal(tap?.runsAcceptFix, true);
  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const markFn = actions.slice(actions.indexOf('export async function markShotWithClub'));
  assert.ok(markFn.indexOf('preferWatchFix') < 0 || markFn.indexOf('resolveMarkFix') < markFn.indexOf('planClubTapStart'));
  assert.match(markFn, /const plan = decide\(/);
  const afterTee = markFn.slice(markFn.indexOf('const plan = decide'));
  assert.match(afterTee, /decide\(/);
});

test('missing tee does not invent a point or save the house', () => {
  assert.equal(phoneIsHomeFromTee(home, null), false);
  assert.equal(planClubTapStart({ phone: null, tee }), null);
  const blocked = planClubTapStart({ phone: home, tee: null, holePin: tee });
  assert.deepEqual(blocked, { kind: 'blocked' });
  assert.notEqual(blocked && 'start' in blocked ? blocked.start : null, home);
  const noPin = planClubTapStart({ phone: home, tee: null });
  assert.deepEqual(noPin, { kind: 'phone', start: home, source: 'gps', runsAcceptFix: true });
});

test('suggested, Same club, Say a club, and Watch picks all use the 600-yard tee rule', () => {
  assert.deepEqual(
    [...homeClubTapPaths()],
    ['suggested', 'phone_strip', 'same_club', 'say_club', 'watch', 'watch_bag'],
  );
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /tee: holeTee/);
  assert.match(hole, /markShotWithClub/);
  assert.match(hole, /void markClub\(full\)/);
  assert.match(hole, /void markClub\(matched\)/);
  assert.match(hole, /<ClubStrip/);
  assert.match(hole, /onMark/);
  assert.match(hole, /COPY\.sayClub/);
  const strip = hole.slice(hole.indexOf('<ClubStrip'), hole.indexOf('COPY.allClubs'));
  assert.match(strip, /void markClub\(full\)/);
  const mark = hole.slice(hole.indexOf('const markClub'), hole.indexOf('const onMark'));
  assert.match(mark, /markShotWithClub/);
  assert.match(mark, /tee: holeTee/);
  const say = hole.slice(hole.indexOf('const applyTranscript'), hole.indexOf('const startListening'));
  assert.match(say, /markClub\(matched\)/);
  const watch = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(watch, /tee: ctx\.tee/);
  assert.match(watch, /markShotWithClub/);
  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const markFn = actions.slice(actions.indexOf('export async function markShotWithClub'));
  assert.match(markFn, /resolveMarkFix/);
  assert.match(markFn, /planClubTapAfterChosenFix/);
  assert.ok(markFn.indexOf('resolveMarkFix') < markFn.indexOf('planClubTapAfterChosenFix'));
  assert.match(markFn, /homeClubTapRunsAcceptFix/);
  assert.match(markFn, /source: 'placed'/);
  assert.match(markFn, /tap\?\.kind === 'blocked'/);
  const homeBlock = markFn.slice(markFn.indexOf("tap?.kind === 'tee'"), markFn.indexOf('const plan = decide'));
  assert.doesNotMatch(homeBlock, /acceptFix\(/);
  assert.doesNotMatch(homeBlock, /decide\(/);
});
