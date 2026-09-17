import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversineYards, roundYards } from './haversine';
import { planInsertPlacedShot, planInsertSlots, planRenumberAfterInsert, yardsFromShotPins } from './insertShot';
import type { Shot } from './types';

function shot(partial: Partial<Shot> & { id: string; seq: number }): Shot {
  return {
    holeId: 'h1',
    clubId: 'club_7i',
    startLat: 37,
    startLng: -122,
    startAccuracyM: 5,
    startFixQuality: 'good',
    endLat: 37.001,
    endLng: -122,
    endAccuracyM: 6,
    endFixQuality: 'good',
    distanceYards: 120,
    typedYards: null,
    fixQuality: 'good',
    impossibleJump: false,
    startedAt: 't0',
    endedAt: 't1',
    source: 'gps',
    suggested: false,
    ...partial,
  };
}

const from = { lat: 37.002, lng: -122 };
const to = { lat: 37.003, lng: -122 };

test('insert slots sit between each pair and after the last shot', () => {
  assert.deepEqual(planInsertSlots([]), [{ afterShotId: null, seq: 1, append: true }]);
  assert.deepEqual(planInsertSlots([{ id: 's1', seq: 1 }]), [
    { afterShotId: 's1', seq: 2, append: true },
  ]);
  assert.deepEqual(planInsertSlots([{ id: 's1', seq: 1 }, { id: 's2', seq: 2 }]), [
    { afterShotId: 's1', seq: 2, append: false },
    { afterShotId: 's2', seq: 3, append: true },
  ]);
});

test('insert-between slots the new shot and renumbers later seqs; neighbors keep pins', () => {
  const first = shot({ id: 's1', seq: 1, clubId: 'club_driver' });
  const second = shot({
    id: 's2',
    seq: 2,
    clubId: 'club_pw',
    startLat: 37.004,
    startLng: -122,
    endLat: 37.005,
    endLng: -122,
    distanceYards: 90,
  });
  const planned = planInsertPlacedShot({
    shots: [first, second],
    seq: 2,
    from,
    to,
    clubId: 'club_7i',
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  assert.equal(planned.append, false);
  assert.equal(planned.seq, 2);
  assert.equal(planned.clubId, 'club_7i');
  assert.equal(planned.plan.source, 'placed');
  assert.equal(planned.plan.startLat, from.lat);
  assert.equal(planned.plan.endLat, to.lat);
  assert.equal(planned.plan.distanceYards, roundYards(haversineYards(from, to)));
  assert.deepEqual(planned.renumber, [{ id: 's2', seq: 3 }]);
  assert.equal(planned.neighborYards.every((row) => row.pinsUnchanged), true);
  assert.equal(first.startLat, 37);
  assert.equal(second.startLat, 37.004);
  assert.equal(planInsertPlacedShot({ shots: [first, second], seq: 2, from, to, clubId: 'club_putter' }).ok, false);
});

test('append-after adds at the end without moving earlier seqs', () => {
  const first = shot({ id: 's1', seq: 1 });
  const planned = planInsertPlacedShot({
    shots: [first],
    seq: 2,
    from,
    to,
    clubId: 'club_8i',
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  assert.equal(planned.append, true);
  assert.equal(planned.seq, 2);
  assert.deepEqual(planned.renumber, []);
  assert.deepEqual(planRenumberAfterInsert([first], 2), []);
});

test('yards recompute from pins and never invent a missing pin', () => {
  const closed = shot({ id: 's1', seq: 1 });
  assert.equal(yardsFromShotPins(closed), roundYards(haversineYards(
    { lat: 37, lng: -122 },
    { lat: 37.001, lng: -122 },
  )));
  assert.equal(yardsFromShotPins({ startLat: 37, startLng: -122, endLat: null, endLng: null }), null);
});
