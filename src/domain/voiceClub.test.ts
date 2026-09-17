import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_BAG } from './defaultBag';
import type { Club } from './types';
import { matchSpokenClub, normalizeUtterance } from './voiceClub';

function bag(): Club[] {
  return DEFAULT_BAG.map((c) => ({ ...c, enabled: true }));
}

function idFor(transcript: string): string | null {
  return matchSpokenClub(transcript, bag())?.id ?? null;
}

test('normalize expands number words and strips punctuation', () => {
  assert.equal(normalizeUtterance('Seven-iron!'), '7 iron');
  assert.equal(normalizeUtterance('  the  7i '), 'the 7i');
});

test('seven iron and nicknames map to 7 Iron', () => {
  assert.equal(idFor('seven iron'), 'club_7i');
  assert.equal(idFor('7 iron'), 'club_7i');
  assert.equal(idFor('7i'), 'club_7i');
  assert.equal(idFor('please hit the seven iron'), 'club_7i');
});

test('driver nicknames', () => {
  assert.equal(idFor('driver'), 'club_driver');
  assert.equal(idFor('big dog'), 'club_driver');
});

test('woods, hybrid, wedges, putter', () => {
  assert.equal(idFor('three wood'), 'club_3w');
  assert.equal(idFor('5w'), 'club_5w');
  assert.equal(idFor('4 hybrid'), 'club_4h');
  assert.equal(idFor('pitching wedge'), 'club_pw');
  assert.equal(idFor('pw'), 'club_pw');
  assert.equal(idFor('sand wedge'), 'club_sw');
  assert.equal(idFor('56'), 'club_sw');
  assert.equal(idFor('56 degree'), 'club_sw');
  assert.equal(idFor('fifty six'), 'club_sw');
  assert.equal(idFor('lob'), 'club_lw');
  assert.equal(idFor('60'), 'club_lw');
  assert.equal(idFor('60 degree'), 'club_lw');
  assert.equal(idFor('52'), 'club_gw');
  assert.equal(idFor('52°'), 'club_gw');
  assert.equal(idFor('52 degree'), 'club_gw');
  assert.equal(idFor('fifty two'), 'club_gw');
  assert.equal(idFor('gap wedge'), 'club_gw');
  assert.equal(idFor('gw'), 'club_gw');
  assert.equal(idFor('48'), 'club_48');
  assert.equal(idFor('48 degree'), 'club_48');
  assert.equal(idFor('50'), 'club_50');
  assert.equal(idFor('50 degree'), 'club_50');
  assert.equal(idFor('putter'), 'club_putter');
  assert.equal(idFor('flat stick'), 'club_putter');
});

test('five iron is 5i, not 5 wood', () => {
  assert.equal(idFor('five iron'), 'club_5i');
  assert.equal(idFor('five wood'), 'club_5w');
});

test('ambiguous five / generic iron does not guess', () => {
  assert.equal(idFor('five'), null);
  assert.equal(idFor('iron'), null);
  assert.equal(idFor(''), null);
  assert.equal(idFor('   '), null);
});

test('disabled clubs are not matched', () => {
  const clubs = bag().map((c) => (c.id === 'club_7i' ? { ...c, enabled: false } : c));
  assert.equal(matchSpokenClub('seven iron', clubs), null);
});

test('two / three / four iron map to stock 2i, 3i, 4i', () => {
  assert.equal(idFor('2 iron'), 'club_2i');
  assert.equal(idFor('two iron'), 'club_2i');
  assert.equal(idFor('2 i'), 'club_2i');
  assert.equal(idFor('2i'), 'club_2i');
  assert.equal(idFor('3i'), 'club_3i');
  assert.equal(idFor('3 i'), 'club_3i');
  assert.equal(idFor('three iron'), 'club_3i');
  assert.equal(idFor('four iron'), 'club_4i');
  assert.equal(idFor('4i'), 'club_4i');
  assert.equal(idFor('4 i'), 'club_4i');
});

test('custom bag club matches on name without a seeded nickname', () => {
  const clubs: Club[] = [
    ...bag(),
    {
      id: 'club_1i',
      name: '1 Iron',
      shortName: '1i',
      loftRank: 3.5,
      sortOrder: 3,
      enabled: true,
      typicalCarryYards: null,
    },
  ];
  assert.equal(matchSpokenClub('1 iron', clubs)?.id, 'club_1i');
  assert.equal(matchSpokenClub('one iron', clubs)?.id, 'club_1i');
});
