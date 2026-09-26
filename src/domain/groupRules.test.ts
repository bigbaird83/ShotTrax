import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeGroupGame, describeGroupGameShort, type GroupRulesContext } from './groupRules';

const gross: GroupRulesContext = { net: false, holeCount: 18, parCoverage: 'all', playerCount: 2, matchNames: ['You', 'Sam'] };
const net: GroupRulesContext = { ...gross, net: true };
const carry = { skinsCarry: true };
const noCarry = { skinsCarry: false };

test('every game has a description in gross and net', () => {
  for (const id of ['strokePlay', 'skins', 'stableford', 'matchPlay', 'nassau'] as const) {
    assert.ok(describeGroupGame(id, carry, gross).length > 40, id);
    assert.ok(describeGroupGame(id, carry, net).length > describeGroupGame(id, carry, gross).length, id);
    assert.doesNotMatch(describeGroupGame(id, carry, gross), /handicap/i, id);
  }
});

test('net text names how strokes are given for each game', () => {
  assert.match(describeGroupGame('strokePlay', carry, net), /lowest handicap in the group plays off scratch/);
  assert.match(describeGroupGame('strokePlay', carry, net), /net score is the same as their gross/);
  assert.match(describeGroupGame('skins', carry, net), /off the group's lowest handicap/);
  assert.match(describeGroupGame('matchPlay', carry, net), /lower handicap of the two plays off scratch/);
  assert.match(describeGroupGame('matchPlay', carry, net), /Other players' handicaps don't count/);
  assert.match(describeGroupGame('nassau', carry, net), /over all 18 holes/);
  assert.match(describeGroupGame('stableford', carry, net), /full course handicap, not strokes off the lowest/);
});

test('skins text follows carry-over', () => {
  assert.match(describeGroupGame('skins', carry, gross), /carries over/);
  assert.doesNotMatch(describeGroupGame('skins', noCarry, gross), /carries over/);
  assert.match(describeGroupGame('skins', noCarry, gross), /next hole is worth one\./);
});

test('9-hole net says strokes are halved; gross and 18 holes do not', () => {
  const nine = { ...net, holeCount: 9 };
  assert.match(describeGroupGame('strokePlay', carry, nine), /halved/);
  assert.match(describeGroupGame('skins', carry, nine), /halved/);
  assert.doesNotMatch(describeGroupGame('strokePlay', carry, net), /halved/);
  assert.doesNotMatch(describeGroupGame('strokePlay', carry, { ...gross, holeCount: 9 }), /halved/);
});

test('match text names the pair, or asks for one', () => {
  assert.match(describeGroupGame('matchPlay', carry, gross), /^You vs Sam\./);
  assert.match(
    describeGroupGame('nassau', carry, { ...gross, playerCount: 4, matchNames: null }),
    /^Pick the two players\./,
  );
});

test('one-line switch text follows the settings', () => {
  assert.equal(describeGroupGameShort('skins', carry, gross), 'Lowest score wins the hole; ties carry over.');
  assert.equal(describeGroupGameShort('skins', noCarry, gross), 'Lowest score wins the hole; ties win nothing.');
  assert.match(describeGroupGameShort('skins', carry, net), /Net, strokes off the lowest handicap\.$/);
  assert.match(describeGroupGameShort('stableford', carry, net), /full handicaps/);
  assert.equal(describeGroupGameShort('matchPlay', carry, gross), 'You vs Sam, hole by hole.');
  assert.match(describeGroupGameShort('matchPlay', carry, net), /off the lower of the two/);
  assert.equal(
    describeGroupGameShort('nassau', carry, { ...gross, playerCount: 4, matchNames: null }),
    'Front 9, back 9, and overall matches.',
  );
  for (const id of ['strokePlay', 'skins', 'stableford', 'matchPlay', 'nassau'] as const) {
    assert.ok(describeGroupGameShort(id, carry, net).length < 90, id);
  }
});

test('stroke-play text says how holes without a par are ranked', () => {
  assert.doesNotMatch(describeGroupGame('strokePlay', carry, gross), /without a par|no pars/);
  assert.match(describeGroupGame('strokePlay', carry, { ...gross, parCoverage: 'some' }), /Holes without a par don't count toward the ranking/);
  assert.match(describeGroupGame('strokePlay', carry, { ...gross, parCoverage: 'none' }), /no pars, so the leaderboard ranks by total strokes/);
  assert.match(describeGroupGame('strokePlay', carry, { ...net, parCoverage: 'none' }), /ranks by total net strokes/);
  assert.equal(describeGroupGameShort('strokePlay', carry, { ...gross, parCoverage: 'none' }), 'Lowest total leads.');
});

test('stroke placement follows the real hole count', () => {
  const twelve = { ...net, holeCount: 12 };
  for (const id of ['strokePlay', 'stableford', 'matchPlay'] as const) {
    assert.match(describeGroupGame(id, carry, twelve), /more than 12\b/, id);
    assert.doesNotMatch(describeGroupGame(id, carry, twelve), /more than 18|strokes are halved/, id);
  }
  assert.match(describeGroupGame('strokePlay', carry, { ...net, holeCount: 9 }), /more than 9\b.*strokes are halved/);
  assert.match(describeGroupGame('strokePlay', carry, net), /more than 18\b/);
});
