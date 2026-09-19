import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  formatTrailYardChip,
  planShotTrail,
  shotTrailDash,
  shotTrailIsDashed,
  shotTrailShowsStackedLabels,
  shotTrailShowsYardChip,
  shotTrailUsesLime,
  trailChipUsesCardYards,
  trailChipUsesLoggedYards,
  trailChipUsesToGreenYards,
  trailShowsQualityBadge,
  trailTintForClub,
} from './shotTrail';

test('shot trails are dashed, club-tinted, and carry a yard chip', () => {
  assert.equal(shotTrailIsDashed(), true);
  assert.equal(shotTrailUsesLime(), false);
  assert.equal(shotTrailShowsStackedLabels(), false);
  assert.equal(shotTrailShowsYardChip(), true);
  assert.equal(trailChipUsesLoggedYards(), true);
  assert.equal(trailChipUsesCardYards(), false);
  assert.equal(trailChipUsesToGreenYards(), false);
  assert.equal(trailShowsQualityBadge('soft'), true);
  assert.equal(trailShowsQualityBadge('forced'), true);
  assert.equal(trailShowsQualityBadge('good'), false);
  assert.deepEqual([...shotTrailDash()], [8, 6]);
  assert.equal(formatTrailYardChip(162), '162 yd');
  assert.equal(formatTrailYardChip(null), null);
  assert.doesNotMatch(trailTintForClub('club_7i'), /#C8F542|#E6FF00/i);

  const trail = planShotTrail({
    start: { lat: 37, lng: -122 },
    end: { lat: 37.01, lng: -122 },
    clubId: 'club_7i',
    distanceYards: 162.4,
    fixQuality: 'soft',
    last: true,
  });
  assert.ok(trail);
  assert.equal(trail?.chip, '162 yd');
  assert.notEqual(trail?.chip, '371 yd');
  assert.notEqual(formatTrailYardChip(162), '371 yd');
  assert.equal(trail?.showQualityBadge, true);
  assert.deepEqual([...trail!.dash], [8, 6]);
  assert.ok(trail && Math.abs(trail.mid.lat - 37.005) < 1e-9);
  assert.doesNotMatch(trail!.tint, /lime|#C8F542/i);

  const forced = planShotTrail({
    start: { lat: 37, lng: -122 },
    end: { lat: 37.01, lng: -122 },
    clubId: 'club_7i',
    distanceYards: 162,
    fixQuality: 'forced',
  });
  assert.equal(forced?.chip, '162 yd');
  assert.notEqual(forced?.chip, '371 yd');
  assert.equal(forced?.showQualityBadge, true);

  const good = planShotTrail({
    start: { lat: 37, lng: -122 },
    end: { lat: 37.01, lng: -122 },
    distanceYards: 162,
    fixQuality: 'good',
  });
  assert.equal(good?.chip, '162 yd');
  assert.equal(good?.showQualityBadge, false);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /planShotTrail/);
  assert.match(map, /distanceYards: shot\.distanceYards/);
  assert.match(map, /QualityBadge/);
  assert.match(map, /fixQuality: shot\.fixQuality/);
  const trailBlock = map.slice(map.indexOf('{closed.map((shot, index)'), map.indexOf('{shots.filter(hasGpsStart)'));
  assert.doesNotMatch(trailBlock, /playHeaderYards|hole\.yards|yardsToGreen/);
  assert.match(trailBlock, /distanceYards: shot\.distanceYards/);
  assert.match(map, /lineDashPattern/);
  assert.match(map, /styles\.lineChip/);
  const badge = readFileSync(new URL('../ui/Badge.tsx', import.meta.url), 'utf8');
  assert.match(badge, /quality === 'soft' \|\| quality === 'forced'/);
  assert.doesNotMatch(map, /strokeColor=\{index === closed.length - 1 \? colors\.lime/);
  assert.doesNotMatch(
    map.slice(map.indexOf('{closed.map((shot, index)'), map.indexOf('{shots.filter(hasGpsStart)')),
    /colors\.lime/,
  );
});
