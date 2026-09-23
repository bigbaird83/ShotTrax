import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';
import { planScorecard } from './scorecard';
import {
  layoutScorecardImage,
  planScorecardImage,
  renderScorecardPng,
  scorecardImageIncludesGps,
  scorecardImageIncludesMap,
  scorecardImageIncludesSpectatorUrl,
  scorecardPngHasSignature,
} from './scorecardImage';

/** Palette indices used by the renderer. */
const BG = 0;
const RED = 6;
const GOOD = 7;

/** Minimal decoder for the renderer's 4-bit palette PNG. */
function decode(png: Uint8Array): { width: number; height: number; at: (x: number, y: number) => number } {
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
      assert.equal(data[8], 4, 'bit depth');
      assert.equal(data[9], 3, 'palette color type');
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil(width / 2);
  assert.equal(raw.length, (stride + 1) * height);
  return {
    width,
    height,
    at: (x, y) => {
      const byte = raw[y * (stride + 1) + 1 + (x >> 1)];
      return x & 1 ? byte & 0x0f : byte >> 4;
    },
  };
}

function cellInks(
  img: ReturnType<typeof decode>,
  x: number,
  y: number,
  w: number,
  h: number,
): Set<number> {
  const inks = new Set<number>();
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) inks.add(img.at(xx, yy));
  }
  return inks;
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
});

test('share image draws a table: ● eagle, ○ birdie, blank par, □ bogey, □□ double, red ! row', () => {
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

  const markX = layout.columns.mark;
  const w = layout.markWidth;
  const h = layout.rowHeight;
  const center = (index: number) => img.at(markX + Math.floor(w / 2), layout.rowTops[index] + Math.floor(h / 2));
  const inks = (index: number) => cellInks(img, markX, layout.rowTops[index], w, h);

  // Birdie: green ring, hollow center.
  assert.ok(inks(0).has(GOOD));
  assert.equal(center(0), BG);
  // Par: nothing drawn.
  assert.deepEqual([...inks(1)], [BG]);
  // Bogey: one red square, hollow.
  assert.ok(inks(2).has(RED));
  assert.equal(center(2), BG);
  // Double: two red squares, gap between them.
  assert.ok(inks(3).has(RED));
  assert.equal(center(3), BG);
  // Eagle: filled green disc.
  assert.equal(center(4), GOOD);
  // Unfinished hole: red outline around the row and a red `!` in the score column, no mark.
  const rowSix = layout.rowTops[5];
  assert.equal(img.at(layout.columns.hole - 10, rowSix), RED);
  assert.ok(cellInks(img, layout.columns.score, rowSix, 40, h).has(RED));
  assert.ok(!inks(5).has(GOOD));
  // Unplayed and unknown-par holes: no mark.
  assert.deepEqual([...inks(6)], [BG]);
  assert.deepEqual([...inks(7)], [BG]);

  // Nothing but pixels: no URL, coordinates, or spectator payload in the bytes.
  const ascii = Buffer.from(png).toString('latin1');
  assert.doesNotMatch(ascii, /lat|lng|shottrax:\/\/|\?p=|http/i);
  assert.doesNotMatch(JSON.stringify(plan), /lat|lng|shottrax:\/\/|\?p=|http/i);
});

test('an 18-hole card fits one image', () => {
  const full = planScorecard(
    Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, score: 4, putts: 2, puttsDone: true, shotCount: 2 })),
  );
  const plan = planScorecardImage({ courseName: 'A very long course name that will not fit on one line', holes: full });
  assert.equal(plan.status, 'Final · E');
  const png = renderScorecardPng(plan);
  const img = decode(png);
  assert.equal(img.height, layoutScorecardImage(plan).height);
  assert.ok(img.height < 1100);
});

test('every Share path renders the table from planScorecard; text message stays short', () => {
  const share = readFileSync(new URL('../services/shareRound.ts', import.meta.url), 'utf8');
  assert.match(share, /planScorecard\(/);
  assert.match(share, /planScorecardImage\(/);
  assert.match(share, /holes: planned\.scorecard/);
  assert.match(share, /penaltyStrokes: totalPenaltyStrokes/);
  assert.match(share, /formatShareScorecard/);
  assert.doesNotMatch(share, /planScorecardImageLines/);
  const image = readFileSync(new URL('./scorecardImage.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(image, /MapView|react-native-maps|expo-location|from '.\/spectator'/);
});
