import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import { planShareChoices, shareKindOrScorecard, shareTapOpensChoice } from './shareChoice';

test('Share opens a pick: Share scorecard or Share live round', () => {
  assert.equal(shareTapOpensChoice(), true);
  assert.deepEqual(planShareChoices(), [
    { kind: 'scorecard', label: 'Share scorecard' },
    { kind: 'live', label: 'Share live round' },
  ]);
  assert.equal(COPY.shareScorecard, 'Share scorecard');
  assert.equal(COPY.shareLiveRound, 'Share live round');
  assert.equal(shareKindOrScorecard('live'), 'live');
  assert.equal(shareKindOrScorecard('scorecard'), 'scorecard');
  assert.equal(shareKindOrScorecard(null), 'scorecard');
  assert.equal(shareKindOrScorecard(undefined), 'scorecard');
});

test('Menu and scorecard Share use the pick; the pick rides the queued share after the sheet closes', () => {
  const ui = readFileSync(new URL('../ui/ShareChoice.tsx', import.meta.url), 'utf8');
  assert.match(ui, /label=\{COPY\.share\}/);
  assert.match(ui, /planShareChoices\(\)/);
  assert.match(ui, /COPY\.cancel/);
  assert.match(ui, /onPick\(choice\.kind\)/);
  // The pick itself never opens the system share sheet.
  assert.doesNotMatch(ui, /Share\.share|shareRoundSnapshot|shareLiveBoard|Alert\.alert|ActionSheetIOS/);

  const card = readFileSync(new URL('../ui/ScorecardBody.tsx', import.meta.url), 'utf8');
  assert.match(card, /<ShareChoice variant="secondary" onPick=\{onShare\}/);
  assert.doesNotMatch(card, /label=\{COPY\.share\}/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  assert.match(hole, /<ShareChoice variant="ghost" onPick=\{queueMenuShare\}/);
  assert.match(hole, /onShare=\{queueMenuShare\}/);
  const queue = hole.slice(hole.indexOf('const queueMenuShare'), hole.indexOf('const onWatchPuttPick'));
  assert.match(queue, /pendingShareKindRef\.current = shareKindOrScorecard\(kind\)/);
  assert.match(queue, /setMenuOpen\(false\)/);
  assert.match(queue, /setScorecardOpen\(false\)/);
  const open = hole.slice(hole.indexOf('const openQueuedShare'), hole.indexOf('const queueMenuShare'));
  assert.match(open, /kind === 'live'\s*\? shareLiveBoard\(/);
  assert.match(open, /: shareRoundSnapshot\(/);
  assert.match(open, /toastFromShareAttempt/);
});
