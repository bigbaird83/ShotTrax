import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
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
  watchCarryFromLabel,
  formatWatchSameClub,
  watchTop3MatchesPhone,
  watchTop3RequiresScroll,
  watchStripShorterPeeksLeft,
  watchStripLongerPeeksRight,
  watchStripSortedByCarry,
  watchStripSortedByName,
  watchStripSwipeMarksShot,
  watchStripScrollMarksShot,
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
  watchBackHomeAreTinyText,
  wrapWatchClubStripIndex,
} from './watchClubPick';
import { HOME_CLUB_TAP_MAX_YD, homeClubTapPaths } from './homeClubTap';
import { formatPickerLeftYards, formatSuggestedClubChip } from './playerCopy';
import { rankDistanceYards, rankTopClubs } from './rankClubs';

test('Watch opens on the same top 3 as the phone; no scroll to hit one', () => {
  assert.equal(watchClubPickOpensOnTop3(), true);
  assert.equal(watchTop3MatchesPhone(), true);
  assert.equal(watchTop3RequiresScroll(), false);
  assert.equal(watchAllClubsSitsUnderTop3(), true);
  assert.equal(watchAllClubsLabel(), 'All clubs');
  assert.equal(COPY.allClubs, 'All clubs');
  assert.equal(watchRestOfBagBelowAllClubs(), true);
  assert.equal(watchSameClubSitsAboveTop3(), false);
  assert.equal(watchSameClubSitsOnFirstScreen(), true);
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
  assert.match(pick, /pickSameClub/);
  assert.match(pick, /sameClubTitle/);
  assert.match(pick, /Text\("All clubs"\)/);
  const headerAt = pick.indexOf('session.list.statusLine');
  const backHomeAt = pick.indexOf('session.leave("back")');
  const stripAt = pick.indexOf('ScrollView(.horizontal');
  const sameAt = pick.indexOf('pickSameClub');
  const allClubsAt = pick.indexOf('Text("All clubs")');
  assert.ok(headerAt >= 0 && backHomeAt > headerAt && stripAt > backHomeAt && sameAt > stripAt && allClubsAt > sameAt);
  assert.equal(watchOneHomeOnly(), true);
  assert.equal(watchSameClubSharesRowWithAllClubs(), true);
  assert.equal(watchBackHomeAreTinyText(), false);
  assert.equal((pick.match(/Text\("Home"\)/g) ?? []).length, 1);
  assert.match(pick, /minHeight: 32/);
  assert.doesNotMatch(pick, /top3\.enumerated\(\)|TabView|tabViewStyle/);
  const sameClub = pick.slice(sameAt, allClubsAt);
  assert.match(sameClub, /Color\("cream"\)/);
  assert.doesNotMatch(sameClub, /Color\.black|borderedProminent/);
  assert.match(pick.slice(pick.indexOf('HStack(spacing: 6)'), pick.indexOf('if showAllClubs')), /pickSameClub/);
  assert.match(pick.slice(pick.indexOf('HStack(spacing: 6)'), pick.indexOf('if showAllClubs')), /Text\("All clubs"\)/);
  assert.match(watchUi, /"Same club · \\\(name\)"/);
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
  assert.deepEqual(strip.ids, ['club_pw', 'club_7i', 'club_6i', 'club_5i', 'club_driver']);
  assert.ok(strip.ids.length > 3);
  assert.equal(strip.openIndex, 2);
  assert.equal(strip.ids[strip.openIndex], 'club_6i');
  assert.equal(strip.ids[strip.openIndex - 1], 'club_7i');
  assert.equal(strip.ids[strip.openIndex + 1], 'club_5i');
  assert.ok((watchCarryFromLabel('5i · 205') ?? 0) > (watchCarryFromLabel('6i · 185') ?? 0));
  assert.ok((watchCarryFromLabel('7i · 165') ?? 0) < (watchCarryFromLabel('6i · 185') ?? 0));
  assert.deepEqual(
    planWatchClubStrip({
      bag: [PUTTER_CLUB_ID, 'club_6i', 'club_5i', 'club_7i'],
      labels: {
        club_putter: 'Pt · 8',
        club_5i: '5i · 205',
        club_6i: '6i · 185',
        club_7i: '7i · 165',
      },
      holeYards: 190,
    }).ids.includes(PUTTER_CLUB_ID),
    false,
  );

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const stripUi = watchUi.slice(watchUi.indexOf('ScrollView(.horizontal'), watchUi.indexOf('pickSameClub'));
  assert.match(stripUi, /onTapGesture/);
  assert.match(stripUi, /scrollTo\(stripPickToken/);
  assert.match(stripUi, /anchor: \.center/);
  assert.match(stripUi, /stripPickId/);
  assert.match(watchUi, /wheelClubs/);
  assert.match(watchUi, /seamAfter/);
  assert.equal(watchStripIsWheel(), true);
  assert.equal(watchStripWraps(), true);
  assert.equal(watchStripSortedByIronNumber(), false);
  assert.equal(watchStripAllowsDashPill(), false);
  assert.equal(watchStripInventZero(), false);
  assert.equal(wrapWatchClubStripIndex(3, 3), 0);
  assert.match(stripUi, /session\.pick\(clubId: club\.id\)/);
  assert.match(stripUi, /session\.list\.label\(for: club\.id\)/);
  assert.doesNotMatch(stripUi, /top3\.enumerated\(\)|minHeight: index == 0|TabView/);
  assert.doesNotMatch(stripUi, /Button\(action: \{ session\.pick/);
  assert.match(watchUi, /sorted \{ \$0\.carry < \$1\.carry \}/);
  assert.match(watchUi, /session\.list\.yardsToGreen/);
  assert.match(watchUi, /session\.list\.bag/);

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

test('Watch putter opens the putt sheet and stays out of the top 3', () => {
  assert.equal(watchPutterInTop3(), false);
  assert.equal(watchPutterOpensPuttSheet(), true);
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
});

test('a bag club under All clubs marks with the same rules as a top-3 tap', () => {
  assert.equal(watchBagPickMarksLikeTop3(), true);
  assert.equal(watchBagPickUsesHomeClubTap(), true);
  assert.equal(watchBagPickUsesChosenFix(), true);
  assert.equal(watchBagPutterOpensPuttSheet(), true);
  assert.equal(HOME_CLUB_TAP_MAX_YD, 600);
  assert.ok(homeClubTapPaths().includes('watch'));
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
  assert.match(top3Btn, /session\.pick\(clubId: club\.id\)/);
  assert.match(top3Btn, /onTapGesture/);
  assert.match(bagBtn, /session\.pick\(clubId: clubId\)/);
  assert.doesNotMatch(top3Btn, /moreClubs/);
  assert.doesNotMatch(bagBtn, /leave\(|clubNav/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const pickFn = session.slice(session.indexOf('func pick(clubId: String)'), session.indexOf('func addPutt'));
  assert.match(pickFn, /"type": "clubPick"/);
  assert.match(pickFn, /attachWatchFix/);
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
