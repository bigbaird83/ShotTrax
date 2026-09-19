import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MIN_TYPED_CLUBS_FOR_FILL } from './carryFill';
import { COPY } from './playerCopy';
import {
  bagCarrySetupNeedsTypedClubs,
  bagCustomizeSeenValue,
  bagCustomizeSkipValue,
  bagSetupBlocksStart,
  bagSetupIsFirstRunOnly,
  canFinishBagCarrySetup,
  countTypedCarries,
  shouldPromptBagCustomize,
} from './bagCustomize';

test('bag customize prompt is first-run only — 3 typed or skip-to-play, never again', () => {
  assert.equal(bagSetupIsFirstRunOnly(), true);
  assert.equal(bagSetupBlocksStart(), false);
  assert.equal(bagCarrySetupNeedsTypedClubs(), MIN_TYPED_CLUBS_FOR_FILL);
  assert.equal(MIN_TYPED_CLUBS_FOR_FILL, 3);
  assert.equal(canFinishBagCarrySetup(0), false);
  assert.equal(canFinishBagCarrySetup(2), false);
  assert.equal(canFinishBagCarrySetup(3), true);
  assert.equal(canFinishBagCarrySetup(4), true);
  assert.equal(
    countTypedCarries([
      { id: 'club_driver', typicalCarryYards: 230 },
      { id: 'club_7i', typicalCarryYards: 150 },
      { id: 'club_putter', typicalCarryYards: 8 },
      { id: 'club_pw', typicalCarryYards: null },
    ]),
    2,
  );
  assert.equal(
    countTypedCarries([
      { id: 'club_driver', typicalCarryYards: 230 },
      { id: 'club_7i', typicalCarryYards: 150 },
      { id: 'club_pw', typicalCarryYards: 120 },
      { id: 'club_putter', typicalCarryYards: 8 },
    ]),
    3,
  );

  assert.equal(shouldPromptBagCustomize(null), true);
  assert.equal(shouldPromptBagCustomize(undefined), true);
  assert.equal(shouldPromptBagCustomize(''), true);
  assert.equal(shouldPromptBagCustomize(bagCustomizeSeenValue()), false);
  assert.equal(shouldPromptBagCustomize(bagCustomizeSkipValue()), false);
  assert.equal(shouldPromptBagCustomize('1'), false);
  assert.equal(shouldPromptBagCustomize('skip'), false);
});

test('home bag setup is first-run, Done needs 3 typed, skip is calculate from actual play', () => {
  assert.equal(COPY.bagCustomizeSkip, 'Calculate from actual play');
  assert.doesNotMatch(COPY.bagCustomizeSkip, /optional/i);
  assert.doesNotMatch(JSON.stringify(COPY), /Course name \(optional\)/);

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /canFinishBagCarrySetup|countTypedCarries/);
  assert.match(home, /markBagCustomizeSkipped|skipBagSetup/);
  assert.match(home, /doneDisabled=\{!canFinishBag\}/);
  assert.match(home, /disabled=\{starting \|\| !canStart\}/);
  assert.doesNotMatch(home, /disabled=\{starting \|\| !canStart \|\|.*[Bb]ag/);
  assert.doesNotMatch(home, /canStartRound\(\{[^}]*typedCount/);

  const actions = readFileSync(new URL('../ui/BagCarryList.tsx', import.meta.url), 'utf8');
  assert.match(actions, /doneDisabled/);
  assert.match(actions, /COPY\.bagCustomizeSkip/);
});
