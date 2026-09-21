import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPersistedGreens,
  gcaGreensForCourse,
  gcaStoreCourseDetail,
  loadGcaGreenStore,
  parseGcaGreenStore,
} from './gcaGreenStore';
import { inventGreenFromClubhouse } from './hydrate';
import type { CourseDetail } from './types';

const emptyDetail = (id = '4'): CourseDetail => ({
  id,
  name: 'Bowling Green Country Club',
  holeCount: 18,
  location: { lat: 37.0132, lng: -86.43378 },
  holes: [
    {
      holeNumber: 1,
      par: 4,
      yards: 437,
      handicap: 7,
      greenCentroid: null,
      greenFront: null,
      greenBack: null,
      greenDepthYards: null,
      teeCentroid: null,
    },
  ],
  tees: [],
  greenCentersAvailable: true,
});

test('empty committed GCA store has no courses and invents nothing', () => {
  const store = loadGcaGreenStore();
  assert.equal(store.source, 'golfapi');
  assert.deepEqual(store.courses, {});
  assert.deepEqual(gcaGreensForCourse('4'), []);
  assert.equal(gcaStoreCourseDetail('4'), null);
  assert.equal(inventGreenFromClubhouse(), false);
});

test('parseGcaGreenStore drops empty, 0,0, and nameless rows — never invents', () => {
  const parsed = parseGcaGreenStore({
    version: 1,
    source: 'golfapi',
    courses: {
      '1': { id: '1', name: 'Empty CC', fetchedAt: '2026-09-21T00:00:00Z', holes: [] },
      '2': {
        id: '2',
        name: 'Null Island CC',
        fetchedAt: '2026-09-21T00:00:00Z',
        holes: [{ hole: 1, lat: 0, lng: 0 }],
      },
      '3': { id: '3', fetchedAt: '2026-09-21T00:00:00Z', holes: [{ hole: 1, lat: 35.1, lng: -92.1 }] },
      '7': {
        id: '7',
        name: 'Cypress Creek Golf Club',
        city: 'Cabot',
        state: 'AR',
        country: 'US',
        fetchedAt: '2026-09-21T00:00:00Z',
        location: { lat: 35.027715, lng: -92.031642 },
        holes: [{ hole: 1, lat: 35.027902, lng: -92.0287661 }],
      },
    },
  });
  assert.deepEqual(Object.keys(parsed.courses), ['7']);
  assert.equal(parsed.courses['7']?.holes.length, 1);
  assert.notDeepEqual(parsed.courses['7']?.holes[0], parsed.courses['7']?.location);
});

test('applyPersistedGreens lets live Pro win and fills only missing holes', () => {
  const stored = [
    { holeNumber: 1, greenCentroid: { lat: 35.1, lng: -92.1 }, greenFront: null, greenBack: null, greenDepthYards: null },
    { holeNumber: 2, greenCentroid: { lat: 35.2, lng: -92.2 }, greenFront: null, greenBack: null, greenDepthYards: null },
  ];
  const live = [
    { holeNumber: 1, greenCentroid: { lat: 37.01744, lng: -86.43135 }, greenFront: null, greenBack: null, greenDepthYards: null },
  ];
  const merged = applyPersistedGreens(emptyDetail(), stored, live);
  assert.deepEqual(merged.holes[0]?.greenCentroid, { lat: 37.01744, lng: -86.43135 });
  assert.deepEqual(merged.holes[1]?.greenCentroid, { lat: 35.2, lng: -92.2 });
  assert.equal(inventGreenFromClubhouse(), false);
});

test('applyPersistedGreens on 403 / empty live keeps blanks when the store is empty', () => {
  const merged = applyPersistedGreens(emptyDetail(), [], []);
  assert.equal(merged.holes[0]?.greenCentroid, null);
  assert.equal(merged.holes[0]?.teeCentroid, null);
});
