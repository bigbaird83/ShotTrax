import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import { HOME_CLUB_TAP_MAX_YD } from './homeClubTap';
import { formatSuggestedClubChip } from './playerCopy';
import {
  carryFromClubLabel,
  clubStripCappedAtThree,
  clubStripCenterIsClosestCarry,
  clubStripCenterIsTeeClub,
  clubStripLongerPeeksRight,
  clubStripOnlyTapMarks,
  clubStripPhoneMatchesWatch,
  clubStripPutterIncluded,
  clubStripScrollMarksShot,
  clubStripShorterPeeksLeft,
  clubStripSortedByCarry,
  clubStripSortedByName,
  clubStripSwipeMarksShot,
  clubStripTapMarksLikeChip,
  clubStripTapUsesHomeClubTap,
  clubStripCenterUsesHoleYards,
  planClubStrip,
} from './clubStrip';
import { planClubTapStart } from './homeClubTap';

test('strip is carry-sorted, full bag, putter off, center is closest to yards left', () => {
  assert.equal(clubStripSortedByCarry(), true);
  assert.equal(clubStripSortedByName(), false);
  assert.equal(clubStripCappedAtThree(), false);
  assert.equal(clubStripShorterPeeksLeft(), true);
  assert.equal(clubStripLongerPeeksRight(), true);
  assert.equal(clubStripSwipeMarksShot(), false);
  assert.equal(clubStripScrollMarksShot(), false);
  assert.equal(clubStripOnlyTapMarks(), true);
  assert.equal(clubStripPutterIncluded(), false);
  assert.equal(clubStripCenterIsClosestCarry(), true);
  assert.equal(clubStripCenterIsTeeClub(), false);
  assert.equal(clubStripPhoneMatchesWatch(), true);
  assert.equal(clubStripTapMarksLikeChip(), true);
  assert.equal(clubStripTapUsesHomeClubTap(), true);
  assert.equal(clubStripCenterUsesHoleYards(), true);
  assert.equal(carryFromClubLabel('6i · 185'), 185);
  assert.equal(carryFromClubLabel('6i · —'), null);
  assert.equal(formatSuggestedClubChip('6i', 185), '6i · 185');

  const strip = planClubStrip({
    clubs: [
      { id: PUTTER_CLUB_ID, carry: 8 },
      { id: 'club_driver', carry: 250 },
      { id: 'club_5i', carry: 205 },
      { id: 'club_6i', carry: 185 },
      { id: 'club_7i', carry: 165 },
      { id: 'club_pw', carry: 130 },
    ],
    yardsLeft: 190,
  });
  assert.deepEqual(strip.ids, ['club_pw', 'club_7i', 'club_6i', 'club_5i', 'club_driver']);
  assert.ok(strip.ids.length > 3);
  assert.equal(strip.pickId, 'club_6i');
  assert.equal(strip.openIndex, 2);
  assert.equal(strip.ids[strip.openIndex - 1], 'club_7i');
  assert.equal(strip.ids[strip.openIndex + 1], 'club_5i');
  assert.ok(!strip.ids.includes(PUTTER_CLUB_ID));

  const afterShot = planClubStrip({
    clubs: [
      { id: 'club_driver', carry: 250 },
      { id: 'club_5i', carry: 205 },
      { id: 'club_6i', carry: 185 },
      { id: 'club_8i', carry: 145 },
      { id: 'club_pw', carry: 130 },
    ],
    yardsLeft: 140,
  });
  assert.equal(afterShot.pickId, 'club_8i');
  assert.notEqual(afterShot.pickId, 'club_driver');
  assert.equal(afterShot.ids[afterShot.openIndex - 1], 'club_pw');
  assert.equal(afterShot.ids[afterShot.openIndex + 1], 'club_6i');
});

test('phone strip tap is the old chip mark, and the center pill is closest to hole yards', () => {
  assert.equal(clubStripTapMarksLikeChip(), true);
  assert.equal(clubStripTapUsesHomeClubTap(), true);
  assert.equal(clubStripCenterUsesHoleYards(), true);
  assert.equal(clubStripCenterIsTeeClub(), false);
  assert.equal(HOME_CLUB_TAP_MAX_YD, 600);

  const bag = [
    { id: 'club_driver', carry: 250 },
    { id: 'club_5i', carry: 205 },
    { id: 'club_6i', carry: 185 },
    { id: 'club_7i', carry: 165 },
  ];
  const mid = planClubStrip({ clubs: bag, yardsLeft: 190 });
  assert.equal(mid.pickId, 'club_6i');
  assert.notEqual(mid.pickId, 'club_driver');
  assert.notEqual(mid.ids[0], mid.pickId);

  const tee = { lat: 37.0, lng: -122.0 };
  const home = { lat: 40.7128, lng: -74.006 };
  const onCourse = { lat: 37.0 + (80 * 0.9144) / 111_320, lng: -122.0 };
  assert.deepEqual(planClubTapStart({ phone: home, tee }), {
    kind: 'tee',
    start: tee,
    source: 'placed',
    runsAcceptFix: false,
  });
  assert.deepEqual(planClubTapStart({ phone: onCourse, tee }), {
    kind: 'phone',
    start: onCourse,
    source: 'gps',
    runsAcceptFix: true,
  });

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const strip = hole.slice(hole.indexOf('<ClubStrip'), hole.indexOf('COPY.allClubs'));
  assert.match(strip, /void markClub\(full\)/);
  const mark = hole.slice(hole.indexOf('const markClub'), hole.indexOf('const onMark'));
  assert.match(mark, /markShotWithClub/);
  assert.match(mark, /tee: holeTee/);
  assert.doesNotMatch(mark, /skipHomeClubTap|withoutTee/);

  const pick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  const pickStrip = pick.slice(pick.indexOf('<ClubStrip'), pick.indexOf('styles.grid'));
  assert.match(pickStrip, /void markClub\(full\)/);
  const pickMark = pick.slice(pick.indexOf('const markClub'), pick.indexOf('const rankedRef'));
  assert.match(pickMark, /markShotWithClub/);
  assert.match(pickMark, /tee: holeTee/);
});

test('phone and Watch strip UIs peek neighbors and mark only on tap', () => {
  const phone = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  assert.match(phone, /PILL_RATIO = 0\.62/);
  assert.match(phone, /onPress=\{\(\) => onPick\(item\.id\)\}/);
  assert.match(phone, /scrollTo/);
  assert.match(phone, /paddingHorizontal: Math.max\(0, \(width - pillWidth\) \/ 2\)/);
  assert.doesNotMatch(phone, /onMomentumScrollEnd|onScrollEndDrag|onScroll=\{/);
  assert.doesNotMatch(phone, /PUTTER_CLUB_ID|club_putter/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.match(dock, /<ClubStrip/);
  assert.match(dock, /void markClub\(full\)/);
  assert.match(dock, /COPY\.allClubs/);
  assert.match(dock, /COPY\.sayClub/);
  assert.doesNotMatch(dock, /ranked\.map\(\(club, index\)/);
  assert.doesNotMatch(dock, /club_putter/);
  assert.match(hole, /planClubStrip/);
  assert.match(hole, /target\?\.dYards/);
  assert.equal(HOME_CLUB_TAP_MAX_YD, 600);

  const pick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  assert.match(pick, /<ClubStrip/);
  assert.match(pick, /planClubStrip/);
  assert.match(pick, /void markClub\(full\)/);
  assert.match(pick, /void markClub\(matched\)/);
  assert.doesNotMatch(pick, /styles\.top3/);
  assert.doesNotMatch(pick.slice(pick.indexOf('return ('), pick.length), /ranked\.map\(\(club, index\)/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /ScrollView\(\.horizontal/);
  assert.match(watch, /onTapGesture/);
  assert.match(watch, /scrollTo\(stripPickId/);
  assert.match(watch, /anchor: \.center/);
  assert.match(watch, /sorted \{ \$0\.carry < \$1\.carry \}/);
  assert.match(watch, /session\.list\.bag/);
  assert.doesNotMatch(watch, /TabView|tabViewStyle|stripPage/);
  assert.doesNotMatch(watch, /sorted \{ \$0\.carry > \$1\.carry \}/);
});
