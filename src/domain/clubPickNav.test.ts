import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clubPickLeaveHref, clubPickLeaveRunsAcceptFix, planClubPickLeave } from './clubPickNav';
import { COPY } from './playerCopy';

test('club pick Back returns to the hole and marks nothing', () => {
  const plan = planClubPickLeave('back');
  assert.equal(plan.selectClub, false);
  assert.equal(plan.mark, false);
  assert.equal(plan.savesGps, false);
  assert.equal(plan.closesPendingShot, false);
  assert.equal(plan.dest, 'hole');
  assert.equal(plan.keepRoundInProgress, true);
  assert.equal(clubPickLeaveHref({ action: 'back', roundId: 'r1', holeNumber: 4 }), '/round/r1/hole/4');
  assert.equal(COPY.back, 'Back');
});

test('club pick Home returns to Rounds and keeps the round in progress', () => {
  const plan = planClubPickLeave('home');
  assert.equal(plan.selectClub, false);
  assert.equal(plan.mark, false);
  assert.equal(plan.savesGps, false);
  assert.equal(plan.closesPendingShot, false);
  assert.equal(plan.dest, 'rounds');
  assert.equal(plan.keepRoundInProgress, true);
  assert.equal(clubPickLeaveHref({ action: 'home', roundId: 'r1', holeNumber: 4 }), '/');
  assert.equal(COPY.home, 'Home');
});

test('Signal Lab: Back and Home never call mark, save GPS, or close a pending shot', () => {
  for (const action of ['back', 'home'] as const) {
    const plan = planClubPickLeave(action);
    assert.equal(plan.mark, false);
    assert.equal(plan.selectClub, false);
    assert.equal(plan.savesGps, false);
    assert.equal(plan.closesPendingShot, false);
    assert.equal(clubPickLeaveRunsAcceptFix(action), false);
  }
});
