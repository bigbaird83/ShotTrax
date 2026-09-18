import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import { HOME_CLUB_TAP_MAX_YD } from './homeClubTap';
import { formatSuggestedClubChip } from './playerCopy';
import {
  carryFromClubLabel,
  clubHasWheelCarry,
  clubStripAllowsDashPill,
  clubStripCappedAtThree,
  clubStripCenterIsClosestCarry,
  clubStripCenterIsTeeClub,
  clubStripHasEmptySlot,
  clubStripInventZero,
  clubStripIsGappedList,
  clubStripIsWheel,
  clubStripLongerPeeksRight,
  clubStripOnlyTapMarks,
  clubStripPhoneMatchesWatch,
  clubStripPutterIncluded,
  clubStripScrollMarksShot,
  clubStripShorterPeeksLeft,
  clubStripSortedByCarry,
  clubStripSortedByIronNumber,
  clubStripSortedByName,
  clubStripSwipeMarksShot,
  clubStripTapMarksLikeChip,
  clubStripTapUsesHomeClubTap,
  clubStripCenterUsesHoleYards,
  clubStripCenterUsesYardsLeft,
  clubStripUsesFullBag,
  clubStripUsesRankedTop3,
  clubStripWraps,
  clubStripFillsBeforeSort,
  clubStripEstimatedEntersWheel,
  clubStripSeamGapOnly,
  clubStripWrapsToFillEmptySide,
  clubStripOpensOnSeam,
  clubStripOpeningWindowIsThree,
  clubStripNeighborPillsShowCarry,
  clubStripVisiblePills,
  clubStripOpeningIds,
  openingClubStripWindow,
  CLUB_STRIP_GAP,
  CLUB_STRIP_SEAM_GAP,
  CLUB_STRIP_VISIBLE_PILLS,
  PHONE_WHEEL_PILL_HEIGHT,
  WATCH_WHEEL_PILL_HEIGHT,
  phoneWheelPillTallerThanWatch,
  planClubStrip,
  wrapClubStripIndex,
} from './clubStrip';
import { planClubTapStart } from './homeClubTap';

test('strip is carry-sorted, full bag, putter off, center is closest to yards left', () => {
  assert.equal(clubStripSortedByCarry(), true);
  assert.equal(clubStripSortedByName(), false);
  assert.equal(clubStripSortedByIronNumber(), false);
  assert.equal(clubStripIsWheel(), true);
  assert.equal(clubStripIsGappedList(), false);
  assert.equal(clubStripWraps(), true);
  assert.equal(clubStripAllowsDashPill(), false);
  assert.equal(clubStripInventZero(), false);
  assert.equal(clubStripHasEmptySlot(), false);
  assert.equal(clubStripCappedAtThree(), false);
  assert.equal(clubStripShorterPeeksLeft(), true);
  assert.equal(clubStripLongerPeeksRight(), true);
  assert.equal(clubStripSwipeMarksShot(), false);
  assert.equal(clubStripScrollMarksShot(), false);
  assert.equal(clubStripOnlyTapMarks(), true);
  assert.equal(clubStripPutterIncluded(), false);
  assert.equal(clubStripCenterIsClosestCarry(), true);
  assert.equal(clubStripWrapsToFillEmptySide(), false);
  assert.equal(clubStripOpensOnSeam(), false);
  assert.equal(clubStripOpeningWindowIsThree(), true);
  assert.equal(clubStripNeighborPillsShowCarry(), true);
  assert.equal(clubStripVisiblePills(), 3);
  assert.equal(CLUB_STRIP_VISIBLE_PILLS, 3);
  assert.equal(clubStripCenterIsTeeClub(), false);
  assert.equal(clubStripPhoneMatchesWatch(), true);
  assert.equal(clubStripTapMarksLikeChip(), true);
  assert.equal(clubStripTapUsesHomeClubTap(), true);
  assert.equal(clubStripCenterUsesHoleYards(), true);
  assert.equal(clubStripCenterUsesYardsLeft(), true);
  assert.equal(clubStripUsesFullBag(), true);
  assert.equal(clubStripUsesRankedTop3(), false);
  assert.equal(carryFromClubLabel('6i · 185'), 185);
  assert.equal(carryFromClubLabel('6i · —'), null);
  assert.equal(carryFromClubLabel('3W · —'), null);
  assert.equal(carryFromClubLabel('4i · —'), null);
  assert.equal(carryFromClubLabel('7i · —'), null);
  assert.equal(clubHasWheelCarry(null), false);
  assert.equal(clubHasWheelCarry(0), false);
  assert.equal(clubHasWheelCarry(185), true);
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

test('after a shot lands the middle pill is closest to yards left, and the strip is the bag', () => {
  assert.equal(clubStripCenterUsesYardsLeft(), true);
  assert.equal(clubStripCenterIsTeeClub(), false);
  assert.equal(clubStripSortedByCarry(), true);
  assert.equal(clubStripSortedByName(), false);
  assert.equal(clubStripCappedAtThree(), false);
  assert.equal(clubStripUsesFullBag(), true);
  assert.equal(clubStripUsesRankedTop3(), false);
  assert.equal(clubStripPutterIncluded(), false);
  assert.equal(clubStripSwipeMarksShot(), false);
  assert.equal(clubStripOnlyTapMarks(), true);

  const afterShot = planClubStrip({
    clubs: [
      { id: 'club_driver', carry: 250 },
      { id: 'club_3w', carry: 230 },
      { id: 'club_5i', carry: 205 },
      { id: 'club_6i', carry: 185 },
      { id: 'club_8i', carry: 145 },
      { id: 'club_pw', carry: 130 },
      { id: PUTTER_CLUB_ID, carry: 8 },
    ],
    yardsLeft: 140,
  });
  assert.ok(afterShot.ids.length > 3);
  assert.deepEqual(afterShot.ids, ['club_pw', 'club_8i', 'club_6i', 'club_5i', 'club_3w', 'club_driver']);
  assert.equal(afterShot.pickId, 'club_8i');
  assert.notEqual(afterShot.pickId, 'club_driver');
  assert.equal(afterShot.ids[afterShot.openIndex - 1], 'club_pw');
  assert.equal(afterShot.ids[afterShot.openIndex + 1], 'club_6i');
  assert.ok(!afterShot.ids.includes(PUTTER_CLUB_ID));

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const plan = hole.slice(hole.indexOf('const stripPlan'), hole.indexOf('const stripItems'));
  assert.match(plan, /clubs\.map/);
  assert.match(plan, /toWheelFillClub/);
  assert.match(plan, /target\?\.dYards/);
  assert.doesNotMatch(plan, /rankTopClubs|ranked\.slice|slice\(0,\s*3\)/);
  assert.match(hole, /COPY\.allClubs/);
  assert.match(hole, /openBag/);

  const pick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  assert.match(pick, /clubs\.map/);
  assert.match(pick, /scroll=\{false\}/);
  assert.doesNotMatch(pick, /rankTopClubs[\s\S]*slice\(0,\s*3\)/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const stripClubs = watch.slice(watch.indexOf('private var stripClubs'), watch.indexOf('private func carryFromLabel'));
  assert.match(stripClubs, /session\.list\.bag/);
  assert.match(stripClubs, /sorted \{ \$0\.carry < \$1\.carry \}/);
  assert.match(stripClubs, /compactMap/);
  assert.match(stripClubs, /wheelClubs/);
  assert.doesNotMatch(stripClubs, /top3|localeCompare|name/);
  assert.doesNotMatch(stripClubs, /10_000/);
  assert.match(watch, /session\.list\.yardsToGreen/);
  assert.match(watch, /Text\("All clubs"\)/);
  const more = watch.slice(watch.indexOf('private var moreClubs'), watch.indexOf('private var stripScrollKey'));
  assert.match(more, /session\.list\.bag/);
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
  assert.match(pick, /void markClub\(club\)/);
  const pickMark = pick.slice(pick.indexOf('const markClub'), pick.indexOf('const rankedRef'));
  assert.match(pickMark, /markShotWithClub/);
  assert.match(pickMark, /tee: holeTee/);
});

test('phone and Watch strip UIs peek neighbors and mark only on tap', () => {
  const phone = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  assert.match(phone, /CLUB_STRIP_VISIBLE_PILLS/);
  assert.match(phone, /windowStart/);
  assert.match(phone, /onPress=\{\(\) => onPick\(item\.id\)\}/);
  assert.match(phone, /scrollTo/);
  assert.match(phone, /paddingHorizontal: 0/);
  assert.doesNotMatch(phone, /PILL_RATIO = 0\.62/);
  assert.doesNotMatch(phone, /width \* 0\.62/);
  assert.match(phone, /onMomentumScrollEnd=\{onWrapSettle\}/);
  assert.match(phone, /onScrollEndDrag=\{onWrapSettle\}/);
  assert.match(phone, /wrapClubStripIndex/);
  assert.match(phone, /CLUB_STRIP_SEAM_GAP/);
  assert.match(phone, /seamAfter/);
  assert.doesNotMatch(phone, /onScroll=\{/);
  const wrapFn = phone.slice(phone.indexOf('const onWrapSettle'), phone.indexOf('return ('));
  assert.doesNotMatch(wrapFn, /onPick/);
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
  assert.match(pick, /void markClub\(club\)/);
  assert.match(pick, /void markClub\(matched\)/);
  assert.doesNotMatch(pick, /styles\.top3/);
  assert.doesNotMatch(pick.slice(pick.indexOf('return ('), pick.length), /ranked\.map\(\(club, index\)/);

  assert.equal(phoneWheelPillTallerThanWatch(), true);
  assert.ok(PHONE_WHEEL_PILL_HEIGHT > WATCH_WHEEL_PILL_HEIGHT);
  assert.equal(WATCH_WHEEL_PILL_HEIGHT, 36);
  assert.match(phone, /PHONE_WHEEL_PILL_HEIGHT/);
  assert.doesNotMatch(dock, /compact/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /height: 36/);
  assert.match(watch, /ScrollView\(\.horizontal/);
  assert.match(watch, /onTapGesture/);
  assert.match(watch, /scrollTo\(stripWindowToken/);
  assert.match(watch, /anchor: \.leading/);
  assert.match(watch, /sorted \{ \$0\.carry < \$1\.carry \}/);
  assert.match(watch, /session\.list\.bag/);
  assert.match(watch, /compactMap/);
  assert.match(watch, /wheelClubs/);
  assert.doesNotMatch(watch, /TabView|tabViewStyle|stripPage/);
  assert.doesNotMatch(watch, /sorted \{ \$0\.carry > \$1\.carry \}/);
  assert.doesNotMatch(watch, /return 10_000|return 0/);
});

test('wheel order is carry not iron number; dash clubs are out with no empty slot', () => {
  assert.equal(clubStripSortedByCarry(), true);
  assert.equal(clubStripSortedByIronNumber(), false);
  assert.equal(clubStripAllowsDashPill(), false);
  assert.equal(clubStripInventZero(), false);
  assert.equal(clubStripHasEmptySlot(), false);
  assert.equal(clubStripIsWheel(), true);
  assert.equal(clubStripWraps(), true);

  const mixed = planClubStrip({
    clubs: [
      { id: 'club_4i', carry: 200 },
      { id: 'club_7i', carry: 165 },
      { id: 'club_3i', carry: 190 },
      { id: 'club_5i', carry: 175 },
      { id: 'club_2i', carry: 210 },
    ],
    yardsLeft: 188,
  });
  assert.deepEqual(mixed.ids, ['club_7i', 'club_5i', 'club_3i', 'club_4i', 'club_2i']);
  assert.notDeepEqual(mixed.ids, ['club_2i', 'club_3i', 'club_4i', 'club_5i', 'club_7i']);
  assert.equal(mixed.pickId, 'club_3i');

  const withDash = planClubStrip({
    clubs: [
      { id: 'club_3w', carry: null },
      { id: 'club_4i', carry: null },
      { id: 'club_7i', carry: null },
      { id: 'club_6i', carry: 185 },
      { id: 'club_driver', carry: 280 },
      { id: 'club_pw', carry: 130 },
      { id: PUTTER_CLUB_ID, carry: 8 },
    ],
    yardsLeft: 282,
  });
  assert.deepEqual(withDash.ids, ['club_pw', 'club_6i', 'club_driver']);
  assert.ok(!withDash.ids.includes('club_3w'));
  assert.ok(!withDash.ids.includes('club_4i'));
  assert.ok(!withDash.ids.includes('club_7i'));
  assert.equal(withDash.ids.length, 3);
  assert.equal(withDash.pickId, 'club_driver');
  assert.notEqual(withDash.pickId, 'club_3w');
  assert.equal(carryFromClubLabel('3W · —'), null);
  assert.equal(carryFromClubLabel('4i · —'), null);
  assert.equal(carryFromClubLabel('7i · —'), null);
  assert.equal(clubHasWheelCarry(0), false);
  assert.equal(clubHasWheelCarry(undefined), false);

  const estimated = planClubStrip({
    clubs: [
      { id: 'club_3w', carry: 230 },
      { id: 'club_7i', carry: null },
      { id: 'club_6i', carry: 185 },
    ],
    yardsLeft: 220,
  });
  assert.deepEqual(estimated.ids, ['club_6i', 'club_3w']);
  assert.ok(!estimated.ids.includes('club_7i'));
  assert.equal(estimated.ids.length, 2);
});

test('scrolling past the longest wraps to the shortest', () => {
  assert.equal(clubStripWraps(), true);
  assert.equal(clubStripIsWheel(), true);
  const strip = planClubStrip({
    clubs: [
      { id: 'club_driver', carry: 280 },
      { id: 'club_5i', carry: 205 },
      { id: 'club_pw', carry: 130 },
    ],
    yardsLeft: 280,
  });
  assert.deepEqual(strip.ids, ['club_pw', 'club_5i', 'club_driver']);
  assert.equal(strip.ids[strip.ids.length - 1], 'club_driver');
  assert.equal(strip.ids[0], 'club_pw');
  assert.equal(wrapClubStripIndex(strip.ids.length, strip.ids.length), 0);
  assert.equal(strip.ids[wrapClubStripIndex(strip.ids.length, strip.ids.length)], 'club_pw');
  assert.equal(wrapClubStripIndex(-1, strip.ids.length), strip.ids.length - 1);
  assert.equal(strip.ids[wrapClubStripIndex(-1, strip.ids.length)], 'club_driver');
  assert.equal(wrapClubStripIndex(0, 0), 0);

  const phone = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  assert.match(phone, /LOOP_COPIES = 3/);
  assert.match(phone, /wrapClubStripIndex/);
  assert.equal(clubStripSeamGapOnly(), true);
  assert.ok(CLUB_STRIP_SEAM_GAP > CLUB_STRIP_GAP);
  assert.match(phone, /CLUB_STRIP_SEAM_GAP/);
  assert.match(phone, /seamAfter/);
  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /wheelClubs/);
  assert.match(watch, /0\.\.<3/);
  assert.match(watch, /seamAfter/);
  assert.match(watch, /padding\(\.trailing, club\.seamAfter/);
});

test('fill estimated carries before sort; estimable iron is in, outside the span is out', () => {
  assert.equal(clubStripFillsBeforeSort(), true);
  assert.equal(clubStripEstimatedEntersWheel(), true);
  assert.equal(clubStripSortedByCarry(), true);
  assert.equal(clubStripSortedByIronNumber(), false);
  assert.equal(clubStripSortedByName(), false);
  assert.equal(clubStripAllowsDashPill(), false);
  assert.equal(clubStripInventZero(), false);

  const filled = planClubStrip({
    clubs: [
      { id: 'club_driver', loftRank: 0, typicalCarryYards: 230 },
      { id: 'club_3w', loftRank: 1, typicalCarryYards: null },
      { id: 'club_4i', loftRank: 6, typicalCarryYards: null },
      { id: 'club_7i', loftRank: 9, typicalCarryYards: 150 },
      { id: 'club_pw', loftRank: 12, typicalCarryYards: 110 },
      { id: 'club_48', loftRank: 13, typicalCarryYards: null },
      { id: PUTTER_CLUB_ID, loftRank: 18, typicalCarryYards: 8 },
    ],
    yardsLeft: 165,
  });
  assert.ok(filled.ids.includes('club_4i'));
  assert.ok(filled.ids.includes('club_7i'));
  assert.ok(filled.ids.includes('club_3w'));
  assert.ok(filled.carries['club_4i'] != null && filled.carries['club_4i'] > 0);
  assert.equal(filled.carries['club_7i'], 150);
  assert.ok(!filled.ids.includes('club_48'));
  assert.ok(!filled.ids.includes(PUTTER_CLUB_ID));
  assert.equal(filled.carries['club_48'], undefined);
  assert.deepEqual(filled.ids, ['club_pw', 'club_7i', 'club_4i', 'club_3w', 'club_driver']);
  assert.notDeepEqual(filled.ids, ['club_3w', 'club_4i', 'club_7i', 'club_pw', 'club_driver']);
  assert.ok(filled.ids.indexOf('club_7i') < filled.ids.indexOf('club_4i'));

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /toWheelFillClub/);
  assert.match(hole, /stripPlan\.carries/);
  const src = readFileSync(new URL('./clubStrip.ts', import.meta.url), 'utf8');
  const resolve = src.slice(src.indexOf('export function resolveWheelCarries'), src.indexOf('export function planClubStrip'));
  assert.match(resolve, /fillEstimatedCarries/);
  assert.ok(resolve.indexOf('fillEstimatedCarries') < src.indexOf('.sort((a, b) => a.carry - b.carry)'));
});

test('282-yard hole opens 2i, 3W, Dr with no wedge; 100-yard hole centers the closest wedge', () => {
  assert.equal(clubStripWrapsToFillEmptySide(), false);
  assert.equal(clubStripOpensOnSeam(), false);
  assert.equal(clubStripOpeningWindowIsThree(), true);
  assert.equal(clubStripNeighborPillsShowCarry(), true);
  assert.deepEqual(openingClubStripWindow({ count: 5, closestIndex: 4 }), { windowStart: 2, openIndex: 3 });
  assert.deepEqual(openingClubStripWindow({ count: 5, closestIndex: 1 }), { windowStart: 0, openIndex: 1 });

  const tee = planClubStrip({
    clubs: [
      { id: 'club_driver', carry: 280 },
      { id: 'club_3w', carry: 260 },
      { id: 'club_2i', carry: 243 },
      { id: 'club_pw', carry: 130 },
      { id: 'club_gw', carry: 110 },
      { id: PUTTER_CLUB_ID, carry: 8 },
    ],
    yardsLeft: 282,
  });
  assert.deepEqual(tee.ids, ['club_gw', 'club_pw', 'club_2i', 'club_3w', 'club_driver']);
  assert.equal(tee.pickId, 'club_driver');
  assert.notEqual(tee.pickId, 'club_2i');
  assert.deepEqual(clubStripOpeningIds(tee.ids, tee.windowStart), ['club_2i', 'club_3w', 'club_driver']);
  assert.equal(tee.ids[tee.openIndex], 'club_3w');
  assert.equal(tee.ids[tee.windowStart], 'club_2i');
  assert.equal(tee.ids[tee.windowStart + 2], 'club_driver');
  assert.ok(!clubStripOpeningIds(tee.ids, tee.windowStart).includes('club_gw'));
  assert.ok(!clubStripOpeningIds(tee.ids, tee.windowStart).includes('club_pw'));
  assert.ok(!tee.ids.includes(PUTTER_CLUB_ID));
  assert.equal(tee.carries.club_driver, 280);
  assert.equal(tee.carries.club_2i, 243);
  assert.equal(formatSuggestedClubChip('2i', 243), '2i · 243');
  assert.equal(formatSuggestedClubChip('3W', 260), '3W · 260');
  assert.equal(formatSuggestedClubChip('Dr', 280), 'Dr · 280');

  const wedge = planClubStrip({
    clubs: [
      { id: 'club_driver', carry: 280 },
      { id: 'club_pw', carry: 120 },
      { id: 'club_gw', carry: 105 },
      { id: 'club_sw', carry: 90 },
      { id: 'club_lw', carry: 75 },
    ],
    yardsLeft: 100,
  });
  assert.equal(wedge.pickId, 'club_gw');
  assert.notEqual(wedge.pickId, 'club_driver');
  assert.equal(wedge.ids[wedge.openIndex], 'club_gw');
  assert.deepEqual(clubStripOpeningIds(wedge.ids, wedge.windowStart), ['club_sw', 'club_gw', 'club_pw']);
  assert.equal(wedge.ids[wedge.openIndex - 1], 'club_sw');
  assert.equal(wedge.ids[wedge.openIndex + 1], 'club_pw');
  assert.ok(!clubStripOpeningIds(wedge.ids, wedge.windowStart).includes('club_driver'));

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /windowStart=\{stripPlan\.windowStart\}/);
  const phone = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  assert.match(phone, /windowStart/);
  assert.match(phone, /item\.label/);
  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /stripWindowStart/);
  assert.match(watch, /stripWindowToken/);
  assert.match(watch, /anchor: \.leading/);
  assert.doesNotMatch(watch, /0\.62/);
});
