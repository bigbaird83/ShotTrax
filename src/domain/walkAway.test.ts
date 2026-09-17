import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversineYards } from './haversine';
import type { GpsFix } from './types';
import {
  DWELL_S,
  DWELL_YD,
  LEAVE_CONFIRM_FIXES,
  LEAVE_YD,
  emptyWalkAway,
  stepWalkAway,
} from './walkAway';

const origin = { lat: 37.0, lng: -122.0 };

function north(yards: number): { lat: number; lng: number } {
  return { lat: origin.lat + (yards * 0.9144) / 111_320, lng: origin.lng };
}

function fix(partial: Partial<GpsFix> & { timestamp: number; lat?: number; lng?: number }): GpsFix {
  return {
    lat: origin.lat,
    lng: origin.lng,
    accuracyM: 6,
    mocked: false,
    isSimulator: false,
    ...partial,
  };
}

test('dwell under 10s does not arm (cart drive-by)', () => {
  let state = emptyWalkAway();
  for (let i = 0; i < 5; i += 1) {
    const stepped = stepWalkAway(state, fix({ timestamp: i * 1000 }));
    state = stepped.state;
    assert.equal(stepped.firePin, null);
  }
  assert.equal(state.liePin, null);
});

test('10s inside 8 yd arms a lie pin at the best-accuracy fix', () => {
  let state = emptyWalkAway();
  const samples = [
    fix({ timestamp: 0, accuracyM: 12 }),
    fix({ timestamp: 4000, accuracyM: 4, ...north(2) }),
    fix({ timestamp: DWELL_S * 1000, accuracyM: 9 }),
  ];
  let fire = null as GpsFix | null;
  for (const sample of samples) {
    const stepped = stepWalkAway(state, sample);
    state = stepped.state;
    fire = stepped.firePin;
  }
  assert.equal(fire, null);
  assert.ok(state.liePin);
  assert.equal(state.liePin?.accuracyM, 4);
});

test('micro-moves under 8 yd stay in dwell', () => {
  let state = emptyWalkAway();
  state = stepWalkAway(state, fix({ timestamp: 0 })).state;
  const near = stepWalkAway(state, fix({ timestamp: 5000, ...north(DWELL_YD - 1) }));
  assert.ok(near.state.cluster.length >= 2);
  assert.equal(near.state.liePin, null);
});

test('leave needs two consecutive fixes at least 20 yd out, then fires the lie pin', () => {
  let state = emptyWalkAway();
  state = stepWalkAway(state, fix({ timestamp: 0, accuracyM: 5 })).state;
  state = stepWalkAway(state, fix({ timestamp: DWELL_S * 1000, accuracyM: 5 })).state;
  assert.ok(state.liePin);

  const firstLeave = stepWalkAway(state, fix({ timestamp: 12_000, ...north(LEAVE_YD + 2) }));
  assert.equal(firstLeave.firePin, null);
  assert.equal(firstLeave.state.leaveHits, 1);

  const second = stepWalkAway(firstLeave.state, fix({ timestamp: 13_000, ...north(LEAVE_YD + 5) }));
  assert.equal(LEAVE_CONFIRM_FIXES, 2);
  assert.ok(second.firePin);
  assert.equal(second.firePin?.accuracyM, 5);
  const fromLie = haversineYards(second.firePin!, north(LEAVE_YD + 5));
  assert.ok(fromLie >= LEAVE_YD);
});

test('a GPS spike then return to the lie resets leave hits', () => {
  let state = emptyWalkAway();
  state = stepWalkAway(state, fix({ timestamp: 0 })).state;
  state = stepWalkAway(state, fix({ timestamp: DWELL_S * 1000 })).state;
  state = stepWalkAway(state, fix({ timestamp: 11_000, ...north(LEAVE_YD + 1) })).state;
  assert.equal(state.leaveHits, 1);
  state = stepWalkAway(state, fix({ timestamp: 12_000 })).state;
  assert.equal(state.leaveHits, 0);
  assert.equal(state.fired, false);
});

test('poor GPS dwell never arms a silent mark', () => {
  let state = emptyWalkAway();
  state = stepWalkAway(state, fix({ timestamp: 0, accuracyM: 40 })).state;
  const done = stepWalkAway(state, fix({ timestamp: DWELL_S * 1000, accuracyM: 40 }));
  assert.equal(done.state.liePin, null);
  assert.equal(done.firePin, null);
});
