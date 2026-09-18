import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clubAverageFromShots, shotsForClubAverage } from './averages';
import { PUTTER_CLUB_ID } from './defaultBag';
import {
  DELETE_SHOT_PROMPT,
  applyDeleteShot,
  deleteFillsGap,
  deleteInventsPoints,
  deleteMovesNeighborPins,
  deleteReopensNeighbor,
  deleteShotPrompt,
  planDeleteShot,
  remainingAverageShots,
  yardsIfDistanceChanged,
} from './deleteShot';
import { COPY } from './playerCopy';
import { includeInDistanceAverages } from './shotSource';
import type { Shot } from './types';
import { WATCH_MESSAGE_TYPES } from './watchMessages';

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

const seed = { typedCarryYards: 150, estimatedCarryYards: null as number | null };

test('cancel leaves the shot exactly as it was', () => {
  const live = shot({
    id: 's1',
    seq: 1,
    distanceYards: 150,
    endedAt: null,
    endLat: null,
    endLng: null,
    endAccuracyM: null,
    endFixQuality: null,
  });
  const placed = shot({
    id: 's2',
    seq: 2,
    source: 'placed',
    startLat: 37.002,
    startLng: -122,
    endLat: 37.003,
    endLng: -122,
    startFixQuality: null,
    endFixQuality: null,
    fixQuality: null,
    distanceYards: 160,
  });
  const before = [live, placed];
  const cancelled = applyDeleteShot({ shots: before, shotId: 's1', confirmed: false });
  assert.equal(cancelled.status, 'cancel');
  if (cancelled.status !== 'cancel') return;
  assert.deepEqual(cancelled.shots, before);
  assert.equal(cancelled.shots.length, 2);
  assert.equal(cancelled.shots[0]?.id, 's1');
  assert.equal(cancelled.shots[0]?.startLat, 37);
  assert.equal(cancelled.shots[0]?.distanceYards, 150);
  assert.equal(cancelled.shots[1]?.id, 's2');
  assert.equal(cancelled.shots[1]?.distanceYards, 160);
  assert.equal(deleteShotPrompt().title, DELETE_SHOT_PROMPT);
  assert.equal(deleteShotPrompt().title, 'Delete this shot?');
  assert.equal(deleteShotPrompt().cancel, COPY.cancel);
  assert.equal(deleteShotPrompt().cancelIsDefault, true);
});

test('confirm removes the shot from the hole and from the average', () => {
  const first = shot({ id: 's1', seq: 1, distanceYards: 150 });
  const second = shot({
    id: 's2',
    seq: 2,
    startLat: 37.002,
    startLng: -122,
    endLat: 37.003,
    endLng: -122,
    distanceYards: 160,
  });
  const beforeSamples = remainingAverageShots([first, second]);
  assert.deepEqual(
    beforeSamples.map((row) => row.yards),
    [150, 160],
  );
  assert.equal(clubAverageFromShots(beforeSamples, seed).avgYards, 155);

  const confirmed = applyDeleteShot({ shots: [first, second], shotId: 's2', confirmed: true });
  assert.equal(confirmed.status, 'commit');
  if (confirmed.status !== 'commit') return;
  assert.equal(confirmed.remaining.length, 1);
  assert.equal(confirmed.remaining[0]?.id, 's1');
  assert.equal(confirmed.remaining.find((row) => row.id === 's2'), undefined);
  assert.deepEqual(
    confirmed.remaining.map((row) => row.seq),
    [1],
  );

  const afterSamples = remainingAverageShots(confirmed.remaining);
  assert.deepEqual(
    afterSamples.map((row) => row.yards),
    [150],
  );
  assert.equal(clubAverageFromShots(afterSamples, seed).avgYards, 150);
  assert.equal(clubAverageFromShots(afterSamples, seed).count, 1);
});

test('neighbor coordinates do not change and the gap is not filled', () => {
  const first = shot({
    id: 's1',
    seq: 1,
    startLat: 36.9,
    startLng: -121.9,
    endLat: 36.91,
    endLng: -121.9,
    distanceYards: 188,
  });
  const middle = shot({
    id: 's2',
    seq: 2,
    startLat: 36.92,
    startLng: -121.88,
    endLat: 36.93,
    endLng: -121.88,
    distanceYards: 77,
    source: 'placed',
    startFixQuality: null,
    endFixQuality: null,
    fixQuality: null,
  });
  const last = shot({
    id: 's3',
    seq: 3,
    startLat: 36.94,
    startLng: -121.86,
    endLat: 36.95,
    endLng: -121.86,
    distanceYards: 90,
  });
  const confirmed = applyDeleteShot({ shots: [first, middle, last], shotId: 's2', confirmed: true });
  assert.equal(confirmed.status, 'commit');
  if (confirmed.status !== 'commit') return;

  assert.equal(deleteMovesNeighborPins(), false);
  assert.equal(deleteFillsGap(), false);
  assert.equal(deleteInventsPoints(), false);
  assert.equal(deleteReopensNeighbor(), false);
  assert.deepEqual(confirmed.plan.yardsUpdates, []);
  assert.equal(yardsIfDistanceChanged(first, confirmed.remaining[0]!), undefined);

  const left = confirmed.remaining[0];
  const right = confirmed.remaining[1];
  assert.equal(left?.id, 's1');
  assert.equal(left?.startLat, 36.9);
  assert.equal(left?.startLng, -121.9);
  assert.equal(left?.endLat, 36.91);
  assert.equal(left?.endLng, -121.9);
  assert.equal(left?.distanceYards, 188);
  assert.equal(right?.id, 's3');
  assert.equal(right?.startLat, 36.94);
  assert.equal(right?.startLng, -121.86);
  assert.equal(right?.endLat, 36.95);
  assert.equal(right?.endLng, -121.86);
  assert.equal(right?.distanceYards, 90);
  assert.notEqual(left?.endLat, right?.startLat);
  assert.deepEqual(
    confirmed.remaining.map((row) => row.seq),
    [1, 2],
  );
  assert.deepEqual(confirmed.plan.renumber, [{ id: 's3', seq: 2 }]);
  for (const neighbor of confirmed.plan.neighbors) {
    const prior = neighbor.id === 's1' ? first : last;
    assert.equal(neighbor.startLat, prior.startLat);
    assert.equal(neighbor.startLng, prior.startLng);
    assert.equal(neighbor.endLat, prior.endLat);
    assert.equal(neighbor.endLng, prior.endLng);
    assert.equal(neighbor.distanceYards, prior.distanceYards);
  }
});

test('putter stays out of averages after a delete', () => {
  const iron = shot({ id: 's1', seq: 1, clubId: 'club_7i', distanceYards: 150 });
  const putt = shot({
    id: 's2',
    seq: 2,
    clubId: PUTTER_CLUB_ID,
    distanceYards: 8,
    startLat: 37.004,
    startLng: -122,
    endLat: 37.0041,
    endLng: -122,
  });
  assert.equal(
    includeInDistanceAverages({
      source: putt.source,
      distanceYards: putt.distanceYards,
      fixQuality: putt.fixQuality,
      clubId: putt.clubId,
    }),
    false,
  );

  const deletedIron = applyDeleteShot({ shots: [iron, putt], shotId: 's1', confirmed: true });
  assert.equal(deletedIron.status, 'commit');
  if (deletedIron.status !== 'commit') return;
  assert.equal(deletedIron.remaining[0]?.clubId, PUTTER_CLUB_ID);
  assert.deepEqual(remainingAverageShots(deletedIron.remaining), []);
  assert.equal(clubAverageFromShots(remainingAverageShots(deletedIron.remaining), seed).count, 0);

  const deletedPutt = applyDeleteShot({ shots: [iron, putt], shotId: 's2', confirmed: true });
  assert.equal(deletedPutt.status, 'commit');
  if (deletedPutt.status !== 'commit') return;
  assert.equal(deletedPutt.remaining[0]?.id, 's1');
  assert.deepEqual(
    remainingAverageShots(deletedPutt.remaining).map((row) => row.yards),
    [150],
  );
});

test('a shot already excluded by the 20% filter still leaves the hole', () => {
  const kept = shot({ id: 's1', seq: 1, distanceYards: 150 });
  const outlier = shot({
    id: 's2',
    seq: 2,
    startLat: 37.01,
    startLng: -122,
    endLat: 37.012,
    endLng: -122,
    distanceYards: 200,
    source: 'placed',
    startFixQuality: null,
    endFixQuality: null,
    fixQuality: null,
  });
  assert.equal(
    includeInDistanceAverages({
      source: outlier.source,
      distanceYards: outlier.distanceYards,
      fixQuality: outlier.fixQuality,
      clubId: outlier.clubId,
    }),
    true,
  );
  assert.deepEqual(
    shotsForClubAverage(
      remainingAverageShots([kept, outlier]),
      seed,
    ).map((row) => row.yards),
    [150],
  );

  const confirmed = applyDeleteShot({ shots: [kept, outlier], shotId: 's2', confirmed: true });
  assert.equal(confirmed.status, 'commit');
  if (confirmed.status !== 'commit') return;
  assert.equal(confirmed.remaining.length, 1);
  assert.equal(confirmed.remaining[0]?.id, 's1');
  assert.equal(confirmed.remaining.find((row) => row.id === 's2'), undefined);
  assert.equal(clubAverageFromShots(remainingAverageShots(confirmed.remaining), seed).avgYards, 150);
});

test('live and Placed shots are both deletable; seqs stay compact', () => {
  const live = shot({
    id: 'open',
    seq: 2,
    endedAt: null,
    endLat: null,
    endLng: null,
    distanceYards: null,
  });
  const placed = shot({
    id: 'placed',
    seq: 1,
    source: 'placed',
    startFixQuality: null,
    endFixQuality: null,
    fixQuality: null,
    distanceYards: 140,
  });
  const dropLive = applyDeleteShot({ shots: [placed, live], shotId: 'open', confirmed: true });
  assert.equal(dropLive.status, 'commit');
  if (dropLive.status !== 'commit') return;
  assert.deepEqual(
    dropLive.remaining.map((row) => ({ id: row.id, seq: row.seq, endLat: row.endLat })),
    [{ id: 'placed', seq: 1, endLat: placed.endLat }],
  );

  const dropPlaced = applyDeleteShot({ shots: [placed, live], shotId: 'placed', confirmed: true });
  assert.equal(dropPlaced.status, 'commit');
  if (dropPlaced.status !== 'commit') return;
  assert.equal(dropPlaced.remaining[0]?.id, 'open');
  assert.equal(dropPlaced.remaining[0]?.seq, 1);
  assert.equal(dropPlaced.remaining[0]?.endedAt, null);
});

test('Watch has no shot-list delete UI to invent', () => {
  assert.ok(!WATCH_MESSAGE_TYPES.includes('shotDelete' as (typeof WATCH_MESSAGE_TYPES)[number]));
  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.doesNotMatch(watch, /Delete this shot/);
  assert.doesNotMatch(watch, /deleteShot/);
});

test('missing shot is not a silent delete', () => {
  const only = shot({ id: 's1', seq: 1 });
  assert.equal(planDeleteShot([only], 'nope').ok, false);
  assert.equal(applyDeleteShot({ shots: [only], shotId: 'nope', confirmed: true }).status, 'missing');
});

test('phone confirm is required; Cancel is the default; no swipe delete', () => {
  assert.equal(COPY.deleteShotConfirm, DELETE_SHOT_PROMPT);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /deleteShotPrompt/);
  assert.match(hole, /style: 'cancel'/);
  assert.match(hole, /style: 'destructive'/);
  assert.match(hole, /confirmed: true/);
  assert.doesNotMatch(hole, /Swipeable|onSwipe|swipeToDelete/);
  assert.match(hole, /const openEdit[\s\S]*?if \(placing\) return;/);
  assert.match(hole, /onShotPress=\{placing \? undefined : openEdit\}/);

  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const start = actions.indexOf('export function deleteHoleShot');
  const end = actions.indexOf('export type ShotEditResult', start);
  assert.ok(start >= 0 && end > start);
  const fn = actions.slice(start, end);
  assert.match(fn, /if \(!args\.confirmed\) return \{ status: 'cancel' \}/);
  assert.doesNotMatch(fn, /reopenShot|acceptFix|forceMark/);

  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const repoStart = repo.indexOf('export function deleteShotOnHole');
  const repoEnd = repo.indexOf('export function undoLastShot', repoStart);
  assert.ok(repoStart >= 0 && repoEnd > repoStart);
  const repoFn = repo.slice(repoStart, repoEnd);
  assert.match(repoFn, /if \(!args\.confirmed\) return \{ status: 'cancel' \}/);
  assert.doesNotMatch(repoFn, /reopenShot/);
});
