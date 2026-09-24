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
  applyFavoriteToggle,
  buildWatchHome,
  favoriteTogglePayload,
  parseFavoriteToggle,
  parseWatchHomeRequest,
  planWatchHomeSearchNearby,
  planWatchHomeTap,
  watchFixFromHomeRequest,
  watchHomeBodyIsFavoritesOnly,
  watchHomeHasDuplicateIds,
  watchHomePermanentlyShowsNearbyList,
  watchHomeRowIds,
  watchHomeSearchPoint,
  watchHomeShowsExportRestore,
  watchKeepsOwnFavoritesList,
} from './watchHome';
import { NEARBY_COURSE_LIST_MAX, OPEN_PHONE } from './watchNearby';

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

test('Watch Home: nothing at all → open the phone; live round rides along for Continue', () => {
  const empty = buildWatchHome({ favorites: [], nearby: [], locationSource: 'none' });
  assert.equal(empty.line, OPEN_PHONE);
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

// ─── Favorite toggle sync ────────────────────────────────────────────────────

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
  assert.doesNotMatch(home, /nearbyRows|homeSectionTitle\("Nearby"\)|ForEach\(nearby\)/);
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
  assert.match(search, /let nearby = session\.home\.nearbyRows/);
  assert.match(search, /homeSectionTitle\("Nearby"\)/);
  assert.match(search, /ForEach\(nearby\)/);
  assert.doesNotMatch(search, /homeSectionTitle\("Favorites"\)/);
  const backAt = search.indexOf('Text("Back")');
  const backAction = search.slice(Math.max(0, backAt - 160), backAt);
  assert.match(backAction, /homePath\.removeLast\(\)/);
  assert.doesNotMatch(backAction, /backToHome|pickCourse|startRound|openHomeCourse|dismissNearbyToHole|requestHome/);
  assert.match(search, /Finding courses…|open the phone/);
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
  assert.match(ui, /Text\("Hole Out"\)/);
  // Highlight is the pill only: fill clipped to the same rounded shape.
  const wheel = ui.slice(ui.indexOf('ForEach(wheelClubs'), ui.indexOf('private var moreClubs'));
  assert.match(wheel, /\.background\(selected \? outdoorLime : Color\("bg"\)\)\s*(\/\/[^\n]*\s*)?\.clipShape\(RoundedRectangle\(cornerRadius: 10\)\)/);
});
