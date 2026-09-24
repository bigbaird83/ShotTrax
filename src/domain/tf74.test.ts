import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { THUNDERBIRD_HEBER_CLUBHOUSE, THUNDERBIRD_HEBER_SPRINGS_AR_KEY } from '../course/hydrate';
import { clubAverageFromShots } from './averages';
import { holesHaveTeeGreenPaint, requestThisCourseVisible } from './courseRequest';
import {
  courseIsHardMiss,
  favoriteFromHistoryRound,
  historyStarInventsPaint,
  historyStarUsesFavoritesList,
  offlineStatusAfterDownload,
} from './favorites';
import { haversineYards, roundYards } from './haversine';
import {
  layoutForPlayedHoles,
  mirrorFrontNineForEighteen,
  playEighteenInventsBackNine,
  playEighteenMirrorsNine,
  resolveCourseNumHoles,
} from './nineByTwo';
import {
  ADD_SHOT_PATH_DOT_PX,
  ADD_SHOT_TO_PIN_HIT_H,
  ADD_SHOT_TO_PIN_HIT_W,
  addShotPathDotFollowsPin,
  addShotPathDotInAdditionToDragPin,
  addShotToPinAnchor,
  addShotToPinBox,
  addShotToPinStaysCenteredOnPath,
  addShotToPinUsesTransformScale,
  dragLinesFollowLivePoint,
  liveDragPointForLines,
  planDragShotLines,
  toPinYardsRecalcOnDragMove,
  toPinYardsRecalcOnReleaseOnly,
} from './placeToDrag';
import {
  HISTORY_SWIPE_DELETE_PX,
  HISTORY_SWIPE_EDIT_PX,
  HISTORY_SWIPE_OPEN_PX,
  HISTORY_SWIPE_REVEAL_PX,
  historySwipeRestOffset,
  historySwipeRevealFitsActions,
  historySwipeShouldOpen,
  historySwipeSnap,
} from './roundHistory';
import {
  planRoundHistoryImport,
  roundImportAveragesFromShotsOnly,
  roundImportFillsTeeGreenFromClubhouse,
  roundImportInventsCoords,
  roundImportWritesStoredAverages,
  roundTransferNeedsAccount,
  serializeRoundHistory,
  ROUND_HISTORY_EXPORT_KIND,
  ROUND_HISTORY_EXPORT_VERSION,
} from './roundTransfer';
import { includeInDistanceAverages } from './shotSource';

function holePaint(n: number, lat: number) {
  return {
    number: n,
    par: 4,
    yards: 320,
    handicap: n,
    teeCentroid: { lat, lng: -92.1 },
    greenCentroid: { lat: lat + 0.0012, lng: -92.1 },
    greenFront: null,
    greenBack: null,
    greenDepthYards: null,
  };
}

test('history swipe snaps fully open on a short left swipe', () => {
  assert.equal(historySwipeRevealFitsActions(), true);
  assert.equal(HISTORY_SWIPE_REVEAL_PX, HISTORY_SWIPE_EDIT_PX + HISTORY_SWIPE_DELETE_PX);
  assert.ok(HISTORY_SWIPE_EDIT_PX >= 100);
  assert.ok(HISTORY_SWIPE_DELETE_PX >= 64);
  assert.ok(HISTORY_SWIPE_OPEN_PX <= 24);
  assert.equal(historySwipeShouldOpen(-20, 3), true);
  assert.equal(historySwipeShouldOpen(-10, 0), false);
  assert.equal(historySwipeSnap({ dx: -20, dy: 4, open: false }), 'open');
  assert.equal(historySwipeSnap({ dx: -8, dy: 1, open: false }), 'closed');
  assert.equal(historySwipeSnap({ dx: -40, dy: 90, open: false }), 'closed');
  assert.equal(historySwipeRestOffset(true), -HISTORY_SWIPE_REVEAL_PX);
  assert.equal(historySwipeRestOffset(false), 0);
  assert.notEqual(historySwipeRestOffset(true), -HISTORY_SWIPE_DELETE_PX);

  const swipe = readFileSync(new URL('../ui/HistorySwipeRow.tsx', import.meta.url), 'utf8');
  assert.match(swipe, /historySwipeSnap/);
  assert.match(swipe, /historySwipeRestOffset/);
  assert.match(swipe, /HISTORY_SWIPE_EDIT_PX/);
  assert.match(swipe, /HISTORY_SWIPE_DELETE_PX/);
  assert.doesNotMatch(swipe, /flex:\s*1/);
});

test('add-shot lines and yardages follow the live drag point', () => {
  assert.equal(toPinYardsRecalcOnDragMove(), true);
  assert.equal(toPinYardsRecalcOnReleaseOnly(), false);
  assert.equal(dragLinesFollowLivePoint(), true);
  const from = { lat: 35.5, lng: -92.1 };
  const start = { lat: 35.501, lng: -92.1 };
  const moved = { lat: 35.503, lng: -92.102 };
  const green = { lat: 35.506, lng: -92.1 };
  const before = planDragShotLines({ from, drag: start, green });
  const live = liveDragPointForLines({ live: moved, placed: start });
  const after = planDragShotLines({ from, drag: live, green });
  assert.deepEqual(live, moved);
  assert.notEqual(before.shot?.yards, after.shot?.yards);
  assert.deepEqual(after.shot?.to, moved);
  assert.deepEqual(after.toGreen?.from, moved);
  assert.equal(after.shot?.yards, roundYards(haversineYards(from, moved)));
  assert.equal(after.toGreen?.yards, roundYards(haversineYards(moved, green)));
  assert.equal(planDragShotLines({ from: null, drag: moved, green }).shot, null);
  assert.equal(planDragShotLines({ from, drag: moved, green: null }).toGreen, null);
  assert.equal(liveDragPointForLines({ live: { lat: 0, lng: 0 }, placed: start })?.lat, start.lat);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const dragStart = map.indexOf('onDragStart=');
  const dragEnd = map.indexOf('onDragEnd=');
  const during = map.slice(dragStart, dragEnd);
  assert.match(during, /onDrag=\{/);
  assert.match(during, /setLiveDrag/);
  assert.doesNotMatch(during, /onPlaceToDrag\(/);
  assert.match(map, /liveDragPointForLines/);
  assert.doesNotMatch(map, /transform:\s*\[\{\s*scale:/);
});

test('enlarged drag pin stays on the path; dot only when no pin is shown', () => {
  assert.equal(addShotToPinUsesTransformScale(), false);
  assert.equal(addShotToPinStaysCenteredOnPath(), true);
  assert.deepEqual(addShotToPinAnchor(), { x: 0.5, y: 1 });
  assert.deepEqual(addShotToPinBox(1), { width: ADD_SHOT_TO_PIN_HIT_W, height: ADD_SHOT_TO_PIN_HIT_H });
  assert.deepEqual(addShotToPinBox(2), { width: ADD_SHOT_TO_PIN_HIT_W, height: ADD_SHOT_TO_PIN_HIT_H });
  assert.equal(addShotPathDotFollowsPin(), true);
  assert.equal(addShotPathDotInAdditionToDragPin(), false);
  assert.ok(ADD_SHOT_PATH_DOT_PX >= 20);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /addShotToPinAnchor\(\)/);
  assert.match(map, /addShotToPinBox\(\)\.width/);
  assert.doesNotMatch(map, /addShotToPinBox\(addShotToPinVisualScale/);
  assert.match(map, /testID="shot-path-dot"/);
  assert.match(map, /dragLines\.shot\.to/);
  const dot = map.slice(map.indexOf('testID="shot-path-dot"') - 240, map.indexOf('testID="shot-path-dot"'));
  assert.match(dot, /dragLines\.shot\.to\.lat/);
});

test('round history JSON restores real GPS marks and recomputes averages from those shots', () => {
  assert.equal(roundTransferNeedsAccount(), false);
  assert.equal(roundImportInventsCoords(), false);
  assert.equal(roundImportFillsTeeGreenFromClubhouse(), false);
  assert.equal(roundImportAveragesFromShotsOnly(), true);
  assert.equal(roundImportWritesStoredAverages(), false);

  const start = { lat: 35.51, lng: -92.11 };
  const end = { lat: 35.513, lng: -92.11 };
  const yards = roundYards(haversineYards(start, end));
  const raw = {
    kind: ROUND_HISTORY_EXPORT_KIND,
    version: ROUND_HISTORY_EXPORT_VERSION,
    averages: [{ clubId: 'club_7i', avgYards: 9999 }],
    rounds: [
      {
        startedAt: '2026-09-21T15:00:00.000Z',
        finishedAt: '2026-09-21T18:00:00.000Z',
        courseName: 'Little River Country Club',
        holeCount: 9,
        courseApiId: 'course-little-river',
        courseLat: THUNDERBIRD_HEBER_CLUBHOUSE.lat,
        courseLng: THUNDERBIRD_HEBER_CLUBHOUSE.lng,
        holes: [
          {
            number: 1,
            par: 4,
            tee: THUNDERBIRD_HEBER_CLUBHOUSE,
            green: null,
            shots: [
              {
                clubId: 'club_7i',
                seq: 1,
                source: 'gps',
                start,
                end,
                startFixQuality: 'good',
                fixQuality: 'good',
                distanceYards: 9999,
                startedAt: '2026-09-21T15:10:00.000Z',
                endedAt: '2026-09-21T15:12:00.000Z',
              },
              {
                clubId: 'club_7i',
                seq: 2,
                source: 'gps',
                start,
                invented: true,
                startedAt: '2026-09-21T15:20:00.000Z',
              },
              {
                clubId: 'club_7i',
                seq: 3,
                source: 'no_gps',
                typedYards: 140,
                startedAt: '2026-09-21T15:30:00.000Z',
              },
            ],
          },
        ],
      },
    ],
  };
  const plan = planRoundHistoryImport(raw);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.equal(plan.ignoredAverages, true);
  assert.equal('averages' in plan, false);
  assert.equal(plan.rejectedShots, 2);
  assert.equal(plan.shots, 1);
  const hole = plan.rounds[0]?.holes[0];
  assert.equal(hole?.tee, null);
  assert.equal(hole?.green, null);
  assert.notEqual(hole?.tee?.lat, THUNDERBIRD_HEBER_CLUBHOUSE.lat);
  const shot = hole?.shots[0];
  assert.ok(shot);
  assert.equal(shot?.distanceYards, yards);
  assert.notEqual(shot?.distanceYards, 9999);
  assert.deepEqual(shot?.start, start);
  assert.equal(
    includeInDistanceAverages({
      source: shot?.source ?? 'gps',
      distanceYards: shot?.distanceYards ?? null,
      fixQuality: shot?.fixQuality,
      clubId: shot?.clubId,
    }),
    true,
  );
  const avg = clubAverageFromShots(
    [{ yards: shot?.distanceYards ?? 0, fixQuality: 'good' }],
    { typedCarryYards: null, estimatedCarryYards: null },
  );
  assert.equal(avg.count, 1);
  assert.equal(avg.avgYards, yards);
  assert.equal(serializeRoundHistory({
    kind: ROUND_HISTORY_EXPORT_KIND,
    version: ROUND_HISTORY_EXPORT_VERSION,
    exportedAt: '2026-09-22T00:00:00.000Z',
    clubs: [],
    rounds: plan.rounds,
  }).includes('"avgYards":9999'), false);

  // Export / Restore lives behind the menu (app/rounds-transfer.tsx), not on Home.
  const transfer = readFileSync(new URL('../../app/rounds-transfer.tsx', import.meta.url), 'utf8');
  assert.match(transfer, /presentRoundHistoryShare/);
  assert.match(transfer, /collectRoundHistoryExport/);
  assert.match(transfer, /restoreRoundHistory/);
  assert.doesNotMatch(transfer, /TextInput|onChangeText/);
  assert.doesNotMatch(transfer, /signIn|createAccount|auth\(\)/);
  const repo = readFileSync(new URL('../db/repo.ts', import.meta.url), 'utf8');
  const restore = repo.slice(repo.indexOf('export function restoreRoundHistory'), repo.indexOf('function insertTransferredRound'));
  assert.doesNotMatch(restore, /setSetting|clubAverageFromShots/);
  assert.match(repo, /planRoundHistoryImport/);
});

test('history star uses Favorites and a HARD-MISS stays Miss', () => {
  assert.equal(historyStarUsesFavoritesList(), true);
  assert.equal(historyStarInventsPaint(), false);
  assert.equal(favoriteFromHistoryRound({ courseName: null, courseApiId: 'x' }), null);
  const favorite = favoriteFromHistoryRound({
    courseApiId: `local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`,
    courseName: 'Thunderbird Country Club',
    courseLat: THUNDERBIRD_HEBER_CLUBHOUSE.lat,
    courseLng: THUNDERBIRD_HEBER_CLUBHOUSE.lng,
    city: 'Heber Springs',
    state: 'AR',
    country: 'US',
  });
  assert.ok(favorite);
  if (!favorite) return;
  const identity = {
    courseKey: favorite.id,
    name: favorite.name,
    city: favorite.city,
    state: favorite.state,
    location: favorite.location,
  };
  assert.equal(courseIsHardMiss(identity), true);
  assert.equal(offlineStatusAfterDownload(identity, true), 'miss');
  assert.equal(favorite.location?.lat, THUNDERBIRD_HEBER_CLUBHOUSE.lat);

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /favoriteFromHistoryRound/);
  assert.match(home, /downloadFavoriteForOffline/);
  assert.match(home, /historyStarInventsPaint/);
  const star = home.slice(home.indexOf('const starHistoryRound'), home.indexOf('const onExportRounds'));
  assert.doesNotMatch(star, /inventGreen|teeCentroid|greenCentroid/);
});

test('9×2 play copies real front paint onto 10–18 and hard-misses holes with no front paint', () => {
  assert.equal(playEighteenMirrorsNine(), true);
  assert.equal(playEighteenInventsBackNine(), false);
  assert.equal(resolveCourseNumHoles({ detailHoleCount: 9, catalogHoleCount: 18 }), 9);
  assert.equal(resolveCourseNumHoles({ detailHoleCount: null, catalogHoleCount: 9 }), 9);
  assert.equal(resolveCourseNumHoles({ detailHoleCount: null, catalogHoleCount: 13 }), null);

  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
    n === 3
      ? { ...holePaint(3, 34.2), teeCentroid: null, greenCentroid: null }
      : holePaint(n, 34.2 + n * 0.01),
  );
  const played = mirrorFrontNineForEighteen({ numHoles: 9, playHoleCount: 18, holes: front });
  assert.equal(played.length, 18);
  for (const n of [1, 2, 4, 5, 6, 7, 8, 9]) {
    const src = played.find((hole) => hole.number === n);
    const back = played.find((hole) => hole.number === n + 9);
    assert.deepEqual(back?.teeCentroid, src?.teeCentroid);
    assert.deepEqual(back?.greenCentroid, src?.greenCentroid);
    assert.notEqual(back?.teeCentroid, null);
  }
  const missed = played.find((hole) => hole.number === 12);
  assert.equal(missed?.teeCentroid, null);
  assert.equal(missed?.greenCentroid, null);
  assert.equal(played.some((hole) => hole.number === 12 && hole.teeCentroid != null), false);

  const clubhouseFront = [{ ...holePaint(1, 34.2), teeCentroid: THUNDERBIRD_HEBER_CLUBHOUSE, greenCentroid: THUNDERBIRD_HEBER_CLUBHOUSE }];
  const tb = mirrorFrontNineForEighteen({ numHoles: 9, playHoleCount: 18, holes: clubhouseFront });
  assert.equal(tb.find((hole) => hole.number === 10)?.teeCentroid, null);
  assert.equal(tb.find((hole) => hole.number === 10)?.greenCentroid, null);

  const eighteen = mirrorFrontNineForEighteen({
    numHoles: 18,
    playHoleCount: 18,
    holes: [holePaint(1, 34.2)],
  });
  assert.equal(eighteen.some((hole) => hole.number === 10), false);

  const nineOnly = mirrorFrontNineForEighteen({
    numHoles: 9,
    playHoleCount: 9,
    holes: [holePaint(1, 34.4)],
  });
  assert.equal(nineOnly.some((hole) => hole.number === 10), false);

  const layout = layoutForPlayedHoles(
    { apiId: 'little-river', name: 'Little River Country Club', holes: front },
    { numHoles: 9, playHoleCount: 18 },
  );
  assert.equal(layout.holes?.find((hole) => hole.number === 10)?.teeCentroid?.lat, front[0]?.teeCentroid?.lat);
  assert.equal(layout.holes?.find((hole) => hole.number === 12)?.greenCentroid, null);

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /layoutForPlayedHoles/);
  assert.match(home, /resolveCourseNumHoles/);
  const watch = readFileSync(new URL('../services/watchNearby.ts', import.meta.url), 'utf8');
  assert.match(watch, /layoutForPlayedHoles/);
});

test('Request this course shows only for HARD-MISS or no paint', () => {
  const thunderbird = {
    courseKey: `local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`,
    name: 'Thunderbird Country Club',
    city: 'Heber Springs',
    state: 'AR',
    location: THUNDERBIRD_HEBER_CLUBHOUSE,
  };
  const littleRiver = {
    courseKey: 'little-river',
    name: 'Little River Country Club',
    city: 'Little Rock',
    state: 'AR',
    location: { lat: 34.75, lng: -92.3 },
  };
  assert.equal(courseIsHardMiss(thunderbird), true);
  assert.equal(courseIsHardMiss(littleRiver), false);
  assert.equal(requestThisCourseVisible({ course: thunderbird, hasTeeGreenPaint: false }), true);
  assert.equal(requestThisCourseVisible({ course: thunderbird, hasTeeGreenPaint: true }), false);
  assert.equal(
    requestThisCourseVisible({ course: littleRiver, hasTeeGreenPaint: false, paintKnown: false }),
    false,
  );
  assert.equal(
    requestThisCourseVisible({ course: littleRiver, hasTeeGreenPaint: false, paintKnown: true }),
    true,
  );
  assert.equal(
    requestThisCourseVisible({ course: littleRiver, hasTeeGreenPaint: true, paintKnown: true }),
    false,
  );
  const painted = [holePaint(1, 34.8)];
  assert.equal(holesHaveTeeGreenPaint(painted), true);
  assert.equal(holesHaveTeeGreenPaint([{ ...holePaint(1, 34.8), teeCentroid: null }]), false);

  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  const favorites = readFileSync(new URL('../../app/(tabs)/favorites.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../../app/settings.tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(picker, /requestThisCourseVisible/);
  assert.match(picker, /holesHaveTeeGreenPaint/);
  assert.match(favorites, /requestThisCourseVisible/);
  assert.match(map, /requestThisCourseVisible/);
  assert.doesNotMatch(settings, /COPY\.requestThisCourse/);
});
