import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { planScorecard } from './scorecard';
import { COPY } from './playerCopy';
import {
  finalCardImageStatus,
  finalCardPlayedAt,
  formatFinalCardSummary,
  planFinalCard,
  planFinalCardImage,
  roundCompleteForFinalCard,
  type FinalCardHoleInput,
} from './finalCard';

function holes18(over?: (hole: number) => Partial<FinalCardHoleInput>): FinalCardHoleInput[] {
  return Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    return {
      number,
      par: 4,
      score: 4,
      ...over?.(number),
    };
  });
}

test('full round: course, date, total, score vs par, and every hole score', () => {
  const card = planFinalCard({
    courseName: '  Magnolia  ',
    playedAt: '2026-09-20T17:00:00.000Z',
    holes: holes18((hole) => (hole === 18 ? { score: 6 } : {})),
  });
  assert.equal(card.courseName, 'Magnolia');
  assert.equal(card.date, 'Sep 20, 2026');
  assert.equal(card.total, 74);
  assert.equal(card.scoreVsPar, 2);
  assert.equal(card.scoreVsParLabel, '+2');
  assert.equal(card.holes.length, 18);
  assert.deepEqual(
    card.holes.map((hole) => hole.score),
    [...Array(17).fill(4), 6],
  );

  const text = formatFinalCardSummary(card);
  assert.equal(
    text,
    [
      'ShotTraxx™',
      'Magnolia',
      'Sep 20, 2026',
      '74',
      '+2',
      '',
      ...Array.from({ length: 17 }, (_, i) => `${i + 1}  4`),
      '18  6',
    ].join('\n'),
  );
  assert.doesNotMatch(text, /yd\b|http|shottrax:\/\/|\?p=|\b(lat|lng)\b/i);

  const image = planFinalCardImage({
    courseName: 'Magnolia',
    holes: planScorecard(card.holes.map((hole) => ({ number: hole.number, par: 4, score: hole.score, putts: 2 }))),
    scoreVsPar: card.scoreVsPar,
  });
  assert.equal(image.courseName, 'Magnolia');
  assert.equal(image.total, '74');
  assert.equal(image.status, 'Final · +2');
  assert.equal(image.rows.length, 18);
});

test('missing par omits score vs par and does not invent a par', () => {
  const card = planFinalCard({
    courseName: 'Magnolia',
    playedAt: '2026-09-20T17:00:00.000Z',
    holes: holes18((hole) => (hole === 9 ? { par: null, score: 4 } : {})),
  });
  assert.equal(card.total, 72);
  assert.equal(card.scoreVsPar, null);
  assert.equal(card.scoreVsParLabel, null);
  assert.deepEqual(card.holes[8], { number: 9, score: 4 });

  const text = formatFinalCardSummary(card);
  assert.match(text, /^ShotTraxx™\nMagnolia\nSep 20, 2026\n72\n\n1  4\n/);
  assert.equal(text.split('\n').filter((line) => line === 'E' || /^[+-]\d+$/.test(line)).length, 0);
  assert.doesNotMatch(text, /par 4|Par 4/i);
  assert.match(text, /^9  4$/m);

  const even = planFinalCard({
    courseName: 'Magnolia',
    playedAt: '2026-09-20T17:00:00.000Z',
    holes: holes18(),
  });
  assert.equal(even.scoreVsPar, 0);
  assert.equal(even.scoreVsParLabel, 'E');
  assert.match(formatFinalCardSummary(even), /\nE\n/);

  const invalidPar = planFinalCard({
    holes: [
      { number: 1, par: 4, score: 4 },
      { number: 2, par: 2, score: 3 },
    ],
  });
  assert.equal(invalidPar.total, 7);
  assert.equal(invalidPar.scoreVsPar, null);

  const imageHoles = planScorecard([
    { number: 1, par: 4, score: 5, putts: 2, puttsDone: true, shotCount: 3 },
    { number: 2, par: null, score: 4, putts: 2, puttsDone: true, shotCount: 2 },
  ]);
  const image = planFinalCardImage({
    courseName: 'Magnolia',
    holes: imageHoles,
    scoreVsPar: null,
  });
  assert.equal(image.status, 'Final');
  assert.equal(finalCardImageStatus('Final · E', null), 'Final');
  assert.equal(image.rows[1]?.par, '');
});

test('partial data keeps stored scores and leaves out anything the round does not have', () => {
  const card = planFinalCard({
    courseName: '   ',
    playedAt: 'not-a-date',
    holes: [
      { number: 3, par: 3, score: null },
      { number: 1, par: null, score: 4 },
      { number: 2, par: 4, score: 5 },
    ],
  });
  assert.equal(card.courseName, null);
  assert.equal(card.date, null);
  assert.equal(card.total, 9);
  assert.equal(card.scoreVsPar, null);
  assert.deepEqual(card.holes, [
    { number: 1, score: 4 },
    { number: 2, score: 5 },
    { number: 3, score: null },
  ]);
  assert.equal(formatFinalCardSummary(card), ['ShotTraxx™', '9', '', '1  4', '2  5', '3  —'].join('\n'));

  const playedOnly = planFinalCard({
    courseName: 'Oak Hills',
    playedAt: null,
    holes: [
      { number: 1, par: 4, score: 5 },
      { number: 2, par: 4, score: null },
    ],
  });
  assert.equal(playedOnly.date, null);
  assert.equal(playedOnly.total, 5);
  assert.equal(playedOnly.scoreVsPar, 1);
  assert.equal(playedOnly.scoreVsParLabel, '+1');
  assert.match(formatFinalCardSummary(playedOnly), /Oak Hills\n5\n\+1\n\n1  5\n2  —/);
  assert.equal(playedOnly.holes.length, 2);

  const blank = planFinalCard({
    holes: [{ number: 1, par: 4, score: 0 }, { number: 4, par: null, score: 4.5 }],
  });
  assert.equal(blank.total, null);
  assert.equal(blank.scoreVsPar, null);
  assert.deepEqual(blank.holes, [
    { number: 1, score: null },
    { number: 4, score: null },
  ]);

  const unnamed = planFinalCardImage({
    courseName: null,
    holes: planScorecard([{ number: 1, par: null, score: 5, putts: 1, puttsDone: true, shotCount: 4 }]),
    scoreVsPar: null,
  });
  assert.equal(unnamed.courseName, '');
  assert.equal(unnamed.status, 'Final');
  assert.equal(unnamed.total, '5');
});

test('the button is for the round-complete summary, including Hole Out before Finish is stamped', () => {
  const open = { finishedAt: null, holeCount: 18, holes: [{ number: 18, puttsDone: false }] };
  assert.equal(roundCompleteForFinalCard(open), false);
  assert.equal(
    roundCompleteForFinalCard({
      finishedAt: null,
      holeCount: 18,
      holes: [
        { number: 17, puttsDone: true },
        { number: 18, puttsDone: true },
      ],
    }),
    true,
  );
  assert.equal(
    roundCompleteForFinalCard({
      finishedAt: null,
      holeCount: 9,
      holes: [{ number: 9, puttsDone: true }],
    }),
    true,
  );
  assert.equal(
    roundCompleteForFinalCard({ finishedAt: '2026-09-20T18:00:00.000Z', holeCount: 18, holes: [] }),
    true,
  );
  assert.equal(
    finalCardPlayedAt({
      finishedAt: null,
      startedAt: '2026-09-20T14:00:00.000Z',
      holes: [
        { number: 17, completedAt: '2026-09-20T17:40:00.000Z' },
        { number: 18, completedAt: '2026-09-20T18:05:00.000Z' },
      ],
    }),
    '2026-09-20T18:05:00.000Z',
  );
  assert.equal(
    finalCardPlayedAt({ finishedAt: '2026-09-20T18:10:00.000Z', startedAt: '2026-09-20T14:00:00.000Z', holes: [] }),
    '2026-09-20T18:10:00.000Z',
  );
});

test('Share final card is opt-in on the finished summary and never touches the live share', () => {
  assert.equal(COPY.shareFinalCard, 'Share final card');

  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  const finalStart = summary.indexOf('{shareFinalCardNow ? (');
  const shareStart = summary.indexOf('<View ref={shareAnchorRef}');
  const finishedButton = summary.slice(finalStart, summary.indexOf('label={COPY.home}'));
  assert.match(finishedButton, /label=\{COPY\.shareFinalCard\}/);
  assert.match(finishedButton, /shareFinalCard\(/);
  assert.match(finishedButton, /COPY\.shareFinalCardFail/);
  assert.match(summary, /roundCompleteForFinalCard/);
  assert.doesNotMatch(summary, /useEffect\([\s\S]*shareFinalCard/);
  assert.doesNotMatch(summary, /putSharedPayload|publishRoundScoreboard|formatLiveBoardShare/);

  const shareButton = summary.slice(shareStart, finalStart);
  assert.match(shareButton, /shareRoundSnapshot/);
  assert.doesNotMatch(shareButton, /shareFinalCard/);

  const service = readFileSync(new URL('../services/shareFinalCard.ts', import.meta.url), 'utf8');
  assert.match(service, /roundCompleteForFinalCard/);
  assert.match(service, /finalCardPlayedAt/);
  assert.match(service, /formatFinalCardSummary/);
  assert.match(service, /planFinalCardImage/);
  assert.match(service, /renderScorecardPng/);
  assert.match(service, /Share\.share\(content/);
  assert.match(service, /shottrax-final-card\.png/);
  assert.doesNotMatch(service, /putSharedPayload|publishRoundScoreboard|ensureRoundShareToken|formatLiveBoardShare|shareSync/);
  assert.doesNotMatch(service, /\b(lat|lng|latitude|longitude|startLat|endLat)\b/);
  assert.doesNotMatch(service, /queryParams|encodeSpectatorPayload|\?p=/);

  const live = readFileSync(new URL('./liveBoard.ts', import.meta.url), 'utf8');
  const liveShare = live.slice(live.indexOf('export function formatLiveBoardShare'));
  assert.match(liveShare, /void args\.holes/);
  assert.match(liveShare, /void args\.courseName/);

  const roundShare = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  const liveFn = roundShare.slice(roundShare.indexOf('export async function shareLiveBoard'));
  assert.match(liveFn, /formatLiveBoardShare/);
  assert.doesNotMatch(liveFn, /shareFinalCard|formatFinalCardSummary/);
});
