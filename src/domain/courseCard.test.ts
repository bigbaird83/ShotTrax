import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  courseCardMinTap,
  courseCardShowsDistance,
  courseCardShowsLastPlayed,
  courseCardShowsName,
  formatLastPlayedChip,
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

  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  assert.match(picker, /planCourseCard/);
  assert.match(picker, /card\.distance/);
  assert.match(picker, /card\.lastPlayed/);
  assert.match(picker, /thumbZoneMin/);
  assert.doesNotMatch(picker, /colors\.lime/);

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /lastPlayedAtByCourse/);
  assert.match(home, /EmptyPanel/);
  assert.match(home, /COPY\.firstRoundHint/);
});
