import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import { HOME_CLUB_TAP_MAX_YD, homeClubTapPaths } from './homeClubTap';
import {
  PHONE_WHEEL_PILL_HEIGHT,
  WATCH_WHEEL_PILL_HEIGHT,
  phoneWheelPillTallerThanWatch,
  planClubStrip,
} from './clubStrip';
import {
  allClubsBagIncludesPutter,
  phoneAllClubsIncludesDashClubs,
  phoneAllClubsIncludesPutter,
  phoneAllClubsIsOneScreen,
  phoneAllClubsMarksWithHomeClubTap,
  phoneAllClubsScreenScrolls,
  planAllClubsBag,
} from './allClubs';
import { playAllClubsSitsUnderWheel, playMapMinRatio, playSameClubSitsUnderWheel } from './playLayout';

test('phone wheel pill is taller than the Watch pill; map stays at least 60%', () => {
  assert.equal(phoneWheelPillTallerThanWatch(), true);
  assert.ok(PHONE_WHEEL_PILL_HEIGHT > WATCH_WHEEL_PILL_HEIGHT);
  assert.equal(PHONE_WHEEL_PILL_HEIGHT, 52);
  assert.equal(WATCH_WHEEL_PILL_HEIGHT, 36);
  assert.ok(playMapMinRatio() >= 0.6);
  assert.equal(playSameClubSitsUnderWheel(), true);
  assert.equal(playAllClubsSitsUnderWheel(), true);

  const phone = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  assert.match(phone, /PHONE_WHEEL_PILL_HEIGHT/);
  assert.match(phone, /height: PHONE_WHEEL_PILL_HEIGHT/);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watch, /height: 36/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  const strip = dock.slice(dock.indexOf('<ClubStrip'), dock.indexOf('COPY.stickyClub'));
  assert.doesNotMatch(strip, /compact/);
  assert.match(hole, /minHeight: '60%'/);
  assert.match(hole, /flexBasis: '60%'/);
  const sameAt = dock.indexOf('COPY.stickyClub');
  const allAt = dock.indexOf('COPY.allClubs');
  const wheelAt = dock.indexOf('<ClubStrip');
  assert.ok(wheelAt >= 0 && sameAt > wheelAt && allAt > sameAt);
});

test('phone All clubs screen renders every bag club, including putter and dash clubs, with no ScrollView', () => {
  assert.equal(phoneAllClubsScreenScrolls(), false);
  assert.equal(phoneAllClubsIsOneScreen(), true);
  assert.equal(phoneAllClubsIncludesPutter(), true);
  assert.equal(phoneAllClubsIncludesDashClubs(), true);
  assert.equal(phoneAllClubsMarksWithHomeClubTap(), true);
  assert.equal(HOME_CLUB_TAP_MAX_YD, 600);
  assert.ok(homeClubTapPaths().includes('all_clubs'));

  const bag = planAllClubsBag([
    { id: 'club_driver' },
    { id: 'club_3w' },
    { id: 'club_4i' },
    { id: 'club_7i' },
    { id: 'club_6i' },
    { id: PUTTER_CLUB_ID },
  ]);
  const wheel = planClubStrip({
    clubs: [
      { id: 'club_driver', carry: 280 },
      { id: 'club_3w', carry: null },
      { id: 'club_4i', carry: null },
      { id: 'club_7i', carry: null },
      { id: 'club_6i', carry: 185 },
      { id: PUTTER_CLUB_ID, carry: 8 },
    ],
    yardsLeft: 190,
  });
  assert.deepEqual(wheel.ids, ['club_6i', 'club_driver']);
  assert.ok(!wheel.ids.includes('club_3w'));
  assert.ok(!wheel.ids.includes('club_4i'));
  assert.ok(!wheel.ids.includes('club_7i'));
  assert.ok(!wheel.ids.includes(PUTTER_CLUB_ID));
  assert.ok(bag.includes('club_3w'));
  assert.ok(bag.includes('club_4i'));
  assert.ok(bag.includes('club_7i'));
  assert.ok(bag.includes(PUTTER_CLUB_ID));
  assert.ok(allClubsBagIncludesPutter(bag));
  assert.equal(bag.length, 6);

  const pick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  assert.match(pick, /if \(!withoutGps && !relabelId\)/);
  assert.match(pick, /<Screen scroll=\{false\}>/);
  assert.doesNotMatch(pick, /<ScrollView/);
  assert.match(pick, /\{bag\}/);
  assert.match(pick, /clubs\.map\(\(club\) =>/);
  assert.match(pick, /void markClub\(club\)/);
  const mark = pick.slice(pick.indexOf('const markClub'), pick.indexOf('const rankedRef'));
  assert.match(mark, /putterOpensPuttSheet/);
  assert.match(mark, /markShotWithClub/);
  assert.match(mark, /tee: holeTee/);
  assert.doesNotMatch(mark, /skipHomeClubTap|withoutTee/);
  assert.doesNotMatch(pick, /<ClubStrip/);
  assert.doesNotMatch(pick, /<ScrollView/);
});
