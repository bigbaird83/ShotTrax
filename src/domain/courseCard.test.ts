import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  courseCardMinTap,
  courseCardShowsDistance,
  courseCardShowsLastPlayed,
  courseCardShowsName,
  formatLastPlayedChip,
  formatPaintSourceChip,
  lastPlayedAtForCourse,
  planCourseCard,
} from './courseCard';

test('home course cards show name, distance, and last-played', () => {
  assert.equal(courseCardShowsName(), true);
  assert.equal(courseCardShowsDistance(), true);
  assert.equal(courseCardShowsLastPlayed(), true);
  assert.equal(courseCardMinTap(), 72);

  const last = lastPlayedAtForCourse(
    [
      { courseApiId: 'pebble', courseName: 'Pebble Beach', startedAt: '2026-09-17T16:00:00.000Z' },
      { courseApiId: 'other', courseName: 'Spyglass', startedAt: '2026-09-18T16:00:00.000Z' },
    ],
    { id: 'pebble', name: 'Pebble Beach' },
  );
  assert.equal(last, '2026-09-17T16:00:00.000Z');
  assert.equal(formatLastPlayedChip(last, Date.parse('2026-09-18T20:00:00.000Z')), 'Played · Yesterday');

  const card = planCourseCard({
    name: 'Pebble Beach',
    distanceMeters: 13_000,
    unit: 'mi',
    lastPlayedAt: '2026-09-18T16:00:00.000Z',
    nowMs: Date.parse('2026-09-18T20:00:00.000Z'),
  });
  assert.equal(card.name, 'Pebble Beach');
  assert.equal(card.distance, '8.1 mi');
  assert.equal(card.lastPlayed, 'Played · Today');
  assert.equal(card.paintSource, null);

  assert.equal(formatPaintSourceChip({ ok: false, source: null, fromCache: false }), 'miss');
  assert.equal(formatPaintSourceChip({ ok: true, source: 'osm', fromCache: true }), 'cache');
  assert.equal(formatPaintSourceChip({ ok: true, source: 'golfapi', fromCache: true }), 'cache');
  assert.equal(formatPaintSourceChip({ ok: true, source: 'gca', fromCache: true }), 'cache');
  assert.equal(formatPaintSourceChip({ ok: true, source: 'osm', fromCache: false }), 'OSM');
  assert.equal(formatPaintSourceChip({ ok: true, source: 'manual_verified', fromCache: false }), 'OSM');
  assert.equal(formatPaintSourceChip({ ok: true, source: 'gca', fromCache: false }), 'GCA');
  assert.equal(formatPaintSourceChip({ ok: true, source: 'golfapi', fromCache: false }), 'golfapi');
  assert.equal(formatPaintSourceChip(null), null);
  assert.equal(
    planCourseCard({
      name: 'Cache Hit',
      paintResult: { ok: true, source: 'osm', fromCache: true },
    }).paintSource,
    'cache',
  );
  assert.equal(
    planCourseCard({
      name: 'OSM',
      paintResult: { ok: true, source: 'manual_verified', fromCache: false },
    }).paintSource,
    'OSM',
  );

  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  assert.match(picker, /planCourseCard/);
  assert.match(picker, /card\.distance/);
  assert.match(picker, /card\.lastPlayed/);
  assert.match(picker, /card\.paintSource/);
  assert.match(picker, /testID="paint-source-chip"/);
  assert.match(picker, /thumbZoneMin/);
  assert.doesNotMatch(picker, /colors\.lime/);
  assert.doesNotMatch(picker, /resolveCoursePaint/);

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /lastPlayedAtByCourse/);
  assert.match(home, /formatPaintSourceChip/);
  assert.match(home, /testID="paint-source-chip"/);
  assert.match(home, /EmptyPanel/);
  assert.match(home, /COPY\.firstRoundHint/);
});
