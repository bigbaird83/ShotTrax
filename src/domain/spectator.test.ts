import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_GROUP_GAMES } from './groupGames';
import { planGroupScorecard, planSpectatorGroup } from './groupScorecard';
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
  planSpectatorGroupColumns,
  planSpectatorHoleRow,
  planSpectatorLive,
  planSpectatorPayload,
  SPECTATOR_PAYLOAD_VERSION,
  androidImageUrlShareBlock,
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

  const share = readFileSync(new URL('../services/roundScoreboard.ts', import.meta.url), 'utf8');
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
  const menuShare = hole.slice(hole.indexOf('<ShareChoice variant="ghost"'), hole.indexOf('label={COPY.undoLastShot}'));
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
  assert.match(
    readFileSync(new URL('../services/roundScoreboard.ts', import.meta.url), 'utf8'),
    /formatShareScorecard/,
  );
  assert.match(share, /waitForShareHost/);
  assert.match(share, /catch \{/);
  assert.match(share, /return false/);
  assert.doesNotMatch(share, /encodeSpectatorPayload/);
  assert.match(share, /queryParams: \{ h:/);
  assert.doesNotMatch(share, /queryParams: \{ p/);
  assert.doesNotMatch(share, /\b(lat|lng|latitude|longitude|startLat|startLng|endLat|endLng)\b/);
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
  assert.match(snapshot, /androidImageUrlShareBlock\(content, Platform\.OS\)/);
  const blockAt = snapshot.indexOf('androidImageUrlShareBlock');
  const presentAt = snapshot.indexOf('presentShare');
  assert.ok(blockAt >= 0 && presentAt > blockAt);
  assert.doesNotMatch(snapshot, /planned\.message|shareSheetContent|formatLiveBoardShare/);
  const live = share.slice(share.indexOf('export async function shareLiveBoard'));
  assert.match(live, /formatLiveBoardShare/);
  assert.match(live, /shareSheetContent\(\{ message \}\)/);

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  assert.match(hole, /kind === 'live' \? COPY\.shareFail : COPY\.shareScorecardFail/);
  assert.match(summary, /COPY\.shareScorecardFail/);
});

test('Android scorecard image-url share is blocked before the sheet; iOS still shares the PNG', async () => {
  const png = { url: 'file:///tmp/shottrax-scorecard.png' };
  assert.equal(androidImageUrlShareBlock(png, 'android'), COPY.shareScorecardAndroid);
  assert.equal(androidImageUrlShareBlock(scorecardImageShareContent(png.url), 'android'), COPY.shareScorecardAndroid);
  assert.equal(androidImageUrlShareBlock(png, 'ios'), null);
  assert.equal(androidImageUrlShareBlock(scorecardImageShareContent(png.url), 'ios'), null);
  assert.equal(androidImageUrlShareBlock({ url: png.url, message: 'card' }, 'android'), null);
  assert.equal(androidImageUrlShareBlock({ url: png.url, message: '  ' }, 'android'), COPY.shareScorecardAndroid);
  assert.equal(androidImageUrlShareBlock({ message: 'Hole 1 · 4' }, 'android'), null);
  assert.equal(androidImageUrlShareBlock(null, 'android'), null);
  assert.equal(androidImageUrlShareBlock({ url: '' }, 'android'), null);
  assert.equal(COPY.shareScorecardAndroid, 'Can’t share the scorecard image on Android.');
  assert.equal(COPY.shareScorecardFail, 'Couldn’t share scorecard.');
  assert.doesNotMatch(COPY.shareScorecardAndroid, /lat|lng|GPS|trail/i);
  assert.equal(
    await toastFromShareAttempt(async () => COPY.shareScorecardAndroid, COPY.shareScorecardFail),
    COPY.shareScorecardAndroid,
  );
  assert.equal(toastAfterShareAttempt(COPY.shareScorecardAndroid, COPY.shareScorecardFail), COPY.shareScorecardAndroid);
  assert.equal(await toastFromShareAttempt(async () => false, COPY.shareScorecardFail), COPY.shareScorecardFail);
  assert.equal(await toastFromShareAttempt(async () => true, COPY.shareScorecardFail), null);

  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  const snapshot = share.slice(
    share.indexOf('export async function shareRoundSnapshot'),
    share.indexOf('export async function shareLiveBoard'),
  );
  assert.match(snapshot, /const blocked = androidImageUrlShareBlock\(content, Platform\.OS\)/);
  assert.match(snapshot, /if \(blocked\) return blocked/);
  assert.ok(snapshot.indexOf('androidImageUrlShareBlock') < snapshot.indexOf('return presentShare'));
  assert.match(snapshot, /return presentShare\(content, options\)/);
  assert.doesNotMatch(snapshot, /planned\.message|formatShareScorecard|formatLiveBoardShare/);
  const present = share.slice(share.indexOf('async function presentShare'), share.indexOf('export async function shareRoundSnapshot'));
  assert.match(present, /if \(androidImageUrlShareBlock\(content, Platform\.OS\)\) return false/);
  assert.ok(present.indexOf('androidImageUrlShareBlock') < present.indexOf('Share.share'));
  const live = share.slice(share.indexOf('export async function shareLiveBoard'));
  assert.match(live, /shareSheetContent\(\{ message \}\)/);
  assert.doesNotMatch(live, /shareScorecardAndroid|androidImageUrlShareBlock/);
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
  assert.doesNotMatch(share, /\b(lat|lng|latitude|longitude|startLat|startLng|endLat|endLng)\b/);
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

test('payload version stays 1, and a payload that includes group still parses the owner holes', () => {
  assert.equal(SPECTATOR_PAYLOAD_VERSION, 1);
  const owner = planSpectatorPayload({
    token: 'tok_round',
    courseName: 'Cypress',
    finished: false,
    currentHoleNumber: 1,
    updatedAt: '2026-09-26T18:00:00.000Z',
    holes: [
      {
        number: 1,
        score: 4,
        par: 4,
        putts: 2,
        startedAt: '2026-09-26T14:00:00.000Z',
        completedAt: '2026-09-26T14:12:00.000Z',
        shots: [
          {
            clubShortName: '7i',
            distanceYards: 155,
            startedAt: '2026-09-26T14:01:00.000Z',
            endedAt: '2026-09-26T14:02:00.000Z',
            source: 'gps',
            fixQuality: 'good',
          },
        ],
      },
    ],
  });
  const withGroup = {
    ...owner,
    v: 1,
    futureField: { ignored: true },
    group: {
      players: [
        {
          name: 'You',
          holes: [{ hole: 1, score: 4 }, { hole: 2, score: 0 }],
          out: 4,
          in: null,
          total: 4,
          handicap: 8,
        },
        { name: 'Pat', holes: [{ hole: 1, score: 5 }], out: null, in: 0, total: 5 },
      ],
      results: [{ title: 'Skins', lines: ['You  1', 'Pat  0'] }],
    },
  };
  const parsed = parseSpectatorPayload(withGroup);
  const plain = parseSpectatorPayload(owner);
  assert.ok(parsed);
  assert.ok(plain);
  const { group, ...rest } = parsed;
  assert.deepEqual(rest, plain);
  assert.equal(parsed.holes[0].score, 4);
  assert.equal(parsed.holes[0].club, '7i');
  assert.equal(parsed.holes[0].pinToPinYards, 155);
  assert.equal(group?.players[0].name, 'You');
  assert.equal(group?.players[0].holes[1].score, null);
  assert.equal(group?.players[0].handicap, 8);
  assert.equal(group?.players[1].in, null);
  assert.equal('handicap' in (group?.players[1] ?? {}), false);
  assert.equal(group?.results?.[0].title, 'Skins');

  const dropped = parseSpectatorPayload({ ...owner, group: 'nope' });
  assert.equal(dropped?.holes[0].score, 4);
  assert.equal(dropped?.group, undefined);
  const empty = parseSpectatorPayload({ ...owner, group: { players: [] } });
  assert.equal(empty?.holes[0].score, 4);
  assert.equal(empty?.group, undefined);
  assert.deepEqual(decodeSpectatorPayload(encodeSpectatorPayload({ ...owner, group: group! })), { ...owner, group });
});

test('group card matches the scorecard totals and omits a blank handicap', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
  const you = { id: 'you', name: 'You', handicap: null as number | null, scores: { 1: 0, 2: 4 } as Record<number, number> };
  const pat = { id: 'pat', name: 'Pat', handicap: null as number | null, scores: { 1: 5 } as Record<number, number> };
  const gross = planSpectatorGroup({
    holes: nine,
    players: [you, pat],
    settings: { ...DEFAULT_GROUP_GAMES, net: true, skins: false },
  });
  assert.ok(gross);
  assert.equal(gross.players[0].name, 'You');
  assert.equal(gross.players[0].holes[0].score, null);
  assert.equal(gross.players[0].holes[1].score, 4);
  assert.equal(gross.players[0].out, null);
  assert.equal(gross.players[0].in, null);
  assert.equal(gross.players[0].total, 4);
  assert.equal('handicap' in gross.players[0], false);
  assert.equal('handicap' in gross.players[1], false);
  assert.doesNotMatch(JSON.stringify(gross), /"handicap"/);
  assert.equal(gross.results, undefined);
  const card = planGroupScorecard({
    holes: nine,
    players: [you, pat],
    result: { net: false, skins: null },
  });
  assert.equal(gross.players[0].holes[1].score, card.front[1].cells[0].score);
  assert.equal(gross.players[1].holes[0].score, card.front[0].cells[1].score);
  assert.equal(planSpectatorGroupColumns(gross).out, false);
  assert.equal(planSpectatorGroupColumns(gross).inn, false);

  const eighteen = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
  const net = planSpectatorGroup({
    holes: eighteen,
    players: [
      { id: 'you', name: 'You', handicap: 0, scores: { 1: 4 } },
      { id: 'pat', name: 'Pat', handicap: 12, scores: { 1: 5 } },
    ],
    settings: { ...DEFAULT_GROUP_GAMES, net: true, skins: true, stableford: true, matchPlay: true, nassau: true, matchPlayerIds: ['you', 'pat'] },
  });
  assert.ok(net);
  assert.equal(net.players[0].handicap, 0);
  assert.equal(net.players[1].handicap, 12);
  assert.equal(net.players[0].out, 4);
  assert.equal(net.players[0].in, null);
  assert.ok(net.results && net.results.length > 0);
  assert.equal(planSpectatorGroupColumns(net).holes.length, 18);
  assert.equal(planSpectatorGroupColumns(net).out, true);
  assert.equal(planSpectatorGroupColumns(net).inn, true);
  assert.equal(planSpectatorGroup({ holes: nine, players: [you], settings: DEFAULT_GROUP_GAMES }), null);
});

test('a 4-player 18-hole group payload with owner shot rows stays under 20000 bytes', () => {
  const holes = Array.from({ length: 18 }, (_, i) => {
    const minute = String(i).padStart(2, '0');
    return {
      number: i + 1,
      score: 4,
      cardYards: 420,
      par: i % 3 === 0 ? 3 : i % 5 === 0 ? 5 : 4,
      putts: 2,
      startedAt: `2026-09-26T14:${minute}:00.000Z`,
      completedAt: `2026-09-26T14:${minute}:12.000Z`,
      shots: [
        {
          clubShortName: '7i',
          distanceYards: 155,
          startedAt: `2026-09-26T14:${minute}:01.000Z`,
          endedAt: `2026-09-26T14:${minute}:02.000Z`,
          source: 'gps' as const,
          fixQuality: 'good' as const,
        },
      ],
    };
  });
  const payload = planSpectatorPayload({
    token: 'AB12CD',
    courseName: 'SAMPLE DATA',
    finished: false,
    currentHoleNumber: 18,
    holes,
    updatedAt: '2026-09-26T18:00:00.000Z',
  });
  const players = ['You', 'Sample Pat', 'Sample Sam', 'Sample Dee'].map((name, index) => ({
    id: ['you', 'pat', 'sam', 'dee'][index],
    name,
    handicap: [8, 12, 18, 4][index],
    scores: Object.fromEntries(Array.from({ length: 18 }, (_, hole) => [hole + 1, 3 + ((hole + index) % 4)])),
  }));
  const group = planSpectatorGroup({
    holes: Array.from({ length: 18 }, (_, i) => ({
      number: i + 1,
      par: i % 3 === 0 ? 3 : i % 5 === 0 ? 5 : 4,
      strokeIndex: i + 1,
    })),
    players,
    settings: {
      net: true,
      skins: true,
      skinsCarry: true,
      stableford: true,
      matchPlay: true,
      nassau: true,
      matchPlayerIds: ['you', 'pat'],
    },
  });
  assert.ok(group);
  payload.group = group;
  const json = JSON.stringify(payload);
  const putBody = JSON.stringify({ ...payload, token: payload.token });
  console.log(`SPECTATOR_GROUP_PAYLOAD_BYTES ${json.length}`);
  console.log(`SPECTATOR_GROUP_PUT_BYTES ${putBody.length}`);
  assert.equal(payload.holes.length, 18);
  assert.equal(payload.holes[0].club, '7i');
  assert.equal(payload.holes[0].pinToPinYards, 155);
  assert.equal(payload.holes[0].par, 3);
  assert.equal(payload.holes[0].putts, 2);
  assert.ok(payload.holes[0].startedAt);
  assert.equal(payload.group.players.length, 4);
  assert.ok(json.length < 20000, `payload JSON is ${json.length} bytes`);
  assert.ok(putBody.length < 20000, `worker PUT body is ${putBody.length} bytes`);

  const screen = readFileSync(new URL('../../app/s/[token].tsx', import.meta.url), 'utf8');
  assert.match(screen, /testID="spectator-group"/);
  assert.match(screen, /planSpectatorGroupColumns/);
  assert.match(screen, /payload\.group \? /);
});
