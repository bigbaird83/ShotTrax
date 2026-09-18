import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { PLACED_SHOT_USES_ACCEPT_FIX } from '../sensing/assists';
import { PUTTER_CLUB_ID } from './defaultBag';
import { haversineYards, roundYards } from './haversine';
import {
  confirmPlacedShot,
  includeInDistanceAverages,
  includeInTop3Samples,
  placedShotRunsAcceptFix,
  planPlacedShot,
} from './shotSource';

function actionsSource(): string {
  return readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
}

function sliceFn(src: string, start: string, end: string): string {
  const from = src.indexOf(start);
  const to = src.indexOf(end, from + 1);
  assert.ok(from >= 0 && to > from, `missing ${start}`);
  return src.slice(from, to);
}

test('Signal Lab: Placed shots never go through acceptFix and have no soft/good quality', () => {
  assert.equal(PLACED_SHOT_USES_ACCEPT_FIX, false);
  assert.equal(placedShotRunsAcceptFix(), false);

  const from = { lat: 37.0, lng: -122.0 };
  const to = { lat: 37.0 + 150 / 111_320, lng: -122.0 };
  const plan = planPlacedShot(from, to);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.source, 'placed');
  assert.equal(plan.fixQuality, null);
  assert.equal(plan.startFixQuality, null);
  assert.equal(plan.endFixQuality, null);
  assert.equal(plan.startAccuracyM, null);
  assert.equal(plan.endAccuracyM, null);
  assert.equal(plan.typedYards, null);
  assert.equal(plan.distanceYards, roundYards(haversineYards(from, to)));
  assert.equal(includeInDistanceAverages(plan), true);
  assert.equal(includeInTop3Samples(plan), true);
  assert.equal(includeInDistanceAverages({ ...plan, clubId: PUTTER_CLUB_ID }), false);
  assert.equal(includeInTop3Samples({ ...plan, clubId: PUTTER_CLUB_ID }), false);

  const src = actionsSource();
  const add = sliceFn(src, 'export function addPlacedShot', 'export function undoLastShot');
  assert.match(add, /planPlacedShot/);
  assert.match(add, /confirmPlacedShot/);
  assert.match(add, /isPutterClubId/);
  assert.doesNotMatch(add, /acceptFix|forceMark/);

  const move = sliceFn(src, 'export function moveShotPin', 'export function undoShotEdit');
  assert.match(move, /confirmPlacedShot/);
  assert.doesNotMatch(move, /acceptFix|forceMark/);

  const live = sliceFn(src, 'function decide(', 'export async function resolveMarkFix');
  assert.match(live, /acceptFix/);

  const prompt = sliceFn(src, 'export function promptForPlan', 'function priorOf');
  assert.match(prompt, /needs_force_impossible_jump/);
  assert.match(prompt, /COPY\.tooFar/);
});

test('a placed pin over 400 saves without the 400-yard ask', () => {
  const from = { lat: 37.0, lng: -122.0 };
  const to = { lat: 37.01, lng: -122.0 };
  const plan = planPlacedShot(from, to);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.ok(plan.distanceYards > MAX_SHOT_YD);
  assert.equal(plan.impossibleJump, false);
  assert.deepEqual(confirmPlacedShot(plan, false), { status: 'commit' });
  assert.deepEqual(confirmPlacedShot(plan, true), { status: 'commit' });
  assert.equal(plan.fixQuality, null);
  assert.equal(plan.source, 'placed');
});

test('Signal Lab: one map point is not a Placed shot — both from and to are required', () => {
  const from = { lat: 37.0, lng: -122.0 };
  assert.equal(planPlacedShot(from, { lat: 0, lng: 0 }).ok, false);
  assert.equal(planPlacedShot({ lat: 0, lng: 0 }, from).ok, false);
});
