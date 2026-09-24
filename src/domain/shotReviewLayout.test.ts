import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HOLE_MAP_MIN_PAINT_PX } from './mapPaint';
import {
  SHOT_REVIEW_MAP_MIN_HEIGHT,
  SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT,
  shotReviewMapMeetsPaintFloor,
  shotReviewShotListWindow,
} from './shotReviewLayout';

test('shot review map floor stays paintable and the shot list caps', () => {
  assert.equal(shotReviewMapMeetsPaintFloor(), true);
  assert.ok(SHOT_REVIEW_MAP_MIN_HEIGHT >= HOLE_MAP_MIN_PAINT_PX);
  assert.ok(SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT > 0);
  assert.equal(shotReviewShotListWindow(0), 0);
  assert.equal(shotReviewShotListWindow(-8), 0);
  assert.equal(shotReviewShotListWindow(Number.NaN), 0);
  assert.equal(shotReviewShotListWindow(48), 48);
  assert.equal(shotReviewShotListWindow(SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT), SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT);
  assert.equal(shotReviewShotListWindow(640), SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT);
});

test('shot review screen flexes the map and pins the bottom section', () => {
  const page = readFileSync(new URL('../../app/review/[id]/shots.tsx', import.meta.url), 'utf8');
  const jsx = page.slice(page.indexOf('<Screen scroll={false}>'), page.indexOf('function ReviewShotList'));
  const styles = page.slice(page.indexOf('function makeStyles'));

  assert.match(page, /SHOT_REVIEW_MAP_MIN_HEIGHT/);
  assert.match(page, /SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT/);
  assert.match(page, /shotReviewShotListWindow/);
  assert.match(jsx, /<Screen scroll=\{false\}>/);
  assert.match(jsx, /testID="shot-review-map"/);
  assert.match(page, /testID="shot-review-shots"/);
  assert.match(jsx, /testID="shot-review-bottom"/);
  assert.match(jsx, /style=\{styles\.mapFill\}/);
  assert.match(jsx, /<ReviewShotList/);
  assert.ok(jsx.indexOf('styles.mapSlot') < jsx.indexOf('styles.bottom'));
  assert.ok(jsx.indexOf('<ReviewShotList') < jsx.indexOf('styles.nav'));
  assert.match(styles, /mapSlot:\s*\{[^}]*flex:\s*1/);
  assert.match(styles, /mapFill:\s*\{[^}]*flex:\s*1/);
  assert.match(styles, /height:\s*'100%'/);
  assert.match(styles, /bottom:\s*\{[^}]*flexGrow:\s*0/);
  assert.match(styles, /maxHeight:\s*SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT/);
  assert.match(styles, /minHeight:\s*SHOT_REVIEW_MAP_MIN_HEIGHT/);
  assert.doesNotMatch(page, /height:\s*236/);
  assert.doesNotMatch(page, /useLiveFix/);
  assert.match(page, /lockHoleCamera/);
  assert.match(page, /phone:\s*null/);
  assert.match(jsx, /userFix=\{null\}/);
  assert.match(jsx, /lockFrame/);
  assert.match(page, /shotPinsForHoleCamera/);
});
