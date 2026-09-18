import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { confirmPlacedShot, includeInDistanceAverages } from './shotSource';
import { readFileSync } from 'node:fs';
import {
  canMoveFromPin,
  canMoveToPin,
  editReadsPhoneFix,
  editRunsAcceptFix,
  planChangeShotClub,
  planMoveShotPin,
  snapshotShot,
} from './shotEdit';
import type { Shot } from './types';

function shot(partial: Partial<Shot> & { id: string }): Shot {
  return {
    holeId: 'h1',
    clubId: 'club_7i',
    seq: 1,
    startLat: 37,
    startLng: -122,
    startAccuracyM: 5,
    startFixQuality: 'good',
    endLat: 37.001,
    endLng: -122,
    endAccuracyM: 6,
    endFixQuality: 'soft',
    distanceYards: 120,
    typedYards: null,
    fixQuality: 'soft',
    impossibleJump: false,
    startedAt: 't0',
    endedAt: 't1',
    source: 'gps',
    suggested: false,
    ...partial,
  };
}

test('club-only change keeps coordinates and source; putter is rejected', () => {
  const gps = shot({ id: 's1' });
  const plan = planChangeShotClub(gps, 'club_6i');
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.keepsCoordinates, true);
  assert.equal(plan.clubId, 'club_6i');
  assert.equal(plan.snapshot.startLat, gps.startLat);
  assert.equal(plan.snapshot.endLng, gps.endLng);
  assert.equal(plan.snapshot.source, 'gps');
  assert.equal(plan.snapshot.distanceYards, 120);
  assert.equal(plan.snapshot.fixQuality, 'soft');
  assert.equal(planChangeShotClub(gps, 'club_putter').ok, false);
});

test('moving either pin badges Placed, recomputes yards, and has no GPS quality', () => {
  const gps = shot({ id: 's1' });
  const nextFrom = { lat: 37.002, lng: -122 };
  const moved = planMoveShotPin(gps, 'from', nextFrom);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.plan.source, 'placed');
  assert.equal(moved.plan.fixQuality, null);
  assert.equal(moved.plan.startFixQuality, null);
  assert.equal(moved.plan.endFixQuality, null);
  assert.equal(moved.from.lat, nextFrom.lat);
  assert.equal(moved.to.lat, gps.endLat);
  assert.ok(moved.plan.distanceYards !== gps.distanceYards);
  assert.equal(includeInDistanceAverages(moved.plan), true);
  assert.equal(moved.snapshot.source, 'gps');
  assert.equal(moved.snapshot.fixQuality, 'soft');
});

test('move to on an open GPS shot closes it as Placed without inventing the from pin', () => {
  const open = shot({
    id: 's2',
    endLat: null,
    endLng: null,
    endAccuracyM: null,
    endFixQuality: null,
    distanceYards: null,
    fixQuality: 'good',
    endedAt: null,
  });
  assert.equal(canMoveFromPin(open), false);
  assert.equal(canMoveToPin(open), true);
  const landed = { lat: 37.0015, lng: -122 };
  const moved = planMoveShotPin(open, 'to', landed);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.from.lat, open.startLat);
  assert.equal(moved.to.lat, landed.lat);
  assert.equal(moved.plan.source, 'placed');
  assert.ok(moved.plan.distanceYards != null && moved.plan.distanceYards > 0);
});

test('no_gps shots cannot grow invented pins; club change still works', () => {
  const logged = shot({
    id: 's3',
    source: 'no_gps',
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    startFixQuality: 'none',
    endFixQuality: 'none',
    fixQuality: 'none',
    distanceYards: null,
  });
  assert.equal(canMoveFromPin(logged), false);
  assert.equal(canMoveToPin(logged), false);
  assert.equal(planMoveShotPin(logged, 'to', { lat: 37, lng: -122 }).ok, false);
  assert.equal(planChangeShotClub(logged, 'club_pw').ok, true);
});

test('400-yard pin move still asks before a silent save', () => {
  const gps = shot({ id: 's4' });
  const far = { lat: 37.02, lng: -122 };
  const moved = planMoveShotPin(gps, 'to', far);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.plan.impossibleJump, true);
  assert.ok(moved.plan.distanceYards > MAX_SHOT_YD);
  assert.deepEqual(confirmPlacedShot(moved.plan, false), {
    status: 'needs_confirm',
    yards: moved.plan.distanceYards,
  });
  assert.deepEqual(confirmPlacedShot(moved.plan, true), { status: 'commit' });
  assert.equal(moved.plan.fixQuality, null);
});

test('invalid or 0,0 pins are rejected — never invented GPS', () => {
  const gps = shot({ id: 's5' });
  assert.equal(planMoveShotPin(gps, 'from', { lat: 0, lng: 0 }).ok, false);
  assert.equal(planMoveShotPin(gps, 'to', { lat: 99, lng: 0 }).ok, false);
});

test('editing an earlier shot does not read the phone fix or run acceptFix', () => {
  assert.equal(editReadsPhoneFix(), false);
  assert.equal(editRunsAcceptFix(), false);
  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const changeStart = actions.indexOf('export function changeShotClub');
  const moveStart = actions.indexOf('export function moveShotPin');
  const undoStart = actions.indexOf('export function undoShotEdit');
  assert.ok(changeStart >= 0 && moveStart > changeStart && undoStart > moveStart);
  const editFns = actions.slice(changeStart, undoStart);
  assert.doesNotMatch(editFns, /getCurrentFix|resolveMarkFix|acceptFix|forceMark/);
  assert.match(editFns, /planChangeShotClub/);
  assert.match(editFns, /planMoveShotPin/);
  assert.match(editFns, /confirmPlacedShot/);
});

test('snapshot is a restore copy of the shot before the edit', () => {
  const gps = shot({ id: 's6', suggested: true });
  const snap = snapshotShot(gps);
  assert.equal(snap.id, 's6');
  assert.equal(snap.clubId, 'club_7i');
  assert.equal(snap.source, 'gps');
  assert.equal(snap.suggested, true);
  assert.equal(snap.startLat, gps.startLat);
  assert.equal(snap.endLat, gps.endLat);
});
