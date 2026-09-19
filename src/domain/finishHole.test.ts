import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import {
  finishHoleCelebrationBeats,
  finishHoleCelebrationIsModal,
  finishHoleInventGreen,
  finishHoleInventPuttYards,
  finishHoleInventPutts,
  finishHoleLabel,
  finishHoleOnGreen,
  finishHolePinToPinYards,
  finishHoleUsesConfetti,
  holedOutChip,
  planFinishHole,
  planFinishHoleGir,
} from './finishHole';

test('Finish hole closes without putts and never invents putt yards', () => {
  assert.equal(finishHoleLabel(), 'Finish hole');
  assert.equal(COPY.finishHole, 'Finish hole');
  assert.equal(holedOutChip(), 'Holed out');
  assert.equal(COPY.holedOut, 'Holed out');
  assert.equal(finishHoleInventPutts(), false);
  assert.equal(finishHoleInventPuttYards(), false);
  assert.equal(finishHoleInventGreen(), false);
  assert.equal(finishHoleCelebrationIsModal(), false);
  assert.equal(finishHoleUsesConfetti(), false);
  assert.equal(finishHoleCelebrationBeats(), 1);

  const off = planFinishHole({
    onGreen: false,
    par: 4,
    shotCount: 2,
    holeNumber: 3,
    holeCount: 18,
  });
  assert.equal(off.putts, 0);
  assert.deepEqual(off.puttLengths, []);
  assert.equal(off.puttsDone, true);
  assert.equal(off.inventPutt, false);
  assert.equal(off.gir, false);
  assert.deepEqual(off.dest, { kind: 'hole', holeNumber: 4 });
});

test('Finish hole sets GIR correctly when off-green', () => {
  assert.equal(planFinishHoleGir({ onGreen: false, par: 4, shotCount: 2 }), false);
  assert.equal(planFinishHoleGir({ onGreen: null, par: 4, shotCount: 2 }), false);
  assert.equal(planFinishHoleGir({ onGreen: true, par: 4, shotCount: 2 }), true);
  assert.equal(planFinishHoleGir({ onGreen: true, par: 4, shotCount: 3 }), false);
  assert.equal(planFinishHoleGir({ onGreen: true, par: 3, shotCount: 1 }), true);

  const green = { lat: 34.5, lng: -92.2 };
  assert.equal(finishHoleOnGreen({ lastMark: { lat: 34.51, lng: -92.2 }, green }), false);
  assert.equal(
    finishHoleOnGreen({
      lastMark: { lat: 34.5001, lng: -92.2 },
      green,
      greenDepthYards: 30,
    }),
    true,
  );
  assert.equal(
    finishHoleOnGreen({
      lastMark: { lat: 35.0, lng: -92.0 },
      green,
      greenDepthYards: 30,
    }),
    false,
  );
  assert.equal(finishHoleOnGreen({ lastMark: { lat: 34.5, lng: -92.2 }, green: null }), false);

  const yards = finishHolePinToPinYards({ lat: 34.5, lng: -92.2 }, { lat: 34.501, lng: -92.2 });
  assert.ok(yards != null && yards > 0);
  assert.equal(finishHolePinToPinYards(null, { lat: 34.5, lng: -92.2 }), null);
});

test('play Finish hole uses mark gates, lime check, quiet Holed out, no modal', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const actions = readFileSync(new URL('../services/shotActions.ts', import.meta.url), 'utf8');
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');

  assert.match(hole, /COPY\.finishHole/);
  assert.match(hole, /onFinishHole/);
  assert.match(hole, /finishHoleWithClub/);
  assert.match(hole, /COPY\.holedOut/);
  assert.match(hole, /hapticMark/);
  assert.match(hole, /setCheckNonce/);
  assert.match(hole, /holeAfterDone/);
  assert.doesNotMatch(hole.slice(hole.indexOf('const onFinishHole'), hole.indexOf('const dismissScorecard')), /Alert\.alert\('Holed/);
  assert.doesNotMatch(hole.slice(hole.indexOf('const onFinishHole'), hole.indexOf('const dismissScorecard')), /confetti|Modal/);
  assert.doesNotMatch(hole.slice(hole.indexOf('const onFinishHole'), hole.indexOf('const dismissScorecard')), /finishHolePutts|planMadeIt|addPuttLength/);

  assert.match(actions, /export async function finishHoleWithClub/);
  assert.match(actions, /resolveMarkFix/);
  assert.match(actions, /planClubTapAfterChosenFix/);
  assert.match(actions, /finishHoleChipIn/);
  assert.match(actions, /planFinishHole/);
  assert.match(actions, /finishHoleOnGreen/);
  assert.doesNotMatch(actions.slice(actions.indexOf('export async function finishHoleWithClub'), actions.indexOf('export async function endOpenShot')), /finishHolePutts|planMadeIt/);

  assert.match(repo, /export function finishHoleChipIn/);
  assert.match(repo, /putts = 0/);
  assert.match(repo, /putts_done = 1/);
  assert.match(repo, /gir = \?/);
});
