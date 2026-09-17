import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COPY,
  formatHoleHeader,
  formatParLabel,
  formatSiLabel,
  formatTeeMeta,
  markedSuggestedMessage,
  voiceFailRecovery,
  yardsToGreenPlayerLabel,
} from './playerCopy';

test('player copy uses words, never ? or SI jargon dump', () => {
  assert.equal(formatParLabel(null), 'Par unknown');
  assert.equal(formatParLabel(4), 'Par 4');
  assert.equal(formatSiLabel(null), 'SI unknown');
  assert.equal(formatSiLabel(7), 'SI 7');
  assert.equal(formatHoleHeader(1, null), 'Hole 1 · Par unknown');
  assert.equal(formatHoleHeader(1, 4), 'Hole 1 · Par 4');
  assert.equal(COPY.homeLede, 'Find a course nearby, pick your tee, start the round.');
  assert.equal(COPY.nearbyHint, 'Courses near you — pull to refresh.');
  assert.equal(COPY.waitingOnGreen, 'Waiting on green location.');
  assert.equal(COPY.longPressGreen, 'Long-press to set the green');
  assert.equal(COPY.pickClub, 'Pick a club');
  assert.equal(COPY.pickClubLede, 'Picking a club marks where you hit from.');
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
  assert.equal(COPY.bagLede, 'Your bag. Turn off what you don’t carry.');
  assert.equal(COPY.restoreBag, 'Restore stock bag');
  assert.equal(COPY.typicalCarry, 'Typical');
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
});

test('voice fail recovery is Pick a club plus Say again, never voice-only', () => {
  const recovery = voiceFailRecovery();
  assert.equal(recovery.banner, COPY.didntCatchClub);
  assert.equal(recovery.primaryLabel, 'Pick a club');
  assert.equal(recovery.secondaryLabel, 'Say again');
  assert.equal(recovery.primaryLabel, COPY.pickClub);
  assert.notEqual(recovery.primaryLabel, COPY.sayClub);
});

test('tee meta shows rating and slope in player voice when present', () => {
  assert.equal(formatTeeMeta({ name: 'Gold', rating: null, slope: null, totalYards: null }), 'Gold');
  assert.equal(
    formatTeeMeta({ name: 'Gold', rating: 73.3, slope: 128, totalYards: 6800 }),
    'Gold · Rating 73.3 · Slope 128 · 6800 yd',
  );
});
