import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  AUTO_PUTTS_FROM_GPS,
  AUTO_PUTTS_FROM_LEAVE_GREEN,
  MIC_SHOT_ASSIST,
  PUTT_ASSIST,
} from '../sensing/assists';
import { formatRunningParBadge } from './playerCopy';
import {
  playRunningParBadgeHidesDuringCatchUp,
  playRunningParBadgeIsCorner,
  playRunningParBadgeIsModal,
} from './playLayout';
import {
  finishedHolePersistedScore,
  formatRunningParLine,
  formatRunningParToPar,
  planRunningParBadge,
  runningParBadgeInventGps,
  runningParBadgeInventYards,
  runningParBadgeIsCorner,
  runningParBadgeIsModal,
  runningParBlocksMapGestures,
  runningParCountsIncompleteHoles,
  runningParHidesDuringCatchUp,
  runningParUsesPersistedScores,
  signalLabCypressNoonRunningPar,
} from './runningPar';

test('Signal Lab: Cypress noon running ±par is thru N from finished persisted scores', () => {
  assert.deepEqual(signalLabCypressNoonRunningPar(), {
    thruFromFinishedOnly: true,
    plusMinusFromPersistedScores: true,
    inventGps: false,
    inventYards: false,
    hideDuringCatchUp: true,
    pointerEvents: 'none',
  });
  assert.equal(runningParBadgeIsCorner(), true);
  assert.equal(runningParBadgeIsModal(), false);
  assert.equal(runningParBadgeInventGps(), false);
  assert.equal(runningParBadgeInventYards(), false);
  assert.equal(runningParCountsIncompleteHoles(), false);
  assert.equal(runningParHidesDuringCatchUp(), true);
  assert.equal(runningParBlocksMapGestures(), false);
  assert.equal(runningParUsesPersistedScores(), true);
  assert.equal(playRunningParBadgeIsCorner(), true);
  assert.equal(playRunningParBadgeIsModal(), false);
  assert.equal(playRunningParBadgeHidesDuringCatchUp(), true);
  assert.equal(PUTT_ASSIST, false);
  assert.equal(AUTO_PUTTS_FROM_GPS, false);
  assert.equal(AUTO_PUTTS_FROM_LEAVE_GREEN, false);
  assert.equal(MIC_SHOT_ASSIST, false);

  // Cypress noon: H1 4, H2 3, H3 5 vs par 4/4/5 → thru 3, −1
  const badge = planRunningParBadge({
    holes: [
      { number: 1, par: 4, score: 4, puttsDone: true, shotCount: 2, putts: 2 },
      { number: 2, par: 4, score: 3, puttsDone: true, shotCount: 1, putts: 2 },
      { number: 3, par: 5, score: 5, puttsDone: true, shotCount: 3, putts: 2 },
      { number: 4, par: 4, score: null, puttsDone: false, shotCount: 1, putts: 0 },
    ],
  });
  assert.equal(badge.visible, true);
  assert.equal(badge.kind, 'corner');
  assert.equal(badge.modal, false);
  assert.equal(badge.thru, 3);
  assert.equal(badge.toPar, -1);
  assert.equal(badge.toParLabel, '−1');
  assert.equal(badge.toParTone, 'good');
  assert.equal(badge.line, 'thru 3, −1');
  assert.equal(formatRunningParLine(3, -1), 'thru 3, −1');
  assert.equal(formatRunningParBadge(3, '−1'), 'thru 3, −1');
  assert.equal(formatRunningParToPar(-1), '−1');
  assert.equal(formatRunningParToPar(0), 'E');
  assert.equal(formatRunningParToPar(2), '+2');
});

test('Signal Lab: blank and in-play holes do not invent strokes for the running badge', () => {
  assert.equal(
    finishedHolePersistedScore({ number: 1, par: 4, score: 4, puttsDone: false, shotCount: 3, putts: 1 }),
    null,
  );
  assert.equal(
    finishedHolePersistedScore({ number: 1, par: 4, score: null, puttsDone: true, shotCount: 0, putts: 0 }),
    null,
  );
  assert.equal(
    finishedHolePersistedScore({ number: 1, par: 4, score: null, puttsDone: true, shotCount: 2, putts: 2 }),
    4,
  );
  assert.equal(
    finishedHolePersistedScore({ number: 1, par: 4, score: 5, puttsDone: true, shotCount: 2, putts: 2 }),
    5,
  );

  const none = planRunningParBadge({
    holes: [
      { number: 1, par: 4, score: null, puttsDone: false, shotCount: 2, putts: 0 },
      { number: 2, par: 4, score: 3, puttsDone: false, shotCount: 1, putts: 0 },
      { number: 3, par: 4, score: null, puttsDone: true, shotCount: 0, putts: 0 },
    ],
  });
  assert.equal(none.visible, false);
  assert.equal(none.thru, 0);
  assert.equal(none.line, '');

  const loggedOnly = planRunningParBadge({
    holes: [
      { number: 1, par: 4, score: null, puttsDone: true, shotCount: 2, putts: 2 },
      { number: 2, par: 3, score: null, puttsDone: true, shotCount: 2, putts: 2, penaltyStrokes: 1 },
    ],
  });
  assert.equal(loggedOnly.visible, true);
  assert.equal(loggedOnly.thru, 2);
  assert.equal(loggedOnly.toPar, 2);
  assert.equal(loggedOnly.line, 'thru 2, +2');

  const missingPar = planRunningParBadge({
    holes: [
      { number: 1, par: 4, score: 3, puttsDone: true },
      { number: 2, par: null, score: 5, puttsDone: true },
    ],
  });
  assert.equal(missingPar.thru, 2);
  assert.equal(missingPar.toPar, -1);
  assert.equal(missingPar.line, 'thru 2, −1');

  const even = planRunningParBadge({
    holes: [{ number: 1, par: 4, score: 4, puttsDone: true }],
  });
  assert.equal(even.line, 'thru 1, E');
  assert.equal(even.toParTone, 'even');

  // Doc H10: after ghost delete, restamped 4 on par 4 — thru 1, E (not cached +5).
  const afterGhosts = planRunningParBadge({
    holes: [{ number: 10, par: 4, score: 4, puttsDone: true, shotCount: 2, putts: 2 }],
  });
  assert.equal(afterGhosts.line, 'thru 1, E');
  assert.equal(afterGhosts.toPar, 0);
  assert.notEqual(afterGhosts.toPar, 5);
});

test('Signal Lab: running ±par badge hides for Add-shot / catch-up / putt sheet and never blocks gestures', () => {
  const holes = [{ number: 1, par: 4, score: 3, puttsDone: true }];
  assert.equal(planRunningParBadge({ holes, catchUpFullScreen: true }).visible, false);
  assert.equal(planRunningParBadge({ holes, placing: true }).visible, false);
  assert.equal(planRunningParBadge({ holes, puttOpen: true }).visible, false);
  assert.equal(planRunningParBadge({ holes, readOnly: true }).visible, false);
  assert.equal(planRunningParBadge({ holes }).visible, true);

  const src = readFileSync(new URL('./runningPar.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /acceptFix|haversineYards|yardsToGreen|start_lat|end_lat/);
  assert.match(src, /puttsDone/);
  assert.match(src, /posted/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /planRunningParBadge/);
  assert.match(hole, /testID="running-par-badge"/);
  assert.match(hole, /pointerEvents="none"/);
  assert.match(hole, /catchUpFullScreen/);
  assert.match(hole, /puttOpen/);
  const badgeAt = hole.indexOf('runningPar.visible');
  assert.ok(badgeAt > 0);
  const badge = hole.slice(badgeAt, hole.indexOf('styles.runningParGood'));
  assert.match(badge, /pointerEvents="none"/);
  assert.match(badge, /testID="running-par-badge"/);
  assert.match(badge, /thru \$\{runningPar\.thru\}/);
  assert.doesNotMatch(badge, /Pressable|onPress/);
  assert.doesNotMatch(badge, /acceptFix|yardsToGreen|start_lat/);

  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /showPhonePin=\{!catchUpFullScreen\}/);
  assert.doesNotMatch(hole, /addShotDragLayer|MapGestureOverlay/);
});
