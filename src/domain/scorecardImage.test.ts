import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { DEFAULT_GROUP_GAMES, formatMatchLine, planGroupGames, type GroupHoleIn, type GroupPlayerIn } from './groupGames';
import { planGroupScorecard } from './groupScorecard';
import { COPY } from './playerCopy';
import { planScorecard } from './scorecard';
import {
  SCORECARD_IMAGE_COLORS,
  layoutGroupScorecardImage,
  layoutScorecardImage,
  planGroupScorecardImage,
  planScorecardImage,
  renderScorecardPng,
  scorecardImageIncludesGps,
  scorecardImageIncludesMap,
  scorecardImageIncludesSpectatorUrl,
  scorecardPngHasSignature,
} from './scorecardImage';

type Rgb = { r: number; g: number; b: number };
const same = (a: Rgb, b: Rgb) => a.r === b.r && a.g === b.g && a.b === b.b;
const { good: GOOD, red: RED } = SCORECARD_IMAGE_COLORS;

/** Minimal decoder for the renderer's 8-bit RGB PNG (None / Up filters). */
function decode(png: Uint8Array): { width: number; height: number; at: (x: number, y: number) => Rgb } {
  const buf = Buffer.from(png);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'bit depth');
      assert.equal(data[9], 2, 'truecolor');
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  assert.equal(raw.length, (stride + 1) * height);
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter === 0 || filter === 2, `filter ${filter}`);
    for (let x = 0; x < stride; x += 1) {
      const above = filter === 2 && y > 0 ? px[(y - 1) * stride + x] : 0;
      px[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + above) & 0xff;
    }
  }
  return {
    width,
    height,
    at: (x, y) => {
      const i = y * stride + x * 3;
      return { r: px[i], g: px[i + 1], b: px[i + 2] };
    },
  };
}

function cellHas(img: ReturnType<typeof decode>, cell: { x: number; y: number; w: number; h: number }, ink: Rgb): boolean {
  for (let yy = cell.y; yy < cell.y + cell.h; yy += 1) {
    for (let xx = cell.x; xx < cell.x + cell.w; xx += 1) if (same(img.at(xx, yy), ink)) return true;
  }
  return false;
}

// 1 birdie, 2 par, 3 bogey, 4 double, 5 eagle, 6 left without Made it, 7 unplayed, 8 unknown par.
const rows = planScorecard(
  [
    { number: 1, par: 4, score: 3, putts: 1, puttsDone: true, shotCount: 2 },
    { number: 2, par: 4, score: 4, putts: 2, puttsDone: true, shotCount: 2 },
    { number: 3, par: 3, score: 4, putts: 2, puttsDone: true, shotCount: 2 },
    { number: 4, par: 5, score: 7, putts: 3, puttsDone: true, shotCount: 4 },
    { number: 5, par: 4, score: 2, putts: 0, puttsDone: true, shotCount: 2 },
    { number: 6, par: 4, score: null, putts: 0, puttsDone: false, shotCount: 3 },
    { number: 7, par: 3, score: null, putts: 0, puttsDone: false },
    { number: 8, par: null, score: 5, putts: 2, puttsDone: true, shotCount: 3 },
  ],
  { currentHoleNumber: 7 },
);

test('share image plan mirrors the in-app scorecard: Hole, Par, Score, Putts, mark', () => {
  const plan = planScorecardImage({ courseName: '  Magnolia  ', holes: rows });
  assert.equal(plan.brand, 'ShotTraxx™');
  assert.equal(plan.courseName, 'Magnolia');
  assert.equal(plan.total, '25');
  // To-par only counts holes with a known par: -1, 0, +1, +2, -2 → E.
  assert.equal(plan.status, 'Thru 6 · E');
  assert.equal(plan.progress, 'Thru 6');
  assert.equal(plan.toPar, 'E');
  assert.equal(plan.toParValue, 0);
  assert.deepEqual(plan.stats, { putts: '10', underPar: 2, pars: 1, overPar: 2 });
  assert.deepEqual(
    plan.rows.map(({ hole, par, score, putts, mark, incomplete }) => [hole, par, score, putts, mark, incomplete]),
    [
      [1, '4', '3', '1', 'birdie', false],
      [2, '4', '4', '2', 'par', false],
      [3, '3', '4', '2', 'bogey', false],
      [4, '5', '7', '3', 'double', false],
      [5, '4', '2', '0', 'eagle', false],
      [6, '4', '!', '', null, true],
      [7, '3', '', '', null, false],
      [8, '', '5', '2', null, false],
    ],
  );

  const final = planScorecardImage({ courseName: null, holes: rows, finished: true });
  assert.equal(final.courseName, 'Round');
  assert.equal(final.status, 'Final · E');

  const noPar = planScorecardImage({
    holes: planScorecard([{ number: 1, par: null, score: 5, putts: 2, puttsDone: true, shotCount: 3 }]),
  });
  assert.equal(noPar.status, 'Final');
  assert.equal(noPar.total, '5');

  const empty = planScorecardImage({ holes: planScorecard([{ number: 1, par: 4, score: null, putts: 0 }]) });
  assert.equal(empty.total, '—');
  assert.equal(empty.status, 'Thru 0');
  assert.equal(empty.toPar, null);
  assert.equal(empty.stats.putts, '—');
});

test('share image draws a card: ● eagle, ○ birdie, blank par, □ bogey, nested □ double, red ! cell', () => {
  assert.equal(scorecardImageIncludesGps(), false);
  assert.equal(scorecardImageIncludesMap(), false);
  assert.equal(scorecardImageIncludesSpectatorUrl(), false);

  const plan = planScorecardImage({ courseName: 'Magnolia', holes: rows });
  const png = renderScorecardPng(plan);
  assert.equal(scorecardPngHasSignature(png), true);
  assert.ok(png.length < 400_000, `png is ${png.length} bytes`);

  const layout = layoutScorecardImage(plan);
  const img = decode(png);
  assert.equal(img.width, layout.width);
  assert.equal(img.height, layout.height);
  assert.equal(layout.blocks.length, 1);
  assert.equal(layout.blocks[0].label, 'TOT');
  assert.equal(layout.scoreCells.length, plan.rows.length);

  const cell = (index: number) => layout.scoreCells[index];
  const cx = (index: number) => cell(index).x + Math.floor(cell(index).w / 2);
  const cy = (index: number) => cell(index).y + Math.floor(cell(index).h / 2);
  /** Pixel `dx` left of the cell center, on the center line. */
  const left = (index: number, dx: number) => img.at(cx(index) - dx, cy(index));

  // Birdie: green ring, hollow inside.
  assert.ok(cellHas(img, cell(0), GOOD));
  assert.ok(same(left(0, 25), GOOD));
  assert.ok(!same(left(0, 20), GOOD));
  // Par: nothing drawn around the score.
  assert.ok(!cellHas(img, cell(1), GOOD) && !cellHas(img, cell(1), RED));
  // Bogey: one red square, hollow; nothing outside it.
  assert.ok(same(left(2, 24), RED));
  assert.ok(!same(left(2, 20), RED));
  assert.ok(!cellHas(img, { x: cx(2) - 34, y: cy(2) - 2, w: 6, h: 4 }, RED));
  // Double: a second, outer square around the first.
  assert.ok(cellHas(img, { x: cx(3) - 34, y: cy(3) - 2, w: 6, h: 4 }, RED));
  assert.ok(cellHas(img, { x: cx(3) - 24, y: cy(3) - 2, w: 4, h: 4 }, RED));
  // Eagle: filled green disc.
  assert.ok(same(left(4, 20), GOOD));
  assert.ok(same(img.at(cx(4), cy(4) - 22), GOOD));
  // Unfinished hole: red outline in the cell and a red `!`, no mark.
  assert.ok(same(img.at(cell(5).x + 7, cy(5)), RED));
  assert.ok(cellHas(img, { x: cx(5) - 6, y: cy(5) - 16, w: 12, h: 32 }, RED));
  assert.ok(!cellHas(img, cell(5), GOOD));
  // Unplayed and unknown-par holes: no mark.
  for (const index of [6, 7]) assert.ok(!cellHas(img, cell(index), GOOD) && !cellHas(img, cell(index), RED));

  // Nothing but pixels: no URL, coordinates, or spectator payload in the bytes.
  const ascii = Buffer.from(png).toString('latin1');
  assert.doesNotMatch(ascii, /lat|lng|shottrax:\/\/|\?p=|http/i);
  assert.doesNotMatch(JSON.stringify(plan), /lat|lng|shottrax:\/\/|\?p=|http/i);
});

test('an 18-hole card fits one image with OUT / IN nines', () => {
  const full = planScorecard(
    Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, score: 4, putts: 2, puttsDone: true, shotCount: 2 })),
  );
  const plan = planScorecardImage({ courseName: 'A very long course name that will not fit on one line', holes: full });
  assert.equal(plan.status, 'Final · E');
  const png = renderScorecardPng(plan);
  const img = decode(png);
  const layout = layoutScorecardImage(plan);
  assert.equal(img.height, layout.height);
  assert.deepEqual(layout.blocks.map((block) => block.label), ['OUT', 'IN']);
  assert.deepEqual(layout.blocks.map((block) => block.rows.length), [9, 9]);
  assert.ok(img.height < 1200);
  assert.ok(png.length < 400_000, `png is ${png.length} bytes`);
});

function groupHoles(n: number, par: number | null = 4): GroupHoleIn[] {
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, par, strokeIndex: i + 1 }));
}

function groupPlayer(name: string, scores: (number | null)[], handicap: number | null = null): GroupPlayerIn {
  return { id: name, name, handicap, scores: Object.fromEntries(scores.map((score, i) => [i + 1, score])) };
}

const NO_FORMAT = {
  net: false,
  skins: false,
  skinsCarry: true,
  stableford: false,
  matchPlay: false,
  nassau: false,
  matchPlayerIds: null,
};

test('whole-group image uses the group scorecard numbers: owner, then partners, blanks never 0', () => {
  const holes = groupHoles(18);
  const you = [4, 5, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, null];
  const sam = [3, 5, null, ...Array<number | null>(15).fill(null)];
  const players = [groupPlayer('You', you, 4), groupPlayer('Sam', sam, 10), groupPlayer('Pat', [6], 12)];
  const settings = NO_FORMAT;
  const card = planGroupScorecard({ holes, players, result: planGroupGames({ holes, players, settings }) });
  const model = planGroupScorecardImage({ holes, players, settings });
  assert.deepEqual(
    model.players.map((player) => player.name),
    ['You', 'Sam', 'Pat'],
  );
  assert.deepEqual(model.holeNumbers, holes.map((hole) => hole.number));
  const text = (label: 'Out' | 'In' | 'Total', index: number) => {
    const strokes = card.totals.find((entry) => entry.label === label)?.cells[index]?.strokes;
    return strokes == null ? '' : String(strokes);
  };
  model.players.forEach((player, index) => {
    assert.equal(player.out, text('Out', index));
    assert.equal(player.in, text('In', index));
    assert.equal(player.total, text('Total', index));
    assert.deepEqual(
      player.scores,
      [...card.front, ...card.back].map((row) => {
        const score = row.cells[index]?.score;
        return score == null ? '' : String(score);
      }),
    );
  });
  assert.equal(model.players[0].scores[17], '');
  assert.equal(model.players[1].scores[2], '');
  assert.equal(model.players[2].in, '');
  assert.ok(model.players.every((player) => player.scores.every((score) => score !== '0')));
  assert.equal(model.results, null);

  const withZero = planGroupScorecardImage({
    holes: groupHoles(9),
    players: [groupPlayer('You', [4, null, 3]), groupPlayer('Sam', [0, 5, null])],
    settings,
  });
  assert.equal(withZero.players[0].scores[1], '');
  assert.equal(withZero.players[1].scores[0], '');
  assert.equal(withZero.players[1].scores[2], '');
  assert.ok(withZero.players.every((player) => player.scores.every((score) => score !== '0')));
  assert.equal(withZero.players[0].out, null);
  assert.equal(withZero.players[0].in, null);
  assert.equal(withZero.players[1].total, '5');
});

test('a 9-hole group image has Total and no Out or In', () => {
  const holes = groupHoles(9);
  const players = [groupPlayer('You', Array(9).fill(4)), groupPlayer('Sam', [5, 5, 5, 5, 5, 5, 5, 5, 5])];
  const model = planGroupScorecardImage({ holes, players, settings: NO_FORMAT });
  assert.equal(model.players[0].out, null);
  assert.equal(model.players[0].in, null);
  assert.equal(model.players[0].total, '36');
  const layout = layoutGroupScorecardImage(model);
  assert.equal(layout.blocks.length, 1);
  assert.deepEqual(layout.blocks[0].holeNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(!layout.blocks[0].columns.some((column) => column.kind === 'out' || column.kind === 'in'));
  assert.ok(layout.blocks[0].columns.some((column) => column.kind === 'total' && column.label === 'Total'));
});

test('results block is present only when a format is on, and a blank handicap blocks net', () => {
  const holes = groupHoles(18);
  const players = [groupPlayer('You', Array(18).fill(4), 2), groupPlayer('Sam', Array(18).fill(5), 8)];
  assert.equal(planGroupScorecardImage({ holes, players, settings: NO_FORMAT }).results, null);
  assert.equal(planGroupScorecardImage({ holes, players, settings: { ...NO_FORMAT, net: true } }).results, null);

  const settings = { ...DEFAULT_GROUP_GAMES, net: true, stableford: true, matchPlay: true, nassau: true };
  const result = planGroupGames({ holes, players, settings });
  const model = planGroupScorecardImage({ holes, players, settings });
  assert.equal(model.net, true);
  assert.equal(model.netBlocked, false);
  assert.ok(model.results);
  assert.deepEqual(
    model.results?.map((block) => block.title),
    [COPY.groupLeaderboardNet, COPY.groupSkins, COPY.groupStableford, COPY.groupMatchPlay, COPY.groupNassau],
  );
  const nameOf = (id: string) => players.find((player) => player.id === id)?.name ?? '—';
  const lines = model.results?.flatMap((block) => block.lines) ?? [];
  assert.ok(result.match && lines.includes(formatMatchLine(result.match, nameOf)));
  assert.ok(lines.some((line) => line.includes(`${result.stableford?.[0]?.points} pts`)));
  assert.ok(result.nassau && lines.some((line) => line.includes(`Front 9  ${formatMatchLine(result.nassau.front, nameOf)}`)));
  const sam = result.strokePlay.find((row) => row.playerId === 'Sam');
  assert.ok(sam && sam.net !== sam.gross);
  assert.equal(model.players[1].scores[0], '5');
  assert.ok(lines.some((line) => line.includes('Sam') && line.endsWith(`· ${sam?.net}`)));

  const blockedHoles = groupHoles(9);
  const blockedPlayers = [groupPlayer('You', Array(9).fill(4), 8), groupPlayer('Sam', [5, 6, 4, 4, 4, 4, 4, 4, 4], null)];
  const blockedResult = planGroupGames({ holes: blockedHoles, players: blockedPlayers, settings: { ...DEFAULT_GROUP_GAMES, net: true } });
  const blocked = planGroupScorecardImage({
    holes: blockedHoles,
    players: blockedPlayers,
    settings: { ...DEFAULT_GROUP_GAMES, net: true },
  });
  assert.equal(blocked.net, false);
  assert.equal(blocked.netBlocked, true);
  assert.equal(blocked.results?.[0]?.title, COPY.groupLeaderboard);
  assert.ok(blocked.results?.[0]?.lines.includes(COPY.groupNetNeedsHandicaps));
  const blockedSam = blockedResult.strokePlay.find((row) => row.playerId === 'Sam');
  assert.equal(blockedSam?.net, blockedSam?.gross);
  assert.equal(blocked.players[1].scores[0], '5');
  assert.ok(blocked.results?.[0]?.lines.some((line) => line.includes('Sam') && line.endsWith(`· ${blockedSam?.gross}`)));
});

test('Just me matches today\'s scorecard plan even when partners are on the round', () => {
  const group = {
    holes: groupHoles(9),
    players: [groupPlayer('You', Array(9).fill(4), 4), groupPlayer('Sam', Array(9).fill(5), 10)],
    settings: DEFAULT_GROUP_GAMES,
  };
  const today = planScorecardImage({ courseName: 'Magnolia', holes: rows, finished: true });
  const justMe = planScorecardImage({ courseName: 'Magnolia', holes: rows, finished: true, audience: 'me', group });
  const omitted = planScorecardImage({ courseName: 'Magnolia', holes: rows, finished: true, group });
  assert.deepEqual(justMe, today);
  assert.deepEqual(omitted, today);
  assert.equal(justMe.group, undefined);

  const whole = planScorecardImage({ courseName: 'Magnolia', holes: rows, finished: true, audience: 'group', group });
  assert.equal(whole.courseName, today.courseName);
  assert.deepEqual(whole.rows, today.rows);
  assert.deepEqual(whole.group?.players.map((player) => player.name), ['You', 'Sam']);
});

test('group scorecard layout stays readable at 1, 2, and 4 players for 9 and 18 holes', () => {
  const heights: number[] = [];
  for (const count of [1, 2, 4]) {
    for (const holeCount of [9, 18]) {
      const players = Array.from({ length: count }, (_, i) => groupPlayer(`P${i + 1}`, Array(holeCount).fill(4), i));
      const model = planGroupScorecardImage({ holes: groupHoles(holeCount), players, settings: NO_FORMAT });
      const layout = layoutGroupScorecardImage(model);
      heights.push(layout.height);
      assert.equal(layout.width, 1080);
      assert.equal(layout.blocks.length, holeCount === 18 ? 2 : 1);
      assert.equal(layout.results, null);
      for (const block of layout.blocks) {
        assert.equal(block.rows.length, count);
        assert.ok(block.rows.every((row) => row.h >= 48));
        const name = block.columns.find((column) => column.kind === 'name');
        assert.ok(name && name.w >= 160);
        const holes = block.columns.filter((column) => column.kind === 'hole');
        assert.ok(holes.length >= 1 && holes.every((column) => column.w >= 64));
        const sorted = [...block.columns].sort((a, b) => a.x - b.x);
        for (let i = 1; i < sorted.length; i += 1) {
          assert.ok(sorted[i].x >= sorted[i - 1].x + sorted[i - 1].w - 0.01);
        }
        const right = sorted[sorted.length - 1].x + sorted[sorted.length - 1].w;
        assert.ok(right <= layout.width - 56 + 1);
        for (let i = 1; i < block.rows.length; i += 1) {
          assert.ok(block.rows[i].y >= block.rows[i - 1].y + block.rows[i - 1].h - 0.01);
        }
      }
      if (holeCount === 9) {
        assert.deepEqual(layout.blocks[0].holeNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.ok(!layout.blocks[0].columns.some((column) => column.kind === 'in' || column.kind === 'out'));
        assert.equal(layout.blocks[0].columns.filter((column) => column.kind === 'total').length, 1);
      } else {
        assert.deepEqual(layout.blocks[0].holeNumbers, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
        assert.deepEqual(layout.blocks[1].holeNumbers, [10, 11, 12, 13, 14, 15, 16, 17, 18]);
        assert.ok(layout.blocks[0].columns.some((column) => column.kind === 'out'));
        assert.ok(!layout.blocks[0].columns.some((column) => column.kind === 'in' || column.kind === 'total'));
        assert.ok(layout.blocks[1].columns.some((column) => column.kind === 'in'));
        assert.ok(layout.blocks[1].columns.some((column) => column.kind === 'total'));
        assert.ok(layout.blocks[1].top >= layout.blocks[0].top + layout.blocks[0].height);
      }
    }
  }
  const oneNine = heights[0];
  const fourEighteen = heights[heights.length - 1];
  assert.ok(fourEighteen > oneNine);

  const withResults = layoutGroupScorecardImage(
    planGroupScorecardImage({
      holes: groupHoles(18),
      players: [groupPlayer('You', Array(18).fill(4)), groupPlayer('Sam', Array(18).fill(5))],
      settings: DEFAULT_GROUP_GAMES,
    }),
  );
  assert.ok(withResults.results);
  const noResults = layoutGroupScorecardImage(
    planGroupScorecardImage({
      holes: groupHoles(18),
      players: [groupPlayer('You', Array(18).fill(4)), groupPlayer('Sam', Array(18).fill(5))],
      settings: NO_FORMAT,
    }),
  );
  assert.equal(noResults.results, null);
  assert.ok(withResults.height > noResults.height);
});

test('whole-group png renders the layout and stays a local image', () => {
  const players = [groupPlayer('You', Array(9).fill(4), 4), groupPlayer('Sam', [5, null, 4, 4, 4, 4, 4, 4, 3], 10)];
  const plan = planScorecardImage({
    courseName: 'Magnolia',
    holes: planScorecard(Array.from({ length: 9 }, (_, i) => ({ number: i + 1, par: 4, score: 4, putts: 2, puttsDone: true, shotCount: 2 }))),
    finished: true,
    audience: 'group',
    group: { holes: groupHoles(9), players, settings: DEFAULT_GROUP_GAMES },
  });
  assert.ok(plan.group);
  const png = renderScorecardPng(plan);
  assert.equal(scorecardPngHasSignature(png), true);
  const layout = layoutGroupScorecardImage(plan.group);
  const img = decode(png);
  assert.equal(img.width, layout.width);
  assert.equal(img.height, layout.height);
  assert.equal(layout.width, 1080);
  const ascii = Buffer.from(png).toString('latin1');
  assert.doesNotMatch(ascii, /http|shottrax:\/\/|\?p=/i);
});

test('every Share path renders the table from planScorecard; text message stays short', () => {
  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  const scoreboard = readFileSync(new URL('../services/roundScoreboard.ts', import.meta.url), 'utf8');
  assert.match(scoreboard, /planScorecard\(/);
  assert.match(share, /planScorecardImage\(/);
  assert.match(share, /holes: planned\.scorecard/);
  assert.match(scoreboard, /penaltyStrokes: totalPenaltyStrokes/);
  assert.match(scoreboard, /formatShareScorecard/);
  assert.doesNotMatch(share + scoreboard, /planScorecardImageLines/);
  const image = readFileSync(new URL('./scorecardImage.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(image, /MapView|react-native-maps|expo-location|from '.\/spectator'/);
});
