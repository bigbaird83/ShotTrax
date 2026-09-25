import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  applyTransferredBag,
  collectRoundHistoryExport,
  deleteRound,
  getSetting,
  listClubs,
  listHoles,
  listRounds,
  listShotsForHole,
  readSettingStore,
  restoreRoundHistory,
  setClubEnabled,
  setSetting,
  updateClubCarry,
} from '../db/repo';
import { migrate } from '../db/schema';
import { layoutForFavoriteStart } from '../course/startRoundEntry';
import { THUNDERBIRD_HEBER_CLUBHOUSE, THUNDERBIRD_HEBER_SPRINGS_AR_KEY } from '../course/hydrate';
import { FAVORITES_SETTING_KEY, listFavorites, OFFLINE_PACKS_SETTING_KEY, setFavorite } from './favorites';
import { PRO_CACHE_SETTING_KEY, PRO_OVERRIDE_SETTING_KEY } from './proEntitlement';
import { yardsToGreenPlayerLabel } from './playerCopy';
import {
  formatBagChange,
  formatRestoreToast,
  planBagRestore,
  planRoundHistoryImport,
  planRoundRestoreMerge,
  roundExportFilename,
  ROUND_HISTORY_EXPORT_KIND,
  ROUND_HISTORY_EXPORT_VERSION,
  serializeRoundHistory,
  type RoundTransferBagClub,
  type RoundTransferRound,
} from './roundTransfer';

/** node:sqlite ships in Node 22.5+. Older Node skips the SQLite round-trips. */
const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();
const needsSqlite = { skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+' };

/** Just enough of expo-sqlite's sync API for repo.ts, over node:sqlite. */
function memoryDb(): SQLiteDatabase {
  if (!DatabaseSync) throw new Error('node:sqlite unavailable');
  const raw = new DatabaseSync(':memory:');
  const args = (params?: unknown[]) => (params ?? []) as (string | number | null)[];
  const db = {
    execSync: (sql: string) => raw.exec(sql),
    runSync: (sql: string, params?: unknown[]) => raw.prepare(sql).run(...args(params)),
    getAllSync: (sql: string, params?: unknown[]) => raw.prepare(sql).all(...args(params)),
    getFirstSync: (sql: string, params?: unknown[]) => raw.prepare(sql).get(...args(params)) ?? null,
    prepareSync: (sql: string) => {
      const statement = raw.prepare(sql);
      return { executeSync: (params?: unknown[]) => statement.run(...args(params)), finalizeSync: () => {} };
    },
    withTransactionSync: (run: () => void) => {
      raw.exec('BEGIN');
      try {
        run();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
  migrate(db as unknown as SQLiteDatabase);
  return db as unknown as SQLiteDatabase;
}

const start = { lat: 35.51, lng: -92.11 };
const end = { lat: 35.513, lng: -92.11 };

function fileRound(over: Partial<RoundTransferRound> & { id: string | null; startedAt: string }): Record<string, unknown> {
  return {
    finishedAt: null,
    courseName: 'Magnolia',
    holeCount: 9,
    courseApiId: null,
    courseLat: null,
    courseLng: null,
    holes: [
      {
        number: 1,
        par: 4,
        score: 5,
        putts: 2,
        shots: [
          { clubId: 'club_driver', seq: 1, source: 'gps', start, end, startedAt: over.startedAt },
        ],
      },
    ],
    ...over,
  };
}

function doc(rounds: Record<string, unknown>[]): string {
  return JSON.stringify({
    kind: ROUND_HISTORY_EXPORT_KIND,
    version: ROUND_HISTORY_EXPORT_VERSION,
    exportedAt: '2026-09-24T12:00:00.000Z',
    rounds,
  });
}

test('export filename is ShotTraxx-rounds-YYYY-MM-DD.json in local time', () => {
  assert.equal(roundExportFilename(new Date(2026, 8, 4, 23, 59)), 'ShotTraxx-rounds-2026-09-04.json');
  assert.equal(roundExportFilename(new Date(2027, 0, 31, 0, 1)), 'ShotTraxx-rounds-2027-01-31.json');
});

test('export payload carries ids, course, timestamps, holes, scores, shots, and clubs', needsSqlite, () => {
  const db = memoryDb();
  restoreRoundHistory(
    db,
    doc([fileRound({ id: 'r-1', startedAt: '2026-09-20T15:00:00.000Z', finishedAt: '2026-09-20T17:00:00.000Z' })]),
  );
  const payload = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-24T12:00:00.000Z')));
  assert.equal(payload.kind, ROUND_HISTORY_EXPORT_KIND);
  assert.equal(payload.version, ROUND_HISTORY_EXPORT_VERSION);
  assert.equal(payload.exportedAt, '2026-09-24T12:00:00.000Z');
  assert.ok(Array.isArray(payload.clubs) && payload.clubs.length > 0);
  for (const club of payload.clubs) {
    assert.equal(typeof club.id, 'string');
    assert.equal(typeof club.name, 'string');
  }
  assert.equal(payload.rounds.length, 1);
  const round = payload.rounds[0];
  assert.equal(round.id, 'r-1');
  assert.equal(round.courseName, 'Magnolia');
  assert.equal(round.startedAt, '2026-09-20T15:00:00.000Z');
  assert.equal(round.finishedAt, '2026-09-20T17:00:00.000Z');
  assert.equal(round.holeCount, 9);
  const hole = round.holes[0];
  assert.equal(hole.number, 1);
  assert.equal(hole.par, 4);
  assert.equal(hole.score, 5);
  assert.equal(hole.putts, 2);
  assert.equal(hole.shots.length, 1);
  assert.equal(hole.shots[0].clubId, 'club_driver');
  assert.ok(payload.clubs.some((club: { id: string }) => club.id === 'club_driver'));
  assert.deepEqual(hole.shots[0].start, start);
  assert.equal(hole.shots[0].startedAt, '2026-09-20T15:00:00.000Z');

  // Round-trips through the importer with its id.
  const back = planRoundHistoryImport(JSON.stringify(payload));
  assert.equal(back.ok, true);
  if (back.ok) assert.equal(back.rounds[0].id, 'r-1');
});

test('restore merge: same id replaces, new id adds, other rounds stay', () => {
  const existing = [
    { id: 'a', startedAt: '2026-09-01T10:00:00.000Z', courseName: 'Magnolia', holeCount: 9 },
    { id: 'b', startedAt: '2026-09-02T10:00:00.000Z', courseName: 'Oak Hills', holeCount: 18 },
  ];
  const round = (id: string | null, startedAt: string, courseName = 'Magnolia'): RoundTransferRound =>
    ({ id, startedAt, courseName, holeCount: 9, holes: [] }) as unknown as RoundTransferRound;
  const merge = planRoundRestoreMerge({
    existing,
    incoming: [
      round('a', '2026-09-01T10:00:00.000Z'),
      round('c', '2026-09-03T10:00:00.000Z'),
      round('c', '2026-09-03T10:00:00.000Z'),
      round(null, '2026-09-01T10:00:00.000Z'),
      round(null, '2026-09-04T10:00:00.000Z'),
      round('z', '2026-09-01T10:00:00.000Z'),
    ],
  });
  assert.deepEqual(merge.replace.map((r) => r.id), ['a']);
  assert.deepEqual(merge.add.map((r) => r.id ?? r.startedAt), ['c', '2026-09-04T10:00:00.000Z']);
  assert.equal(merge.skipped, 3);
});

test('restore writes to SQLite: replaces the same id, adds new, keeps the rest', needsSqlite, () => {
  const db = memoryDb();
  const first = restoreRoundHistory(
    db,
    doc([
      fileRound({ id: 'keep', startedAt: '2026-09-01T10:00:00.000Z', courseName: 'Oak Hills' }),
      fileRound({ id: 'swap', startedAt: '2026-09-02T10:00:00.000Z' }),
    ]),
  );
  assert.deepEqual(first.ok && { added: first.added, updated: first.updated }, { added: 2, updated: 0 });
  const swapHole = listHoles(db, 'swap')[0];
  assert.equal(swapHole.score, 5);

  const second = restoreRoundHistory(
    db,
    doc([
      {
        ...fileRound({ id: 'swap', startedAt: '2026-09-02T10:00:00.000Z', courseName: 'Magnolia Back' }),
        holes: [{ number: 1, par: 4, score: 3, putts: 1, shots: [] }],
      },
      fileRound({ id: 'new', startedAt: '2026-09-05T10:00:00.000Z' }),
    ]),
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.added, 1);
  assert.equal(second.updated, 1);
  assert.equal(formatRestoreToast(second), '1 round added, 1 round updated.');

  const ids = listRounds(db).map((r) => r.id).sort();
  assert.deepEqual(ids, ['keep', 'new', 'swap']);
  const swapped = listRounds(db).find((r) => r.id === 'swap');
  assert.equal(swapped?.courseName, 'Magnolia Back');
  const holes = listHoles(db, 'swap');
  assert.equal(holes.length, 1);
  assert.equal(holes[0].score, 3);
  assert.equal(listShotsForHole(db, holes[0].id).length, 0);
  // The untouched round keeps its shot.
  assert.equal(listShotsForHole(db, listHoles(db, 'keep')[0].id).length, 1);

  // Same file again: only updates, no duplicates.
  const again = restoreRoundHistory(db, doc([fileRound({ id: 'new', startedAt: '2026-09-05T10:00:00.000Z' })]));
  assert.equal(again.ok && again.added, 0);
  assert.equal(listRounds(db).length, 3);

  deleteRound(db, 'keep');
  assert.equal(listRounds(db).length, 2);
});

test('restore rejects a file that is not ShotTraxx rounds', needsSqlite, () => {
  const db = memoryDb();
  assert.equal(restoreRoundHistory(db, '{"hello":1}').ok, false);
  assert.equal(restoreRoundHistory(db, 'not json').ok, false);
  assert.equal(listRounds(db).length, 0);
  assert.equal(formatRestoreToast({ added: 0, updated: 0 }), 'Those rounds are already on this phone.');
  assert.equal(formatRestoreToast({ added: 2, updated: 0 }), '2 rounds added.');
});

test('Home drops export/restore; menu opens Export / Restore rounds', () => {
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(home, /exportRounds|restoreRounds|restore-rounds|rounds-transfer|presentRoundHistoryShare/);
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const menu = hole.slice(hole.indexOf('visible={menuOpen}'), hole.indexOf('visible={scorecardOpen}'));
  assert.match(menu, /COPY\.roundsTransfer/);
  assert.match(menu, /\/rounds-transfer/);
  const screen = readFileSync(new URL('../../app/rounds-transfer.tsx', import.meta.url), 'utf8');
  assert.match(screen, /pickRoundHistoryFile/);
  assert.match(screen, /presentRoundHistoryShare/);
  assert.match(screen, /presentRoundCsvShare/);
  assert.match(screen, /ROUNDS_CSV_FILENAME/);
  assert.match(screen, /SHOTS_CSV_FILENAME/);
  const csvSource = readFileSync(new URL('./roundCsv.ts', import.meta.url), 'utf8');
  assert.match(csvSource, /rounds\.csv/);
  assert.match(csvSource, /shots\.csv/);
  assert.match(screen, /COPY\.restoreRoundsConfirm/);
  assert.match(screen, /looksLikeRoundCsvRestore/);
  assert.match(screen, /COPY\.restoreRoundsCsv/);
  assert.match(screen, /restoreFailureCopy/);
  assert.match(screen, /COPY\.restoreRoundsUnreadable/);
  assert.match(screen, /COPY\.restoreRoundsSaveFailed/);
  assert.match(screen, /console\.warn/);
  assert.match(screen, /COPY\.exportCsvSavedRoundsOnly/);
  assert.match(screen, /useFocusEffect/);
  assert.match(screen, /setBusy\(false\)/);
  const share = readFileSync(new URL('../services/roundHistoryShare.ts', import.meta.url), 'utf8');
  assert.match(share, /shareCsvSheets/);
  assert.match(share, /InteractionManager/);
  assert.match(share, /CSV_SHARE_CLOSE_DELAY_MS/);
  assert.match(share, /CSV_SHARE_TIMEOUT_MS/);
  assert.match(share, /csvExportSheetTitle/);
  assert.match(share, /shareCacheFile\(title, file\.contents, title\)/);
  assert.match(screen, /planBagRestore/);
  assert.match(screen, /applyTransferredBag/);
  assert.match(screen, /COPY\.cancel/);
  assert.match(screen, /bag-restore-changes/);
  assert.doesNotMatch(screen, /TextInput/);
  assert.doesNotMatch(screen, /isPro|Paywall|purchase/);
});

test('export file round-trips favorites and the typed bag, and a v1 file still restores', needsSqlite, () => {
  const db = memoryDb();
  const store = readSettingStore(db);
  setFavorite(
    store,
    {
      id: 'magnolia',
      name: 'Magnolia',
      city: 'Magnolia',
      state: 'AR',
      country: 'US',
      location: { lat: 33.26, lng: -93.24 },
    },
    true,
  );
  updateClubCarry(db, 'club_8i', 140);
  setClubEnabled(db, 'club_3w', false);
  restoreRoundHistory(
    db,
    doc([
      fileRound({
        id: 'r-1',
        startedAt: '2026-09-20T15:00:00.000Z',
        courseName: 'Magnolia',
        courseCity: 'Magnolia',
        courseState: 'AR',
        courseDataSource: 'osm',
      } as Partial<RoundTransferRound> & { id: string; startedAt: string }),
    ]),
  );
  const payload = JSON.parse(serializeRoundHistory(collectRoundHistoryExport(db, '2026-09-24T12:00:00.000Z')));
  assert.equal(payload.version, 2);
  assert.equal(payload.favorites.length, 1);
  assert.deepEqual(Object.keys(payload.favorites[0]).sort(), ['city', 'id', 'location', 'name', 'state']);
  assert.equal(payload.favorites[0].city, 'Magnolia');
  assert.equal(JSON.stringify(payload.favorites).includes('ready'), false);
  assert.equal(JSON.stringify(payload.favorites).includes('downloaded'), false);
  const eight = payload.bag.find((club: RoundTransferBagClub) => club.id === 'club_8i');
  const driver = payload.bag.find((club: RoundTransferBagClub) => club.id === 'club_driver');
  const wood = payload.bag.find((club: RoundTransferBagClub) => club.id === 'club_3w');
  assert.equal(eight.typicalCarryYards, 140);
  assert.equal(driver.typicalCarryYards, null);
  assert.equal(wood.enabled, false);
  assert.equal(payload.rounds[0].courseCity, 'Magnolia');
  assert.equal(payload.rounds[0].courseDataSource, 'osm');

  const fresh = memoryDb();
  const restored = restoreRoundHistory(fresh, JSON.stringify(payload));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.favoritesAdded, 1);
  assert.equal(listFavorites(readSettingStore(fresh))[0]?.id, 'magnolia');
  assert.equal(getSetting(fresh, OFFLINE_PACKS_SETTING_KEY), null);

  const v1 = memoryDb();
  const old = restoreRoundHistory(
    v1,
    JSON.stringify({
      kind: ROUND_HISTORY_EXPORT_KIND,
      version: 1,
      exportedAt: '2026-01-01T00:00:00.000Z',
      rounds: [fileRound({ id: 'old', startedAt: '2026-01-02T00:00:00.000Z' })],
    }),
  );
  assert.equal(old.ok, true);
  if (!old.ok) return;
  assert.equal(old.added, 1);
  assert.equal(old.favoritesAdded, 0);
  assert.equal(old.bag.length, 0);
  assert.equal(listRounds(v1).length, 1);
});

test('bag diff lists on, off, order, and carry including blank, and apply waits for confirm', () => {
  const current = [
    { id: 'club_driver', name: 'Driver', shortName: 'Dr', enabled: false, sortOrder: 0, typicalCarryYards: null },
    { id: 'club_3w', name: '3 Wood', shortName: '3W', enabled: true, sortOrder: 1, typicalCarryYards: null },
    { id: 'club_6i', name: '6 Iron', shortName: '6i', enabled: true, sortOrder: 8, typicalCarryYards: null },
    { id: 'club_7i', name: '7 Iron', shortName: '7i', enabled: true, sortOrder: 9, typicalCarryYards: null },
    { id: 'club_8i', name: '8 Iron', shortName: '8i', enabled: true, sortOrder: 10, typicalCarryYards: 140 },
    { id: 'club_putter', name: 'Putter', shortName: 'Pt', enabled: true, sortOrder: 18, typicalCarryYards: null },
  ];
  const incoming: RoundTransferBagClub[] = [
    { id: 'club_driver', enabled: true, sortOrder: 0, typicalCarryYards: null },
    { id: 'club_3w', enabled: false, sortOrder: 1, typicalCarryYards: null },
    { id: 'club_6i', enabled: true, sortOrder: 8, typicalCarryYards: 155 },
    { id: 'club_7i', enabled: true, sortOrder: 3, typicalCarryYards: null },
    { id: 'club_8i', enabled: true, sortOrder: 10, typicalCarryYards: null },
    { id: 'club_putter', enabled: true, sortOrder: 18, typicalCarryYards: 12 },
    { id: 'club_missing', enabled: true, sortOrder: 20, typicalCarryYards: 200 },
  ];
  const lines = planBagRestore(current, incoming).map(formatBagChange);
  assert.deepEqual(lines, [
    'Driver turned on',
    '3 Wood turned off',
    '6 Iron carry blank → 155',
    '7 Iron moved from 9 to 3',
    '8 Iron carry 140 → blank',
  ]);
  assert.equal(planBagRestore(current, current.map((club) => ({
    id: club.id,
    enabled: club.enabled,
    sortOrder: club.sortOrder,
    typicalCarryYards: club.typicalCarryYards,
  }))).length, 0);
});

test('restore adds favorites without duplicates or a download, and a second pass is a no-op', needsSqlite, () => {
  const db = memoryDb();
  const proCache = '{"active":true,"expirationDate":null,"isTrial":false}';
  setSetting(db, PRO_CACHE_SETTING_KEY, proCache);
  setSetting(db, PRO_OVERRIDE_SETTING_KEY, 'force-pro');
  const thunderId = `local:${THUNDERBIRD_HEBER_SPRINGS_AR_KEY}`;
  const file = JSON.stringify({
    kind: ROUND_HISTORY_EXPORT_KIND,
    version: ROUND_HISTORY_EXPORT_VERSION,
    exportedAt: '2026-09-24T12:00:00.000Z',
    clubs: [{ id: 'club_driver', name: 'Driver', shortName: 'Dr' }],
    favorites: [
      {
        id: thunderId,
        name: 'Thunderbird Country Club',
        city: 'Heber Springs',
        state: 'AR',
        location: THUNDERBIRD_HEBER_CLUBHOUSE,
        status: 'ready',
        downloaded: true,
        paint: { holes: [{ green: { lat: 1, lng: 2 } }] },
      },
      {
        id: 'magnolia',
        name: 'Magnolia',
        city: 'Magnolia',
        state: 'AR',
        location: { lat: 33.26, lng: -93.24 },
      },
      {
        id: 'magnolia',
        name: 'Magnolia duplicate',
        city: 'Elsewhere',
        state: 'TX',
        location: null,
      },
    ],
    bag: listClubs(db).map((club) => ({
      id: club.id,
      enabled: club.id !== 'club_driver',
      sortOrder: club.sortOrder,
      typicalCarryYards: club.id === 'club_8i' ? 140 : null,
    })),
    rounds: [fileRound({ id: 'r-1', startedAt: '2026-09-20T15:00:00.000Z' })],
  });

  const first = restoreRoundHistory(db, file);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.added, 1);
  assert.equal(first.favoritesAdded, 2);
  const favorites = listFavorites(readSettingStore(db));
  assert.deepEqual(favorites.map((favorite) => favorite.id), [thunderId, 'magnolia']);
  assert.equal(favorites[0]?.name, 'Thunderbird Country Club');
  const storedFavorites = getSetting(db, FAVORITES_SETTING_KEY) ?? '';
  assert.equal(storedFavorites.includes('ready'), false);
  assert.equal(storedFavorites.includes('downloaded'), false);
  assert.equal(storedFavorites.includes('paint'), false);
  assert.equal(getSetting(db, OFFLINE_PACKS_SETTING_KEY), null);
  assert.equal(getSetting(db, PRO_CACHE_SETTING_KEY), proCache);
  assert.equal(getSetting(db, PRO_OVERRIDE_SETTING_KEY), 'force-pro');

  const layout = layoutForFavoriteStart(favorites[0]);
  assert.equal(layout.holes?.some((hole) => hole.greenCentroid != null || hole.teeCentroid != null) ?? false, false);
  assert.equal(layout.holes?.some((hole) => hole.yards != null) ?? false, false);
  assert.equal(yardsToGreenPlayerLabel({ yards: null, quality: 'none' }, { hasGreen: false }).value, '—');

  const before = listClubs(db).find((club) => club.id === 'club_driver');
  assert.equal(before?.enabled, true);
  const lines = planBagRestore(listClubs(db), first.bag).map(formatBagChange);
  assert.ok(lines.includes('Driver turned off'));
  assert.ok(lines.includes('8 Iron carry blank → 140'));
  assert.equal(listClubs(db).find((club) => club.id === 'club_driver')?.enabled, true);

  applyTransferredBag(db, first.bag);
  assert.equal(listClubs(db).find((club) => club.id === 'club_driver')?.enabled, false);
  assert.equal(listClubs(db).find((club) => club.id === 'club_8i')?.typicalCarryYards, 140);
  assert.equal(planBagRestore(listClubs(db), first.bag).length, 0);

  const shotId = listShotsForHole(db, listHoles(db, 'r-1')[0].id)[0]?.id;
  const again = restoreRoundHistory(db, file);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.added, 0);
  assert.equal(again.updated, 0);
  assert.equal(again.favoritesAdded, 0);
  assert.equal(listRounds(db).length, 1);
  assert.equal(listFavorites(readSettingStore(db)).length, 2);
  assert.equal(listShotsForHole(db, listHoles(db, 'r-1')[0].id).length, 1);
  assert.equal(listShotsForHole(db, listHoles(db, 'r-1')[0].id)[0]?.id, shotId);
  assert.equal(planBagRestore(listClubs(db), again.bag).length, 0);
  assert.equal(getSetting(db, PRO_CACHE_SETTING_KEY), proCache);
  assert.equal(getSetting(db, PRO_OVERRIDE_SETTING_KEY), 'force-pro');
});
