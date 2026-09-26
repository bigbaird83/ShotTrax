import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  FAVORITES_SETTING_KEY,
  isFavorite,
  listFavorites,
  setFavorite,
  type FavoriteCourse,
  type JsonStore,
} from './favorites';
import type { GpsFix } from './types';
import {
  WATCH_HOME_FAVORITES_MAX,
  WATCH_NEARBY_NONE_IN_RADIUS,
  WATCH_NEARBY_NO_LOCATION,
  applyFavoriteToggle,
  buildWatchHome,
  favoriteTogglePayload,
  parseCachedNearby,
  parseFavoriteToggle,
  parseWatchHomeRequest,
  forgetWatchHomeRequestAt,
  planWatchHomeSearchNearby,
  planWatchHomeTap,
  orderWatchHomeFavorites,
  parseWatchHomeLocationAuth,
  watchFixFromHomeRequest,
  watchHomeBackgroundRefreshUsesSendMessage,
  watchHomeFavoritesMeasurePoint,
  watchHomeLocationAuthFromStatus,
  watchHomeBodyIsFavoritesOnly,
  watchHomeHasDuplicateIds,
  watchHomePermanentlyShowsNearbyList,
  watchHomeQueuedCopy,
  watchHomeRefreshStatus,
  watchHomeRequestDidApply,
  watchHomeRequestShouldApply,
  watchHomeRowIds,
  watchHomeSearchPoint,
  watchHomeSendMessageWhenUnreachable,
  watchHomeShowsExportRestore,
  watchHomeSyncWhenUnreachable,
  watchHomeUnavailableCopy,
  watchKeepsOwnFavoritesList,
  watchNearbyEmptyLine,
  watchNearbyScreenRows,
} from './watchHome';
import { PHONE_UNAVAILABLE, QUEUED_WILL_SYNC } from './watchMessages';
import {
  forgetWatchCourseStartAt,
  NEARBY_COURSE_LIST_MAX,
  watchCourseStartDidApply,
  watchCourseStartShouldApply,
} from './watchNearby';

function memoryStore(): JsonStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
  };
}

const fav = (id: string, name: string): FavoriteCourse => ({
  id,
  name,
  city: null,
  state: null,
  country: null,
  location: null,
});

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// ─── Watch Home rendering: nearby + favorites, ids never repeat ──────────────

test('Watch Home: a favorite that is also nearby shows once, under Favorites, with its distance', () => {
  const home = buildWatchHome({
    favorites: [fav('c2', 'Cypress Creek'), fav('c9', 'Far Away GC')],
    nearby: [
      { id: 'c1', name: 'Bay CC', distanceMeters: 1200 },
      { id: 'c2', name: 'Cypress Creek', distanceMeters: 800.4 },
      { id: 'c3', name: 'Mountain Ranch', distanceMeters: 3000 },
    ],
    locationSource: 'watch',
  });
  assert.deepEqual(home.favorites.map((c) => c.id), ['c2', 'c9']);
  assert.deepEqual(home.nearby.map((c) => c.id), ['c1', 'c3']);
  assert.equal(home.favorites[0].distanceMeters, 800);
  assert.equal('distanceMeters' in home.favorites[1], false);
  assert.ok(home.favorites.every((c) => c.favorite));
  assert.ok(home.nearby.every((c) => !c.favorite));
  assert.deepEqual(watchHomeRowIds(home), ['c2', 'c9', 'c1', 'c3']);
  assert.equal(watchHomeHasDuplicateIds(home), false);
  assert.equal(home.line, '');
  assert.equal(home.locationSource, 'watch');
});

test('Watch Home: duplicate ids inside either input collapse; nearby is distance order and capped', () => {
  const nearby = Array.from({ length: 14 }, (_, i) => ({
    id: `n${i % 11}`,
    name: `Course ${i % 11}`,
    distanceMeters: (14 - i) * 100,
  }));
  const home = buildWatchHome({
    favorites: [fav('f1', 'One'), fav('f1', 'One again'), fav('n3', 'Course 3')],
    nearby,
    locationSource: 'phone',
  });
  assert.equal(watchHomeHasDuplicateIds(home), false);
  assert.deepEqual(home.favorites.map((c) => c.id), ['f1', 'n3']);
  assert.ok(home.nearby.length <= NEARBY_COURSE_LIST_MAX);
  assert.ok(!home.nearby.some((c) => c.id === 'n3'));
  const distances = home.nearby.map((c) => c.distanceMeters ?? Infinity);
  assert.deepEqual(distances, [...distances].sort((a, b) => a - b));
});

test('Watch Home: favorites cap, blank rows dropped, plist-safe (no null anywhere)', () => {
  const many = Array.from({ length: WATCH_HOME_FAVORITES_MAX + 5 }, (_, i) => fav(`f${i}`, `Fav ${i}`));
  const home = buildWatchHome({
    favorites: [...many, { id: ' ', name: 'blank' }, { id: 'x', name: '' }],
    nearby: [{ id: 'n1', name: 'Near', distanceMeters: null }],
    locationSource: 'last_phone',
    live: { courseName: null, courseId: null },
  });
  assert.equal(home.favorites.length, WATCH_HOME_FAVORITES_MAX);
  assert.equal(home.live, undefined);
  assert.doesNotMatch(JSON.stringify(home), /null/);
});

test('Watch Home: nothing at all → clear no-location line; live round rides along for Continue', () => {
  const empty = buildWatchHome({ favorites: [], nearby: [], locationSource: 'none' });
  assert.equal(empty.line, WATCH_NEARBY_NO_LOCATION);
  assert.match(empty.line, /No location on Watch or phone/);
  assert.match(empty.line, /Open ShotTraxx on your phone/);
  assert.deepEqual(watchHomeRowIds(empty), []);

  const live = buildWatchHome({
    favorites: [fav('c1', 'Bay CC')],
    nearby: [],
    locationSource: 'none',
    live: { courseName: 'Bay CC', courseId: 'c1' },
  });
  assert.deepEqual(live.live, { courseName: 'Bay CC', courseId: 'c1' });
  assert.equal(
    planWatchHomeTap({ course: { id: 'c1', name: 'Bay CC' }, live: live.live, hasLiveHole: true }),
    'continue_round',
  );
  assert.equal(
    planWatchHomeTap({ course: { id: 'zz', name: 'bay cc ' }, live: { courseName: 'Bay CC' }, hasLiveHole: true }),
    'continue_round',
  );
  assert.equal(
    planWatchHomeTap({ course: { id: 'c2', name: 'Other' }, live: live.live, hasLiveHole: true }),
    'pick_course',
  );
  assert.equal(
    planWatchHomeTap({ course: { id: 'c1', name: 'Bay CC' }, live: live.live, hasLiveHole: false }),
    'pick_course',
  );
});

test('Watch Home location: fresh Watch fix → fresh phone fix → last phone location → none', () => {
  const now = 1_000_000;
  const phone: GpsFix = { lat: 36.1, lng: -94.1, accuracyM: 40, mocked: false, isSimulator: false, timestamp: now - 5_000 };
  const watch = { lat: 36.2, lng: -94.2, timestamp: now - 2_000 };
  assert.equal(watchHomeSearchPoint({ watchFix: watch, phoneFix: phone, nowMs: now })?.source, 'watch');
  assert.equal(
    watchHomeSearchPoint({ watchFix: { ...watch, timestamp: now - 120_000 }, phoneFix: phone, nowMs: now })?.source,
    'phone',
  );
  const last = watchHomeSearchPoint({
    watchFix: null,
    phoneFix: { ...phone, timestamp: now - 600_000 },
    lastPhoneFix: { lat: 35, lng: -93 },
    nowMs: now,
  });
  assert.deepEqual(last, { point: { lat: 35, lng: -93 }, source: 'last_phone' });
  assert.equal(watchHomeSearchPoint({ nowMs: now }), null);
  assert.equal(watchHomeSearchPoint({ lastPhoneFix: { lat: 0, lng: 0 }, nowMs: now }), null);

  const req = parseWatchHomeRequest({
    type: 'homeRequest',
    at: '2026-09-24T12:00:00.000Z',
    lat: 36.2,
    lng: -94.2,
    accuracyM: 8,
    fixAt: '2026-09-24T11:59:58.000Z',
  });
  assert.ok(req);
  assert.deepEqual(watchFixFromHomeRequest(req), {
    lat: 36.2,
    lng: -94.2,
    timestamp: Date.parse('2026-09-24T11:59:58.000Z'),
  });
  const noFix = parseWatchHomeRequest({ type: 'homeRequest', at: '2026-09-24T12:00:00.000Z' });
  assert.ok(noFix);
  assert.equal(watchFixFromHomeRequest(noFix), null);
  assert.equal(parseWatchHomeRequest({ type: 'homeRequest', at: 'nope' }), null);
});

// ─── Favorites nearest first ─────────────────────────────────────────────────

const pin = (lat: number, lng: number) => ({ lat, lng });

test('Watch Home favorites: nearest stored pin first, missing pins last, ties keep order', () => {
  const fix = pin(36, -94);
  const measure = { fix, authorization: 'authorized' as const };
  const rows = [
    { id: 'far', name: 'Far', location: pin(36.3, -94) },
    { id: 'none-a', name: 'No Pin A', location: null },
    { id: 'near', name: 'Near', location: pin(36.01, -94) },
    { id: 'tie-a', name: 'Tie A', location: pin(36.1, -94) },
    { id: 'none-b', name: 'No Pin B', location: null },
    { id: 'tie-b', name: 'Tie B', location: pin(36.1, -94) },
    { id: 'zero', name: 'Placeholder', location: pin(0, 0) },
  ];
  assert.deepEqual(
    orderWatchHomeFavorites(rows, measure).map((row) => row.id),
    ['near', 'tie-a', 'tie-b', 'far', 'none-a', 'none-b', 'zero'],
  );
  assert.deepEqual(orderWatchHomeFavorites([], measure), []);

  const home = buildWatchHome({
    favorites: rows,
    nearby: [{ id: 'near', name: 'Near', distanceMeters: 9_000 }, { id: 'other', name: 'Other', distanceMeters: 500 }],
    locationSource: 'watch',
    favoritesMeasure: measure,
  });
  assert.deepEqual(home.favorites.map((row) => row.id), ['near', 'tie-a', 'tie-b', 'far', 'none-a', 'none-b', 'zero']);
  // Distance on the row is only the nearby distance already returned. Sorting does not add one.
  assert.equal(home.favorites[0].distanceMeters, 9000);
  assert.equal('distanceMeters' in home.favorites[1], false);
  assert.deepEqual(home.nearby.map((row) => row.id), ['other']);
  assert.deepEqual(watchNearbyScreenRows(home).map((row) => row.id), ['other', 'near']);
});

test('Watch Home favorites: no fix, denied, restricted, or not determined keeps order', () => {
  const rows = [
    { id: 'far', name: 'Far', location: pin(37, -94) },
    { id: 'near', name: 'Near', location: pin(36.01, -94) },
    { id: 'none', name: 'None', location: null },
  ];
  const fix = pin(36, -94);
  const ids = rows.map((row) => row.id);
  assert.deepEqual(orderWatchHomeFavorites(rows, { fix: null, authorization: 'authorized' }).map((row) => row.id), ids);
  assert.deepEqual(orderWatchHomeFavorites(rows, { fix: pin(0, 0), authorization: 'authorized' }).map((row) => row.id), ids);
  assert.deepEqual(orderWatchHomeFavorites(rows, { authorization: 'authorized' }).map((row) => row.id), ids);
  for (const authorization of ['denied', 'restricted', 'notDetermined'] as const) {
    assert.deepEqual(orderWatchHomeFavorites(rows, { fix, authorization }).map((row) => row.id), ids);
  }
  assert.deepEqual(orderWatchHomeFavorites(rows).map((row) => row.id), ids);

  const denied = buildWatchHome({
    favorites: rows,
    nearby: [],
    locationSource: 'none',
    favoritesMeasure: { fix, authorization: 'denied' },
  });
  assert.deepEqual(denied.favorites.map((row) => row.id), ids);
  assert.equal(denied.favorites.length, rows.length);
  assert.equal(denied.line, WATCH_NEARBY_NO_LOCATION);

  const noFix = buildWatchHome({
    favorites: rows,
    nearby: [{ id: 'near', name: 'Near', distanceMeters: 400 }],
    locationSource: 'none',
    favoritesMeasure: { fix: null, authorization: 'authorized' },
  });
  assert.deepEqual(noFix.favorites.map((row) => row.id), ids);
  assert.equal(noFix.favorites.find((row) => row.id === 'near')?.distanceMeters, 400);
});

test('Watch Home favorites measure from an authorized Watch fix, else an authorized phone fix', () => {
  const watch = pin(36.2, -94.2);
  const phone = pin(36.1, -94.1);
  assert.deepEqual(
    watchHomeFavoritesMeasurePoint({
      watchFix: watch,
      watchAuthorization: 'authorized',
      phoneFix: phone,
      phoneAuthorization: 'authorized',
    }),
    watch,
  );
  assert.deepEqual(
    watchHomeFavoritesMeasurePoint({
      watchFix: watch,
      watchAuthorization: 'denied',
      phoneFix: phone,
      phoneAuthorization: 'authorized',
    }),
    phone,
  );
  assert.equal(
    watchHomeFavoritesMeasurePoint({
      watchFix: watch,
      watchAuthorization: 'restricted',
      phoneFix: phone,
      phoneAuthorization: 'denied',
    }),
    null,
  );
  assert.equal(
    watchHomeFavoritesMeasurePoint({
      watchFix: watch,
      watchAuthorization: 'notDetermined',
      phoneFix: null,
      phoneAuthorization: 'authorized',
    }),
    null,
  );
  assert.equal(watchHomeFavoritesMeasurePoint({ phoneFix: phone, phoneAuthorization: 'notDetermined' }), null);
  assert.equal(watchHomeFavoritesMeasurePoint({ phoneFix: phone }), null);
  // Older Watch: a fix with no permission field still counts.
  assert.deepEqual(watchHomeFavoritesMeasurePoint({ watchFix: watch }), watch);
  assert.equal(watchHomeFavoritesMeasurePoint({}), null);
  assert.equal(watchHomeLocationAuthFromStatus('granted'), 'authorized');
  assert.equal(watchHomeLocationAuthFromStatus('denied'), 'denied');
  assert.equal(watchHomeLocationAuthFromStatus('restricted'), 'restricted');
  assert.equal(watchHomeLocationAuthFromStatus('undetermined'), 'notDetermined');
  assert.equal(watchHomeLocationAuthFromStatus(null), 'notDetermined');
  assert.equal(parseWatchHomeLocationAuth('authorized'), 'authorized');
  assert.equal(parseWatchHomeLocationAuth('nope'), null);

  const req = parseWatchHomeRequest({
    type: 'homeRequest',
    at: '2026-09-24T12:00:00.000Z',
    lat: 36.2,
    lng: -94.2,
    fixAt: '2026-09-24T11:59:58.000Z',
    locationAuth: 'denied',
  });
  assert.equal(req?.locationAuth, 'denied');
  assert.equal(
    parseWatchHomeRequest({ type: 'homeRequest', at: '2026-09-24T12:00:00.000Z', locationAuth: 'always' })?.locationAuth,
    undefined,
  );

  const service = read('../services/watchHome.ts');
  const measure = service.slice(service.indexOf('async function favoritesMeasureFrom'), service.indexOf('async function handleHomeRequest'));
  assert.match(measure, /watchHomeFavoritesMeasurePoint/);
  assert.match(measure, /readPhoneLocationAuth/);
  assert.doesNotMatch(measure, /lastPhoneFix|readLastPhoneFix|requestForegroundPermissionsAsync/);
  const authRead = service.slice(service.indexOf('async function readPhoneLocationAuth'), service.indexOf('async function wakePhoneFix'));
  assert.match(authRead, /getForegroundPermissionsAsync/);
  assert.doesNotMatch(authRead, /requestForegroundPermissionsAsync/);
  const session = read('../../targets/watch/WatchClubSession.swift');
  const request = session.slice(session.indexOf('func requestHome'), session.indexOf('func refreshHomeIfShowing'));
  assert.match(request, /"locationAuth": liveAuthBucket\(location\.authorizationStatus\)/);
  assert.match(request, /attachHomeFix/);
});

// ─── Favorite toggle sync ────────────────────────────────────────────────────

test('Watch Search nearby: no Watch GPS falls back to the phone location, not open the phone', () => {
  const now = 1_000_000;
  // Watch has no GPS; the phone is pocketed (stale fix) but knows where it last was.
  const point = watchHomeSearchPoint({
    watchFix: null,
    phoneFix: null,
    lastPhoneFix: { lat: 36.1, lng: -94.1 },
    nowMs: now,
  });
  assert.deepEqual(point, { point: { lat: 36.1, lng: -94.1 }, source: 'last_phone' });
  const home = buildWatchHome({
    favorites: [],
    nearby: [{ id: 'n1', name: 'Near CC', distanceMeters: 3_000 }],
    locationSource: point!.source,
  });
  assert.equal(home.line, '');
  assert.deepEqual(watchNearbyScreenRows(home).map((c) => c.id), ['n1']);
  assert.doesNotMatch(JSON.stringify(home), /open the phone/);

  // Location known, nothing within 40 mi → says so. Never “open the phone”.
  const none = buildWatchHome({ favorites: [], nearby: [], locationSource: 'last_phone' });
  assert.equal(none.line, WATCH_NEARBY_NONE_IN_RADIUS);
  assert.equal(none.line, 'No courses within 40 mi');

  // No location anywhere but a cached nearby list → the cached rows, no line.
  const cached = buildWatchHome({
    favorites: [],
    nearby: parseCachedNearby(JSON.stringify([{ id: 'c1', name: 'Cached GC', distanceMeters: 900 }])),
    locationSource: 'last_phone',
  });
  assert.equal(cached.line, '');
  assert.deepEqual(watchNearbyScreenRows(cached).map((c) => c.id), ['c1']);

  // Truly nothing: no location on Watch or phone, no cache → the clear line.
  const nothing = buildWatchHome({ favorites: [], nearby: [], locationSource: 'none' });
  assert.equal(nothing.line, WATCH_NEARBY_NO_LOCATION);
  assert.equal(watchNearbyEmptyLine({ favorites: [], nearby: [], locationSource: 'phone' }), WATCH_NEARBY_NONE_IN_RADIUS);
});

test('Watch Search nearby includes nearby favorites; favorites are the fallback list', () => {
  // Every nearby course is starred → payload nearby is empty, screen is not.
  const home = buildWatchHome({
    favorites: [fav('c2', 'Cypress Creek'), fav('c9', 'Far Away GC')],
    nearby: [
      { id: 'c2', name: 'Cypress Creek', distanceMeters: 4_000 },
      { id: 'c3', name: 'Oak Hills', distanceMeters: 1_000 },
    ],
    locationSource: 'phone',
  });
  assert.equal(watchHomeHasDuplicateIds(home), false);
  assert.equal(home.line, '');
  assert.deepEqual(watchNearbyScreenRows(home).map((c) => c.id), ['c3', 'c2']);
  assert.equal(watchNearbyScreenRows(home)[1].favorite, true);

  const allStarred = buildWatchHome({
    favorites: [fav('c2', 'Cypress Creek')],
    nearby: [{ id: 'c2', name: 'Cypress Creek', distanceMeters: 4_000 }],
    locationSource: 'watch',
  });
  assert.deepEqual(allStarred.nearby, []);
  assert.equal(allStarred.line, '');
  assert.deepEqual(watchNearbyScreenRows(allStarred).map((c) => c.id), ['c2']);

  // No location, no nearby: favorites still tappable under the line.
  const favOnly = buildWatchHome({ favorites: [fav('c9', 'Far Away GC')], nearby: [], locationSource: 'none' });
  assert.equal(favOnly.line, WATCH_NEARBY_NO_LOCATION);
  assert.deepEqual(watchNearbyScreenRows(favOnly).map((c) => c.id), ['c9']);

  assert.deepEqual(parseCachedNearby('nope'), []);
  assert.deepEqual(parseCachedNearby(JSON.stringify([{ id: '', name: 'x' }, { id: 'a', name: 'A' }])), [
    { id: 'a', name: 'A' },
  ]);
});

test('Phone answers Watch Search nearby from its last known location and cached list', () => {
  const service = read('../services/watchHome.ts');
  const refresh = service.slice(service.indexOf('async function refreshNearby'), service.indexOf('async function handleHomeRequest'));
  // GPS wake is bounded, then live fix, then the OS / stored last known location.
  assert.match(refresh, /wakePhoneFix\(\)/);
  assert.match(refresh, /ctx\.phoneFix\(\)/);
  assert.match(refresh, /readLastPhoneFix\(ctx\.db\)/);
  assert.match(service, /getLastKnownFix\(\)/);
  assert.match(service, /PHONE_FIX_WAKE_TIMEOUT_MS/);
  // Last nearby list survives a relaunch and a failed search.
  assert.match(service, /WATCH_HOME_LAST_NEARBY_KEY/);
  assert.match(refresh, /saveNearbyCache/);
  assert.match(refresh, /lastNearby\.length > 0 \? 'last_phone' : 'none'/);
  assert.doesNotMatch(service, /open the phone/);
  // The phone keeps its location stored for the Watch as it moves.
  const start = read('../services/useWatchNearbyStart.ts');
  assert.match(start, /rememberPhoneFix\(db, fix\)/);
  // Swift mirrors the screen rows and the no-location copy.
  const session = read('../../targets/watch/WatchClubSession.swift');
  assert.match(session, new RegExp(WATCH_NEARBY_NO_LOCATION.replace(/\./g, '\\.')));
});

test('Watch star writes the phone favorites list (one list, same key the phone reads)', () => {
  const store = memoryStore();
  setFavorite(store, fav('c9', 'Phone Fav'), true);
  const lastAppliedAt = new Map<string, number>();

  const star = parseFavoriteToggle(
    favoriteTogglePayload({ courseId: 'c1', name: 'Bay CC', starred: true, at: '2026-09-24T12:00:00.000Z' }),
  );
  assert.ok(star);
  const result = applyFavoriteToggle(store, star, {
    lastAppliedAt,
    known: { id: 'c1', name: 'Bay CC', city: 'Rogers', state: 'AR', location: { lat: 36.3, lng: -94.1 } },
  });
  assert.equal(result.applied, true);
  assert.equal(isFavorite(store, 'c1'), true);
  assert.deepEqual(listFavorites(store).map((c) => c.id), ['c1', 'c9']);
  // Same record shape a phone star saves (city/state/pin from the nearby summary).
  const saved = listFavorites(store)[0];
  assert.equal(saved.city, 'Rogers');
  assert.deepEqual(saved.location, { lat: 36.3, lng: -94.1 });
  // Only the shared phone key — no Watch-only list.
  assert.deepEqual([...store.data.keys()], [FAVORITES_SETTING_KEY]);
  assert.equal(watchKeepsOwnFavoritesList(), false);

  // Watch Home rebuilt from the phone list now shows it under Favorites.
  const home = buildWatchHome({
    favorites: listFavorites(store),
    nearby: [{ id: 'c1', name: 'Bay CC', distanceMeters: 500 }],
    locationSource: 'watch',
  });
  assert.deepEqual(home.favorites.map((c) => c.id), ['c1', 'c9']);
  assert.deepEqual(home.nearby, []);

  const unstar = parseFavoriteToggle(
    favoriteTogglePayload({ courseId: 'c1', name: 'Bay CC', starred: false, at: '2026-09-24T12:00:05.000Z' }),
  );
  assert.ok(unstar);
  assert.equal(applyFavoriteToggle(store, unstar, { lastAppliedAt }).applied, true);
  assert.equal(isFavorite(store, 'c1'), false);
  assert.deepEqual(listFavorites(store).map((c) => c.id), ['c9']);
});

test('Watch toggle delivered twice or out of order never flips the phone back', () => {
  const store = memoryStore();
  const lastAppliedAt = new Map<string, number>();
  const on = favoriteTogglePayload({ courseId: 'c1', name: 'Bay CC', starred: true, at: '2026-09-24T12:00:00.000Z' });
  const off = favoriteTogglePayload({ courseId: 'c1', name: 'Bay CC', starred: false, at: '2026-09-24T12:00:01.000Z' });

  // live on, live off, then the queued transfers replay on, off.
  applyFavoriteToggle(store, on, { lastAppliedAt });
  applyFavoriteToggle(store, off, { lastAppliedAt });
  const replayOn = applyFavoriteToggle(store, on, { lastAppliedAt });
  assert.equal(replayOn.applied, false);
  assert.equal(isFavorite(store, 'c1'), false);
  const replayOff = applyFavoriteToggle(store, off, { lastAppliedAt });
  assert.equal(replayOff.applied, false);
  assert.equal(isFavorite(store, 'c1'), false);

  // Starring an existing favorite again is a no-op, not a duplicate row.
  setFavorite(store, fav('c2', 'Two'), true);
  const again = applyFavoriteToggle(
    store,
    favoriteTogglePayload({ courseId: 'c2', name: 'Two', starred: true, at: '2026-09-24T12:00:02.000Z' }),
    { lastAppliedAt },
  );
  assert.equal(again.applied, false);
  assert.equal(listFavorites(store).filter((c) => c.id === 'c2').length, 1);
});

test('favoriteToggle parse rejects junk', () => {
  const at = '2026-09-24T12:00:00.000Z';
  assert.equal(parseFavoriteToggle({ type: 'favoriteToggle', courseId: '', name: 'x', starred: true, at }), null);
  assert.equal(parseFavoriteToggle({ type: 'favoriteToggle', courseId: 'c1', name: 'x', starred: 'yes', at }), null);
  assert.equal(parseFavoriteToggle({ type: 'favoriteToggle', courseId: 'c1', name: 'x', starred: true, at: 'x' }), null);
  assert.equal(parseFavoriteToggle({ type: 'clubPick', courseId: 'c1', name: 'x', starred: true, at }), null);
  assert.equal(parseFavoriteToggle({ type: 'favoriteToggle', courseId: ' c1 ', name: 'Bay', starred: false, at })?.courseId, 'c1');
});

test('phone favorite changes re-push Watch Home live (no Watch relaunch)', () => {
  const start = read('../services/useWatchNearbyStart.ts');
  assert.match(start, /setWatchHomeContext/);
  assert.match(start, /pushWatchHomeFromCache\(\)/);
  assert.match(start, /\}, \[db, revision\]\);/);

  const service = read('../services/watchHome.ts');
  assert.match(service, /listFavorites\(readSettingStore\(ctx\.db\)\)/);
  assert.match(service, /applyFavoriteToggle/);
  assert.match(service, /ctx\.bump\(\)/);
  assert.match(service, /pushWatchHomeJson/);
  // Favorites-only push never hits the network.
  const cached = service.slice(service.indexOf('export async function pushWatchHomeFromCache'), service.indexOf('async function refreshNearby'));
  assert.doesNotMatch(cached, /nearbyCourses\(|getCurrentFix/);

  const club = read('../services/watchClub.ts');
  assert.match(club, /isWatchHomeJson\(json\)/);
  assert.match(club, /handleWatchHomeJson/);

  const native = read('../../modules/watch-bridge/ios/WatchBridgeModule.swift');
  assert.match(native, /AsyncFunction\("pushWatchHomeJson"\)/);
  assert.match(native, /context\["watchHome"\] = lastWatchHome/);
  assert.match(native, /type == "homeRequest" \|\| type == "favoriteToggle"/);
  // Home never replaces the clubList context a live hole needs.
  const homePush = native.slice(native.indexOf('func pushWatchHomeJson'), native.indexOf('private func applicationContext'));
  assert.doesNotMatch(homePush, /pendingClubList = /);
  assert.match(homePush, /updateApplicationContext\(applicationContext\(\)\)/);

  const bridge = read('../../modules/watch-bridge/index.ts');
  assert.match(bridge, /pushWatchHomeJson\?:/);
});

test('Watch session: star sends favoriteToggle reliably and applies phone pushes live', () => {
  const session = read('../../targets/watch/WatchClubSession.swift');
  const toggle = session.slice(session.indexOf('func toggleFavorite'), session.indexOf('func backToHome'));
  assert.match(toggle, /"type": "favoriteToggle"/);
  assert.match(toggle, /"starred": starred/);
  assert.match(toggle, /transferUserInfo\(payload\)/);
  assert.match(toggle, /sendMessage\(payload/);
  assert.match(toggle, /home = home\.applyingStar/);
  assert.doesNotMatch(toggle, /pickCourse|startRound/);

  const apply = session.slice(session.indexOf('private func applyClubList'), session.indexOf('if type == "puttSheet"'));
  assert.match(apply, /message\["watchHome"\] as\? \[String: Any\]/);
  assert.match(apply, /type == "watchHome"/);
  assert.match(session, /func session\(_ session: WCSession, didReceiveMessage message/);
  assert.match(session, /didReceiveApplicationContext/);
});

test('Watch Home is Favorites plus a Search nearby push; Back pops without remounting', () => {
  assert.equal(watchHomeBodyIsFavoritesOnly(), true);
  assert.equal(watchHomePermanentlyShowsNearbyList(), false);
  assert.equal(planWatchHomeSearchNearby(), 'push_nearby');

  const session = read('../../targets/watch/WatchClubSession.swift');
  const state = session.slice(session.indexOf('struct WatchHomeState'), session.indexOf('struct NearbyState'));
  assert.match(state, /var favoriteRows: \[HomeCourse\]/);
  assert.match(state, /var nearbyRows: \[HomeCourse\]/);
  assert.match(state, /var nearbyScreenRows: \[HomeCourse\]/);
  assert.match(state, /var seen = Set\(favorites\.map \{ \$0\.id \}\)/);
  assert.match(state, /seen\.insert\(\$0\.id\)\.inserted/);
  assert.match(session, /var showsHome: Bool/);

  const ui = read('../../targets/watch/content.swift');
  assert.match(ui, /NavigationStack\(path: \$homePath\) \{\s*watchHome/);
  assert.match(ui, /navigationDestination\(for: WatchHomePush\.self\)/);
  assert.match(ui, /case \.searchNearby:\s*nearbySearch/);
  // Leaving Home clears a push. Search → Back only pops, so Home stays mounted.
  assert.match(ui, /if !showing \{ homePath = NavigationPath\(\) \}/);
  assert.doesNotMatch(ui, /watchHome\s*\.id\(/);

  const home = ui.slice(ui.indexOf('private var watchHome'), ui.indexOf('private var nearbySearch'));
  assert.match(home, /let favorites = session\.home\.favoriteRows/);
  assert.match(home, /homeSectionTitle\("Favorites"\)/);
  assert.match(home, /ForEach\(favorites\)/);
  assert.match(home, /homeRow\(course\)/);
  assert.doesNotMatch(home, /nearbyRows|nearbyScreenRows|homeSectionTitle\("Nearby"\)|ForEach\(nearby\)/);
  assert.doesNotMatch(home, /ForEach\(session\.home\.(favorites|nearby)\)/);
  const searchAt = home.indexOf('Text("Search nearby")');
  const searchAction = home.slice(Math.max(0, searchAt - 180), searchAt);
  assert.match(searchAction, /homePath\.append\(WatchHomePush\.searchNearby\)/);
  assert.doesNotMatch(searchAction, /pickCourse|startRound|openHomeCourse|dismissNearbyToHole|requestHome/);
  assert.match(home, /Continue · Hole/);
  assert.ok(home.indexOf('Text("Search nearby")') < home.indexOf('homeSectionTitle("Favorites")'));
  assert.ok(home.indexOf('Text("Search nearby")') < home.indexOf('Continue · Hole'));
  const row = ui.slice(ui.indexOf('private func homeRow'), ui.indexOf('private var coursesBack'));
  assert.match(row, /session\.toggleFavorite\(course\)/);
  assert.match(row, /session\.openHomeCourse\(course\)/);
  assert.match(row, /"star\.fill" : "star"/);

  const search = ui.slice(ui.indexOf('private var nearbySearch'), ui.indexOf('private func homeSectionTitle'));
  assert.match(search, /let nearby = session\.home\.nearbyScreenRows/);
  assert.match(search, /homeSectionTitle\("Nearby"\)/);
  assert.match(search, /ForEach\(nearby\)/);
  assert.doesNotMatch(search, /homeSectionTitle\("Favorites"\)/);
  const backAt = search.indexOf('Text("Back")');
  const backAction = search.slice(Math.max(0, backAt - 160), backAt);
  assert.match(backAction, /homePath\.removeLast\(\)/);
  assert.doesNotMatch(backAction, /backToHome|pickCourse|startRound|openHomeCourse|dismissNearbyToHole|requestHome/);
  assert.match(search, /Finding courses…/);
  assert.match(search, /session\.home\.nearbyEmptyLine/);
  assert.doesNotMatch(search, /open the phone/);
});

test('Watch keeps club pick + hole scoring; no Export / Restore, no cloud account', () => {
  assert.equal(watchHomeShowsExportRestore(), false);
  const ui = read('../../targets/watch/content.swift');
  const session = read('../../targets/watch/WatchClubSession.swift');
  assert.doesNotMatch(ui + session, /Export|Restore|Sign in|iCloud|CloudKit/);
  // Club strip, putt sheet, Hole Out still reachable once a course is open.
  assert.match(ui, /private var clubPick: some View/);
  assert.match(ui, /session\.pick\(clubId: club\.id\)/);
  assert.match(ui, /session\.openPuttSheet\(\)/);
  assert.match(ui, /actionPill\("Hole Out"\)/);
  // Highlight is the pill only: fill clipped to the same rounded shape.
  const wheel = ui.slice(ui.indexOf('ForEach(wheelClubs'), ui.indexOf('private var moreClubs'));
  assert.match(wheel, /\.background\(selected \? outdoorLime : tileFill\)\s*(\/\/[^\n]*\s*)?\.clipShape\(RoundedRectangle\(cornerRadius: 10\)\)/);
});

test('Search nearby refreshes when the phone is only background-reachable', () => {
  const session = read('../../targets/watch/WatchClubSession.swift');
  const request = session.slice(
    session.indexOf('/// Ask the phone for a fresh Watch Home'),
    session.indexOf('func refreshHomeIfShowing'),
  );
  assert.match(request, /func requestHome\(interactive: Bool = true\)/);
  assert.match(request, /transferUserInfo\(payload\)/);
  assert.match(request, /sendMessage\(payload/);
  assert.match(request, /"type": "homeRequest"/);
  assert.match(request, /attachHomeFix/);
  assert.match(request, /home\.loading = true/);
  assert.match(request, /if session\.isReachable/);
  assert.match(request, /reply\["home"\]/);
  assert.match(request, /applyWatchHome/);
  // Reachability only adds the fast reply. It must not skip the queued request.
  assert.doesNotMatch(request, /guard session\.isReachable else/);
  assert.doesNotMatch(request, /home\.loading = false/);
  assert.doesNotMatch(request, /failUnavailable|Phone unavailable/);

  const apply = session.slice(
    session.indexOf('private func applyWatchHome'),
    session.indexOf('private func saveHome'),
  );
  assert.match(apply, /next\.loading = false/);

  const sendFn = session.slice(session.indexOf('private func sendPick'), session.indexOf('private func handleReply'));
  const beforeFallback = sendFn.slice(0, sendFn.indexOf('guard WCSession.isSupported()'));
  assert.match(beforeFallback, /isHomeCourseStart\(payload\)/);
  assert.match(beforeFallback, /sendHomeCourseReliable\(payload\)/);
  assert.doesNotMatch(beforeFallback, /failUnavailable|Phone unavailable/);
  const homeStart = sendFn.slice(sendFn.indexOf('private func isHomeCourseStart'));
  assert.match(homeStart, /"nearbyCoursePick"/);
  assert.match(homeStart, /"startRound"/);
  assert.match(homeStart, /"clubNav"/);
  const reliable = sendFn.slice(
    sendFn.indexOf('private func sendHomeCourseReliable'),
    sendFn.indexOf('private func sendReliableQueued'),
  );
  assert.match(reliable, /sendReliableQueued\(payload\)/);
  assert.doesNotMatch(reliable, /failUnavailable|Phone unavailable/);

  const nearby = read('../services/watchNearby.ts');
  assert.match(nearby, /watchCourseStartShouldApply\(pick\.at\)/);
  assert.match(nearby, /watchCourseStartShouldApply\(start\.at\)/);
  assert.match(nearby, /watchCourseStartDidApply/);
  assert.match(nearby, /forgetWatchCourseStartAt/);

  const at = '2026-09-24T15:00:00.000Z';
  assert.equal(watchCourseStartShouldApply(at), true);
  assert.equal(watchCourseStartShouldApply(at), false);
  watchCourseStartDidApply(at);
  assert.equal(watchCourseStartShouldApply(at), false);
  forgetWatchCourseStartAt(at);
  assert.equal(watchCourseStartShouldApply(at), true);
  forgetWatchCourseStartAt(at);
});

test('Watch Home and Search nearby say Queued · will sync when the transfer is waiting', () => {
  assert.equal(watchHomeSyncWhenUnreachable(), 'transferUserInfo');
  assert.equal(watchHomeSendMessageWhenUnreachable(), false);
  assert.equal(watchHomeBackgroundRefreshUsesSendMessage(), false);
  assert.equal(watchHomeQueuedCopy(), QUEUED_WILL_SYNC);
  assert.equal(watchHomeQueuedCopy(), 'Queued · will sync');
  assert.equal(watchHomeUnavailableCopy(), PHONE_UNAVAILABLE);
  assert.notEqual(watchHomeQueuedCopy(), watchHomeUnavailableCopy());

  const queued = { phoneReachable: false, loading: true, nearbyEmpty: true } as const;
  assert.equal(watchHomeRefreshStatus({ ...queued, face: 'home' }), 'Queued · will sync');
  assert.equal(watchHomeRefreshStatus({ ...queued, face: 'nearby' }), 'Queued · will sync');
  assert.notEqual(watchHomeRefreshStatus({ ...queued, face: 'nearby' }), 'Phone unavailable');
  assert.notEqual(watchHomeRefreshStatus({ ...queued, face: 'home' }), 'Updating…');
  assert.notEqual(watchHomeRefreshStatus({ ...queued, face: 'nearby' }), 'Finding courses…');

  assert.equal(
    watchHomeRefreshStatus({ phoneReachable: true, loading: true, nearbyEmpty: false, face: 'home' }),
    'Updating…',
  );
  assert.equal(
    watchHomeRefreshStatus({ phoneReachable: true, loading: true, nearbyEmpty: true, face: 'nearby' }),
    'Finding courses…',
  );
  assert.equal(
    watchHomeRefreshStatus({ phoneReachable: true, loading: false, nearbyEmpty: true, face: 'nearby', line: '' }),
    WATCH_NEARBY_NO_LOCATION,
  );
  assert.equal(
    watchHomeRefreshStatus({ phoneReachable: true, loading: false, nearbyEmpty: false, face: 'home' }),
    'Refresh',
  );

  const session = read('../../targets/watch/WatchClubSession.swift');
  const request = session.slice(
    session.indexOf('/// Ask the phone for a fresh Watch Home'),
    session.indexOf('func refreshHomeIfShowing'),
  );
  assert.match(request, /home\.queued = true/);
  assert.match(request, /homeRequestCoalesce/);
  assert.match(request, /transferUserInfo\(payload\)/);
  assert.match(request, /if session\.isReachable/);
  assert.match(request, /if interactive/);
  assert.doesNotMatch(request, /failUnavailable|Phone unavailable/);
  // Unreachable never takes the sendMessage branch.
  const unreachable = request.slice(request.indexOf('} else {'));
  assert.match(unreachable, /home\.queued = true/);
  assert.doesNotMatch(unreachable, /sendMessage/);

  const refresh = session.slice(
    session.indexOf('func refreshHomeIfShowing'),
    session.indexOf('private func attachHomeFix'),
  );
  assert.match(refresh, /requestHome\(interactive: false\)/);
  assert.match(refresh, /home\.loading/);
  assert.match(refresh, /automaticHomeInterval/);
  assert.doesNotMatch(refresh, /sendMessage/);

  const apply = session.slice(
    session.indexOf('private func applyWatchHome'),
    session.indexOf('private func saveHome'),
  );
  assert.match(apply, /next\.queued = false/);
  assert.match(apply, /next\.loading = false/);

  const ui = read('../../targets/watch/content.swift');
  const home = ui.slice(ui.indexOf('private var watchHome'), ui.indexOf('private var nearbySearch'));
  const search = ui.slice(ui.indexOf('private var nearbySearch'), ui.indexOf('private func homeSectionTitle'));
  assert.match(home, /session\.home\.queued/);
  assert.match(home, /Queued · will sync/);
  assert.match(home, /session\.home\.refreshLabel/);
  assert.match(search, /session\.home\.queued/);
  assert.match(search, /Queued · will sync/);
  assert.match(search, /session\.home\.refreshLabel/);
  assert.match(search, /Finding courses…/);
  assert.match(search, /nearbyEmptyLine/);
  assert.doesNotMatch(search, /open the phone/);
  assert.doesNotMatch(home + search, /Phone unavailable/);
  // Favorites stay the body. Search nearby stays a push. Back still pops.
  assert.match(home, /homeSectionTitle\("Favorites"\)/);
  assert.doesNotMatch(home, /homeSectionTitle\("Nearby"\)/);
  assert.match(search, /homePath\.removeLast\(\)/);

  const service = read('../services/watchHome.ts');
  assert.match(service, /watchHomeRequestShouldApply\(req\.at\)/);
  assert.match(service, /watchHomeRequestDidApply\(req\.at\)/);
  assert.match(service, /forgetWatchHomeRequestAt\(req\.at\)/);

  const at = '2026-09-24T16:00:00.000Z';
  assert.equal(watchHomeRequestShouldApply(at), true);
  assert.equal(watchHomeRequestShouldApply(at), false);
  watchHomeRequestDidApply(at);
  assert.equal(watchHomeRequestShouldApply(at), false);
  forgetWatchHomeRequestAt(at);
  assert.equal(watchHomeRequestShouldApply(at), true);
  forgetWatchHomeRequestAt(at);
});
