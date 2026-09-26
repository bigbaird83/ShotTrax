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
  HISTORY_SWIPE_DELETE_PX,
  HISTORY_SWIPE_REVEAL_PX,
  historySwipeRefusesTermination,
  historySwipeRestOffset,
  historySwipeSnap,
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

test('an active row swipe keeps the touch and a cancelled swipe springs to a full rest', () => {
  assert.equal(historySwipeRefusesTermination(), true);

  // Terminate springs to this rest. It is fully open or fully closed, never the delete sliver.
  assert.equal(
    historySwipeRestOffset(historySwipeSnap({ dx: -20, dy: 2, open: false }) === 'open'),
    -HISTORY_SWIPE_REVEAL_PX,
  );
  assert.equal(
    historySwipeRestOffset(historySwipeSnap({ dx: -8, dy: 1, open: false }) === 'open'),
    0,
  );
  assert.notEqual(historySwipeRestOffset(true), -HISTORY_SWIPE_DELETE_PX);

  const swipe = readFileSync(new URL('../ui/HistorySwipeRow.tsx', import.meta.url), 'utf8');
  assert.match(swipe, /onPanResponderTerminationRequest:\s*\(\)\s*=>\s*false/);

  const terminateAt = swipe.indexOf('onPanResponderTerminate:');
  assert.ok(terminateAt > swipe.indexOf('onPanResponderRelease:'));
  const terminate = swipe.slice(terminateAt, swipe.indexOf('}),', terminateAt));
  assert.match(terminate, /historySwipeSnap\(/);
  assert.match(terminate, /Animated\.spring\(x,\s*\{/);
  assert.match(terminate, /toValue:\s*historySwipeRestOffset\(snap === 'open'\)/);
  assert.match(terminate, /useNativeDriver:\s*true/);
  assert.match(terminate, /bounciness:\s*0/);
  assert.match(terminate, /speed:\s*20/);
  assert.match(terminate, /\.start\(\)/);

  const tabs = readFileSync(new URL('../ui/TabSwipe.tsx', import.meta.url), 'utf8');
  assert.match(tabs, /onMoveShouldSetPanResponder:\s*\(_e,\s*g\)\s*=>\s*tabSwipeClaims\(g\)/);
  assert.doesNotMatch(tabs, /onPanResponderTerminationRequest/);
});
