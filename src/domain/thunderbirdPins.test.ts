import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  isThunderbirdPinSheetId,
  loadThunderbirdPinBook,
  parseThunderbirdPinCsv,
  parseThunderbirdPinRow,
  resolveThunderbirdPinSheet,
  thunderbirdDailyPin,
  thunderbirdInventTees,
  thunderbirdMirrorHole,
  thunderbirdPinHoleFor,
  thunderbirdPinSheetFromWeekday,
  thunderbirdSheetLabel,
  thunderbirdTeesStayHardMiss,
  thunderbirdWeekdaysFromDays,
} from './thunderbirdPins';

const csvPath = new URL('../course/hydrates/thunderbird-pin-sheets.csv', import.meta.url);

test('Thunderbird pin ingest keeps real coords only — tees stay HARD-MISS', () => {
  assert.equal(thunderbirdInventTees(), false);
  assert.equal(thunderbirdTeesStayHardMiss(), true);
  assert.equal(thunderbirdMirrorHole(1), 1);
  assert.equal(thunderbirdMirrorHole(10), 1);
  assert.equal(thunderbirdMirrorHole(18), 9);
  assert.equal(isThunderbirdPinSheetId('A'), true);
  assert.equal(isThunderbirdPinSheetId('E'), false);

  const row = parseThunderbirdPinRow({
    hole: 2,
    par: 4,
    white_yds: 365,
    green_center_lat: 35.52,
    green_center_lon: -92.03,
    green_front_lat: 35.519,
    green_front_lon: -92.029,
    green_back_lat: 35.521,
    green_back_lon: -92.031,
    green_depth_yd: 32,
    green_width_yd: 22,
    pin_a_lat: 35.5201,
    pin_a_lon: -92.0301,
    pin_b_lat: 0,
    pin_b_lon: 0,
  });
  assert.equal(row?.hole, 2);
  assert.deepEqual(row?.greenCenter, { lat: 35.52, lng: -92.03 });
  assert.deepEqual(row?.pins.A, { lat: 35.5201, lng: -92.0301 });
  assert.equal(row?.pins.B, null);
  assert.equal(row?.pins.C, null);
  assert.equal('tee' in (row ?? {}), false);

  assert.equal(parseThunderbirdPinRow({ hole: 0, green_center_lat: 35.52, green_center_lon: -92.03 }), null);
  assert.equal(parseThunderbirdPinRow({ hole: 3 }).greenCenter, null);
});

test('Thunderbird weekday → sheet comes from the CSV days column', () => {
  assert.deepEqual(thunderbirdWeekdaysFromDays('Sun / Mon'), [0, 1]);
  assert.deepEqual(thunderbirdWeekdaysFromDays('Tue / Wed'), [2, 3]);
  assert.deepEqual(thunderbirdWeekdaysFromDays('Thu / Fri'), [4, 5]);
  assert.deepEqual(thunderbirdWeekdaysFromDays('Sat / Events'), [6]);
  assert.equal(thunderbirdPinSheetFromWeekday(0), 'A');
  assert.equal(thunderbirdPinSheetFromWeekday(1), 'A');
  assert.equal(thunderbirdPinSheetFromWeekday(2), 'B');
  assert.equal(thunderbirdPinSheetFromWeekday(4), 'C');
  assert.equal(thunderbirdPinSheetFromWeekday(6), 'D');
  assert.equal(thunderbirdPinSheetFromWeekday(7), null);
  assert.equal(resolveThunderbirdPinSheet('C', 0), 'C');
  assert.equal(resolveThunderbirdPinSheet(null, 6), 'D');
  assert.equal(thunderbirdSheetLabel('A'), 'A · Sun / Mon');
});

test('Doc pin-sheet CSV and bundled book match exactly — no averaging, 10–18 mirror 1–9', () => {
  const csv = readFileSync(csvPath, 'utf8');
  const fromCsv = parseThunderbirdPinCsv(csv);
  const book = loadThunderbirdPinBook();
  assert.equal(fromCsv.holes.length, 18);
  assert.equal(book.holes.length, 18);
  assert.deepEqual(book.sheets.A.days, 'Sun / Mon');
  assert.deepEqual(book.sheets.B.days, 'Tue / Wed');
  assert.deepEqual(book.sheets.C.days, 'Thu / Fri');
  assert.deepEqual(book.sheets.D.days, 'Sat / Events');

  const h1 = thunderbirdPinHoleFor(1, book);
  assert.deepEqual(h1?.greenCenter, { lat: 35.52695, lng: -92.03735 });
  assert.deepEqual(h1?.greenFront, { lat: 35.5268675, lng: -92.0374626 });
  assert.deepEqual(h1?.greenBack, { lat: 35.5270325, lng: -92.0372374 });
  assert.equal(h1?.par, 4);
  assert.equal(h1?.whiteYards, 267);
  assert.equal(h1?.greenDepthYards, 30);
  assert.equal(h1?.greenWidthYards, 20);
  assert.deepEqual(h1?.pins.A, { lat: 35.5269366, lng: -92.0374439 });
  assert.deepEqual(thunderbirdDailyPin(1, 'A', book), { lat: 35.5269366, lng: -92.0374439 });
  assert.deepEqual(thunderbirdDailyPin(10, 'B', book), thunderbirdDailyPin(1, 'B', book));

  for (let n = 1; n <= 9; n += 1) {
    const front = book.holes.find((row) => row.hole === n);
    const back = fromCsv.holes.find((row) => row.hole === n + 9);
    assert.ok(front);
    assert.ok(back);
    assert.deepEqual(back, { ...front, hole: n + 9 });
    assert.deepEqual(thunderbirdPinHoleFor(n, book), thunderbirdPinHoleFor(n, fromCsv));
    assert.deepEqual(thunderbirdPinHoleFor(n + 9, book), front);
    assert.equal('tee' in (front ?? {}), false);
  }
});
