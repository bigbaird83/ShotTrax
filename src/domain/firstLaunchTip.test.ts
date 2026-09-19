import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import {
  FIRST_LAUNCH_TIP_LINE,
  FIRST_LAUNCH_TIP_SETTING_KEY,
  firstLaunchTipBeats,
  firstLaunchTipBlocksMark,
  firstLaunchTipHistoryRoundCount,
  firstLaunchTipIsDismissible,
  firstLaunchTipLine,
  firstLaunchTipSeenValue,
  firstLaunchTipShownOnce,
  isFirstLaunchTipSeen,
  shouldShowFirstLaunchTip,
  shouldSkipFirstLaunchTipForHistory,
} from './firstLaunchTip';
import { COURSE_SEARCH_PLACEHOLDER } from './coursePick';
import { signalLabAddShotGestureLock } from './playLayout';

test('first-launch tip is three beats, once, dismissible, and never blocks mark', () => {
  assert.deepEqual(firstLaunchTipBeats(), ['Pick a club', 'walk', 'press to mark']);
  assert.equal(firstLaunchTipLine(), 'Pick a club → walk → press to mark');
  assert.equal(FIRST_LAUNCH_TIP_LINE, 'Pick a club → walk → press to mark');
  assert.equal(COPY.firstLaunchTip, 'Pick a club → walk → press to mark');
  assert.equal(COPY.dismissFirstLaunchTip, 'Got it');
  assert.equal(firstLaunchTipIsDismissible(), true);
  assert.equal(firstLaunchTipBlocksMark(), false);
  assert.equal(firstLaunchTipShownOnce(), true);
  assert.equal(FIRST_LAUNCH_TIP_SETTING_KEY, 'first_launch_mark_tip');
  assert.equal(firstLaunchTipSeenValue(), '1');
  assert.equal(isFirstLaunchTipSeen(null), false);
  assert.equal(isFirstLaunchTipSeen(''), false);
  assert.equal(isFirstLaunchTipSeen(firstLaunchTipSeenValue()), true);

  assert.equal(shouldShowFirstLaunchTip({ seen: null, historyRoundCount: 0 }), true);
  assert.equal(shouldShowFirstLaunchTip({ seen: undefined, historyRoundCount: 0 }), true);
  assert.equal(shouldShowFirstLaunchTip({ seen: '1', historyRoundCount: 0 }), false);
  assert.equal(shouldSkipFirstLaunchTipForHistory(1), true);
  assert.equal(shouldShowFirstLaunchTip({ seen: null, historyRoundCount: 1 }), false);
  assert.equal(shouldShowFirstLaunchTip({ seen: null, historyRoundCount: 3 }), false);
  assert.equal(
    firstLaunchTipHistoryRoundCount({ roundIds: ['live'], currentRoundId: 'live' }),
    0,
  );
  assert.equal(
    firstLaunchTipHistoryRoundCount({ roundIds: ['old', 'live'], currentRoundId: 'live' }),
    1,
  );
});

test('play shows the tip once, persists seen on dismiss, and mark stays live', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');

  assert.match(hole, /shouldShowFirstLaunchTip/);
  assert.match(hole, /firstLaunchTipHistoryRoundCount|historyRoundCount/);
  assert.match(hole, /COPY\.firstLaunchTip/);
  assert.match(hole, /COPY\.dismissFirstLaunchTip/);
  assert.match(hole, /markFirstLaunchTipSeen/);
  assert.match(hole, /hasSeenFirstLaunchTip/);
  assert.match(hole, /setFirstLaunchTipDismissed/);
  assert.doesNotMatch(hole, /disabled=\{[^}]*[Tt]ip/);
  assert.doesNotMatch(hole, /firstLaunchTipBlocksMark\(\) === true/);

  const strip = hole.slice(hole.indexOf('<ClubStrip'), hole.indexOf('void markClub(full)'));
  assert.match(strip, /disabled=\{readOnly \|\| placing\}/);
  assert.doesNotMatch(strip, /[Tt]ip/);
  assert.match(hole, /void markClub\(full\)/);
  assert.match(hole, /disabled=\{busy \|\| readOnly \|\| placing\}/);

  const mark = hole.slice(hole.indexOf('const markClub'), hole.indexOf('const onMark'));
  assert.match(mark, /if \(readOnly \|\| placing\) return;/);
  assert.doesNotMatch(mark, /[Tt]ip/);

  assert.match(repo, /FIRST_LAUNCH_TIP_SETTING_KEY/);
  assert.match(repo, /export function hasSeenFirstLaunchTip/);
  assert.match(repo, /export function markFirstLaunchTipSeen/);
  assert.match(repo, /firstLaunchTipSeenValue\(\)/);
});

test('build 36 cook gate still has Add-shot P0, required course pick, icon, and this tip', () => {
  assert.deepEqual(signalLabAddShotGestureLock(), {
    firstFrameUsesCourseCard: true,
    reframesAfterInitialFrame: false,
    scrollZoomAfterFrame: true,
    dockFrostPointerEvents: 'none',
  });
  assert.equal(COURSE_SEARCH_PLACEHOLDER, 'Search by name, city, state, or zip');
  assert.equal(COPY.courseNamePlaceholder, 'Search by name, city, state, or zip');
  assert.doesNotMatch(JSON.stringify(COPY), /Course name \(optional\)|type a course name to start/i);
  assert.equal(COPY.firstLaunchTip, 'Pick a club → walk → press to mark');

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /disabled=\{starting \|\| !canStart\}/);

  const readme = readFileSync(new URL('../../assets/images/README.md', import.meta.url), 'utf8');
  assert.match(readme, /Build 36/);
  assert.match(readme, /illuminated pin/);
  assert.match(readme, /full wordmark \*\*ShotTraxx\*\*/);
});
