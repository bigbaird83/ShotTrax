import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import {
  planScorecardAudienceChoices,
  planShareChoices,
  shareAudienceForPublish,
  shareKindOrScorecard,
  shareTapOpensChoice,
} from './shareChoice';

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

test('Whole group / Just me is asked only when the round has a partner', () => {
  assert.equal(planScorecardAudienceChoices(0), null);
  assert.equal(planScorecardAudienceChoices(-1), null);
  assert.equal(planScorecardAudienceChoices(1.5), null);
  const one = planScorecardAudienceChoices(1);
  assert.deepEqual(one, [
    { audience: 'group', label: 'Whole group', default: true },
    { audience: 'me', label: 'Just me', default: false },
  ]);
  assert.equal(one?.[0]?.default, true);
  assert.deepEqual(planScorecardAudienceChoices(3), one);
  assert.equal(COPY.shareWholeGroup, 'Whole group');
  assert.equal(COPY.shareJustMe, 'Just me');

  const ui = readFileSync(new URL('../ui/ShareChoice.tsx', import.meta.url), 'utf8');
  assert.match(ui, /audiences && audiences.length > 0/);
  assert.match(ui, /choices && choices.length > 0/);
  assert.match(ui, /accessibilityRole="menu"/);
  assert.match(ui, /accessibilityState=\{choice\.default \? \{ selected: true \} : undefined\}/);
  assert.match(ui, /testID="scorecard-audience"/);
  assert.match(ui, /onPick\(choice\.kind\)/);
  assert.doesNotMatch(ui, /shareLiveBoard|shareRoundSnapshot/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../../app/review/[id]/scorecard.tsx', import.meta.url), 'utf8');
  assert.match(hole, /planScorecardAudienceChoices\(scorecardPartnerCount\)/);
  assert.match(hole, /<ShareChoice variant="ghost" onPick=\{queueMenuShare\}/);
  assert.match(summary, /planScorecardAudienceChoices\(partnerCount\)/);
  assert.match(review, /planScorecardAudienceChoices\(partnerCount\)/);
  assert.doesNotMatch(review, /shareLiveBoard|onShare=/);

  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  const snapshot = share.slice(share.indexOf('export async function shareRoundSnapshot'), share.indexOf('export async function shareLiveBoard'));
  const live = share.slice(share.indexOf('export async function shareLiveBoard'));
  assert.ok(snapshot.indexOf('publishExplicitRoundShare') < snapshot.indexOf("audience === 'group'"));
  assert.ok(snapshot.indexOf('publishExplicitRoundShare') < snapshot.indexOf('loadGroup'));
  assert.doesNotMatch(snapshot, /buildRoundSpectatorPayload/);
  assert.doesNotMatch(live, /loadGroup|planGroupScorecard|planScorecardAudienceChoices|audience/);
});

test('publish follows an explicit choice, then the stored one, and defaults to Whole group once partners exist', () => {
  assert.equal(shareAudienceForPublish({ explicit: 'me', stored: 'group', partnerCount: 3 }), 'me');
  assert.equal(shareAudienceForPublish({ explicit: 'group', stored: 'me', partnerCount: 1 }), 'group');
  assert.equal(shareAudienceForPublish({ explicit: 'group', partnerCount: 0 }), 'me');
  assert.equal(shareAudienceForPublish({ stored: 'me', partnerCount: 2 }), 'me');
  assert.equal(shareAudienceForPublish({ stored: 'group', partnerCount: 0 }), 'me');
  assert.equal(shareAudienceForPublish({ stored: null, partnerCount: 1 }), 'group');
  assert.equal(shareAudienceForPublish({ partnerCount: 0 }), 'me');
});
