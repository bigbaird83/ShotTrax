import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillEstimatedCarries, MIN_TYPED_CLUBS_FOR_FILL, scaleAtLoft } from './carryFill';
import { DEFAULT_BAG, PUTTER_CLUB_ID, STOCK_AVG_CARRY, stockAvgCarryForSuggestion } from './defaultBag';

function club(id: string, loftRank: number, yards: number | null) {
  return { id, loftRank, typicalCarryYards: yards };
}

test('MIN_TYPED_CLUBS_FOR_FILL is 3', () => {
  assert.equal(MIN_TYPED_CLUBS_FOR_FILL, 3);
});

test('skip / enter nothing means no fake average and no estimated fill', () => {
  const empty = DEFAULT_BAG.map((row) => ({
    id: row.id,
    loftRank: row.loftRank,
    typicalCarryYards: null,
  }));
  const filled = fillEstimatedCarries(empty);
  for (const row of empty) {
    assert.equal(filled.get(row.id)?.yards ?? null, null, row.id);
    assert.equal(filled.get(row.id)?.source ?? null, null, row.id);
  }
  const two = fillEstimatedCarries([
    club('club_driver', 0, 230),
    club('club_7i', 9, 150),
    club('club_pw', 12, null),
  ]);
  assert.equal(two.get('club_3w')?.yards ?? null, null);
  assert.equal(two.get('club_pw')?.yards ?? null, null);
  assert.equal(two.get('club_driver')?.source, 'typed');
});

test('3 typed anchors scale the whole bag off STOCK — not neighbor-yard interpolation', () => {
  const filled = fillEstimatedCarries([
    club('club_driver', 0, 230),
    club('club_3w', 1, null),
    club('club_7i', 9, 140),
    club('club_8i', 10, null),
    club('club_pw', 12, 110),
    club('club_48', 13, null),
    club('club_gw', 15, null),
  ]);
  assert.equal(filled.get('club_driver')?.source, 'typed');
  assert.equal(filled.get('club_driver')?.yards, 230);
  assert.equal(filled.get('club_7i')?.source, 'typed');
  assert.equal(filled.get('club_7i')?.yards, 140);
  assert.equal(filled.get('club_pw')?.source, 'typed');
  assert.equal(filled.get('club_pw')?.yards, 110);

  const anchors = [
    { loft: 0, scale: 230 / STOCK_AVG_CARRY.club_driver },
    { loft: 9, scale: 140 / STOCK_AVG_CARRY.club_7i },
    { loft: 12, scale: 110 / STOCK_AVG_CARRY.club_pw },
  ];
  const wood = filled.get('club_3w');
  assert.equal(wood?.source, 'estimated');
  assert.equal(
    wood?.yards,
    Math.round(STOCK_AVG_CARRY.club_3w * (scaleAtLoft(1, anchors) ?? 0)),
  );
  const neighborInterp = Math.round(230 + ((140 - 230) * 1) / 2);
  assert.notEqual(wood?.yards, neighborInterp);

  assert.equal(filled.get('club_8i')?.source, 'estimated');
  assert.equal(filled.get('club_48')?.source, 'estimated');
  assert.equal(filled.get('club_gw')?.source, 'estimated');
  assert.ok((filled.get('club_48')?.yards ?? 0) > 0);
  assert.ok((filled.get('club_gw')?.yards ?? 0) > 0);
});

test('any three typed clubs seed the whole bag off STOCK — no required trio', () => {
  const filled = fillEstimatedCarries([
    club('club_5w', 2, 190),
    club('club_9i', 11, 125),
    club('club_sw', 16, 88),
    club('club_driver', 0, null),
    club('club_7i', 9, null),
    club('club_pw', 12, null),
    club(PUTTER_CLUB_ID, 18, 8),
  ]);
  assert.equal(filled.get('club_5w')?.source, 'typed');
  assert.equal(filled.get('club_9i')?.source, 'typed');
  assert.equal(filled.get('club_sw')?.source, 'typed');
  assert.equal(filled.get('club_driver')?.source, 'estimated');
  assert.equal(filled.get('club_7i')?.source, 'estimated');
  assert.equal(filled.get('club_pw')?.source, 'estimated');
  assert.ok((filled.get('club_driver')?.yards ?? 0) > 0);
  assert.ok((filled.get('club_7i')?.yards ?? 0) > 0);
  assert.equal(filled.get(PUTTER_CLUB_ID)?.source ?? null, null);
});

test('typed number always wins over the scaled stock value', () => {
  const filled = fillEstimatedCarries([
    club('club_5i', 7, 170),
    club('club_6i', 8, 162),
    club('club_7i', 9, 140),
    club('club_8i', 10, null),
  ]);
  assert.equal(filled.get('club_6i')?.source, 'typed');
  assert.equal(filled.get('club_6i')?.yards, 162);
  assert.notEqual(filled.get('club_6i')?.yards, stockAvgCarryForSuggestion('club_6i'));
});

test('short and long of the typed span are estimated from STOCK scale', () => {
  const filled = fillEstimatedCarries([
    club('club_driver', 0, null),
    club('club_5i', 7, 170),
    club('club_7i', 9, 150),
    club('club_pw', 12, 120),
    club('club_48', 13, null),
    club('club_50', 14, null),
    club('club_gw', 15, null),
  ]);
  assert.equal(filled.get('club_5i')?.source, 'typed');
  assert.equal(filled.get('club_driver')?.source, 'estimated');
  assert.ok((filled.get('club_driver')?.yards ?? 0) > 0);
  assert.equal(filled.get('club_48')?.source, 'estimated');
  assert.equal(filled.get('club_50')?.source, 'estimated');
  assert.equal(filled.get('club_gw')?.source, 'estimated');
  assert.ok((filled.get('club_48')?.yards ?? 0) > 0);
  assert.ok((filled.get('club_gw')?.yards ?? 0) > 0);
});

test('putter is never filled, even with a typed number on it', () => {
  const filled = fillEstimatedCarries([
    club('club_7i', 9, 150),
    club('club_pw', 12, 120),
    club('club_lw', 17, 70),
    club(PUTTER_CLUB_ID, 18, 8),
  ]);
  assert.equal(filled.get(PUTTER_CLUB_ID)?.yards ?? null, null);
  assert.equal(filled.get(PUTTER_CLUB_ID)?.source ?? null, null);
});
