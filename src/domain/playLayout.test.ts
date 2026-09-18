import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  PLAY_DOCK_ACTIONS,
  PLAY_MAP_MIN_RATIO,
  planPlayLayout,
  playDockRowCount,
  playEmptyMiddle,
  playHeaderEatsMap,
  playMapMinRatio,
  playShowsFatAllClubs,
  playShowsFatSayClub,
  playShowsTallSameClub,
} from './playLayout';

test('play map fills at least 60% down to a two-row dock; header is overlay', () => {
  const layout = planPlayLayout();
  assert.equal(layout.map, 'fill');
  assert.equal(layout.mapMinRatio, 0.6);
  assert.equal(playMapMinRatio(), PLAY_MAP_MIN_RATIO);
  assert.ok(playMapMinRatio() >= 0.6);
  assert.equal(layout.header, 'overlay');
  assert.deepEqual(layout.headerItems, ['menu', 'hole', 'to-green', 'shots']);
  assert.deepEqual(layout.dockRows, ['chips', 'actions']);
  assert.equal(playDockRowCount(), 2);
  assert.deepEqual(layout.dockActions, PLAY_DOCK_ACTIONS);
  assert.deepEqual([...layout.dockActions], ['same_club', 'add_shot', 'scorecard', 'prev', 'next']);
  assert.equal(layout.emptyMiddle, false);
  assert.equal(playEmptyMiddle(), false);
  assert.equal(playHeaderEatsMap(), false);
  assert.equal(layout.shotLine, 'header');
  assert.equal(layout.insertPlus, 'header');
});

test('dock is not fat All clubs, Say a club, or a tall Same club', () => {
  const layout = planPlayLayout();
  assert.equal(layout.allClubs, 'once');
  assert.equal(layout.sayClub, 'not_dock');
  assert.equal(layout.sameClub, 'short');
  assert.equal(playShowsFatAllClubs(), false);
  assert.equal(playShowsFatSayClub(), false);
  assert.equal(playShowsTallSameClub(), false);
  assert.ok(!layout.dockActions.includes('all_clubs' as (typeof layout.dockActions)[number]));
  assert.ok(!layout.dockActions.includes('say_club' as (typeof layout.dockActions)[number]));
});

test('play hole screen uses the fill layout and does not keep the empty middle', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /planPlayLayout/);
  assert.match(hole, /styles\.mapFill/);
  assert.match(hole, /styles\.dock/);
  assert.match(hole, /styles\.shotLine/);
  assert.doesNotMatch(hole, /ThumbZone/);
  assert.doesNotMatch(hole, /styles\.shotList/);
  assert.doesNotMatch(hole, /styles\.clubChip/);
});
