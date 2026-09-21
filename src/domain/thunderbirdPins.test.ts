import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isThunderbirdPinSheetId,
  parseThunderbirdPinRow,
  thunderbirdInventTees,
  thunderbirdMirrorHole,
  thunderbirdPinSheetFromWeekday,
  thunderbirdTeesStayHardMiss,
} from './thunderbirdPins';

test('Thunderbird pin ingest keeps real coords only — tees stay HARD-MISS', () => {
  assert.equal(thunderbirdInventTees(), false);
  assert.equal(thunderbirdTeesStayHardMiss(), true);
  assert.equal(thunderbirdMirrorHole(1), 1);
  assert.equal(thunderbirdMirrorHole(10), 1);
  assert.equal(thunderbirdMirrorHole(18), 9);
  assert.equal(thunderbirdPinSheetFromWeekday(0), null);
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
