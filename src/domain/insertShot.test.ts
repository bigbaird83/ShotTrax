import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversineYards, roundYards } from './haversine';
import {
  insertMovesNeighborPins,
  insertRewritesNeighborYards,
  insertSharesEndpoints,
  planInsertPlacedShot,
  planInsertSlots,
  planRenumberAfterInsert,
  yardsFromShotPins,
} from './insertShot';
import { confirmPlacedShot, includeInDistanceAverages, placedShotRunsAcceptFix } from './shotSource';
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
    holeOut: false,
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
  assert.equal(insertMovesNeighborPins(), false);
  assert.equal(insertSharesEndpoints(), false);
  assert.equal(placedShotRunsAcceptFix(), false);
  assert.equal(planned.plan.source, 'placed');
  const before = [first, second].map((shot) => ({
    id: shot.id,
    startLat: shot.startLat,
    startLng: shot.startLng,
    endLat: shot.endLat,
    endLng: shot.endLng,
    distanceYards: shot.distanceYards,
  }));
  assert.deepEqual(planned.neighbors, before);
  assert.equal(first.startLat, 37);
  assert.equal(second.startLat, 37.004);
  assert.equal(second.distanceYards, 90);
  assert.equal(planInsertPlacedShot({ shots: [first, second], seq: 2, from, to, clubId: 'club_putter' }).ok, false);
});

test('insert does not change neighbor coordinates or yards', () => {
  const first = shot({
    id: 's1',
    seq: 1,
    startLat: 36.9,
    startLng: -121.9,
    endLat: 36.91,
    endLng: -121.9,
    distanceYards: 188,
  });
  const second = shot({
    id: 's2',
    seq: 2,
    startLat: 36.92,
    startLng: -121.88,
    endLat: 36.93,
    endLng: -121.88,
    distanceYards: 77,
  });
  const planned = planInsertPlacedShot({
    shots: [first, second],
    seq: 2,
    from,
    to,
    clubId: 'club_6i',
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  assert.equal(planned.plan.source, 'placed');
  assert.equal(planned.plan.fixQuality, null);
  assert.equal(planned.plan.startLat, from.lat);
  assert.equal(planned.plan.startLng, from.lng);
  assert.equal(planned.plan.endLat, to.lat);
  assert.equal(planned.plan.endLng, to.lng);
  assert.equal(planned.plan.distanceYards, roundYards(haversineYards(from, to)));
  assert.notEqual(planned.plan.distanceYards, first.distanceYards);
  assert.notEqual(planned.plan.distanceYards, second.distanceYards);
  assert.notEqual(planned.plan.startLat, first.endLat);
  assert.notEqual(planned.plan.endLat, second.startLat);
  assert.equal(placedShotRunsAcceptFix(), false);
  assert.equal(insertMovesNeighborPins(), false);
  assert.equal(insertSharesEndpoints(), false);
  assert.equal(insertRewritesNeighborYards(), false);
  assert.equal(
    includeInDistanceAverages({
      source: planned.plan.source,
      distanceYards: planned.plan.distanceYards,
      fixQuality: planned.plan.fixQuality,
      clubId: planned.clubId,
    }),
    true,
  );
  assert.notEqual(first.distanceYards, yardsFromShotPins(first));
  assert.notEqual(second.distanceYards, yardsFromShotPins(second));
  for (const neighbor of planned.neighbors) {
    const prior = neighbor.id === 's1' ? first : second;
    assert.equal(neighbor.startLat, prior.startLat);
    assert.equal(neighbor.startLng, prior.startLng);
    assert.equal(neighbor.endLat, prior.endLat);
    assert.equal(neighbor.endLng, prior.endLng);
    assert.equal(neighbor.distanceYards, prior.distanceYards);
  }
  const farTo = { lat: from.lat + 0.01, lng: from.lng };
  const far = planInsertPlacedShot({
    shots: [first, second],
    seq: 2,
    from,
    to: farTo,
    clubId: 'club_6i',
  });
  assert.equal(far.ok, true);
  if (!far.ok) return;
  assert.ok(far.plan.distanceYards > 400);
  assert.equal(far.plan.impossibleJump, false);
  assert.deepEqual(confirmPlacedShot(far.plan, false), { status: 'commit' });
  assert.deepEqual(confirmPlacedShot(far.plan, true), { status: 'commit' });
  assert.equal(far.neighbors[0]?.distanceYards, 188);
  assert.equal(far.neighbors[1]?.distanceYards, 77);
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
