import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { haversineYards } from './haversine';
import { planEndShot, planMarkShot } from './markShot';
import type { GpsFix, OpenShot } from './types';

function fix(partial: Partial<GpsFix> & { lat: number; lng: number }): GpsFix {
  return {
    accuracyM: 5,
    mocked: false,
    isSimulator: false,
    timestamp: 0,
    ...partial,
  };
}

const origin = { lat: 37.0, lng: -122.0 };

function northOf(meters: number): { lat: number; lng: number } {
  return { lat: origin.lat + meters / 111_320, lng: origin.lng };
}

const openGood: OpenShot = {
  id: 's1',
  startLat: origin.lat,
  startLng: origin.lng,
  startFixQuality: 'good',
};

test('confirm mark with good GPS and no open shot commits start only', () => {
  const plan = planMarkShot(fix({ ...origin, accuracyM: 8 }), null);
  assert.equal(plan.status, 'commit');
  if (plan.status === 'commit') {
    assert.equal(plan.startFixQuality, 'good');
    assert.equal(plan.closePrior, null);
  }
});

test('soft GPS 15–25 m auto-commits with soft quality (no force prompt)', () => {
  const plan = planMarkShot(fix({ ...origin, accuracyM: 18 }), null);
  assert.equal(plan.status, 'commit');
  if (plan.status === 'commit') {
    assert.equal(plan.startFixQuality, 'soft');
  }
});

test('poor GPS > 25 m requires force', () => {
  const plan = planMarkShot(fix({ ...origin, accuracyM: 40 }), null);
  assert.equal(plan.status, 'needs_force_poor_gps');
});

test('forced poor GPS commits as forced', () => {
  const plan = planMarkShot(fix({ ...origin, accuracyM: 40 }), null, { forcePoorGps: true });
  assert.equal(plan.status, 'commit');
  if (plan.status === 'commit') {
    assert.equal(plan.startFixQuality, 'forced');
  }
});

test('next mark closes the prior shot and logs yards', () => {
  const end = northOf(150);
  const plan = planMarkShot(fix({ ...end, accuracyM: 6 }), openGood);
  assert.equal(plan.status, 'commit');
  if (plan.status === 'commit') {
    assert.ok(plan.closePrior);
    const expected = Math.round(haversineYards(origin, end));
    assert.equal(plan.closePrior?.distanceYards, expected);
    assert.equal(plan.closePrior?.impossibleJump, false);
    assert.equal(plan.closePrior?.fixQuality, 'good');
    assert.equal(plan.startFixQuality, 'good');
  }
});

test('closing with soft GPS badges the prior shot soft', () => {
  const end = northOf(120);
  const plan = planMarkShot(fix({ ...end, accuracyM: 22 }), openGood);
  assert.equal(plan.status, 'commit');
  if (plan.status === 'commit') {
    assert.equal(plan.closePrior?.endFixQuality, 'soft');
    assert.equal(plan.closePrior?.fixQuality, 'soft');
  }
});

test('distance above MAX_SHOT_YD is impossible_jump and needs force', () => {
  const far = northOf((MAX_SHOT_YD + 20) * 0.9144);
  const plan = planMarkShot(fix({ ...far, accuracyM: 5 }), openGood);
  assert.equal(plan.status, 'needs_force_impossible_jump');
  if (plan.status === 'needs_force_impossible_jump') {
    assert.ok(plan.yards > MAX_SHOT_YD);
  }
});

test('forced impossible_jump still logs yards as forced', () => {
  const far = northOf((MAX_SHOT_YD + 50) * 0.9144);
  const plan = planMarkShot(fix({ ...far, accuracyM: 5 }), openGood, { forceJump: true });
  assert.equal(plan.status, 'commit');
  if (plan.status === 'commit') {
    assert.equal(plan.closePrior?.impossibleJump, true);
    assert.equal(plan.closePrior?.fixQuality, 'forced');
    assert.ok((plan.closePrior?.distanceYards ?? 0) > MAX_SHOT_YD);
  }
});

test('distance at 350 yd is allowed (under MAX_SHOT_YD)', () => {
  const end = northOf(350 * 0.9144);
  const plan = planMarkShot(fix({ ...end, accuracyM: 5 }), openGood);
  assert.equal(plan.status, 'commit');
  if (plan.status === 'commit') {
    assert.equal(plan.closePrior?.impossibleJump, false);
    assert.ok((plan.closePrior?.distanceYards ?? 0) < MAX_SHOT_YD);
  }
});

test('planEndShot closes without implying a new start when GPS is good', () => {
  const end = northOf(80);
  const plan = planEndShot(fix({ ...end, accuracyM: 4 }), openGood);
  assert.equal(plan.status, 'commit');
  if (plan.status === 'commit') {
    assert.ok(plan.closePrior);
    assert.equal(plan.closePrior?.impossibleJump, false);
  }
});
