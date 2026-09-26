import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CADDIE_MIN_SPREAD_SHOTS, caddieCarrySource, formatCaddieChip, planCaddie, type CaddieClubIn } from './caddie';
import type { HazardCarry } from './hazardCarry';

/** A club with a measured spread: finishes carry−short … carry+long, misses lateral.low … high. */
function club(
  id: string,
  carry: number | null,
  spread?: { short: number; long: number; left?: number; right?: number; count?: number },
): CaddieClubIn {
  return {
    id,
    name: id,
    carry,
    source: spread ? 'average' : 'bag',
    dispersion: spread
      ? {
          count: spread.count ?? 10,
          avgAlong: 150,
          alongRange: { low: 150 - spread.short, high: 150 + spread.long },
          lateralRange: { low: -(spread.left ?? 6), high: spread.right ?? 6 },
        }
      : null,
  };
}

const BAG = [
  club('9 Iron', 128, { short: 7, long: 6 }),
  club('8 Iron', 139, { short: 8, long: 7 }),
  club('7 Iron', 150, { short: 9, long: 8 }),
  club('6 Iron', 161, { short: 10, long: 9 }),
];
const water = (reach: number, carry: number, side: HazardCarry['side']): HazardCarry => ({ kind: 'water', side, reach, carry });
const bunker = (reach: number, carry: number, side: HazardCarry['side']): HazardCarry => ({ kind: 'bunker', side, reach, carry });

test('no hazards: the club closest to the yards left, with its spread', () => {
  const a = planCaddie({ yardsLeft: 147.4, clubs: BAG, hazards: [] });
  assert.ok(a);
  assert.equal(a.yardsLeft, 147);
  assert.equal(a.pick.clubId, '7 Iron');
  assert.deepEqual(a.pick.range, { low: 141, high: 158 });
  assert.equal(a.pick.gap, 3);
  assert.equal(a.instead, null);
  assert.equal(a.shorter?.clubId, '8 Iron');
  assert.equal(a.longer?.clubId, '6 Iron');
  assert.equal(a.reasons[0], 'From your 10 measured shots — 3 long of the middle.');
  assert.ok(a.reasons.includes('No mapped hazards in play from here.'));
  assert.equal(formatCaddieChip(a), 'Caddie · 7 Iron');
});

test('water in line where the closest club finishes: clubs to one that stays short of it', () => {
  // 7 Iron (141–158) finishes in water 144–156; 8 Iron (131–146) might reach it; 9 Iron (121–134) stays short but is 16 short.
  // 6 Iron (151–170) clears it and is 14 long of 147 → outside the swap window. 8 Iron is 8 short: safer than the 7.
  const a = planCaddie({ yardsLeft: 147, clubs: BAG, hazards: [water(144, 156, 'center')] });
  assert.ok(a);
  assert.equal(a.pick.clubId, '8 Iron');
  assert.equal(a.instead?.clubId, '7 Iron');
  assert.deepEqual(a.instead?.risks.map((r) => r.kind), ['finishes_in']);
  assert.match(a.reasons.join('\n'), /Not 7 Iron \(141–158\): Water in line from 144 to 156\./);
});

test('a safer club is only taken inside the swap window; otherwise the pick carries a warning', () => {
  const a = planCaddie({ yardsLeft: 150, clubs: [club('7 Iron', 150, { short: 9, long: 8 }), club('5 Iron', 175, { short: 9, long: 8 })], hazards: [water(145, 155, 'center')] });
  assert.ok(a);
  assert.equal(a.pick.clubId, '7 Iron');
  assert.equal(a.instead, null);
  assert.match(a.reasons.join('\n'), /Water in line from 145 to 155 — this club usually finishes there\./);
});

test('side hazards count only when your misses go that way', () => {
  const pullsLeft = [club('7 Iron', 150, { short: 9, long: 8, left: 15, right: 2 }), club('6 Iron', 160, { short: 9, long: 8, left: 15, right: 2 })];
  const right = planCaddie({ yardsLeft: 150, clubs: pullsLeft, hazards: [water(140, 158, 'right')] });
  assert.equal(right?.pick.clubId, '7 Iron');
  assert.deepEqual(right?.pick.risks, []);
  const left = planCaddie({ yardsLeft: 150, clubs: pullsLeft, hazards: [water(140, 158, 'left')] });
  assert.equal(left?.pick.risks[0]?.kind, 'might_finish_in');
});

test('water outweighs a bunker when choosing', () => {
  const a = planCaddie({
    yardsLeft: 145,
    clubs: [club('8 Iron', 139, { short: 4, long: 4 }), club('7 Iron', 150, { short: 4, long: 4 })],
    hazards: [water(147, 153, 'center'), bunker(135, 142, 'center')],
  });
  // 7 Iron (146–154) in the water; 8 Iron (135–143) in the bunker → the bunker is the lesser trouble.
  assert.equal(a?.pick.clubId, '8 Iron');
});

test('without enough measured shots: distance only, no spread claimed, and it says so', () => {
  const few = [club('7 Iron', 150, { short: 9, long: 8, count: CADDIE_MIN_SPREAD_SHOTS - 1 }), club('8 Iron', 139)];
  const a = planCaddie({ yardsLeft: 149, clubs: few, hazards: [] });
  assert.ok(a);
  assert.equal(a.pick.range, null);
  assert.match(a.reasons[0], /^From your average — /);
  assert.match(a.reasons.join('\n'), /Fewer than 5 measured shots with 7 Iron, so no spread yet\./);
  assert.match(planCaddie({ yardsLeft: 139, clubs: few, hazards: [] })!.reasons[0], /^From your bag number — /);
});

test('nothing invented: no yards left or no club with a distance → no advice', () => {
  assert.equal(planCaddie({ yardsLeft: null, clubs: BAG, hazards: [] }), null);
  assert.equal(planCaddie({ yardsLeft: 0, clubs: BAG, hazards: [] }), null);
  assert.equal(planCaddie({ yardsLeft: 150, clubs: [club('Driver', null)], hazards: [] }), null);
});

test('carry source words follow the bag row', () => {
  assert.equal(caddieCarrySource('live'), 'average');
  assert.equal(caddieCarrySource('typed'), 'bag');
  assert.equal(caddieCarrySource('estimated'), 'estimate');
  assert.equal(caddieCarrySource('seed'), 'stock');
  assert.equal(caddieCarrySource(null), 'stock');
  const stock = planCaddie({ yardsLeft: 150, clubs: [{ id: '7i', name: '7 Iron', carry: 150, source: 'stock', dispersion: null }], hazards: [] });
  assert.match(stock!.reasons[0], /^From a typical distance for this club — /);
});

test('hole screen: same yards as the wheel, live hazards only, off for past rounds, history read once', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const block = hole.slice(hole.indexOf('const caddie ='), hole.indexOf('const stripItems = stripPlan.ids'));
  assert.match(block, /readOnly \|\| marksOnly\n      \? null/);
  assert.match(block, /yardsLeft: target\?\.dYards \?\? null/);
  assert.match(block, /carry: stripPlan\.carries\[row\.club\.id\] \?\? null/);
  assert.match(block, /hazards: hazardCarries/);
  assert.match(block, /!isPutterClubId\(row\.club\.id\)/);
  assert.match(hole, /const dispersionShots = useMemo\(\(\) => listDispersionShots\(db\), \[db, round\?\.id\]\)/);
  assert.match(hole, /testID="caddie-chip"/);
  assert.match(hole, /testID="caddie-sheet"/);
});
