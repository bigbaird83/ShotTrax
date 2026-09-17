import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BAG, STOCK_LONG_IRONS } from './defaultBag';

test('stock bag includes 2i, 3i, and 4i along with the rest of the irons', () => {
  const byId = new Map(DEFAULT_BAG.map((club) => [club.id, club]));
  for (const id of STOCK_LONG_IRONS) {
    assert.ok(byId.has(id), `missing ${id}`);
  }
  assert.equal(byId.get('club_2i')?.shortName, '2i');
  assert.equal(byId.get('club_3i')?.shortName, '3i');
  assert.equal(byId.get('club_4i')?.shortName, '4i');
  assert.equal(byId.get('club_2i')?.name, '2 Iron');
  assert.equal(byId.get('club_3i')?.name, '3 Iron');
  assert.equal(byId.get('club_4i')?.name, '4 Iron');
  for (const id of ['club_5i', 'club_6i', 'club_7i', 'club_8i', 'club_9i', 'club_pw', 'club_putter']) {
    assert.ok(byId.has(id), `missing ${id}`);
  }
});

test('long irons sit between hybrid and 5i in loft and bag order', () => {
  const byId = new Map(DEFAULT_BAG.map((club) => [club.id, club]));
  const hybrid = byId.get('club_4h');
  const two = byId.get('club_2i');
  const three = byId.get('club_3i');
  const four = byId.get('club_4i');
  const five = byId.get('club_5i');
  assert.ok(hybrid && two && three && four && five);
  assert.ok(hybrid.loftRank < two.loftRank);
  assert.ok(two.loftRank < three.loftRank);
  assert.ok(three.loftRank < four.loftRank);
  assert.ok(four.loftRank < five.loftRank);
  assert.ok(hybrid.sortOrder < two.sortOrder);
  assert.ok(two.sortOrder < three.sortOrder);
  assert.ok(three.sortOrder < four.sortOrder);
  assert.ok(four.sortOrder < five.sortOrder);
});
