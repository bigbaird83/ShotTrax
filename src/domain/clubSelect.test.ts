import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PUTTER_CLUB_ID } from './defaultBag';
import {
  applyWheelSelection,
  clubStripTapMarksShot,
  clubStripTapSelectsClub,
  watchBagTapMarksShot,
  watchSelectionMatchesPhone,
  watchStripTapMarksShot,
  watchStripTapSelectsClub,
  wheelRecomputesOnNewHole,
  wheelRecomputesOnSelection,
  wheelSelectionAfterTap,
  wheelSelectionSyncsPhoneAndWatch,
} from './clubSelect';
import { clubStripOpeningIds, clubStripWindowKey, planClubStrip } from './clubStrip';
import {
  addShotFramePoints,
  addShotMapUsesPhoneFix,
  addShotMapWaitsForPhoneFix,
  addShotShowsWaitingOnLocation,
  addShotShowsWaitingWithCardYards,
  holeFrameRegion,
  openingHoleRegionContainsTeeAndGreen,
  holeCameraHeading,
  planCourseCardCamera,
} from './holeCamera';
import { parseClubSelect, parseWatchInboundIntent, clubSelectPayload, clubListPayload, clubListPushKey } from './watchMessages';

test('a non-driver tap stays selected and does not mark or reopen the window', () => {
  assert.equal(clubStripTapMarksShot(), false);
  assert.equal(clubStripTapSelectsClub(), true);
  assert.equal(wheelRecomputesOnSelection(), false);
  assert.equal(wheelRecomputesOnNewHole(), true);

  const opening = planClubStrip({
    clubs: [
      { id: 'club_driver', carry: 280 },
      { id: 'club_3w', carry: 260 },
      { id: 'club_2i', carry: 243 },
      { id: 'club_pw', carry: 130 },
      { id: PUTTER_CLUB_ID, carry: 8 },
    ],
    yardsLeft: 282,
  });
  assert.equal(opening.pickId, 'club_driver');
  assert.deepEqual(clubStripOpeningIds(opening.ids, opening.windowStart), [
    'club_2i',
    'club_3w',
    'club_driver',
  ]);

  const first = wheelSelectionAfterTap({
    openingPickId: opening.pickId,
    previousId: opening.pickId,
    tappedId: 'club_3w',
  });
  assert.equal(first.selectedId, 'club_3w');
  assert.equal(first.marksShot, false);
  assert.equal(first.recomputesWindow, false);
  assert.notEqual(first.selectedId, 'club_driver');

  const again = wheelSelectionAfterTap({
    openingPickId: opening.pickId,
    previousId: first.selectedId,
    tappedId: 'club_2i',
  });
  assert.equal(again.selectedId, 'club_2i');
  assert.equal(applyWheelSelection('club_3w'), 'club_3w');

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const strip = hole.slice(hole.indexOf('<ClubStrip'), hole.indexOf('COPY.stickyClub'));
  assert.match(strip, /pickId=\{wheelSelectedId\}/);
  assert.match(strip, /applyWheelSelection/);
  assert.doesNotMatch(strip, /markClub/);
  assert.match(hole, /setSelectedClubId\(null\)/);
  assert.match(hole, /\[holeNumber\]/);

  const phone = readFileSync(new URL('../ui/ClubStrip.tsx', import.meta.url), 'utf8');
  const openFx = phone.slice(phone.indexOf('useEffect(() => {'), phone.indexOf('const settleWrap'));
  assert.match(openFx, /windowKey/);
  assert.doesNotMatch(openFx, /pickId/);
  assert.doesNotMatch(openFx, /\[items,/);
  assert.equal(
    clubStripWindowKey(['club_2i', 'club_3w', 'club_driver'], 0),
    clubStripWindowKey(['club_2i', 'club_3w', 'club_driver'], 0),
  );
  assert.notEqual(
    clubStripWindowKey(['club_2i', 'club_3w', 'club_driver'], 0),
    clubStripWindowKey(['club_2i', 'club_3w', 'club_driver'], 2),
  );
});

test('Watch selection is the phone selection; strip tap does not mark', () => {
  assert.equal(watchStripTapMarksShot(), false);
  assert.equal(watchStripTapSelectsClub(), true);
  assert.equal(watchBagTapMarksShot(), true);
  assert.equal(wheelSelectionSyncsPhoneAndWatch(), true);
  assert.equal(watchSelectionMatchesPhone('club_3w', 'club_3w'), true);
  assert.equal(watchSelectionMatchesPhone('club_3w', 'club_driver'), false);

  const select = clubSelectPayload({ clubId: 'club_3w', at: '2026-09-18T16:00:00.000Z' });
  assert.deepEqual(parseClubSelect(select), select);
  const intent = parseWatchInboundIntent(select);
  assert.equal(intent?.kind, 'select');
  assert.equal(intent?.runsAcceptFix, false);

  const phone = clubListPayload({
    top3: ['club_driver'],
    bag: ['club_driver', 'club_3w'],
    labels: { club_driver: 'Dr · 280', club_3w: '3W · 260' },
    holeNumber: 1,
    yardsToGreen: 282,
    yardsQuality: 'good',
    selectedClubId: 'club_3w',
  });
  const watch = clubListPayload({
    top3: ['club_driver'],
    bag: ['club_driver', 'club_3w'],
    labels: { club_driver: 'Dr · 280', club_3w: '3W · 260' },
    holeNumber: 1,
    yardsToGreen: 282,
    yardsQuality: 'good',
    selectedClubId: 'club_3w',
  });
  assert.equal(phone.selectedClubId, watch.selectedClubId);
  assert.notEqual(
    clubListPushKey(phone),
    clubListPushKey({ ...phone, selectedClubId: 'club_driver' }),
  );

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /onSelectClub/);
  assert.match(hole, /selectedClubId: wheelSelectedId/);

  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(watchUi, /session\.select\(club\.id\)/);
  assert.match(watchUi, /stripSelectedId/);
  assert.match(watchUi, /selectedClubId \?\? stripPickId/);
  const bag = watchUi.slice(watchUi.indexOf('ForEach(moreClubs'), watchUi.indexOf('private var moreClubs'));
  assert.match(bag, /session\.pick\(clubId: clubId\)/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(session, /"type": "clubSelect"/);
  assert.match(session, /func select\(_ clubId: String\)/);
  const service = readFileSync(new URL('../services/watchClub.ts', import.meta.url), 'utf8');
  assert.match(service, /intent\.kind === 'select'/);
  assert.doesNotMatch(
    service.slice(service.indexOf("if (intent.kind === 'select')"), service.indexOf("if (intent.kind === 'leave')")),
    /markShotWithClub/,
  );
});

test("Add shot opening region contains tee and green and does not wait when 282 is showing", () => {
  assert.equal(addShotMapWaitsForPhoneFix(), false);
  assert.equal(addShotMapUsesPhoneFix(), false);
  assert.equal(addShotShowsWaitingWithCardYards(), false);
  assert.equal(addShotShowsWaitingOnLocation(), false);
  const tee = { lat: 37.0, lng: -122.0 };
  const green = { lat: 37.01, lng: -122.0 };
  const home = { lat: 40.7128, lng: -74.006 };
  const camera = planCourseCardCamera({ tee, green, phone: null });
  const fromHome = planCourseCardCamera({ tee, green, phone: home });
  assert.ok(camera);
  assert.deepEqual(camera.points, [tee, green]);
  assert.equal(camera.heading, holeCameraHeading(tee, green));
  assert.notEqual(camera.heading, holeCameraHeading(home, green));
  assert.deepEqual(camera, fromHome);
  assert.deepEqual(addShotFramePoints({ tee, green, phone: null }), [tee, green]);
  assert.deepEqual(addShotFramePoints({ tee, green, phone: home }), [tee, green]);
  assert.equal(addShotFramePoints({ tee: null, green, phone: home }), null);
  assert.equal(openingHoleRegionContainsTeeAndGreen(holeFrameRegion(camera.points), tee, green), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const playMap = hole.slice(hole.indexOf('<HoleMap'), hole.indexOf('onDropGreenEstimate'));
  assert.match(playMap, /lockFrame/);
  assert.match(playMap, /framePoints=/);
  assert.match(playMap, /heading=\{courseCamera\?\.heading/);
  assert.match(playMap, /showPhonePin=\{!catchUpFullScreen\}/);
  assert.match(playMap, /userFix=\{catchUpFullScreen \? null : fix\}/);
  assert.match(playMap, /courseCamera\?\.points/);
  assert.doesNotMatch(playMap, /holeCamera\?\.points/);
  assert.match(playMap, /playHeaderYards\.yards/);
  assert.match(hole, /resolveOverlayTee/);
  assert.match(hole, /cachedOsmOverlay/);
  assert.match(hole, /cachedResolvedTee/);
  assert.match(hole, /rememberResolvedTee/);
  assert.match(hole, /courseTeeFromHole/);
  assert.match(hole, /resolvePlayHoleTee/);
  assert.match(hole, /saveHoleTee/);
  assert.match(hole, /phone: null/);
  assert.doesNotMatch(playMap, /getCurrentFix/);
  assert.match(hole, /styles\.catchUpHint/);
  assert.match(hole, /COPY\.placeFromHint/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /showWaitingOnLocationLine/);
  assert.match(map, /!yardsOnCard/);
  assert.match(map, /hideYardsOverlay/);
  assert.match(map, /holeFrameOnScreen/);
  assert.match(map, /Never wait on a phone fix/);
  assert.doesNotMatch(map, /styles\.placeHint/);
  const locked = map.slice(map.indexOf('const lockedRegion'), map.indexOf('const dragLines'));
  assert.doesNotMatch(locked, /userFix/);
  assert.doesNotMatch(locked, /coords\.length/);
  const catchUp = hole.slice(hole.indexOf('catchUpFullScreen ? ('), hole.indexOf('playLayout.shotLine'));
  assert.doesNotMatch(catchUp, /waitingOnLocation|Waiting on your location/);
});
