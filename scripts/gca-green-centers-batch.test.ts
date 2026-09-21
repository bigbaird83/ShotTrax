import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AR_DOC_BELT_LABELS,
  AR_DOC_BELT_PRIORITY,
  CLUBHOUSE_DENYLIST,
  DEFAULT_NIGHTLY_CAP,
  GCA_API_BASE,
  classifyGreenCenters,
  formatCountsLine,
  isArkansas,
  isClubhousePin,
  isValidGreenPoint,
  parseGreenCenterRows,
  persistCourse,
  prioritizeCourses,
  readCap,
  runGreensBatch,
} from './gca-green-centers-batch.mjs';
import { inventGreenFromClubhouse } from '../src/course/hydrate';

const THUNDERBIRD_CLUBHOUSE = { lat: 35.525292, lng: -92.038355 };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function emptyStore() {
  return { version: 1, source: 'golfapi', updatedAt: null, courses: {} };
}

function emptyCursor() {
  return {
    version: 1,
    priorityIndex: 0,
    arStateId: null,
    arListPage: 1,
    usListPage: 1,
    arListDone: false,
    processedIds: [],
    lastRunAt: null,
    lastCounts: { fetched: 0, skipped_empty: 0, 403: 0, errors: 0 },
  };
}

function tempPaths() {
  const dir = mkdtempSync(join(tmpdir(), 'gca-greens-batch-'));
  const storePath = join(dir, 'green-centers.json');
  const cursorPath = join(dir, 'cursor.json');
  writeFileSync(storePath, JSON.stringify(emptyStore(), null, 2));
  writeFileSync(cursorPath, JSON.stringify(emptyCursor(), null, 2));
  return { storePath, cursorPath };
}

test('nightly cap defaults to 350 and documents AR-first labels', () => {
  assert.equal(DEFAULT_NIGHTLY_CAP, 350);
  assert.equal(readCap({}), 350);
  assert.equal(readCap({ GCA_GREENS_BATCH_CAP: '50' }), 50);
  assert.equal(readCap({ GCA_GREENS_BATCH_CAP: 'nope' }), 350);
  assert.ok(AR_DOC_BELT_PRIORITY.length >= 6);
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Thunderbird/i.test(label)));
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Mountain Ranch/i.test(label)));
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Cypress Creek/i.test(label)));
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Greystone/i.test(label)));
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Pleasant Valley/i.test(label)));
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Magnolia/i.test(label)));
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Little Rock/i.test(label)));
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Heber Springs/i.test(label)));
  assert.ok(AR_DOC_BELT_LABELS.some((label) => /Fairfield Bay/i.test(label)));
});

test('prioritizeCourses puts AR Doc-belt ahead of the rest of US', () => {
  const ranked = prioritizeCourses(
    [
      { id: '90', name: 'Pebble Beach', city: 'Pebble Beach', state: 'CA', country: 'US', club: null, location: null },
      { id: '11', name: 'Pleasant Valley Country Club', city: 'Little Rock', state: 'AR', country: 'US', club: null, location: null },
      { id: '7', name: 'Cypress Creek Golf Club', city: 'Cabot', state: 'AR', country: 'US', club: null, location: null },
      { id: '3', name: 'Thunderbird Country Club', city: 'Heber Springs', state: 'AR', country: 'US', club: null, location: null },
      { id: '22', name: 'Some Club', city: 'Dallas', state: 'TX', country: 'US', club: null, location: null },
    ],
    [],
  );
  assert.deepEqual(
    ranked.map((row) => row.name),
    [
      'Thunderbird Country Club',
      'Cypress Creek Golf Club',
      'Pleasant Valley Country Club',
      'Some Club',
      'Pebble Beach',
    ],
  );
  assert.equal(isArkansas('Arkansas'), true);
  assert.equal(isArkansas('AR'), true);
});

test('parseGreenCenterRows drops empty, 0,0, and clubhouse pins — never invents', () => {
  assert.deepEqual(parseGreenCenterRows({ data: { holes: [] } }), []);
  assert.deepEqual(parseGreenCenterRows({ data: { holes: [{ hole: 1 }] } }), []);
  assert.deepEqual(parseGreenCenterRows({ data: { holes: [{ hole: 1, lat: 0, lng: 0 }] } }), []);
  assert.deepEqual(
    parseGreenCenterRows({
      data: { holes: [{ hole: 1, lat: THUNDERBIRD_CLUBHOUSE.lat, lng: THUNDERBIRD_CLUBHOUSE.lng }] },
    }),
    [],
  );
  assert.equal(isClubhousePin(THUNDERBIRD_CLUBHOUSE), true);
  assert.equal(isValidGreenPoint({ lat: 35.03, lng: -92.03 }), true);
  assert.equal(inventGreenFromClubhouse(), false);
  assert.equal(CLUBHOUSE_DENYLIST.some((pin) => pin.label.includes('Thunderbird')), true);
  const ok = parseGreenCenterRows({
    data: { holes: [{ hole: 1, lat: 34.78, lng: -92.4 }] },
  });
  assert.equal(ok.length, 1);
  assert.equal(ok[0]?.hole, 1);
});

test('classifyGreenCenters maps fetched / skipped_empty / 403 / errors', () => {
  assert.equal(classifyGreenCenters(200, [{ hole: 1, lat: 1, lng: 2 }]), 'fetched');
  assert.equal(classifyGreenCenters(200, []), 'skipped_empty');
  assert.equal(classifyGreenCenters(404, []), 'skipped_empty');
  assert.equal(classifyGreenCenters(403, []), '403');
  assert.equal(classifyGreenCenters(500, []), 'errors');
});

test('batch skips cleanly without a key and never invents greens', async () => {
  const { storePath, cursorPath } = tempPaths();
  const logs: string[] = [];
  let calls = 0;
  const result = await runGreensBatch({
    env: {},
    storePath,
    cursorPath,
    persist: true,
    log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    fetch: async () => {
      calls += 1;
      throw new Error('network should not run');
    },
  });
  assert.equal(result.code, 'NO_KEY');
  assert.match(logs.join('\n'), /GCA_GREENS_BATCH skipped=NO_KEY/);
  assert.equal(calls, 0);
  assert.deepEqual(JSON.parse(readFileSync(storePath, 'utf8')).courses, {});
});

test('batch pulls AR-first, caps the night, and persists only real greens', async () => {
  const { storePath, cursorPath } = tempPaths();
  const urls: string[] = [];
  const logs: string[] = [];
  const result = await runGreensBatch({
    env: { GOLF_COURSES_API_KEY: 'k' },
    storePath,
    cursorPath,
    cap: 2,
    gapMs: 0,
    sleep: async () => undefined,
    persist: true,
    log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
    now: () => '2026-09-21T07:00:00.000Z',
    fetch: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/states?')) {
        return jsonResponse(200, { data: [{ id: 1407, name: 'Arkansas', iso2: 'AR' }] });
      }
      if (url.includes('q=Thunderbird')) {
        return jsonResponse(200, {
          data: [
            {
              id: 3,
              name: 'Thunderbird Country Club',
              city: 'Heber Springs',
              state: 'Arkansas',
              country: 'US',
              latitude: 35.525292,
              longitude: -92.038355,
            },
          ],
        });
      }
      if (url.includes('q=Cypress') || url.includes('q=Mountain') || url.includes('q=Greystone') || url.includes('q=Pleasant') || url.includes('q=Heber') || url.includes('q=Fairfield') || url.includes('q=Cabot') || url.includes('q=Little') || url.includes('q=Magnolia')) {
        return jsonResponse(200, {
          data: [
            {
              id: 7,
              name: 'Cypress Creek Golf Club',
              city: 'Cabot',
              state: 'Arkansas',
              country: 'US',
              latitude: 35.027715,
              longitude: -92.031642,
            },
            {
              id: 90,
              name: 'Pebble Beach Golf Links',
              city: 'Pebble Beach',
              state: 'California',
              country: 'US',
              latitude: 36.57,
              longitude: -121.95,
            },
          ],
        });
      }
      if (url.includes('country=US') || url.includes('state_prov_id=')) {
        return jsonResponse(200, {
          data: [
            {
              id: 90,
              name: 'Pebble Beach Golf Links',
              city: 'Pebble Beach',
              state: 'California',
              country: 'US',
              latitude: 36.57,
              longitude: -121.95,
            },
          ],
          meta: { current_page: 1, last_page: 1 },
        });
      }
      if (url.endsWith('/courses/3/green-centers')) {
        return jsonResponse(200, { data: { holes: [] } });
      }
      if (url.endsWith('/courses/7/green-centers')) {
        return jsonResponse(200, {
          data: { course_id: 7, holes: [{ hole: 1, lat: 35.027902, lng: -92.0287661 }] },
        });
      }
      throw new Error(`unexpected ${url}`);
    },
  });

  assert.equal(result.code, 'OK');
  assert.equal(result.counts.fetched, 1);
  assert.equal(result.counts.skipped_empty, 1);
  assert.equal(result.counts[403], 0);
  assert.equal(result.counts.errors, 0);
  assert.deepEqual(
    result.queue.map((row) => row.id),
    ['3', '7'],
  );
  const greensCalls = urls.filter((url) => url.includes('/green-centers'));
  assert.deepEqual(greensCalls, [
    `${GCA_API_BASE}/courses/3/green-centers`,
    `${GCA_API_BASE}/courses/7/green-centers`,
  ]);
  assert.ok(urls.every((url) => url.startsWith(GCA_API_BASE)));

  const store = JSON.parse(readFileSync(storePath, 'utf8')) as {
    courses: Record<string, { holes: { hole: number; lat: number; lng: number }[]; location: { lat: number; lng: number } }>;
  };
  assert.equal(store.courses['3'], undefined);
  assert.equal(store.courses['7']?.holes.length, 1);
  assert.deepEqual(store.courses['7']?.holes[0], { hole: 1, lat: 35.027902, lng: -92.0287661 });
  assert.notDeepEqual(store.courses['7']?.holes[0], THUNDERBIRD_CLUBHOUSE);
  assert.notDeepEqual(store.courses['7']?.location, store.courses['7']?.holes[0]);
  assert.match(logs.join('\n'), /GCA_GREENS_BATCH fetched=1 skipped_empty=1 403=0 errors=0 cap=2/);
  assert.doesNotMatch(logs.join('\n'), /Bearer k/);
  assert.doesNotMatch(logs.join('\n'), /GOLF_COURSES_API_KEY=k/);
});

test('batch skips 403 and empty payloads and never writes invented coords', async () => {
  const { storePath, cursorPath } = tempPaths();
  const result = await runGreensBatch({
    env: { GOLF_COURSES_API_KEY: 'free' },
    storePath,
    cursorPath,
    cap: 3,
    gapMs: 0,
    sleep: async () => undefined,
    persist: true,
    log: () => undefined,
    fetch: async (input) => {
      const url = String(input);
      if (url.includes('/states?')) {
        return jsonResponse(200, { data: [{ id: 1407, name: 'Arkansas', iso2: 'AR' }] });
      }
      if (url.includes('/courses?')) {
        return jsonResponse(200, {
          data: [
            { id: 1, name: 'Empty AR', city: 'Cabot', state: 'AR', country: 'US', latitude: 35.02, longitude: -92.03 },
            { id: 2, name: 'Forbidden AR', city: 'Cabot', state: 'AR', country: 'US', latitude: 35.03, longitude: -92.04 },
            { id: 3, name: 'Miss AR', city: 'Cabot', state: 'AR', country: 'US', latitude: 35.04, longitude: -92.05 },
          ],
          meta: { current_page: 1, last_page: 1 },
        });
      }
      if (url.endsWith('/courses/1/green-centers')) return jsonResponse(200, { data: { holes: [] } });
      if (url.endsWith('/courses/2/green-centers')) {
        return jsonResponse(403, { message: 'Green-center data requires a Pro or Max plan.' });
      }
      if (url.endsWith('/courses/3/green-centers')) return jsonResponse(404, { message: 'Not found' });
      throw new Error(`unexpected ${url}`);
    },
  });
  assert.equal(result.counts.fetched, 0);
  assert.equal(result.counts.skipped_empty, 2);
  assert.equal(result.counts[403], 1);
  const store = JSON.parse(readFileSync(storePath, 'utf8'));
  assert.deepEqual(store.courses, {});
  assert.equal(inventGreenFromClubhouse(), false);
});

test('persistCourse refuses empty hole lists', () => {
  const store = persistCourse(
    emptyStore(),
    {
      id: '3',
      name: 'Thunderbird Country Club',
      club: 'Thunderbird Country Club',
      city: 'Heber Springs',
      state: 'AR',
      country: 'US',
      location: THUNDERBIRD_CLUBHOUSE,
    },
    [],
    '2026-09-21T07:00:00Z',
  );
  assert.deepEqual(store.courses, {});
});

test('logs are status counts only — no key, no PII payload', () => {
  const line = formatCountsLine({ fetched: 12, skipped_empty: 4, 403: 1, errors: 0 }, { cap: 350 });
  assert.equal(line, 'GCA_GREENS_BATCH fetched=12 skipped_empty=4 403=1 errors=0 cap=350');
  assert.doesNotMatch(line, /Bearer|lat|lng|address|phone|@/);
});

test('CLI prints NO_KEY and exits 0 without a key', () => {
  const env = { ...process.env };
  delete env.GOLF_COURSES_API_KEY;
  delete env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  const script = fileURLToPath(new URL('./gca-green-centers-batch.mjs', import.meta.url));
  const ran = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  assert.equal(ran.status, 0);
  assert.match(ran.stdout, /GCA_GREENS_BATCH skipped=NO_KEY/);
  assert.doesNotMatch(ran.stdout, /Bearer /);
});
