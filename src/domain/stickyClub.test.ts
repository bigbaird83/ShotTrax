import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BAG } from './defaultBag';
import { resolveStickyClub, selectClubForMark } from './stickyClub';
import type { Club } from './types';
import { matchSpokenClub } from './voiceClub';

function bag(): Club[] {
  return DEFAULT_BAG.map((club) => ({ ...club, enabled: true }));
}

test('sticky club prefers the last marked club on this round', () => {
  const clubs = bag();
  const sticky = resolveStickyClub({
    enabledClubs: clubs,
    roundLastClubId: 'club_7i',
    lastShotClubId: 'club_driver',
  });
  assert.equal(sticky?.id, 'club_7i');
});

test('sticky club skips a club that was turned off', () => {
  const clubs = bag().map((club) => (club.id === 'club_7i' ? { ...club, enabled: false } : club));
  const sticky = resolveStickyClub({
    enabledClubs: clubs,
    roundLastClubId: 'club_7i',
    lastShotClubId: 'club_8i',
  });
  assert.equal(sticky?.id, 'club_8i');
});

test('voice selects a club for the next Mark and does not imply a commit', () => {
  const clubs = bag();
  const heard = matchSpokenClub('seven iron', clubs);
  const selected = selectClubForMark(heard, clubs);
  assert.equal(selected?.id, 'club_7i');
  assert.equal(selectClubForMark(null, clubs), null);
});

test('default sticky is the first enabled club when nothing has been marked', () => {
  const sticky = resolveStickyClub({ enabledClubs: bag() });
  assert.equal(sticky?.id, 'club_driver');
});
