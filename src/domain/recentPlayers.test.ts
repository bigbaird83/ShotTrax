import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  RECENT_PARTNER_LIMIT,
  RECENT_PLAYERS_CAP,
  recentPlayerNameKey,
  recentPlayersToOffer,
  type RecentPlayer,
} from './recentPlayers';

function row(partial: Partial<RecentPlayer> & Pick<RecentPlayer, 'id' | 'name' | 'lastUsedAt'>): RecentPlayer {
  return {
    nameKey: recentPlayerNameKey(partial.name) ?? partial.name.toLowerCase(),
    handicap: null,
    ...partial,
  };
}

test('name keys match after trim and case fold', () => {
  assert.equal(recentPlayerNameKey('bob'), 'bob');
  assert.equal(recentPlayerNameKey('Bob '), 'bob');
  assert.equal(recentPlayerNameKey('BOB'), 'bob');
  assert.equal(recentPlayerNameKey('  Bob   Smith '), 'bob smith');
  assert.equal(recentPlayerNameKey('   '), null);
});

test('offer is newest first, skips anyone already in the round, and keeps a blank handicap blank', () => {
  const offered = recentPlayersToOffer({
    partnerCount: 1,
    inRoundNames: [' You ', 'sam'],
    recent: [
      row({ id: 'old', name: 'Ann', lastUsedAt: '2026-01-01T00:00:00.000Z', handicap: null }),
      row({ id: 'sam', name: 'Sam', lastUsedAt: '2026-04-01T00:00:00.000Z', handicap: 12 }),
      row({ id: 'mid', name: 'Cy', lastUsedAt: '2026-02-01T00:00:00.000Z', handicap: 0 }),
      row({ id: 'new', name: 'Bo', lastUsedAt: '2026-03-01T00:00:00.000Z', handicap: 4 }),
      row({ id: 'you', name: 'You', lastUsedAt: '2026-05-01T00:00:00.000Z', handicap: 9 }),
    ],
  });
  assert.deepEqual(
    offered.map((player) => [player.name, player.handicap]),
    [
      ['Bo', 4],
      ['Cy', 0],
      ['Ann', null],
    ],
  );
  assert.equal(offered.find((player) => player.name === 'Ann')?.handicap, null);
});

test('sixteen saved partners offer only the fifteen newest', () => {
  const recent = Array.from({ length: RECENT_PLAYERS_CAP + 1 }, (_, index) =>
    row({
      id: `p${String(index).padStart(2, '0')}`,
      name: `P${index}`,
      lastUsedAt: `2026-06-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    }),
  );
  const offered = recentPlayersToOffer({ recent, inRoundNames: [], partnerCount: 0 });
  assert.equal(offered.length, RECENT_PLAYERS_CAP);
  assert.equal(offered[0]?.name, 'P15');
  assert.equal(offered.at(-1)?.name, 'P1');
  assert.equal(
    offered.some((player) => player.name === 'P0'),
    false,
  );
});

test('three partners already in the group hides the recent list', () => {
  const recent = [row({ id: 'ann', name: 'Ann', lastUsedAt: '2026-01-01T00:00:00.000Z', handicap: 7 })];
  assert.equal(RECENT_PARTNER_LIMIT, 3);
  assert.deepEqual(recentPlayersToOffer({ recent, inRoundNames: [], partnerCount: 2 }).map((p) => p.name), ['Ann']);
  assert.deepEqual(recentPlayersToOffer({ recent, inRoundNames: [], partnerCount: 3 }), []);
});

test('the Group screen adds a recent partner in one tap and removes them from the recent list only', () => {
  const screen = readFileSync(new URL('../../app/round/[id]/group.tsx', import.meta.url), 'utf8');
  assert.match(screen, /recentPartnersForRound/);
  assert.match(screen, /name: 'Remove from recent'/);
  assert.match(screen, /onLongPress=\{\(\) => confirmRemoveRecent\(player\)\}/);
  assert.match(screen, /handicap: player\.handicap/);
  assert.doesNotMatch(screen, /handicap \?\? 0/);
  assert.doesNotMatch(screen, /player\.handicap \?\? 0/);
  const confirm = screen.slice(screen.indexOf('const confirmRemoveRecent'), screen.indexOf('const beginEdit'));
  assert.match(confirm, /removeRecentPlayer/);
  assert.doesNotMatch(confirm, /removeGroupPlayer/);
});
