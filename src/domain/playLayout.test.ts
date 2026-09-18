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
  playChipRowIncludes,
  playShowsFatAllClubs,
  playShowsFatSayClub,
  playShowsTallSameClub,
  playUsesAddShotCamera,
  anyEarlierShotCanOpenEdit,
  playEditIsDockRow,
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
  assert.equal(layout.allClubs, 'chip');
  assert.equal(layout.sayClub, 'chip');
  assert.equal(layout.sameClub, 'short');
  assert.deepEqual(playChipRowIncludes(), ['suggested', 'all_clubs', 'say_club']);
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
  assert.match(hole, /COPY\.allClubs/);
  assert.match(hole, /COPY\.sayClub/);
  assert.match(hole, /styles\.dockChip/);
  assert.doesNotMatch(hole, /ThumbZone/);
  assert.doesNotMatch(hole, /styles\.shotList/);
  assert.doesNotMatch(hole, /styles\.clubChip/);
  assert.match(hole, /lockHoleCamera/);
  assert.match(hole, /lockFrame/);
  assert.match(hole, /frameEpoch=\{catchUpFullScreen \? 'catchup' : 'play'\}/);
  assert.match(hole, /resolveHoleTee/);
  assert.match(hole, /teePointFromHoleFeature/);
  assert.equal(playUsesAddShotCamera(), true);
});

test('All clubs and Say a club are chips in row 1; edit is tap a shot, not a dock row', () => {
  assert.equal(playDockRowCount(), 2);
  assert.deepEqual(playChipRowIncludes(), ['suggested', 'all_clubs', 'say_club']);
  assert.equal(playEditIsDockRow(), false);
  assert.equal(anyEarlierShotCanOpenEdit(), true);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const dock = hole.slice(hole.indexOf('styles.dock'), hole.indexOf('<FullSheet'));
  assert.equal((dock.match(/styles\.dockRow/g) ?? []).length, 2);
  assert.match(dock, /COPY\.allClubs/);
  assert.match(dock, /COPY\.sayClub/);
  assert.match(dock, /styles\.dockChip/);
  assert.doesNotMatch(dock, /COPY\.editShot|COPY\.changeClub|COPY\.moveFrom|COPY\.moveTo/);
  assert.match(hole, /shots\.map\(\(shot\) => \{[\s\S]*openEdit\(shot\.id\)/);
  assert.match(hole, /label=\{COPY\.changeClub\}/);
  assert.match(hole, /label=\{COPY\.moveFrom\}/);
  assert.match(hole, /label=\{COPY\.moveTo\}/);
  assert.match(hole, /toGreenDisplayFromHole/);
  assert.match(hole, /yardsToGreenPlayerLabel/);
});
