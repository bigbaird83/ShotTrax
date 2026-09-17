import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillEstimatedCarries, MIN_TYPED_CLUBS_FOR_FILL } from './carryFill';
import { DEFAULT_BAG, PUTTER_CLUB_ID } from './defaultBag';

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

test('interpolation only between typed clubs in loft order', () => {
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
  assert.equal(filled.get('club_pw')?.source, 'typed');
  assert.equal(filled.get('club_3w')?.source, 'estimated');
  assert.equal(filled.get('club_3w')?.yards, Math.round(230 + ((140 - 230) * 1) / 9));
  assert.equal(filled.get('club_8i')?.source, 'estimated');
  assert.equal(filled.get('club_8i')?.yards, Math.round(140 + ((110 - 140) * 1) / 3));
});

test('typed number always wins over the interpolated value', () => {
  const filled = fillEstimatedCarries([
    club('club_5i', 7, 170),
    club('club_6i', 8, 155),
    club('club_7i', 9, 140),
    club('club_8i', 10, null),
  ]);
  assert.equal(filled.get('club_6i')?.source, 'typed');
  assert.equal(filled.get('club_6i')?.yards, 155);
  assert.notEqual(filled.get('club_6i')?.yards, Math.round((170 + 140) / 2));
});

test('outside the typed span stays blank', () => {
  const filled = fillEstimatedCarries([
    club('club_driver', 0, null),
    club('club_5i', 7, 170),
    club('club_7i', 9, 150),
    club('club_pw', 12, 120),
    club('club_48', 13, null),
    club('club_50', 14, null),
    club('club_gw', 15, null),
  ]);
  assert.equal(filled.get('club_driver')?.yards ?? null, null);
  assert.equal(filled.get('club_48')?.yards ?? null, null);
  assert.equal(filled.get('club_50')?.yards ?? null, null);
  assert.equal(filled.get('club_gw')?.yards ?? null, null);
  assert.equal(filled.get('club_5i')?.source, 'typed');
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
