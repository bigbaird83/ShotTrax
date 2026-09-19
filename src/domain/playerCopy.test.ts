import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COPY,
  finishPuttsChip,
  finishShotChip,
  formatHoleHeader,
  formatPlayHeader,
  formatPlayHeaderPrimary,
  formatPlayHeaderSecondary,
  formatParLabel,
  formatPickerLeftYards,
  formatSiLabel,
  formatSuggestedClubChip,
  formatTeeMeta,
  markedSuggestedMessage,
  voiceFailRecovery,
  yardsToGreenPlayerLabel,
  showWaitingOnLocationLine,
  waitingOnLocationWhenYardsShown,
  lockFrameEmptyStateWaitsForPhone,
  yardsAreOnTheCard,
} from './playerCopy';

test('player copy uses words, never ? or SI jargon dump', () => {
  assert.equal(formatParLabel(null), 'Par unknown');
  assert.equal(formatParLabel(4), 'Par 4');
  assert.equal(formatSiLabel(null), 'SI unknown');
  assert.equal(formatSiLabel(7), 'SI 7');
  assert.equal(formatHoleHeader(1, null), 'Hole 1 · Par unknown');
  assert.equal(formatHoleHeader(1, 4), 'Hole 1 · Par 4');
  assert.equal(formatPlayHeader(1, 4, 371), 'Hole 1 · Par 4 · 371 yd');
  assert.equal(formatPlayHeader(1, 4, null), 'Hole 1 · Par 4 · —');
  assert.doesNotMatch(formatPlayHeader(1, 4, 371), /SI |Rating |Slope /);
  assert.equal(COPY.homeLede, 'Find a course, pick your tee, start the round.');
  assert.equal(COPY.nearbyHint, 'Courses near you — pull to refresh.');
  assert.equal(COPY.waitingOnGreen, 'Waiting on green location.');
  assert.equal(COPY.courseCardMissingFrame, 'Need the course tee and green for this hole.');
  assert.equal(COPY.courseCardTilesMissing, 'Couldn’t load the hole map.');
  assert.equal(lockFrameEmptyStateWaitsForPhone(), false);
  assert.doesNotMatch(COPY.courseCardMissingFrame, /location|GPS|phone|fix/i);
  assert.doesNotMatch(COPY.courseCardTilesMissing, /location|GPS|phone|fix/i);
  assert.equal(COPY.longPressGreen, 'Long-press to set the green');
  assert.equal(COPY.pickClub, 'Pick a club');
  assert.equal(COPY.pickClubLede, 'Picking a club marks where you hit from.');
  assert.equal(COPY.firstLaunchTip, 'Pick a club → walk → press to mark');
  assert.equal(COPY.dismissFirstLaunchTip, 'Got it');
  assert.equal(COPY.sayClub, 'Say a club');
  assert.equal(COPY.sayAgain, 'Say again');
  assert.equal(COPY.allClubs, 'All clubs');
  assert.equal(COPY.top3Unlock, 'Top clubs unlock after a few shots');
  assert.equal(COPY.stickyClub, 'Same club');
  assert.equal(COPY.undoLast, 'Undo last');
  assert.equal(COPY.markWithoutClub, 'Mark without club');
  assert.equal(COPY.approximate, 'Approximate');
  assert.equal(COPY.suggested, 'Suggested');
  assert.equal(COPY.changeClub, 'Change club');
  assert.equal(COPY.editShot, 'Edit shot');
  assert.equal(COPY.moveFrom, 'Move from');
  assert.equal(COPY.moveTo, 'Move to');
  assert.equal(COPY.undoEdit, 'Undo edit');
  assert.equal(COPY.deleteShot, 'Delete shot');
  assert.equal(COPY.deleteShotConfirm, 'Delete this shot?');
  assert.equal(COPY.editFromHint, 'Tap the new from pin.');
  assert.equal(COPY.editToHint, 'Tap the new landing pin.');
  assert.equal(COPY.bagLede, 'Your bag. Turn off what you don’t carry. Carry is on each row.');
  assert.equal(COPY.restoreBag, 'Restore stock bag');
  assert.equal(COPY.typicalCarry, 'Typical');
  assert.equal(COPY.typicalCarryYards, 'Carry (yd)');
  assert.equal(COPY.clearTypicalCarry, 'Clear carry');
  assert.equal(COPY.bagCustomizeSkip, 'Calculate from actual play');
  assert.equal(COPY.estimated, 'Estimated');
  assert.equal(COPY.insertShot, 'Insert shot');
  assert.equal(COPY.nerdOut, 'Nerd out');
  assert.equal(COPY.nerdOutLede, 'Score, putts, and how far you hit each club.');
  assert.equal(COPY.scorecard, 'Scorecard');
  assert.equal(COPY.putts, 'Putts');
  assert.equal(COPY.madeIt, 'Made it');
  assert.equal(COPY.puttSheetLede, 'How long was the putt?');
  assert.equal(COPY.menu, 'Menu');
  assert.equal(COPY.previousHole, 'Previous hole');
  assert.equal(COPY.settings, 'Settings');
  assert.equal(COPY.home, 'Home');
  assert.equal(COPY.back, 'Back');
  assert.equal(COPY.addShot, 'Add shot');
  assert.equal(COPY.courseCardMissingFrame, 'Need the course tee and green for this hole.');
  assert.equal(COPY.courseCardTilesMissing, 'Couldn’t load the hole map.');
  assert.equal(lockFrameEmptyStateWaitsForPhone(), false);
  assert.doesNotMatch(COPY.courseCardMissingFrame, /location|GPS|phone|fix/i);
  assert.doesNotMatch(COPY.courseCardTilesMissing, /location|GPS|phone|fix/i);
  assert.equal(COPY.shot, 'Shot');
  assert.equal(COPY.placed, 'Placed');
  assert.equal(COPY.placeFromHint, 'Tap where you hit from.');
  assert.equal(COPY.placeToHint, 'Tap or drag where it landed.');
  assert.equal(COPY.cancelPlace, 'Cancel');
  assert.equal(COPY.confirmPlace, 'Confirm shot');
  assert.equal(COPY.openPhone, 'open the phone');
  assert.equal(COPY.selectCourse, 'Select course');
  assert.equal(COPY.prevHole, 'Prev hole');
  assert.equal(COPY.nextHole, 'Next hole');
  assert.equal(COPY.courseDistance, 'Course distance');
  assert.equal(COPY.courseDistanceSetting, 'Course distance: Miles / Kilometers');
  assert.equal(COPY.colorTheme, 'Color theme');
  assert.equal(COPY.themeDarkLime, 'Dark lime');
  assert.equal(COPY.themeLight, 'Light');
  assert.equal(COPY.themeHighContrast, 'High contrast');
  assert.equal(COPY.miles, 'Miles');
  assert.equal(COPY.kilometers, 'Kilometers');
  assert.equal(COPY.noRounds, 'Your first round will show up here.');
  assert.equal(COPY.firstRoundHint, 'Pick a course and start 9 or 18.');
  assert.equal(COPY.nearbyEmpty, 'No courses found.');
  assert.equal(COPY.nearbyEmptyHint, 'Pull to refresh, or search by name, city, state, or zip.');
  assert.equal(COPY.courseNamePlaceholder, 'Search by name, city, state, or zip');
  assert.equal(COPY.nearbyUnavailable, 'Courses aren’t available right now. Pull to refresh or try again.');
  assert.doesNotMatch(COPY.courseNamePlaceholder, /optional/i);
  assert.doesNotMatch(JSON.stringify(COPY), /Course name \(optional\)|type a course name to start/i);
  assert.equal(formatPlayHeaderPrimary(1), 'Hole 1');
  assert.equal(formatPlayHeaderSecondary(4, 'Gold'), 'Par 4 · Gold');
  assert.equal(formatPlayHeaderSecondary(null), 'Par unknown');
  assert.equal(COPY.noShots, 'No shots yet. Pick a club after you hit.');
  assert.equal(finishPuttsChip(4), 'Finish putts · Hole 4');
  assert.equal(finishShotChip(2), 'Finish shot · Hole 2');
  assert.equal(markedSuggestedMessage('7i'), 'Marked 7i (suggested) · Change club.');
});

test('player copy never mentions API, OSM, invent, centroid, or meters', () => {
  const blob = JSON.stringify(COPY);
  assert.doesNotMatch(blob, /API|OSM|invent|centroid|Pro green|lat\/lng|accuracy/i);
});

test('yards to green is a big number or — plus waiting copy', () => {
  const live = yardsToGreenPlayerLabel({ yards: 164, quality: 'good' });
  assert.equal(live.value, '164');
  assert.doesNotMatch(live.detail, /SOFT|15–25|GPS/i);

  const missing = yardsToGreenPlayerLabel(
    { yards: null, quality: 'none' },
    { hasFix: true, hasGreen: false },
  );
  assert.equal(missing.value, '—');
  assert.equal(missing.detail, COPY.waitingOnGreen);

  assert.equal(waitingOnLocationWhenYardsShown(), false);
  assert.equal(yardsAreOnTheCard({ yards: 282, quality: 'good' }), true);
  assert.equal(
    showWaitingOnLocationLine({ yards: 282, quality: 'good', hasFix: false, hasGreen: true }),
    false,
  );
  assert.equal(yardsToGreenPlayerLabel({ yards: 282, quality: 'none' }).value, '282');
  assert.doesNotMatch(yardsToGreenPlayerLabel({ yards: 282, quality: 'none' }).detail, /Waiting/);
  assert.equal(
    showWaitingOnLocationLine({ yards: null, quality: 'none', hasFix: false, hasGreen: true }),
    true,
  );
});

test('voice fail recovery is Pick a club plus Say again, never voice-only', () => {
  const recovery = voiceFailRecovery();
  assert.equal(recovery.banner, COPY.didntCatchClub);
  assert.equal(recovery.primaryLabel, 'Pick a club');
  assert.equal(recovery.secondaryLabel, 'Say again');
  assert.equal(recovery.primaryLabel, COPY.pickClub);
  assert.notEqual(recovery.primaryLabel, COPY.sayClub);
});

test('suggested chips show that club’s carry, not yards-to-green', () => {
  assert.equal(formatSuggestedClubChip('7i', 155), '7i · 155');
  assert.equal(formatSuggestedClubChip('7i', null), '7i · —');
  assert.equal(formatSuggestedClubChip('7i', undefined), '7i · —');
  assert.equal('chipYardsDuringUndo' in COPY, false);
});

test('picker remaining yards are 148 left only when quality is good or soft', () => {
  assert.equal(formatPickerLeftYards({ yards: 148, quality: 'good' }), '148 left');
  assert.equal(formatPickerLeftYards({ yards: 148, quality: 'soft' }), '148 left');
  assert.equal(formatPickerLeftYards({ yards: 148, quality: 'none' }), '—');
  assert.equal(formatPickerLeftYards({ yards: 148, quality: 'forced' }), '—');
  assert.equal(formatPickerLeftYards({ yards: null, quality: 'good' }), '—');
  assert.equal(formatPickerLeftYards({ yards: 282, quality: 'good' }), '282 left');
  assert.equal(formatPickerLeftYards({ yards: 401, quality: 'good' }), '401 left');
  assert.equal(yardsToGreenPlayerLabel({ yards: 282, quality: 'good' }).value, '282');
  assert.equal(yardsToGreenPlayerLabel({ yards: 401, quality: 'good' }).value, '401');
});

test('tee meta shows rating and slope in player voice when present', () => {
  assert.equal(formatTeeMeta({ name: 'Gold', rating: null, slope: null, totalYards: null }), 'Gold');
  assert.equal(
    formatTeeMeta({ name: 'Gold', rating: 73.3, slope: 128, totalYards: 6800 }),
    'Gold · Rating 73.3 · Slope 128 · 6800 yd',
  );
});
