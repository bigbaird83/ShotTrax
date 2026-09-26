import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { planScorecard } from './scorecard';
import {
  SCORECARD_IMAGE_COLORS,
  layoutScorecardImage,
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
  assert.equal(plan.brand, 'ShotTraxx');
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
