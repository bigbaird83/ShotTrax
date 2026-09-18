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
  formatWatchSameClub,
  watchTop3MatchesPhone,
  watchTop3RequiresScroll,
} from './watchClubPick';
import { HOME_CLUB_TAP_MAX_YD, homeClubTapPaths } from './homeClubTap';

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
  assert.match(pick, /session\.list\.top3/);
  assert.match(pick, /session\.list\.label\(for: clubId\)/);
  assert.match(pick, /pickSameClub/);
  assert.match(pick, /sameClubTitle/);
  assert.match(pick, /Text\("All clubs"\)/);
  const headerAt = pick.indexOf('session.list.statusLine');
  const top3At = pick.indexOf('session.list.top3');
  const sameAt = pick.indexOf('pickSameClub');
  const allClubsAt = pick.indexOf('Text("All clubs")');
  assert.ok(headerAt >= 0 && top3At > headerAt && sameAt > top3At && allClubsAt > sameAt);
  const sameClub = pick.slice(sameAt, allClubsAt);
  assert.match(sameClub, /Color\("cream"\)/);
  assert.doesNotMatch(sameClub, /Color\.black|borderedProminent/);
  assert.match(watchUi, /"Same club · \\\(name\)"/);
  assert.match(pick, /moreClubs/);
  assert.match(watchUi, /session\.list\.bag\.filter \{ !session\.list\.top3\.contains/);
  assert.doesNotMatch(pick.slice(0, allClubsAt), /ScrollView/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const push = hole.slice(hole.indexOf('useWatchClubList'), hole.indexOf('if (!round || !hole)'));
  assert.match(push, /top3: ranked\.map/);
  assert.doesNotMatch(push, /guess|invent/);

  const clubPick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  const clubPush = clubPick.slice(clubPick.indexOf('useWatchClubList'), clubPick.indexOf('const markClub'));
  assert.match(clubPush, /top3: ranked\.map/);
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
  const top3Btn = watchUi.slice(watchUi.indexOf('session.list.top3.enumerated()'), watchUi.indexOf('Text("All clubs")'));
  const bagBtn = watchUi.slice(watchUi.indexOf('ForEach(moreClubs'), watchUi.indexOf('private var moreClubs'));
  assert.match(top3Btn, /session\.pick\(clubId: clubId\)/);
  assert.match(bagBtn, /session\.pick\(clubId: clubId\)/);
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
