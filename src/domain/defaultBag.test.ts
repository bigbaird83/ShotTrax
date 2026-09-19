import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clubCountsTowardDistanceSamples,
  DEFAULT_BAG,
  isLegacyStockCarry,
  isPutterClubId,
  LEGACY_STOCK_CARRY_YARDS,
  PUTTER_CLUB_ID,
  STOCK_LONG_IRONS,
  STOCK_WEDGES,
  STOCK_AVG_CARRY,
  stockAvgCarryForSuggestion,
  typicalCarryForClub,
  typicalCarrySeedForClub,
  parseTypicalCarryYards,
  MAX_TYPICAL_CARRY_YARDS,
} from './defaultBag';

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

test('default bag wedges are PW, 48°, 50°, GW, 56°, 60° — 48/50 are not putters', () => {
  const byId = new Map(DEFAULT_BAG.map((club) => [club.id, club]));
  assert.equal(byId.get('club_pw')?.shortName, 'PW');
  assert.equal(byId.get('club_pw')?.name, 'Pitching Wedge');
  assert.deepEqual(
    STOCK_WEDGES.map((id) => byId.get(id)?.shortName),
    ['48°', '50°', 'GW', '56°', '60°'],
  );
  assert.deepEqual(
    STOCK_WEDGES.map((id) => byId.get(id)?.name),
    ['48°', '50°', 'Gap Wedge', '56°', '60°'],
  );
  const pw = byId.get('club_pw');
  const w48 = byId.get('club_48');
  const w50 = byId.get('club_50');
  const gw = byId.get('club_gw');
  const w56 = byId.get('club_sw');
  const w60 = byId.get('club_lw');
  const putter = byId.get('club_putter');
  assert.ok(pw && w48 && w50 && gw && w56 && w60 && putter);
  assert.ok(pw.loftRank < w48.loftRank);
  assert.ok(w48.loftRank < w50.loftRank);
  assert.ok(w50.loftRank < gw.loftRank);
  assert.ok(gw.loftRank < w56.loftRank);
  assert.ok(w56.loftRank < w60.loftRank);
  assert.ok(w60.loftRank < putter.loftRank);
  assert.equal(isPutterClubId('club_48'), false);
  assert.equal(isPutterClubId('club_50'), false);
  assert.equal(DEFAULT_BAG.filter((club) => club.shortName === 'SW').length, 0);
  assert.equal(DEFAULT_BAG.filter((club) => club.shortName === '52°').length, 0);
});

test('putter stays in the bag but has no typical-carry seed and is not a distance sample', () => {
  const putter = DEFAULT_BAG.find((club) => club.id === PUTTER_CLUB_ID);
  assert.ok(putter);
  assert.equal(putter?.name, 'Putter');
  assert.equal(putter?.shortName, 'Pt');
  assert.equal(putter?.typicalCarryYards, null);
  assert.equal(typicalCarryForClub(PUTTER_CLUB_ID), null);
  assert.equal(isPutterClubId(PUTTER_CLUB_ID), true);
  assert.equal(isPutterClubId('club_7i'), false);
  assert.equal(isPutterClubId(null), false);
  assert.equal(clubCountsTowardDistanceSamples(PUTTER_CLUB_ID), false);
  assert.equal(clubCountsTowardDistanceSamples('club_7i'), true);
  assert.equal(clubCountsTowardDistanceSamples(null), false);
});

test('stock bag has no fake typical-carry seed — skip means empty until live shots', () => {
  for (const club of DEFAULT_BAG) {
    assert.equal(club.typicalCarryYards, null, club.id);
    assert.equal(typicalCarryForClub(club.id), null);
  }
  assert.equal(typicalCarryForClub('club_custom'), null);
  assert.equal(isLegacyStockCarry('club_7i', 150), true);
  assert.equal(isLegacyStockCarry('club_7i', 155), false);
  assert.equal(isLegacyStockCarry('club_7i', null), false);
  assert.equal(LEGACY_STOCK_CARRY_YARDS.club_gw, 105);
});

test('parseTypicalCarryYards accepts yards or clear, never invents GPS', () => {
  assert.equal(parseTypicalCarryYards(''), null);
  assert.equal(parseTypicalCarryYards('   '), null);
  assert.equal(parseTypicalCarryYards(null), null);
  assert.equal(parseTypicalCarryYards('150'), 150);
  assert.equal(parseTypicalCarryYards(' 145.4 '), 145);
  assert.equal(parseTypicalCarryYards('0'), null);
  assert.equal(parseTypicalCarryYards('-10'), null);
  assert.equal(parseTypicalCarryYards('nope'), null);
  assert.equal(parseTypicalCarryYards(String(MAX_TYPICAL_CARRY_YARDS + 1)), null);
  assert.equal(parseTypicalCarryYards(String(MAX_TYPICAL_CARRY_YARDS)), MAX_TYPICAL_CARRY_YARDS);
});

test('typicalCarrySeedForClub uses the typed bag seed and never a putter carry', () => {
  assert.equal(
    typicalCarrySeedForClub({ id: 'club_7i', typicalCarryYards: 145 }),
    145,
  );
  assert.equal(typicalCarrySeedForClub({ id: 'club_7i', typicalCarryYards: null }), null);
  assert.equal(
    typicalCarrySeedForClub({ id: PUTTER_CLUB_ID, typicalCarryYards: 8 }),
    null,
  );
});

test('STOCK_AVG_CARRY seeds Suggested only — never the putter, never written into the bag', () => {
  assert.equal(STOCK_AVG_CARRY.club_7i, 150);
  assert.equal(STOCK_AVG_CARRY.club_driver, 230);
  assert.equal(stockAvgCarryForSuggestion('club_7i'), 150);
  assert.equal(stockAvgCarryForSuggestion(PUTTER_CLUB_ID), null);
  assert.equal(stockAvgCarryForSuggestion('club_custom'), null);
  assert.equal('club_putter' in STOCK_AVG_CARRY, false);
  for (const club of DEFAULT_BAG) {
    assert.equal(club.typicalCarryYards, null, club.id);
  }
});
