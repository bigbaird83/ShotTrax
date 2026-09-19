import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import { FIRST_LAUNCH_TIP_LINE } from './firstLaunchTip';
import {
  HOW_TO_FINISH_LINE,
  HOW_TO_MARK_LINE,
  HOW_TO_TITLE,
  howToAutoShows,
  howToBeats,
  howToFinishLine,
  howToIsModalSpam,
  howToIsReplayable,
  howToMarkLine,
  howToReplacesFirstLaunchTip,
  howToTitle,
} from './howTo';

test('how-to is fuller, replayable, and keeps the first-launch tip', () => {
  assert.equal(howToTitle(), 'How to play');
  assert.equal(COPY.howTo, 'How to play');
  assert.equal(howToMarkLine(), 'Pick a club → walk → press to mark');
  assert.equal(HOW_TO_MARK_LINE, FIRST_LAUNCH_TIP_LINE);
  assert.equal(COPY.howToMark, FIRST_LAUNCH_TIP_LINE);
  assert.equal(COPY.firstLaunchTip, FIRST_LAUNCH_TIP_LINE);
  assert.equal(howToFinishLine(), 'Finish hole for a chip-in or hole-out off the green.');
  assert.equal(COPY.howToFinish, HOW_TO_FINISH_LINE);
  assert.deepEqual(howToBeats(), [HOW_TO_MARK_LINE, HOW_TO_FINISH_LINE]);
  assert.equal(howToAutoShows(), false);
  assert.equal(howToIsReplayable(), true);
  assert.equal(howToReplacesFirstLaunchTip(), false);
  assert.equal(howToIsModalSpam(), false);
  assert.equal(HOW_TO_TITLE, 'How to play');
});

test('how-to is reachable after first launch from settings, home, and play', () => {
  const settings = readFileSync(new URL('../../app/settings.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const body = readFileSync(new URL('../ui/HowToBody.tsx', import.meta.url), 'utf8');

  assert.match(settings, /COPY\.howTo/);
  assert.match(settings, /setHowToOpen\(true\)/);
  assert.match(settings, /<HowToBody/);
  assert.match(home, /COPY\.howTo/);
  assert.match(home, /setHowToOpen\(true\)/);
  assert.match(home, /<HowToBody/);
  assert.match(hole, /COPY\.howTo/);
  assert.match(hole, /setHowToOpen\(true\)/);
  assert.match(hole, /<HowToBody/);
  assert.match(hole, /shouldShowFirstLaunchTip/);
  assert.match(body, /COPY\.howToMark/);
  assert.match(body, /COPY\.howToFinish/);
  assert.match(body, /colors\.lime/);
  assert.doesNotMatch(settings, /howToAutoShows\(\) === true/);
  assert.doesNotMatch(home, /useEffect\(\(\) => \{\s*setHowToOpen\(true\)/);
});
