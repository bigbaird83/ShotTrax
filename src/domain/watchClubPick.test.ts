import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID, STOCK_AVG_CARRY } from './defaultBag';
import { COPY } from './playerCopy';
import { planClubPickLeave } from './clubPickNav';
import {
  planWatchClubTap,
  watchAllClubsLabel,
  watchAllClubsSitsUnderTop3,
  watchBagPickMarksLikeTop3,
  watchBagPickUsesChosenFix,
  watchBagPickUsesHomeClubTap,
  watchBagPutterOpensPuttSheet,
  watchClubListTop3,
  watchClubPickBackLeavesBall,
  watchClubPickBackMarksShot,
  watchClubPickHomeMarksShot,
  watchClubPickHomeOpensInRoundMenu,
  watchClubPickOpensOnTop3,
  watchClubPickRestOfBag,
  watchPutterInTop3,
  watchPutterOpensPuttSheet,
  watchPutterPickOpensPuttSheetImmediately,
  watchPuttChipsShowMadeIt,
  watchPutterSkipsAttachWatchFix,
  watchRestOfBagBelowAllClubs,
  watchSameClubSitsAboveTop3,
  watchSameClubSitsOnFirstScreen,
  watchSameClubIsLightOnDark,
  watchBackHomeDarkensRows,
  watchFirstScreenFitsWithoutScroll,
  watchTop3DropsYards,
  watchTop3NumberIsCarry,
  watchTop3NumberIsYardsLeft,
  watchFirstSuggestedIsThePick,
  watchSuggestedPillsLookTheSame,
  watchTop3IsSidewaysStrip,
  watchStackedSuggestionRows,
  watchStripSwipeLeftIsShorter,
  watchStripSwipeRightIsLonger,
  watchAllClubsExtendsStrip,
  planWatchClubStrip,
  resolveWatchBagCarry,
  watchBagLabelForPush,
  watchCarryFromLabel,
  watchClubListKeepsFullBag,
  watchSelectedClubNeverVanishes,
  watchSelectedClubHighlightNeverHidesPill,
  watchSelectedHighlightInPlace,
  watchStripNeverDropsBagClub,
  watchTop3ByRemainingYards,
  formatWatchSameClub,
  watchTop3MatchesPhone,
  watchTop3RequiresScroll,
  watchStripShorterPeeksLeft,
  watchStripLongerPeeksRight,
  watchStripSortedByCarry,
  watchStripSortedByName,
  watchStripSwipeMarksShot,
  watchStripScrollMarksShot,
  watchStripTapMarksShot,
  watchStripTapUsesHomeClubTap,
  watchStripOnlyTapMarks,
  watchStripCappedAtThree,
  watchStripUsesFullBag,
  watchStripIsWheel,
  watchStripWraps,
  watchStripSortedByIronNumber,
  watchStripAllowsDashPill,
  watchStripInventZero,
  watchOneHomeOnly,
  watchSameClubSharesRowWithAllClubs,
  watchSameClubVisibleWithoutShot,
  watchShowPuttPills,
  watchShowsHoleOut,
  watchShowsScorecard,
  watchPuttChipsUseSignalGate,
  watchTapUsesWatchGps,
  watchHoleOutClosesOnLastMark,
  watchHoleOutInventPutts,
  watchBackHomeAreTinyText,
  wrapWatchClubStripIndex,
} from './watchClubPick';
import { clubStripOpeningIds, planClubStrip } from './clubStrip';
import { HOME_CLUB_TAP_MAX_YD, homeClubTapPaths } from './homeClubTap';
import { formatPickerLeftYards, formatSuggestedClubChip } from './playerCopy';
import { rankDistanceYards, rankTopClubs } from './rankClubs';
import { clubListPayload } from './watchMessages';

test('Watch opens on the same top 3 as the phone; no scroll to hit one', () => {
  assert.equal(watchClubPickOpensOnTop3(), true);
  assert.equal(watchTop3MatchesPhone(), true);
  assert.equal(watchTop3RequiresScroll(), false);
  assert.equal(watchAllClubsSitsUnderTop3(), true);
  assert.equal(watchAllClubsLabel(), 'All clubs');
  assert.equal(COPY.allClubs, 'All clubs');
  assert.equal(watchRestOfBagBelowAllClubs(), true);
  assert.equal(watchSameClubSitsAboveTop3(), false);
  assert.equal(watchSameClubSitsOnFirstScreen(), false);
  assert.equal(watchSameClubVisibleWithoutShot(), false);
  assert.equal(watchShowsHoleOut(), true);
  assert.equal(watchShowsScorecard(), false);
  assert.equal(watchFirstScreenFitsWithoutScroll(), true);
  assert.equal(watchBackHomeDarkensRows(), false);
  assert.equal(watchSameClubIsLightOnDark(), true);
  assert.equal(watchTop3DropsYards(), false);
  assert.equal(formatWatchSameClub('2i · 190'), 'Same club · 2i');
  assert.equal(formatWatchSameClub('2i'), 'Same club · 2i');
  assert.equal(formatWatchSameClub(null), 'Same club');

  const phoneTop3 = ['club_7i', 'club_8i', 'club_6i'];
  assert.deepEqual(watchClubListTop3([...phoneTop3, PUTTER_CLUB_ID, 'club_pw']), phoneTop3);
  assert.deepEqual(
    watchClubPickRestOfBag({
      top3: phoneTop3,
      bag: ['club_driver', 'club_7i', 'club_8i', 'club_6i', 'club_pw', PUTTER_CLUB_ID],
    }),
    ['club_driver', 'club_pw', PUTTER_CLUB_ID],
  );

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const pick = watchUi.slice(watchUi.indexOf('private var clubPick'), watchUi.indexOf('private var moreClubs'));
  assert.match(pick, /session\.leave\("back"\)/);
  assert.match(pick, /session\.leave\("home"\)/);
  assert.match(pick, /Text\("Back"\)/);
  assert.match(pick, /Text\("Home"\)/);
  assert.match(pick, /\.buttonStyle\(\.plain\)/);
  assert.match(pick, /session\.list\.statusLine/);
  assert.match(pick, /ScrollView\(\.horizontal/);
  assert.match(pick, /wheelClubs|stripClubs/);
  assert.match(pick, /session\.list\.label\(for: club\.id\)/);
  assert.match(pick, /session\.madeIt\(\)/);
  assert.match(pick, /Text\("Hole Out"\)/);
  assert.doesNotMatch(pick, /pickSameClub|sameClubTitle/);
  assert.doesNotMatch(watchUi, /Scorecard/);
  assert.match(pick, /Text\("All clubs"\)/);
  const headerAt = pick.indexOf('session.list.statusLine');
  const backHomeAt = pick.indexOf('session.leave("back")');
  const stripAt = pick.indexOf('ScrollView(.horizontal');
  const holeOutAt = pick.indexOf('session.madeIt()');
  const allClubsAt = pick.indexOf('Text("All clubs")');
  assert.ok(headerAt >= 0 && backHomeAt > headerAt && stripAt > backHomeAt && holeOutAt > stripAt && allClubsAt > holeOutAt);
  assert.equal(watchOneHomeOnly(), true);
  assert.equal(watchSameClubSharesRowWithAllClubs(), false);
  assert.equal(watchBackHomeAreTinyText(), false);
  assert.equal((pick.match(/Text\("Home"\)/g) ?? []).length, 1);
  assert.match(pick, /minHeight: 44/);
  assert.doesNotMatch(pick, /top3\.enumerated\(\)|TabView|tabViewStyle/);
  const holeOut = pick.slice(holeOutAt, allClubsAt);
  assert.match(holeOut, /Color\("cream"\)/);
  assert.doesNotMatch(holeOut, /Color\.black|borderedProminent/);
  assert.match(pick.slice(pick.indexOf('HStack(spacing: 8)'), pick.indexOf('if showAllClubs')), /session\.madeIt\(\)/);
  assert.match(pick.slice(pick.indexOf('HStack(spacing: 8)'), pick.indexOf('if showAllClubs')), /Text\("Hole Out"\)/);
  assert.match(pick.slice(pick.indexOf('HStack(spacing: 8)'), pick.indexOf('if showAllClubs')), /Text\("All clubs"\)/);
  assert.doesNotMatch(watchUi, /"Same club · \\\(name\)"/);
  assert.match(pick, /moreClubs/);
  assert.match(watchUi, /session\.list\.bag/);
  assert.match(pick.slice(0, allClubsAt), /ScrollView\(\.horizontal/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const push = hole.slice(hole.indexOf('useWatchClubList'), hole.indexOf('if (!round || !hole)'));
  assert.match(push, /top3: ranked\.map/);
  assert.match(push, /formatSuggestedClubChip\(club\.shortName, rankDistanceYards\(club\)\)/);
  assert.doesNotMatch(push, /formatPickerLeftYards|guess|invent/);

  const clubPick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  const clubPush = clubPick.slice(clubPick.indexOf('useWatchClubList'), clubPick.indexOf('const markClub'));
  assert.match(clubPush, /top3: ranked\.map/);
  assert.match(clubPush, /formatSuggestedClubChip\(club\.shortName, rankDistanceYards\(club\)\)/);
  assert.doesNotMatch(clubPush, /formatPickerLeftYards/);
});

test('Watch suggested strip shows carry, opens on the pick, and is not stacked rows', () => {
  assert.equal(watchTop3NumberIsCarry(), true);
  assert.equal(watchTop3NumberIsYardsLeft(), false);
  assert.equal(watchFirstSuggestedIsThePick(), true);
  assert.equal(watchSuggestedPillsLookTheSame(), false);
  assert.equal(watchTop3IsSidewaysStrip(), true);
  assert.equal(watchStackedSuggestionRows(), false);
  assert.equal(watchStripSwipeLeftIsShorter(), true);
  assert.equal(watchStripSwipeRightIsLonger(), true);
  assert.equal(watchStripShorterPeeksLeft(), true);
  assert.equal(watchStripLongerPeeksRight(), true);
  assert.equal(watchStripSortedByCarry(), true);
  assert.equal(watchStripSortedByName(), false);
  assert.equal(watchStripSwipeMarksShot(), false);
  assert.equal(watchStripScrollMarksShot(), false);
  assert.equal(watchStripTapMarksShot(), true);
  assert.equal(watchStripTapUsesHomeClubTap(), true);
  assert.equal(watchStripOnlyTapMarks(), true);
  assert.equal(watchStripCappedAtThree(), false);
  assert.equal(watchStripUsesFullBag(), true);
  assert.equal(watchAllClubsExtendsStrip(), false);
  assert.equal(watchCarryFromLabel('6i · 185'), 185);
  assert.equal(watchCarryFromLabel('6i · —'), null);
  assert.equal(formatSuggestedClubChip('5i', 205), '5i · 205');
  assert.equal(formatSuggestedClubChip('6i', 185), '6i · 185');
  assert.notEqual(formatSuggestedClubChip('5i', 205), formatPickerLeftYards({ yards: 164, quality: 'good' }));
  assert.equal(formatPickerLeftYards({ yards: 164, quality: 'good' }), '164 left');

  const five = {
    id: 'club_5i',
    name: '5 Iron',
    shortName: '5i',
    loftRank: 7,
    avgYards: 205,
    count: 8,
  };
  const six = {
    id: 'club_6i',
    name: '6 Iron',
    shortName: '6i',
    loftRank: 8,
    avgYards: 185,
    count: 8,
  };
  const seven = {
    id: 'club_7i',
    name: '7 Iron',
    shortName: '7i',
    loftRank: 9,
    avgYards: 165,
    count: 8,
  };
  const putter = {
    id: PUTTER_CLUB_ID,
    name: 'Putter',
    shortName: 'Pt',
    loftRank: 18,
    avgYards: 8,
    count: 20,
    typicalCarryYards: 8,
  };
  const ranked = rankTopClubs([five, six, seven, putter], { source: 'yards_to_green', dYards: 190 });
  assert.equal(ranked[0]?.id, 'club_6i');
  assert.equal(rankDistanceYards(ranked[0]), 185);
  assert.equal(formatSuggestedClubChip(ranked[0].shortName, rankDistanceYards(ranked[0])), '6i · 185');
  assert.notEqual(formatSuggestedClubChip(ranked[0].shortName, rankDistanceYards(ranked[0])), '6i · 190');
  assert.ok(!ranked.some((club) => club.id === PUTTER_CLUB_ID));
  assert.equal(watchPutterInTop3(), false);

  const strip = planWatchClubStrip({
    bag: ['club_driver', 'club_5i', 'club_6i', 'club_7i', 'club_pw', PUTTER_CLUB_ID],
    top3: ranked.map((club) => club.id),
    labels: {
      club_driver: formatSuggestedClubChip('Dr', 250),
      club_5i: formatSuggestedClubChip('5i', 205),
      club_6i: formatSuggestedClubChip('6i', 185),
      club_7i: formatSuggestedClubChip('7i', 165),
      club_pw: formatSuggestedClubChip('PW', 130),
    },
    holeYards: 190,
  });
  assert.deepEqual(strip.ids, ['club_pw', 'club_7i', 'club_6i', 'club_5i', 'club_driver', PUTTER_CLUB_ID]);
  assert.ok(strip.ids.length > 3);
  assert.equal(strip.openIndex, 2);
  assert.equal(strip.ids[strip.openIndex], 'club_6i');
  assert.equal(strip.ids[strip.openIndex - 1], 'club_7i');
  assert.equal(strip.ids[strip.openIndex + 1], 'club_5i');
  assert.ok(strip.ids.includes(PUTTER_CLUB_ID));
  assert.equal(strip.ids[strip.ids.length - 1], PUTTER_CLUB_ID);
  const tee282 = planWatchClubStrip({
    bag: ['club_driver', 'club_3w', 'club_2i', 'club_pw', 'club_gw', PUTTER_CLUB_ID],
    labels: {
      club_driver: 'Dr · 280',
      club_3w: '3W · 260',
      club_2i: '2i · 243',
      club_pw: 'PW · 130',
      club_gw: 'GW · 110',
    },
    holeYards: 282,
  });
  assert.deepEqual(tee282.ids.slice(tee282.windowStart, tee282.windowStart + 3), [
    'club_2i',
    'club_3w',
    'club_driver',
  ]);
  assert.equal(tee282.pickId, 'club_driver');
  assert.ok(!tee282.ids.slice(tee282.windowStart, tee282.windowStart + 3).includes('club_gw'));

  const mid100 = planWatchClubStrip({
    bag: ['club_driver', 'club_pw', 'club_gw', 'club_sw', 'club_lw'],
    labels: {
      club_driver: 'Dr · 280',
      club_pw: 'PW · 120',
      club_gw: 'GW · 105',
      club_sw: 'SW · 90',
      club_lw: 'LW · 75',
    },
    holeYards: 100,
  });
  assert.equal(mid100.pickId, 'club_gw');
  assert.equal(mid100.ids[mid100.openIndex], 'club_gw');
  assert.equal(mid100.ids[mid100.openIndex - 1], 'club_sw');
  assert.equal(mid100.ids[mid100.openIndex + 1], 'club_pw');
  assert.ok(!mid100.ids.slice(mid100.windowStart, mid100.windowStart + 3).includes('club_driver'));

  assert.ok((watchCarryFromLabel('5i · 205') ?? 0) > (watchCarryFromLabel('6i · 185') ?? 0));
  assert.ok((watchCarryFromLabel('7i · 165') ?? 0) < (watchCarryFromLabel('6i · 185') ?? 0));
  const withPutter = planWatchClubStrip({
    bag: [PUTTER_CLUB_ID, 'club_6i', 'club_5i', 'club_7i'],
    labels: {
      club_putter: 'Pt · 8',
      club_5i: '5i · 205',
      club_6i: '6i · 185',
      club_7i: '7i · 165',
    },
    holeYards: 190,
  });
  assert.ok(withPutter.ids.includes(PUTTER_CLUB_ID));
  assert.equal(withPutter.ids[withPutter.ids.length - 1], PUTTER_CLUB_ID);
  assert.ok(!clubStripOpeningIds(withPutter.ids, withPutter.windowStart).includes(PUTTER_CLUB_ID));
  assert.equal(withPutter.pickId, 'club_6i');

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const pickUi = watchUi.slice(watchUi.indexOf('private var clubPick'), watchUi.indexOf('private var moreClubs'));
  const stripUi = pickUi.slice(pickUi.indexOf('ScrollView(.horizontal'), pickUi.indexOf('session.madeIt()'));
  assert.match(stripUi, /onTapGesture/);
  assert.match(stripUi, /scrollTo\(stripWindowToken/);
  assert.match(stripUi, /anchor: \.leading/);
  assert.match(stripUi, /stripSelectedId/);
  assert.match(watchUi, /stripPickId/);
  assert.match(watchUi, /stripWindowStart/);
  assert.match(watchUi, /wheelClubs/);
  assert.match(watchUi, /seamAfter/);
  assert.equal(watchStripIsWheel(), true);
  assert.equal(watchStripWraps(), true);
  assert.equal(watchStripSortedByIronNumber(), false);
  assert.equal(watchStripAllowsDashPill(), false);
  assert.equal(watchStripInventZero(), false);
  assert.equal(wrapWatchClubStripIndex(3, 3), 0);
  assert.match(stripUi, /session\.pick\(clubId: club.id\)/);
  assert.match(stripUi, /session\.list\.label\(for: club\.id\)/);
  assert.doesNotMatch(stripUi, /top3\.enumerated\(\)|minHeight: index == 0|TabView/);
  assert.doesNotMatch(stripUi, /Button\(action: \{ session\.pick/);
  assert.match(watchUi, /sorted \{ \$0\.carry < \$1\.carry \}/);
  assert.match(watchUi, /session\.list\.yardsToGreen/);
  assert.match(watchUi, /session\.list\.bag/);
  const stripClubs = watchUi.slice(watchUi.indexOf('private var stripClubs'), watchUi.indexOf('private var wheelClubs'));
  assert.match(stripClubs, /"club_putter"/);
  assert.match(stripClubs, /rows\.append\(\(id: "club_putter"/);
  const pickIdFn = watchUi.slice(watchUi.indexOf('private var stripPickId'), watchUi.indexOf('private var stripSelectedId'));
  assert.match(pickIdFn, /\$0\.id != "club_putter"/);
  const windowFn = watchUi.slice(watchUi.indexOf('private var stripWindowStart'), watchUi.indexOf('private var stripWindowToken'));
  assert.match(windowFn, /\$0\.id != "club_putter"/);
  assert.match(windowFn, /selectedClubId/);

  const phoneHole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(phoneHole, /<ClubStrip/);
  const phonePick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(phonePick, /TabView|tabViewStyle|styles\.top3/);

  const rankSrc = readFileSync(new URL('./rankClubs.ts', import.meta.url), 'utf8');
  assert.match(rankSrc, /lowest \|rank yards − D\|/);
  assert.match(rankSrc, /Putter is never eligible/);
  assert.match(rankSrc, /export function rankTopClubs/);
});

test('Watch Back returns to the hole and does not mark; Home opens the in-round menu', () => {
  assert.equal(watchClubPickBackMarksShot(), false);
  assert.equal(watchClubPickBackLeavesBall(), true);
  assert.equal(watchClubPickHomeMarksShot(), false);
  assert.equal(watchClubPickHomeOpensInRoundMenu(), true);
  const backTap = planWatchClubTap({ action: 'back' });
  assert.equal(backTap.marks, false);
  assert.equal(backTap.leaveBall, true);
  assert.equal(backTap.dest, 'hole');
  const homeTap = planWatchClubTap({ action: 'home' });
  assert.equal(homeTap.marks, false);
  assert.equal(homeTap.dest, 'menu');
  const back = planClubPickLeave('back');
  assert.equal(back.dest, 'hole');
  assert.equal(back.mark, false);
  assert.equal(back.selectClub, false);
  assert.equal(back.savesGps, false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const leave = hole.slice(hole.indexOf('onLeave: (action)'), hole.indexOf('onPuttPick:'));
  assert.match(leave, /setMenuOpen\(true\)/);
  assert.doesNotMatch(leave, /markShot|acceptFix|addPlacedShot/);
  assert.match(hole, /menuParam !== '1'/);
  assert.match(hole, /visible=\{menuOpen\}/);
  assert.match(hole, /title=\{COPY\.menu\}/);

  const clubPick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  const watchLeave = clubPick.slice(clubPick.indexOf('onLeave: (action)'), clubPick.indexOf('labelForClub'));
  assert.match(watchLeave, /hole\/\$\{holeNumber\}\?menu=1/);
  assert.match(watchLeave, /leavePicker\(action\)/);
});

test('Watch putt chips use the Signal gate; Hole Out stays; no scorecard', () => {
  assert.equal(watchPuttChipsUseSignalGate(), true);
  assert.equal(watchShowsHoleOut(), true);
  assert.equal(watchShowsScorecard(), false);
  assert.equal(watchTapUsesWatchGps(), true);
  assert.equal(watchHoleOutClosesOnLastMark(), true);
  assert.equal(watchHoleOutInventPutts(), false);
  assert.equal(watchShowPuttPills({ selectedClubId: PUTTER_CLUB_ID, yardsToGreen: 180, yardsQuality: 'good' }), true);
  assert.equal(watchShowPuttPills({ selectedClubId: 'club_7i', yardsToGreen: 36, yardsQuality: 'soft' }), true);
  assert.equal(watchShowPuttPills({ selectedClubId: 'club_7i', yardsToGreen: 40, yardsQuality: 'good' }), true);
  assert.equal(watchShowPuttPills({ selectedClubId: 'club_7i', yardsToGreen: 41, yardsQuality: 'good' }), false);
  assert.equal(watchShowPuttPills({ selectedClubId: 'club_7i', yardsToGreen: 12, yardsQuality: 'forced' }), false);
  assert.equal(watchShowPuttPills({ selectedClubId: 'club_7i', yardsToGreen: 12, yardsQuality: 'hard' }), false);
  assert.equal(watchShowPuttPills({ selectedClubId: PUTTER_CLUB_ID, yardsToGreen: 12, yardsQuality: 'forced' }), true);
  assert.equal(watchShowPuttPills({ selectedClubId: 'club_7i', yardsToGreen: 20, yardsQuality: 'none' }), false);

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.doesNotMatch(watchUi, /showPuttChips/);
  assert.doesNotMatch(watchUi, /session\.addPutt\(lengthId: bucket\.id\)/);
  assert.match(watchUi, /session\.madeIt\(\)/);
  assert.doesNotMatch(watchUi, /Scorecard/);
  const pick = watchUi.slice(watchUi.indexOf('private var clubPick'), watchUi.indexOf('private var moreClubs'));
  const stripAt = pick.indexOf('ScrollView(.horizontal');
  const holeOutAt = pick.indexOf('session.madeIt()');
  assert.ok(stripAt >= 0 && holeOutAt > stripAt);
  assert.match(pick, /Text\("Hole Out"\)/);
  assert.doesNotMatch(pick, /Text\("Made(?: it)?"\)/);
  const watchSheet = watchUi.slice(watchUi.indexOf('private var puttSheet'), watchUi.indexOf('private var clubPick'));
  assert.match(watchSheet, /Text\("Made(?: it)?"\)/);
  assert.match(watchSheet, /"0–3"/);
  assert.match(watchSheet, /"3–10"/);
  assert.match(watchSheet, /"10–20"/);
  assert.match(watchSheet, /"20\+"/);
  assert.doesNotMatch(watchSheet, /LazyVGrid\(/);
  assert.ok(watchSheet.indexOf('"0–3"') < watchSheet.search(/Text\("Made(?: it)?"\)/));
  assert.equal(watchPuttChipsShowMadeIt(), false);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /attachWatchFix/);
  assert.match(pickFn, /clubId != "club_putter"/);
  assert.ok(pickFn.indexOf('clubId != "club_putter"') < pickFn.indexOf('attachWatchFix'));
  const madeFn = session.slice(session.indexOf('func madeIt()'), session.indexOf('/// Stretch: attach Watch GPS'));
  assert.doesNotMatch(madeFn, /attachWatchFix/);
  assert.match(madeFn, /payload\["lengthId"\] = pending/);
  const pickLen = session.slice(session.indexOf('func pickPuttLength'), session.indexOf('func addPutt'));
  assert.match(pickLen, /next\.canMake = true/);
  assert.match(session, /"Hole Out"/);
});

test('Watch putter opens the putt sheet and stays out of the top 3', () => {
  assert.equal(watchPutterInTop3(), false);
  assert.equal(watchPutterOpensPuttSheet(), true);
  assert.equal(watchPutterPickOpensPuttSheetImmediately(), true);
  assert.equal(watchPutterSkipsAttachWatchFix(), true);
  const stripPutter = planWatchClubTap({ action: 'club', clubId: PUTTER_CLUB_ID, from: 'top3' });
  assert.equal(stripPutter.marks, false);
  assert.equal(stripPutter.opensPuttSheet, true);
  assert.deepEqual(watchClubListTop3([PUTTER_CLUB_ID, 'club_7i', 'club_8i', 'club_6i']), [
    'club_7i',
    'club_8i',
    'club_6i',
  ]);
  assert.ok(
    watchClubPickRestOfBag({
      top3: ['club_7i', 'club_8i', 'club_6i'],
      bag: ['club_7i', PUTTER_CLUB_ID],
    }).includes(PUTTER_CLUB_ID),
  );

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(service, /watchClubListTop3/);
  assert.match(service, /intent\.kind === 'putter'/);
  assert.match(service, /onPutter/);
  assert.doesNotMatch(
    service.slice(service.indexOf("if (intent.kind === 'putter')"), service.indexOf('const pick = intent.pick')),
    /markShotWithClub|acceptFix/,
  );

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watchUi, /session\.putt\.open/);
  assert.match(watchUi, /puttSheet/);
  const stripPick = watchUi.slice(watchUi.indexOf('ScrollView(.horizontal'), watchUi.indexOf('Text("All clubs")'));
  const allClubsPick = watchUi.slice(watchUi.indexOf('ForEach(moreClubs'), watchUi.indexOf('private var moreClubs'));
  assert.match(stripPick, /session\.pick\(clubId: club.id\)/);
  assert.match(allClubsPick, /session\.pick\(clubId: clubId\)/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /clubId != "club_putter"/);
  assert.match(pickFn, /attachWatchFix/);
  assert.ok(pickFn.indexOf('clubId != "club_putter"') < pickFn.indexOf('attachWatchFix(&payload)'));
  assert.doesNotMatch(pickFn.slice(0, pickFn.indexOf('if clubId != "club_putter"')), /attachWatchFix/);
  assert.match(pickFn, /clubId == "club_putter"/);
  assert.match(pickFn, /sheet\.open = true/);
  assert.match(pickFn, /sheet\.canMake = true/);
  assert.ok(pickFn.indexOf('sheet.open = true') < pickFn.indexOf('sendPick(payload)'));
});

test('a bag club under All clubs marks with the same rules as a top-3 tap', () => {
  assert.equal(watchBagPickMarksLikeTop3(), true);
  assert.equal(watchBagPickUsesHomeClubTap(), true);
  assert.equal(watchBagPickUsesChosenFix(), true);
  assert.equal(watchBagPutterOpensPuttSheet(), true);
  assert.equal(HOME_CLUB_TAP_MAX_YD, 600);
  assert.ok(homeClubTapPaths().includes('watch_bag'));

  const top3 = planWatchClubTap({ action: 'club', clubId: 'club_pw', from: 'top3' });
  const bag = planWatchClubTap({ action: 'club', clubId: 'club_pw', from: 'bag' });
  assert.equal(top3.marks, true);
  assert.equal(bag.marks, true);
  assert.equal(top3.dest, 'mark');
  assert.equal(bag.dest, 'mark');
  if (top3.marks && bag.marks) {
    assert.equal(top3.usesHomeClubTap, true);
    assert.equal(bag.usesHomeClubTap, true);
    assert.equal(top3.usesChosenFix, true);
    assert.equal(bag.usesChosenFix, true);
    assert.equal(top3.clubId, bag.clubId);
  }

  const bagPutter = planWatchClubTap({ action: 'club', clubId: PUTTER_CLUB_ID, from: 'bag' });
  assert.equal(bagPutter.marks, false);
  assert.equal(bagPutter.opensPuttSheet, true);
  assert.equal(planWatchClubTap({ action: 'back' }).marks, false);
  assert.equal(planWatchClubTap({ action: 'home' }).marks, false);

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const top3Btn = watchUi.slice(watchUi.indexOf('ScrollView(.horizontal'), watchUi.indexOf('Text("All clubs")'));
  const bagBtn = watchUi.slice(watchUi.indexOf('ForEach(moreClubs'), watchUi.indexOf('private var moreClubs'));
  assert.match(top3Btn, /session\.pick\(clubId: club.id\)/);
  assert.match(top3Btn, /onTapGesture/);
  assert.doesNotMatch(top3Btn, /DragGesture/);
  assert.doesNotMatch(top3Btn, /session\.select\(club\.id\)/);
  assert.match(bagBtn, /session\.pick\(clubId: clubId\)/);
  assert.doesNotMatch(top3Btn, /moreClubs/);
  assert.doesNotMatch(bagBtn, /leave\(|clubNav/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const sameFn = session.slice(session.indexOf('func pickSameClub'), session.indexOf('func leave'));
  assert.match(sameFn, /guard let clubId = list.lastClubId/);
  assert.doesNotMatch(sameFn, /top3\.first|bag\.first/);
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /"type": "clubPick"/);
  assert.match(pickFn, /attachWatchFix/);
  assert.match(pickFn, /clubId != "club_putter"/);
  assert.ok(pickFn.indexOf('clubId != "club_putter"') < pickFn.indexOf('attachWatchFix'));
  const leaveFn = session.slice(session.indexOf('func leave('), session.indexOf('private func isoNow'));
  assert.match(leaveFn, /"type": "clubNav"/);
  assert.doesNotMatch(leaveFn, /clubPick|attachWatchFix/);

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  const handle = service.slice(service.indexOf('async function handlePick'), service.indexOf('async function handlePuttPick'));
  assert.match(handle, /parseWatchInboundIntent/);
  assert.match(handle, /markShotWithClub/);
  assert.match(handle, /watchFixFromPick/);
  assert.match(handle, /tee: ctx\.tee/);
  assert.doesNotMatch(handle, /top3\.includes|from === 'top3'|source === 'top3'/);
  assert.match(handle, /intent\.kind === 'leave'/);
  assert.match(handle, /intent\.kind === 'putter'/);
  assert.doesNotMatch(
    handle.slice(handle.indexOf("if (intent.kind === 'leave')"), handle.indexOf("if (intent.kind === 'putter')")),
    /markShotWithClub/,
  );
});

test('P0: bag with Driver null + remaining ~330 keeps Driver in Watch top-3; never dash or woods-only', () => {
  assert.equal(watchStripNeverDropsBagClub(), true);
  assert.equal(watchClubListKeepsFullBag(), true);
  assert.equal(STOCK_AVG_CARRY.club_driver, 230);
  assert.equal(resolveWatchBagCarry({ id: 'club_driver', label: 'Dr · —' }), 230);
  assert.equal(resolveWatchBagCarry({ id: PUTTER_CLUB_ID, label: 'Pt · 8' }), null);
  assert.equal(watchBagLabelForPush({ id: 'club_driver', shortName: 'Dr · —' }), 'Dr · 230');
  assert.notEqual(watchBagLabelForPush({ id: 'club_driver', shortName: 'Dr · —' }), 'Dr · —');
  assert.equal(watchBagLabelForPush({ id: 'club_3w', shortName: '3W · 254' }), '3W · 254');
  assert.equal(watchBagLabelForPush({ id: PUTTER_CLUB_ID, shortName: 'Pt · —' }), 'Pt');
  assert.equal(watchBagLabelForPush({ id: PUTTER_CLUB_ID, shortName: 'Putter' }), 'Putter');
  assert.notEqual(watchBagLabelForPush({ id: PUTTER_CLUB_ID, shortName: 'Pt' }), 'Pt · —');

  const bagIds = [
    'club_driver',
    'club_3w',
    'club_2i',
    'club_7i',
    'club_pw',
    PUTTER_CLUB_ID,
  ];
  const labels = {
    club_driver: 'Dr · —',
    club_3w: '3W · 254',
    club_2i: '2i · 239',
    club_7i: '7i · 150',
    club_pw: 'PW · 120',
    club_putter: 'Pt · —',
  };
  const strip = planWatchClubStrip({
    bag: bagIds,
    labels,
    holeYards: 330,
  });
  assert.ok(strip.ids.includes('club_driver'));
  assert.ok(strip.ids.includes('club_7i'));
  assert.ok(strip.ids.includes('club_pw'));
  assert.ok(strip.ids.includes(PUTTER_CLUB_ID));
  assert.equal(strip.ids[strip.ids.length - 1], PUTTER_CLUB_ID);
  assert.ok(!clubStripOpeningIds(strip.ids, strip.windowStart).includes(PUTTER_CLUB_ID));
  assert.notEqual(strip.ids, ['club_2i', 'club_3w']);
  const opening = clubStripOpeningIds(strip.ids, strip.windowStart);
  assert.ok(opening.includes('club_driver'));
  assert.deepEqual(opening, ['club_driver', 'club_2i', 'club_3w']);
  assert.deepEqual(
    watchTop3ByRemainingYards({
      bag: [
        { id: 'club_driver', carry: 230 },
        { id: 'club_3w', carry: 254 },
        { id: 'club_2i', carry: 239 },
        { id: 'club_7i', carry: 150 },
        { id: 'club_pw', carry: 120 },
      ],
      yardsLeft: 330,
    }),
    ['club_driver', 'club_2i', 'club_3w'],
  );

  const wheel = planClubStrip({
    clubs: [
      { id: 'club_driver', loftRank: 0, typicalCarryYards: null },
      { id: 'club_3w', loftRank: 1, typicalCarryYards: 254 },
      { id: 'club_2i', loftRank: 4, typicalCarryYards: 239 },
      { id: 'club_7i', loftRank: 9, typicalCarryYards: null },
      { id: 'club_pw', loftRank: 12, typicalCarryYards: null },
      { id: PUTTER_CLUB_ID, loftRank: 18, typicalCarryYards: null },
    ],
    yardsLeft: 330,
  });
  assert.ok(wheel.ids.includes('club_driver'));
  assert.ok(wheel.carries.club_driver > 0);
  assert.equal(formatSuggestedClubChip('Dr', wheel.carries.club_driver), 'Dr · 230');
  assert.ok(clubStripOpeningIds(wheel.ids, wheel.windowStart).includes('club_driver'));
  assert.ok(wheel.ids.includes(PUTTER_CLUB_ID));
  assert.equal(wheel.carries[PUTTER_CLUB_ID], undefined);

  const bagRows = [
    { id: 'club_driver', shortName: 'Dr · —' },
    { id: 'club_3w', shortName: '3W · 254' },
    { id: 'club_2i', shortName: '2i · 239' },
    { id: 'club_7i', shortName: '7i · —' },
    { id: 'club_pw', shortName: 'PW · —' },
    { id: PUTTER_CLUB_ID, shortName: 'Pt · —' },
  ];
  const labelsForPush: Record<string, string> = {};
  for (const club of bagRows) {
    labelsForPush[club.id] = watchBagLabelForPush({ id: club.id, shortName: club.shortName });
  }
  const payload = clubListPayload({
    top3: ['club_3w', 'club_2i'],
    bag: bagRows.map((club) => club.id),
    labels: labelsForPush,
    holeNumber: 1,
    yardsToGreen: 330,
    yardsQuality: 'good',
  });
  assert.deepEqual(payload.bag, [
    'club_driver',
    'club_3w',
    'club_2i',
    'club_7i',
    'club_pw',
    PUTTER_CLUB_ID,
  ]);
  assert.notEqual(payload.bag, ['club_3w', 'club_2i']);
  assert.equal(payload.labels.club_driver, 'Dr · 230');
  assert.notEqual(payload.labels.club_driver, 'Dr · —');
  assert.equal(payload.labels.club_3w, '3W · 254');
  assert.equal(payload.labels.club_putter, 'Pt');
  assert.ok(payload.bag.includes('club_7i'));
  assert.ok(payload.bag.includes('club_pw'));

  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  const build = service.slice(service.indexOf('export function buildClubList'), service.indexOf('async function replyToken'));
  assert.match(build, /watchBagLabelForPush/);
  assert.match(build, /args\.bag\.map/);
  assert.doesNotMatch(build, /bag\.slice\(0,\s*3\)|woods|typed-carry-only/);

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watchUi, /stockCarryYards/);
  assert.match(watchUi, /"club_driver": 230/);
  assert.match(watchUi, /session\.list\.bag/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(session, /clubListJSON/);
  assert.match(session, /defaults\?\.set\(state\.bag, forKey: "bag"\)/);
  assert.doesNotMatch(session, /next\.bag = next\.top3|bag = top3/);
});

test('P0: phone selected=Driver at 330 stays on Watch strip highlighted, not only 2i/3w', () => {
  assert.equal(watchSelectedClubNeverVanishes(), true);
  assert.equal(watchSelectedClubHighlightNeverHidesPill(), true);
  assert.equal(watchSelectedHighlightInPlace(), true);

  const bagIds = ['club_driver', 'club_3w', 'club_2i', 'club_7i', 'club_pw', PUTTER_CLUB_ID];
  const labels = {
    club_driver: 'Dr · 230',
    club_3w: '3W · 254',
    club_2i: '2i · 239',
    club_7i: '7i · 150',
    club_pw: 'PW · 120',
  };
  const yards = planWatchClubStrip({ bag: bagIds, labels, holeYards: 330 });
  const selected = planWatchClubStrip({
    bag: bagIds,
    labels,
    holeYards: 330,
    selectedClubId: 'club_driver',
  });
  const yardsOpen = clubStripOpeningIds(yards.ids, yards.windowStart);
  const selectedOpen = clubStripOpeningIds(selected.ids, selected.windowStart);
  assert.ok(yardsOpen.includes('club_driver'));
  assert.ok(selectedOpen.includes('club_driver'));
  assert.deepEqual(selectedOpen, yardsOpen);
  assert.deepEqual(selectedOpen, ['club_driver', 'club_2i', 'club_3w']);
  assert.notDeepEqual(selectedOpen, ['club_2i', 'club_3w']);
  assert.equal(selected.windowStart, yards.windowStart);

  const outside = planWatchClubStrip({
    bag: bagIds,
    labels,
    holeYards: 330,
    selectedClubId: 'club_pw',
  });
  const outsideOpen = clubStripOpeningIds(outside.ids, outside.windowStart);
  assert.ok(outsideOpen.includes('club_pw'));
  assert.ok(outsideOpen.includes('club_7i'));

  const putterSelected = planWatchClubStrip({
    bag: bagIds,
    labels: { ...labels, club_putter: 'Pt' },
    holeYards: 330,
    selectedClubId: PUTTER_CLUB_ID,
  });
  assert.ok(putterSelected.ids.includes(PUTTER_CLUB_ID));
  assert.ok(clubStripOpeningIds(putterSelected.ids, putterSelected.windowStart).includes(PUTTER_CLUB_ID));

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const windowFn = watchUi.slice(watchUi.indexOf('private var stripWindowStart'), watchUi.indexOf('private var stripWindowToken'));
  assert.match(windowFn, /selectedClubId/);
  assert.match(watchUi, /session\.list\.selectedClubId/);
  assert.doesNotMatch(watchUi, /selectedClubId \?\? stripPickId/);
  const stripClubs = watchUi.slice(watchUi.indexOf('private var stripClubs'), watchUi.indexOf('private var wheelClubs'));
  assert.match(stripClubs, /selectedClubId/);
  assert.doesNotMatch(stripClubs, /filter \{ \$0 == selected|filter \{ \$0 != selected/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const plan = hole.slice(hole.indexOf('const stripPlan'), hole.indexOf('const stripItems'));
  assert.match(plan, /selectedClubId/);
});
