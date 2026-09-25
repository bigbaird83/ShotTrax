import assert from 'node:assert/strict';
import test from 'node:test';
import type { SQLiteDatabase } from 'expo-sqlite';
import { collectRoundCsv, listHoles, startRound } from '../db/repo';
import { migrate } from '../db/schema';
import { CSV_BOM, csvNumber, csvText } from './csv';
import { courseDataSourceLabel } from './courseDataSource';
import {
  buildRoundsCsv,
  buildShotsCsv,
  csvShareSheetLabel,
  looksLikeRoundCsvRestore,
  ROUNDS_CSV_HEADERS,
  SHOTS_CSV_HEADERS,
  type CsvRound,
  type CsvShot,
} from './roundCsv';

const DatabaseSync = (() => {
  try {
    return (require('node:sqlite') as typeof import('node:sqlite')).DatabaseSync;
  } catch {
    return null;
  }
})();
const needsSqlite = { skip: DatabaseSync ? false : 'node:sqlite needs Node 22.5+' };

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

function parseCsv(text: string): string[][] {
  assert.equal(text.charCodeAt(0), CSV_BOM.charCodeAt(0));
  const body = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\r' && body[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 2;
      continue;
    }
    cell += ch;
    i += 1;
  }
  return rows.filter((item) => item.length > 1 || item[0] !== '');
}

const cafe = "Pine's Edge, North — Café";

function round(over: Partial<CsvRound> = {}): CsvRound {
  return {
    id: 'r-1',
    startedAt: '2026-09-20T15:00:00.000Z',
    courseId: 'course-1',
    courseName: cafe,
    city: null,
    state: null,
    holesPlayed: 9,
    courseDataSource: null,
    holes: [{ number: 1, par: 4, score: 5, putts: 2 }],
    ...over,
  };
}

test('course data source tokens map to readable words and unknown stays blank', () => {
  assert.equal(courseDataSourceLabel('cache'), 'saved copy');
  assert.equal(courseDataSourceLabel('saved copy'), 'saved copy');
  assert.equal(courseDataSourceLabel('osm'), 'OpenStreetMap');
  assert.equal(courseDataSourceLabel('manual_verified'), 'OpenStreetMap');
  assert.equal(courseDataSourceLabel('gca'), 'GCA');
  assert.equal(courseDataSourceLabel('golfapi'), 'golfapi');
  assert.equal(courseDataSourceLabel('golfapi.io'), 'golfapi');
  assert.equal(courseDataSourceLabel(null), '');
  assert.equal(courseDataSourceLabel('seed'), '');
  assert.equal(courseDataSourceLabel('miss'), '');
});

test('rounds.csv quotes text, keeps one cell, blanks missing numbers, and skips GIR and handicap', () => {
  const csv = buildRoundsCsv([
    round({
      courseName: `${cafe}\nHe said "hello"`,
      city: null,
      state: null,
      holes: [
        { number: 1, par: 4, score: 5, putts: 2 },
        { number: 2, par: null, score: null, putts: null },
      ],
      courseDataSource: 'osm',
    }),
    round({
      id: 'r-2',
      courseName: '=HYPERLINK("http://evil")',
      city: '+cmd',
      state: '@sum',
      courseDataSource: 'cache',
      holes: [],
      holesPlayed: null,
    }),
  ]);
  assert.equal(csv.startsWith(CSV_BOM), true);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], [...ROUNDS_CSV_HEADERS]);
  const headerLine = rows[0].join(',').toLowerCase();
  assert.equal(headerLine.includes('gir'), false);
  assert.equal(headerLine.includes('handicap'), false);
  assert.equal(headerLine.includes('green'), false);

  const first = rows[1];
  assert.equal(first.length, ROUNDS_CSV_HEADERS.length);
  assert.match(first[1], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  assert.equal(Date.parse(first[1]), Date.parse('2026-09-20T15:00:00.000Z'));
  assert.equal(first[3], `${cafe}\nHe said "hello"`);
  assert.equal(first[4], '');
  assert.equal(first[5], '');
  assert.equal(first[6], '9');
  assert.equal(first[7], '5');
  assert.equal(first[8], '2');
  assert.equal(first[9], 'OpenStreetMap');
  assert.equal(first[10], '4');
  assert.equal(first[11], '5');
  assert.equal(first[12], '');
  assert.equal(first[13], '');
  assert.equal(csv.includes(',0,'), false);

  const second = rows[2];
  assert.equal(second[3], `'=HYPERLINK("http://evil")`);
  assert.equal(second[4], `'+cmd`);
  assert.equal(second[5], `'@sum`);
  assert.equal(second[6], '');
  assert.equal(second[7], '');
  assert.equal(second[8], '');
  assert.equal(second[9], 'saved copy');

  const rawSecondName = csv.split('\r\n')[2];
  assert.match(rawSecondName, /"'=HYPERLINK\(""http:\/\/evil""\)"/);
});

test('formula guard prefixes text and leaves negative numbers plain', () => {
  assert.equal(csvText('=1+1'), `"'=1+1"`);
  assert.equal(csvText('+1'), `"'+1"`);
  assert.equal(csvText('-Pine'), `"'-Pine"`);
  assert.equal(csvText('@sum'), `"'@sum"`);
  assert.equal(csvText('\tcmd'), `"'\tcmd"`);
  assert.equal(csvText('\rmd'), `"'\rmd"`);
  assert.equal(csvText(`Say "hi"`), `"Say ""hi"""`);
  assert.equal(csvNumber(-92.11), '-92.11');
  assert.equal(csvNumber(0), '0');
  assert.equal(csvNumber(null), '');
  assert.equal(csvNumber(Number.NaN), '');
});

test('shots.csv source words, blanks, typed yards, and penalties', () => {
  const shots: CsvShot[] = [
    {
      roundId: 'r-1',
      holeNumber: 1,
      shotNumber: 1,
      club: 'Dr',
      distanceYards: 246,
      startLat: 35.51,
      startLng: -92.11,
      endLat: 35.513,
      endLng: -92.108,
      fixQuality: 'good',
      source: 'gps',
      typedYards: null,
    },
    {
      roundId: 'r-1',
      holeNumber: 1,
      shotNumber: 2,
      club: '7i',
      distanceYards: 999,
      startLat: 1,
      startLng: 2,
      endLat: 3,
      endLng: 4,
      fixQuality: 'none',
      source: 'no_gps',
      typedYards: 140,
    },
    {
      roundId: 'r-1',
      holeNumber: 2,
      shotNumber: 1,
      club: 'PW',
      distanceYards: 80,
      startLat: 35.52,
      startLng: -92.1,
      endLat: 35.521,
      endLng: -92.099,
      fixQuality: null,
      source: 'placed',
      typedYards: null,
    },
    {
      roundId: 'r-1',
      holeNumber: 3,
      shotNumber: null,
      club: null,
      distanceYards: null,
      startLat: 35.53,
      startLng: -92.12,
      endLat: null,
      endLng: null,
      fixQuality: null,
      source: 'penalty',
      typedYards: null,
    },
  ];
  const csv = buildShotsCsv(shots);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], [...SHOTS_CSV_HEADERS]);
  assert.equal(rows[0].join(',').toLowerCase().includes('gir'), false);
  assert.equal(rows[0].join(',').toLowerCase().includes('handicap'), false);

  const gps = rows[1];
  assert.equal(gps[4], '246');
  assert.equal(gps[6], '-92.11');
  assert.equal(gps[10], 'GPS');
  assert.equal(gps[11], '');
  assert.match(csv, /,-92\.11,/);

  const noGps = rows[2];
  assert.equal(noGps[3], '7i');
  assert.equal(noGps[4], '');
  assert.equal(noGps[5], '');
  assert.equal(noGps[6], '');
  assert.equal(noGps[7], '');
  assert.equal(noGps[8], '');
  assert.equal(noGps[10], 'No GPS');
  assert.equal(noGps[11], '140');
  assert.equal(noGps.includes('999'), false);

  assert.equal(rows[3][10], 'Placed');
  assert.equal(rows[3][9], '');
  assert.equal(rows[4][2], '');
  assert.equal(rows[4][10], 'Penalty');
  assert.equal(rows[4][5], '35.53');
  assert.equal(rows[4][7], '');
});

test('stored round export leaves missing par, score, putts, and source blank', needsSqlite, () => {
  const db = memoryDb();
  const created = startRound(db, 9, 'Temp');
  db.runSync(
    'UPDATE rounds SET course_name = ?, course_api_id = ?, course_city = ?, course_state = ?, course_data_source = ? WHERE id = ?',
    [cafe, 'course-pine', 'Heber Springs', null, 'gca', created.id],
  );
  const hole = listHoles(db, created.id)[0];
  db.runSync('UPDATE holes SET par = NULL, score = NULL, putts = 0, putts_done = 0 WHERE id = ?', [hole.id]);
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq, start_lat, start_lng, end_lat, end_lng,
      distance_yards, typed_yards, fix_quality, impossible_jump, started_at, ended_at, source
    ) VALUES (?, ?, 'club_driver', 1, 35.51, -92.11, 35.513, -92.1, 150, NULL, 'good', 0, ?, NULL, 'gps')`,
    ['shot-gps', hole.id, created.startedAt],
  );
  db.runSync(
    `INSERT INTO shots (
      id, hole_id, club_id, seq, distance_yards, typed_yards, fix_quality, impossible_jump, started_at, source
    ) VALUES (?, ?, 'club_7i', 2, 999, 140, 'none', 0, ?, 'no_gps')`,
    ['shot-nogps', hole.id, created.startedAt],
  );
  db.runSync(
    `INSERT INTO hole_penalties (id, hole_id, strokes, reason, note, created_at, kind, lat, lng)
     VALUES ('pen-1', ?, 1, 'water', NULL, ?, 'penalty', 35.52, -92.2)`,
    [hole.id, created.startedAt],
  );
  const csv = collectRoundCsv(db);
  const rounds = parseCsv(csv.roundsCsv);
  const data = rounds[1];
  assert.equal(data[3], cafe);
  assert.equal(data[4], 'Heber Springs');
  assert.equal(data[5], '');
  assert.equal(data[7], '');
  assert.equal(data[8], '');
  assert.equal(data[9], 'GCA');
  assert.equal(data[10], '');
  assert.equal(data[11], '');
  const shots = parseCsv(csv.shotsCsv);
  assert.equal(shots[1][3], 'Dr');
  assert.equal(shots[1][4], '150');
  assert.equal(shots[1][6], '-92.11');
  assert.equal(shots[1][10], 'GPS');
  assert.equal(shots[2][4], '');
  assert.equal(shots[2][10], 'No GPS');
  assert.equal(shots[2][11], '140');
  assert.equal(shots[3][10], 'Penalty');
  assert.equal(shots[3][2], '');
});

test('csv share labels and restore detection', () => {
  assert.equal(csvShareSheetLabel(1, 2, 'rounds.csv'), '1 of 2 · rounds.csv');
  assert.equal(csvShareSheetLabel(2, 2, 'shots.csv'), '2 of 2 · shots.csv');
  assert.equal(looksLikeRoundCsvRestore('rounds.csv', 'hello'), true);
  assert.equal(looksLikeRoundCsvRestore('Shots.CSV', ''), true);
  assert.equal(looksLikeRoundCsvRestore('export/rounds.csv', 'x'), true);
  assert.equal(looksLikeRoundCsvRestore('ShotTraxx-rounds-2026-09-25.json', buildRoundsCsv([])), true);
  assert.equal(looksLikeRoundCsvRestore(null, buildShotsCsv([])), true);
  assert.equal(looksLikeRoundCsvRestore('notes.txt', ROUNDS_CSV_HEADERS.join(',')), true);
  assert.equal(looksLikeRoundCsvRestore('notes.txt', SHOTS_CSV_HEADERS.join(',')), true);
  assert.equal(looksLikeRoundCsvRestore('backup.json', '{"kind":"shottrax.round-history","version":2}'), false);
  assert.equal(looksLikeRoundCsvRestore('notes.txt', 'round_id,started_at'), false);
  assert.equal(looksLikeRoundCsvRestore(null, ''), false);
});
