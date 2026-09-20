import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY, holeOutClosedOnShot } from './playerCopy';
import {
  holeClosedByShot,
  holeOutBadgeLabel,
  holeOutFlagsLastRealShot,
  holeOutInsertsShot,
  holeOutInventPuttGps,
  holeOutInventPuttYards,
  holeOutInventPutts,
  isHoleOutShot,
  lastRealShotId,
  planFinishHoleOut,
  planFlagLastRealShot,
} from './putts';
import { watchHoleOutFlagsLastRealShot } from './watchClubPick';

test('Signal: Hole Out flags the last real shot — no invented putt GPS or yards', () => {
  assert.equal(holeOutFlagsLastRealShot(), true);
  assert.equal(holeOutInsertsShot(), false);
  assert.equal(holeOutInventPuttGps(), false);
  assert.equal(holeOutInventPuttYards(), false);
  assert.equal(holeOutInventPutts(), false);
  assert.equal(watchHoleOutFlagsLastRealShot(), true);

  const empty = planFlagLastRealShot([]);
  assert.equal(empty.insertShot, false);
  assert.equal(empty.inventGps, false);
  assert.equal(empty.inventPuttYards, false);
  assert.equal(empty.shotId, null);
  assert.equal(lastRealShotId([]), null);

  const last = planFlagLastRealShot([
    { id: 's1', seq: 1 },
    { id: 's3', seq: 3 },
    { id: 's2', seq: 2 },
  ]);
  assert.equal(last.shotId, 's3');
  assert.equal(last.insertShot, false);
  assert.equal(last.inventGps, false);
  assert.equal(last.inventPuttYards, false);

  const offGreen = planFinishHoleOut();
  assert.equal(offGreen.putts, 0);
  assert.deepEqual(offGreen.lengths, []);
  assert.equal(offGreen.gir, false);
});

test('Signal: shot list + summary expose a quiet Hole Out badge on the closer', () => {
  assert.equal(holeOutBadgeLabel(), 'Hole Out');
  assert.equal(COPY.holeOut, 'Hole Out');
  assert.equal(holeOutClosedOnShot(2), 'Hole Out · shot 2');
  assert.equal(isHoleOutShot({ holeOut: true }), true);
  assert.equal(isHoleOutShot({ holeOut: false }), false);
  assert.deepEqual(
    holeClosedByShot([
      { seq: 1, holeOut: false },
      { seq: 2, holeOut: true },
    ]),
    { seq: 2 },
  );
  assert.equal(holeClosedByShot([{ seq: 1, holeOut: false }]), null);

  const schema = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');
  assert.match(schema, /ensureColumn\(db, 'shots', 'hole_out', 'INTEGER NOT NULL DEFAULT 0'\)/);

  const types = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
  assert.match(types, /holeOut: boolean/);

  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const finishOut = repo.slice(
    repo.indexOf('export function finishHoleOut'),
    repo.indexOf('export function sealOpenShotWithoutGps'),
  );
  assert.match(finishOut, /planFinishHoleOut/);
  assert.match(finishOut, /planFlagLastRealShot/);
  assert.match(finishOut, /UPDATE shots SET hole_out = 1/);
  assert.doesNotMatch(finishOut, /INSERT INTO shots|insertShot|addPlacedShot|club_putter/);
  assert.doesNotMatch(finishOut, /start_lat|end_lat|acceptFix/);
  assert.match(repo, /holeOut: \(row\.hole_out \?\? 0\) === 1/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const overlayShots = hole.slice(hole.indexOf('playLayout.shotLine'), hole.indexOf('!hideHoleButtons'));
  assert.match(overlayShots, /isHoleOutShot\(shot\)/);
  assert.match(overlayShots, /testID="hole-out-shot-badge"/);
  assert.match(overlayShots, /COPY\.holeOut/);
  assert.doesNotMatch(overlayShots, /Modal|confetti/i);
  assert.match(hole, /<HoleOutBadge testID="hole-out-score-badge"/);
  const finish = hole.slice(hole.indexOf('const onFinishHole'), hole.indexOf('const onAddPenalty'));
  assert.match(finish, /finishHoleOut/);
  const watchStart = hole.indexOf('const onWatchPuttPick');
  const watchFn = hole.slice(watchStart, hole.indexOf('useWatchClubList', watchStart + 1));
  assert.match(watchFn, /finishHoleOut/);

  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  assert.match(summary, /holeClosedByShot/);
  assert.match(summary, /holeOutClosedOnShot/);
  assert.match(summary, /testID="hole-out-summary"/);
  assert.doesNotMatch(summary, /Modal|confetti/i);

  const badge = readFileSync(new URL('../ui/Badge.tsx', import.meta.url), 'utf8');
  assert.match(badge, /export function HoleOutBadge/);
  assert.match(badge, /COPY\.holeOut/);
  assert.match(badge, /colors\.lime/);
});
