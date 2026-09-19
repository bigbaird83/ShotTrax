import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import {
  formatHistoryCourse,
  formatHistoryDate,
  formatHistoryRow,
  formatHistoryScoreLabel,
  formatHistoryTees,
} from './roundHistory';

test('history row shows date, course, tees, score', () => {
  const row = formatHistoryRow({
    startedAt: '2026-09-18T16:00:00.000Z',
    courseName: 'Pebble Beach',
    teeName: 'Blue',
    score: 82,
    nowMs: Date.parse('2026-09-18T20:00:00.000Z'),
  });
  assert.equal(row.date, 'Sep 18, 2026');
  assert.equal(row.courseName, 'Pebble Beach');
  assert.equal(row.tees, 'Blue');
  assert.equal(row.score, '82');
  assert.equal(row.relative, 'Today');
  assert.equal(
    formatHistoryRow({
      startedAt: '2026-09-17T16:00:00.000Z',
      courseName: 'Pebble Beach',
      teeName: 'Blue',
      score: 82,
      nowMs: Date.parse('2026-09-18T20:00:00.000Z'),
    }).relative,
    'Yesterday',
  );
  assert.equal(
    formatHistoryRow({
      startedAt: '2026-09-14T16:00:00.000Z',
      courseName: 'Pebble Beach',
      teeName: 'Blue',
      score: 82,
      nowMs: Date.parse('2026-09-18T20:00:00.000Z'),
    }).relative,
    'Mon',
  );
  assert.equal(formatHistoryDate('2026-09-18T16:00:00.000Z'), 'Sep 18, 2026');
  assert.equal(formatHistoryCourse(null), 'Round');
  assert.equal(formatHistoryTees(null), '—');
  assert.equal(formatHistoryScoreLabel(null), '—');
  assert.equal(COPY.roundHistory, 'Round history');

  const empty = formatHistoryRow({
    startedAt: 'not-a-date',
    courseName: '  ',
    teeName: null,
    score: null,
  });
  assert.equal(empty.date, '—');
  assert.equal(empty.courseName, 'Round');
  assert.equal(empty.tees, '—');
  assert.equal(empty.score, '—');

  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(home, /formatHistoryRow/);
  assert.match(home, /row\.date/);
  assert.match(home, /row\.courseName/);
  assert.match(home, /row\.tees/);
  assert.match(home, /row\.score/);
  assert.match(home, /row\.relative/);
});
