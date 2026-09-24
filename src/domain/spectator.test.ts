import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import {
  approximateFromFixQuality,
  decodeSpectatorPayload,
  encodeSpectatorPayload,
  formatSpectatorHoleLine,
  formatSpectatorShareText,
  lastClosedClubYards,
  parseSpectatorPayload,
  pinToPinYardsFromShots,
  planSpectatorHoleRow,
  planSpectatorLive,
  planSpectatorPayload,
  MENU_SHARE_FALLBACK_MS,
  menuShareMustWaitForDismiss,
  formatShareScorecard,
  shareFailToast,
  shareMessageIncludesPayloadQuery,
  shareScorecardTotal,
  scorecardImageShareContent,
  shareSheetContent,
  shareSheetPassesUrl,
  shouldOpenShareSheet,
  toastAfterShareAttempt,
  toastFromShareAttempt,
  spectatorInventsFromCardYards,
  spectatorKeepsApproximateOnSoftForced,
  spectatorNeedsViewerLocation,
  spectatorPayloadHasCoordinates,
  spectatorUploadsLiveGpsTrail,
  type SpectatorHoleInput,
  type SpectatorShotInput,
} from './spectator';

function shot(partial: Partial<SpectatorShotInput> & Pick<SpectatorShotInput, 'distanceYards'>): SpectatorShotInput {
  return {
    clubShortName: '7i',
    endedAt: '2026-09-19T18:00:00.000Z',
    source: 'gps',
    fixQuality: 'good',
    ...partial,
  };
}

const holes: SpectatorHoleInput[] = [
  {
    number: 1,
    score: 4,
    cardYards: 412,
    shots: [shot({ clubShortName: 'Dr', distanceYards: 248 }), shot({ clubShortName: '7i', distanceYards: 155 })],
  },
  {
    number: 2,
    score: 3,
    cardYards: 170,
    shots: [shot({ clubShortName: '52°', distanceYards: 105, fixQuality: 'soft' })],
  },
  {
    number: 3,
    score: null,
    cardYards: 390,
    shots: [],
  },
];

test('live share is hole, score, and last closed club·yards — no GPS trail', () => {
  assert.equal(spectatorNeedsViewerLocation(), false);
  assert.equal(spectatorUploadsLiveGpsTrail(), false);
  assert.equal(spectatorInventsFromCardYards(), false);
  assert.equal(spectatorKeepsApproximateOnSoftForced(), true);

  const live = planSpectatorLive({ holeNumber: 2, score: 3, shots: holes[1].shots });
  assert.deepEqual(live, { hole: 2, score: 3, lastClubYards: `52° · 105 · ${COPY.approximate}` });
  assert.equal(lastClosedClubYards(holes[2].shots), null);
  assert.equal(lastClosedClubYards([shot({ distanceYards: 140, endedAt: null })]), null);
  assert.equal(lastClosedClubYards([shot({ distanceYards: 140, source: 'no_gps' })]), null);

  const payload = planSpectatorPayload({
    token: 'tok_live',
    courseName: 'Pine Valley',
    finished: false,
    currentHoleNumber: 2,
    holes,
  });
  assert.equal(payload.finished, false);
  assert.deepEqual(payload.live, live);
  assert.equal(payload.holes.length, 3);
  assert.equal(payload.holes[0]?.score, 4);
  assert.equal(payload.holes[2]?.score, null);
  assert.equal(spectatorPayloadHasCoordinates(payload), false);
  assert.doesNotMatch(JSON.stringify(payload), /40\.7128|-74\.006|lat|lng/);
});

test('finished share lists every hole with club · pin-to-pin yards · score', () => {
  const payload = planSpectatorPayload({
    token: 'tok_done',
    courseName: 'Pine Valley',
    finished: true,
    currentHoleNumber: 3,
    holes,
  });
  assert.equal(payload.live, null);
  assert.equal(payload.holes.length, 3);
  assert.deepEqual(payload.holes[0], {
    hole: 1,
    club: '7i',
    pinToPinYards: 155,
    score: 4,
    approximate: false,
    par: null,
    putts: null,
    // No hole stamps — shot times back them up on a scored hole.
    startedAt: '2026-09-19T18:00:00.000Z',
    completedAt: '2026-09-19T18:00:00.000Z',
  });
  assert.deepEqual(payload.holes[1], {
    hole: 2,
    club: '52°',
    pinToPinYards: 105,
    score: 3,
    approximate: true,
    par: null,
    putts: null,
    // No hole stamps — shot times back them up on a scored hole.
    startedAt: '2026-09-19T18:00:00.000Z',
    completedAt: '2026-09-19T18:00:00.000Z',
  });
  assert.deepEqual(payload.holes[2], {
    hole: 3,
    club: null,
    pinToPinYards: null,
    score: null,
    approximate: false,
    par: null,
    putts: null,
    startedAt: null,
    completedAt: null,
  });
  assert.notEqual(payload.holes[0].pinToPinYards, 412);
  assert.equal(pinToPinYardsFromShots(holes[0].shots), 155);
  assert.equal(planSpectatorHoleRow(holes[0]).pinToPinYards, 155);
  assert.equal(approximateFromFixQuality('forced'), true);
  assert.equal(approximateFromFixQuality('good'), false);
  assert.match(formatSpectatorHoleLine(payload.holes[1]), /Approximate/);
  assert.doesNotMatch(formatSpectatorHoleLine(payload.holes[0]), /Approximate/);
});

test('encode/decode keeps the thin payload and never invents coordinates', () => {
  const payload = planSpectatorPayload({
    token: 'tok_round',
    courseName: 'Cypress',
    finished: true,
    holes,
  });
  const encoded = encodeSpectatorPayload(payload);
  assert.equal(decodeSpectatorPayload(encoded)?.token, 'tok_round');
  assert.deepEqual(decodeSpectatorPayload(encoded), payload);
  assert.equal(decodeSpectatorPayload('not-payload'), null);
  assert.equal(parseSpectatorPayload({ token: '' }), null);
  assert.equal(parseSpectatorPayload({ token: 'x', finished: true, holes: [{ hole: 1, score: 5 }] })?.holes[0].score, 5);
});

test('share text is readable without opening a map or granting location', () => {
  const live = planSpectatorPayload({
    token: 't',
    courseName: 'Magnolia',
    finished: false,
    currentHoleNumber: 1,
    holes,
  });
  const liveText = formatSpectatorShareText(live);
  assert.match(liveText, /ShotTraxx™ · Live/);
  assert.doesNotMatch(liveText, /®/);
  assert.match(liveText, /Magnolia/);
  assert.match(liveText, /Hole 1 · 4/);
  assert.match(liveText, /7i · 155/);
  assert.doesNotMatch(liveText, /lat|lng|GPS|trail/i);

  const done = planSpectatorPayload({
    token: 't',
    courseName: 'Magnolia',
    finished: true,
    holes,
  });
  const doneText = formatSpectatorShareText(done);
  assert.match(doneText, /ShotTraxx™ · Finished/);
  assert.match(doneText, /1  7i · 155  4/);
  assert.match(doneText, new RegExp(`2  52° · 105  3 · ${COPY.approximate}`));
});

test('Messages share body is a scorecard — never the ?p= spectator token', () => {
  assert.equal(shareSheetPassesUrl(), false);
  assert.deepEqual(shareSheetContent({ message: 'ShotTraxx™\nMagnolia · 7' }), {
    message: 'ShotTraxx™\nMagnolia · 7',
    title: 'ShotTraxx™',
  });
  assert.equal(
    shareSheetContent({ message: 'card', imageUrl: 'shottrax:///s/x?p=abc' }).url,
    undefined,
  );
  assert.equal(
    shareSheetContent({ message: 'card', imageUrl: 'file:///tmp/shottrax-scorecard.png' }).url,
    'file:///tmp/shottrax-scorecard.png',
  );
  const cardHoles = holes.map((hole) => ({ hole: hole.number, score: hole.score }));
  assert.equal(shareScorecardTotal(cardHoles), 7);
  const live = formatShareScorecard({
    courseName: 'Magnolia',
    holes: cardHoles,
    lastClubYards: '7i · 155',
  });
  assert.equal(
    live,
    ['ShotTraxx™', 'Magnolia · 7', '1  4', '2  3', '3  —', 'Last: 7i · 155'].join('\n'),
  );
  assert.equal(shareMessageIncludesPayloadQuery(live), false);
  assert.doesNotMatch(live, /shottrax:\/\//i);
  assert.doesNotMatch(live, /[?&]p=/);
  assert.doesNotMatch(live, /lat|lng|GPS|trail/i);

  const done = formatShareScorecard({
    courseName: 'Magnolia',
    holes: cardHoles,
  });
  assert.equal(done, ['ShotTraxx™', 'Magnolia · 7', '1  4', '2  3', '3  —'].join('\n'));
  assert.doesNotMatch(done, /Last:/);
  assert.equal(shareMessageIncludesPayloadQuery(done), false);

  const empty = formatShareScorecard({ courseName: null, holes: [] });
  assert.equal(empty, 'ShotTraxx™\nRound');
  assert.equal(shareScorecardTotal([]), null);
});

test('Signal Lab: share yards stay logged pin-to-pin with Approximate when soft/forced', () => {
  assert.equal(spectatorInventsFromCardYards(), false);
  assert.equal(spectatorKeepsApproximateOnSoftForced(), true);

  const cardOnly: SpectatorHoleInput = {
    number: 4,
    score: 5,
    cardYards: 418,
    shots: [],
  };
  assert.equal(planSpectatorHoleRow(cardOnly).pinToPinYards, null);
  assert.equal(planSpectatorHoleRow(cardOnly).approximate, false);

  const forced = planSpectatorHoleRow({
    number: 5,
    score: 4,
    cardYards: 390,
    shots: [shot({ clubShortName: 'Dr', distanceYards: 241, fixQuality: 'forced' })],
  });
  assert.equal(forced.pinToPinYards, 241);
  assert.notEqual(forced.pinToPinYards, 390);
  assert.equal(forced.approximate, true);
  assert.match(formatSpectatorHoleLine(forced), /Approximate/);

  const placed = planSpectatorHoleRow({
    number: 6,
    score: 3,
    cardYards: 170,
    shots: [shot({ clubShortName: '9i', distanceYards: 132, source: 'placed', fixQuality: null })],
  });
  assert.equal(placed.pinToPinYards, 132);
  assert.equal(placed.approximate, false);

  const liveSoft = lastClosedClubYards(holes[1].shots);
  assert.equal(liveSoft, `52° · 105 · ${COPY.approximate}`);
  assert.equal(lastClosedClubYards(holes[0].shots), '7i · 155');

  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  assert.match(share, /distanceYards: shot\.distanceYards/);
  assert.doesNotMatch(share, /pinToPinYards: hole\.yards/);
});

test('share surfaces use the spectator helper and do not upload a live trail', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  const spectator = readFileSync(new URL('../../app/s/[token].tsx', import.meta.url), 'utf8');
  assert.match(hole, /shareRoundSnapshot/);
  assert.match(summary, /shareRoundSnapshot/);
  assert.match(spectator, /decodeSpectatorPayload/);
  assert.match(spectator, /COPY\.spectatorNeedsNoLocation/);
  assert.doesNotMatch(hole, /getCurrentFix\(\).*share/);
  assert.doesNotMatch(spectator, /getCurrentFix/);
  assert.doesNotMatch(spectator, /expo-location/);
});

test('Menu Share toasts Couldn’t open share when Share.share fails — never a GPS trail', async () => {
  assert.equal(shareFailToast(), "Couldn't open share");
  assert.equal(COPY.shareFail, "Couldn't open share");
  assert.equal(toastAfterShareAttempt(false), COPY.shareFail);
  assert.equal(toastAfterShareAttempt(true), null);
  assert.equal(await toastFromShareAttempt(async () => false), COPY.shareFail);
  assert.equal(await toastFromShareAttempt(async () => true), null);
  assert.equal(
    await toastFromShareAttempt(async () => {
      throw new Error('share');
    }),
    COPY.shareFail,
  );
  assert.doesNotMatch(COPY.shareFail, /lat|lng|GPS|trail/i);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  const menuShare = hole.slice(hole.indexOf('<ShareChoice variant="ghost"'), hole.indexOf('label={COPY.undoLast}'));
  const summaryShare = summary.slice(summary.indexOf('label={COPY.share}'), summary.indexOf('label={COPY.home}'));
  assert.match(menuShare, /queueMenuShare/);
  assert.doesNotMatch(menuShare, /shareRoundSnapshot/);
  assert.match(hole, /onDismiss=\{openQueuedShare\}/);
  assert.match(hole, /shareRoundSnapshot/);
  assert.match(hole, /toastFromShareAttempt/);
  assert.match(hole, /setToast\(fail\)/);
  assert.match(summaryShare, /shareRoundSnapshot/);
  assert.match(summaryShare, /toastFromShareAttempt/);
  assert.match(summaryShare, /setToast\(fail\)/);
  assert.match(share, /shareSheetContent/);
  assert.match(share, /Share\.share\(content/);
  assert.match(share, /renderScorecardPng/);
  assert.match(share, /formatShareScorecard/);
  assert.match(share, /waitForShareHost/);
  assert.match(share, /catch \{/);
  assert.match(share, /return false/);
  assert.doesNotMatch(share, /encodeSpectatorPayload/);
  assert.match(share, /queryParams: \{ h:/);
  assert.doesNotMatch(share, /queryParams: \{ p/);
  assert.doesNotMatch(share, /lat|lng/);
  assert.doesNotMatch(menuShare, /getCurrentFix/);
});

test('Scorecard Share sends the image only — no message, no link, no text fallback', async () => {
  assert.deepEqual(scorecardImageShareContent('file:///tmp/shottrax-scorecard.png'), {
    url: 'file:///tmp/shottrax-scorecard.png',
  });
  assert.equal(scorecardImageShareContent(null), null);
  assert.equal(scorecardImageShareContent(''), null);
  assert.equal(scorecardImageShareContent('shottrax:///s/x?p=abc'), null);
  assert.equal(scorecardImageShareContent('https://example.com/card.png'), null);
  assert.equal(COPY.shareScorecardFail, 'Couldn’t share scorecard.');
  assert.equal(await toastFromShareAttempt(async () => false, COPY.shareScorecardFail), COPY.shareScorecardFail);
  assert.equal(
    await toastFromShareAttempt(async () => {
      throw new Error('share');
    }, COPY.shareScorecardFail),
    COPY.shareScorecardFail,
  );
  assert.equal(await toastFromShareAttempt(async () => true, COPY.shareScorecardFail), null);

  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  const snapshot = share.slice(
    share.indexOf('export async function shareRoundSnapshot'),
    share.indexOf('export async function shareLiveBoard'),
  );
  assert.match(snapshot, /scorecardImageShareContent\(imageUrl\)/);
  assert.match(snapshot, /if \(!content\) return false/);
  assert.doesNotMatch(snapshot, /planned\.message|shareSheetContent|formatLiveBoardShare/);
  const live = share.slice(share.indexOf('export async function shareLiveBoard'));
  assert.match(live, /formatLiveBoardShare/);
  assert.match(live, /shareSheetContent\(\{ message \}\)/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  assert.match(hole, /kind === 'live' \? COPY\.shareFail : COPY\.shareScorecardFail/);
  assert.match(summary, /COPY\.shareScorecardFail/);
});

test('TF 62: Menu Share waits for fullScreen Modal dismiss before Share.share', () => {
  assert.equal(menuShareMustWaitForDismiss(), true);
  assert.equal(MENU_SHARE_FALLBACK_MS, 600);
  assert.equal(shouldOpenShareSheet({ queued: true, menuVisible: true, menuDismissed: false }), false);
  assert.equal(shouldOpenShareSheet({ queued: true, menuVisible: false, menuDismissed: false }), false);
  assert.equal(shouldOpenShareSheet({ queued: true, menuVisible: false, menuDismissed: true }), true);
  assert.equal(shouldOpenShareSheet({ queued: false, menuVisible: false, menuDismissed: true }), false);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../ui/Sheet.tsx', import.meta.url), 'utf8');
  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  const queue = hole.slice(hole.indexOf('const queueMenuShare'), hole.indexOf('const onWatchPuttPick'));
  const open = hole.slice(hole.indexOf('const openQueuedShare'), hole.indexOf('const queueMenuShare'));
  assert.match(queue, /pendingShareRef\.current = true/);
  assert.match(queue, /setMenuOpen\(false\)/);
  assert.match(queue, /MENU_SHARE_FALLBACK_MS/);
  assert.doesNotMatch(queue, /shareRoundSnapshot/);
  assert.match(open, /shareRoundSnapshot/);
  assert.match(open, /toastFromShareAttempt/);
  assert.match(open, /if \(!pendingShareRef\.current\) return/);
  assert.match(hole, /onDismiss=\{openQueuedShare\}/);
  assert.match(sheet, /onDismiss=\{onDismiss\}/);
  assert.match(share, /waitForShareHost/);
  assert.match(share, /InteractionManager\.runAfterInteractions/);
  assert.match(share, /shareSheetContent/);
  assert.match(share, /Share\.share\(content/);
  assert.doesNotMatch(share, /encodeSpectatorPayload/);
  assert.doesNotMatch(open, /getCurrentFix/);
  assert.doesNotMatch(share, /lat|lng/);
});

test('hole start / finish ride the PUT, falling back to shot times', () => {
  const shot = (startedAt: string, endedAt: string | null) => ({
    clubShortName: '7i',
    distanceYards: 150,
    startedAt,
    endedAt,
    source: 'gps' as const,
    fixQuality: 'good' as const,
  });
  const stamped = planSpectatorHoleRow({
    number: 1,
    score: 4,
    startedAt: '2026-09-24T14:00:00.000Z',
    completedAt: '2026-09-24T14:12:00.000Z',
    shots: [shot('2026-09-24T14:01:00.000Z', '2026-09-24T14:02:00.000Z')],
  });
  assert.equal(stamped.startedAt, '2026-09-24T14:00:00.000Z');
  assert.equal(stamped.completedAt, '2026-09-24T14:12:00.000Z');

  const unstamped = planSpectatorHoleRow({
    number: 2,
    score: 5,
    startedAt: null,
    completedAt: null,
    shots: [
      shot('2026-09-24T14:15:00.000Z', '2026-09-24T14:16:00.000Z'),
      shot('2026-09-24T14:18:00.000Z', '2026-09-24T14:20:00.000Z'),
    ],
  });
  assert.equal(unstamped.startedAt, '2026-09-24T14:15:00.000Z');
  assert.equal(unstamped.completedAt, '2026-09-24T14:20:00.000Z');

  const open = planSpectatorHoleRow({
    number: 3,
    score: null,
    shots: [shot('2026-09-24T14:25:00.000Z', '2026-09-24T14:26:00.000Z')],
  });
  assert.equal(open.startedAt, '2026-09-24T14:25:00.000Z');
  assert.equal(open.completedAt, null);
});
