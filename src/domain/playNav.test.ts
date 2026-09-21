import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import { shouldAutoOpenClubPick } from './putts';
import {
  allClubsHref,
  allClubsOnlyViaControl,
  playHrefAfterHoleChange,
  playHrefAfterRoundStart,
  playHrefIsAllClubs,
  playHoleHref,
} from './playNav';

test('round start and Prev/Next land on play/hole, not All clubs', () => {
  assert.equal(playHrefAfterRoundStart('r1'), '/round/r1/hole/1');
  assert.equal(playHrefAfterHoleChange('r1', 4), '/round/r1/hole/4');
  assert.equal(playHoleHref('r1', 9), '/round/r1/hole/9');
  assert.equal(playHrefIsAllClubs(playHrefAfterRoundStart('r1')), false);
  assert.equal(playHrefIsAllClubs(playHrefAfterHoleChange('r1', 2)), false);
  assert.equal(playHrefIsAllClubs(allClubsHref('r1', 1)), true);
  assert.equal(allClubsOnlyViaControl(), true);
  assert.equal(COPY.allClubs, 'All clubs');
  assert.equal(COPY.prevHole, 'Prev hole');
  assert.equal(COPY.nextHole, 'Next hole');

  // Fresh holes used to auto-push club-pick. Start already routed to hole/1;
  // the leak was opening All clubs after landing. That must stay off.
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 1 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: true, shotCount: 0 }), false);
  assert.equal(shouldAutoOpenClubPick({ readOnly: false, shotCount: 0, openingPutts: true }), false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const watch = readFileSync(new URL('../services/watchNearby.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(hole, /shouldAutoOpenClubPick/);
  assert.doesNotMatch(hole, /autoOpened/);
  assert.match(hole, /playHrefAfterHoleChange/);
  assert.match(hole, /allClubsHref/);
  const openBag = hole.slice(hole.indexOf('const openBag'), hole.indexOf('const confirmToPin'));
  assert.match(openBag, /allClubsHref/);
  assert.match(openBag, /club-pick|allClubsHref/);
  const go = hole.slice(hole.indexOf('const goToHole'), hole.indexOf('const lastShotClubId'));
  assert.match(go, /playHrefAfterHoleChange/);
  assert.doesNotMatch(go, /club-pick/);

  assert.match(home, /playHrefAfterRoundStart/);
  assert.doesNotMatch(home, /club-pick/);
  assert.match(watch, /playHrefAfterRoundStart/);
  assert.doesNotMatch(watch.slice(watch.indexOf('router.push'), watch.indexOf('return { ok: true, feedback: tee')), /club-pick/);
});

test('Settings back titles are Home / Round — never Expo folder paths', () => {
  const layout = readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');
  const round = readFileSync(new URL('../../app/round/[id]/_layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /name="\(tabs\)"[\s\S]*title: 'Home'/);
  assert.match(layout, /name="round\/\[id\]"[\s\S]*title: 'Round'/);
  assert.match(layout, /name="settings"[\s\S]*title: 'Settings'/);
  assert.match(round, /name="hole\/\[number\]"[\s\S]*title: 'Hole'/);
  assert.doesNotMatch(layout, /title: '\(tabs\)'/);
  assert.doesNotMatch(layout, /title: 'round\/\[id\]'/);
  assert.doesNotMatch(layout, /headerBackTitle: '\(tabs\)'/);
  assert.doesNotMatch(layout, /headerBackTitle: 'round\/\[id\]'/);
});
