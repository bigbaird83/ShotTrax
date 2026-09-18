import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { haversineYards } from './haversine';
import {
  HOME_CLUB_TAP_MAX_YD,
  homeClubTapMaxYards,
  homeClubTapPaths,
  homeClubTapRunsAcceptFix,
  homeClubTapUsesHouseStart,
  homeClubTapUsesShotSaveGate,
  phoneIsHomeFromTee,
  placedStartRunsAccuracyGates,
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

test('Watch pick is chosen first, then measured to the tee; home Watch starts at the tee', () => {
  const homeFix: GpsFix = {
    lat: home.lat,
    lng: home.lng,
    accuracyM: 6,
    mocked: false,
    isSimulator: false,
    timestamp: 1_000_000,
  };
  const chosen = preferWatchFix({
    watchFix: homeFix,
    phoneFix: homeFix,
    nowMs: 1_001_000,
  });
  assert.ok(chosen.fix);
  const tap = planClubTapStart({
    phone: chosen.fix ? { lat: chosen.fix.lat, lng: chosen.fix.lng } : null,
    tee,
  });
  assert.equal(tap?.kind, 'tee');
  assert.equal(tap?.source, 'placed');
  assert.equal(tap?.runsAcceptFix, false);
  assert.deepEqual(tap?.start, tee);
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
  assert.deepEqual([...homeClubTapPaths()], ['suggested', 'same_club', 'say_club', 'watch']);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /tee: holeTee/);
  assert.match(hole, /markShotWithClub/);
  assert.match(hole, /void markClub\(full\)/);
  assert.match(hole, /void markClub\(matched\)/);
  assert.match(hole, /onMark/);
  assert.match(hole, /COPY\.sayClub/);
  const say = hole.slice(hole.indexOf('const applyTranscript'), hole.indexOf('const startListening'));
  assert.match(say, /markClub\(matched\)/);
  const watch = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(watch, /tee: ctx\.tee/);
  assert.match(watch, /markShotWithClub/);
  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const markFn = actions.slice(actions.indexOf('export async function markShotWithClub'));
  assert.match(markFn, /resolveMarkFix/);
  assert.match(markFn, /planClubTapStart/);
  assert.ok(markFn.indexOf('resolveMarkFix') < markFn.indexOf('planClubTapStart'));
  assert.match(markFn, /homeClubTapRunsAcceptFix/);
  assert.match(markFn, /source: 'placed'/);
  assert.match(markFn, /tap\?\.kind === 'blocked'/);
  const homeBlock = markFn.slice(markFn.indexOf("tap?.kind === 'tee'"), markFn.indexOf('const plan = decide'));
  assert.doesNotMatch(homeBlock, /acceptFix\(/);
  assert.doesNotMatch(homeBlock, /decide\(/);
});
