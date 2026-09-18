import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import { COPY } from './playerCopy';
import { planClubPickLeave } from './clubPickNav';
import {
  watchAllClubsLabel,
  watchAllClubsSitsUnderTop3,
  watchClubListTop3,
  watchClubPickBackMarksShot,
  watchClubPickHomeOpensInRoundMenu,
  watchClubPickOpensOnTop3,
  watchClubPickRestOfBag,
  watchPutterInTop3,
  watchPutterOpensPuttSheet,
  watchRestOfBagBelowAllClubs,
  watchSameClubSitsAboveTop3,
  watchTop3MatchesPhone,
  watchTop3RequiresScroll,
} from './watchClubPick';

test('Watch opens on the same top 3 as the phone; no scroll to hit one', () => {
  assert.equal(watchClubPickOpensOnTop3(), true);
  assert.equal(watchTop3MatchesPhone(), true);
  assert.equal(watchTop3RequiresScroll(), false);
  assert.equal(watchAllClubsSitsUnderTop3(), true);
  assert.equal(watchAllClubsLabel(), 'All clubs');
  assert.equal(COPY.allClubs, 'All clubs');
  assert.equal(watchRestOfBagBelowAllClubs(), true);
  assert.equal(watchSameClubSitsAboveTop3(), false);

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
  assert.match(pick, /session\.list\.top3/);
  assert.match(pick, /Text\("All clubs"\)/);
  const allClubsAt = pick.indexOf('Text("All clubs")');
  const top3At = pick.indexOf('session.list.top3');
  assert.ok(top3At >= 0 && allClubsAt > top3At);
  assert.doesNotMatch(pick, /pickSameClub|Same club/);
  assert.match(pick, /moreClubs/);
  assert.match(watchUi, /session\.list\.bag\.filter \{ !session\.list\.top3\.contains/);

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
  assert.equal(watchClubPickHomeOpensInRoundMenu(), true);
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
