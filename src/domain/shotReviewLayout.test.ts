import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { holeCameraHeading, projectHoleCameraScreen } from './holeCamera';
import { HOLE_MAP_MIN_PAINT_PX } from './mapPaint';
import { PUTTER_CLUB_ID } from './defaultBag';
import { shotPinsForHoleCamera } from './holeCamera';
import { putterOpensPuttSheet } from './putts';
import {
  SHOT_REVIEW_FRAME_EDGE_PAD,
  SHOT_REVIEW_MAP_MIN_HEIGHT,
  SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT,
  shotReviewFramePoints,
  shotReviewHoleHeader,
  shotReviewMapMeetsPaintFloor,
  shotReviewPuttLines,
  shotReviewShotListWindow,
} from './shotReviewLayout';

test('shot review map floor stays paintable and the shot list caps', () => {
  assert.equal(shotReviewMapMeetsPaintFloor(), true);
  assert.ok(SHOT_REVIEW_MAP_MIN_HEIGHT >= HOLE_MAP_MIN_PAINT_PX);
  assert.ok(SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT > 0);
  assert.equal(shotReviewShotListWindow(0), 0);
  assert.equal(shotReviewShotListWindow(-8), 0);
  assert.equal(shotReviewShotListWindow(Number.NaN), 0);
  assert.equal(shotReviewShotListWindow(48), 48);
  assert.equal(shotReviewShotListWindow(SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT), SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT);
  assert.equal(shotReviewShotListWindow(640), SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT);
});

test('shot review frame includes the green and shot pins, with edge padding', () => {
  const tee = { lat: 37, lng: -122 };
  const green = { lat: 37.005, lng: -122 };
  const pinPastGreen = { lat: 37.0054, lng: -122.0004 };
  const sidePin = { lat: 37.002, lng: -122.0012 };
  const framed = shotReviewFramePoints({ tee, green, shotPins: [pinPastGreen, sidePin] });
  assert.ok(framed.some((point) => point.lat === green.lat && point.lng === green.lng));
  assert.ok(framed.some((point) => point.lat === tee.lat && point.lng === tee.lng));
  assert.ok(framed.some((point) => point.lat === pinPastGreen.lat && point.lng === pinPastGreen.lng));
  assert.ok(framed.some((point) => point.lat === sidePin.lat && point.lng === sidePin.lng));

  const heading = holeCameraHeading(tee, green);
  assert.ok(heading != null);
  const center = {
    lat: framed.reduce((sum, point) => sum + point.lat, 0) / framed.length,
    lng: framed.reduce((sum, point) => sum + point.lng, 0) / framed.length,
  };
  const screenOf = (point: { lat: number; lng: number }) => {
    const projected = projectHoleCameraScreen(point, center, heading);
    assert.ok(projected);
    return projected;
  };
  const greenScreen = screenOf(green);
  const pinScreen = screenOf(pinPastGreen);
  const sideScreen = screenOf(sidePin);
  const chipScreen = screenOf({
    lat: (tee.lat + green.lat) / 2,
    lng: (tee.lng + green.lng) / 2,
  });
  const bounds = framed.map((point) => screenOf(point));
  const minX = Math.min(...bounds.map((point) => point.x));
  const maxX = Math.max(...bounds.map((point) => point.x));
  const minY = Math.min(...bounds.map((point) => point.y));
  const maxY = Math.max(...bounds.map((point) => point.y));
  const ySpan = Math.max(...[green, tee, pinPastGreen, sidePin].map((point) => screenOf(point).y))
    - Math.min(...[green, tee, pinPastGreen, sidePin].map((point) => screenOf(point).y));
  const pad = ySpan * SHOT_REVIEW_FRAME_EDGE_PAD;
  for (const marker of [greenScreen, pinScreen, sideScreen, chipScreen]) {
    assert.ok(marker.y - minY >= pad * 0.9);
    assert.ok(maxY - marker.y >= pad * 0.9);
    assert.ok(marker.x - minX >= pad * 0.9);
    assert.ok(maxX - marker.x >= pad * 0.9);
  }
});

test('shot review frame does not invent a green', () => {
  const tee = { lat: 37, lng: -122 };
  const pin = { lat: 37.002, lng: -122.0003 };
  const missing = shotReviewFramePoints({ tee, green: null, shotPins: [pin] });
  assert.ok(missing.some((point) => point.lat === pin.lat && point.lng === pin.lng));
  assert.equal(
    missing.some((point) => point.lat === 37.005),
    false,
  );
  const invalid = shotReviewFramePoints({
    tee,
    green: { lat: 0, lng: 0 },
    shotPins: [pin],
  });
  assert.equal(
    invalid.some((point) => point.lat === 0 && point.lng === 0),
    false,
  );
  assert.deepEqual(shotReviewFramePoints({ tee: null, green: null, shotPins: [] }), []);
  assert.deepEqual(shotReviewFramePoints({ tee: null, green: { lat: Number.NaN, lng: -122 }, shotPins: [] }), []);
});

test('shot review screen flexes the map and pins the bottom section', () => {
  const page = readFileSync(new URL('../../app/review/[id]/shots.tsx', import.meta.url), 'utf8');
  const jsx = page.slice(page.indexOf('<Screen scroll={false}>'), page.indexOf('function ReviewShotList'));
  const styles = page.slice(page.indexOf('function makeStyles'));

  assert.match(page, /SHOT_REVIEW_MAP_MIN_HEIGHT/);
  assert.match(page, /SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT/);
  assert.match(page, /shotReviewShotListWindow/);
  assert.match(jsx, /<Screen scroll=\{false\}>/);
  assert.match(jsx, /testID="shot-review-map"/);
  assert.match(page, /testID="shot-review-shots"/);
  assert.match(jsx, /testID="shot-review-bottom"/);
  assert.match(jsx, /style=\{styles\.mapFill\}/);
  assert.match(jsx, /shotReviewFramePoints\(\{ tee, green, shotPins \}\)/);
  assert.doesNotMatch(jsx, /framePoints=\{camera\.points/);
  assert.match(jsx, /<ReviewShotList/);
  assert.ok(jsx.indexOf('styles.mapSlot') < jsx.indexOf('styles.bottom'));
  assert.ok(jsx.indexOf('<ReviewShotList') < jsx.indexOf('styles.nav'));
  assert.match(styles, /mapSlot:\s*\{[^}]*flex:\s*1/);
  assert.match(styles, /mapFill:\s*\{[^}]*flex:\s*1/);
  assert.match(styles, /height:\s*'100%'/);
  assert.match(styles, /bottom:\s*\{[^}]*flexGrow:\s*0/);
  assert.match(styles, /maxHeight:\s*SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT/);
  assert.match(styles, /minHeight:\s*SHOT_REVIEW_MAP_MIN_HEIGHT/);
  assert.doesNotMatch(page, /height:\s*236/);
  assert.match(page, /useColors\(\)/);
  assert.match(page, /cardBorder\(colors\)/);
  assert.doesNotMatch(page, /#[0-9A-Fa-f]{3,8}/);
  assert.doesNotMatch(page, /useLiveFix/);
  assert.match(page, /lockHoleCamera/);
  assert.match(page, /phone:\s*null/);
  assert.match(jsx, /userFix=\{null\}/);
  assert.match(jsx, /lockFrame/);
  assert.match(page, /shotPinsForHoleCamera/);
});

test('shot review appends putt rows after the GPS shots, no pins added', () => {
  const shots = [
    { startLat: 37, startLng: -122, endLat: 37.002, endLng: -122 },
    { startLat: 37.002, startLng: -122, endLat: 37.0045, endLng: -122 },
  ];
  const hole = {
    number: 2,
    par: 4,
    score: 4,
    puttsDone: true,
    putts: 2,
    puttLengths: ['3_to_10', 'inside_3'],
  };
  const pinsBefore = shotPinsForHoleCamera(shots);
  const lines = shotReviewPuttLines(hole);
  assert.deepEqual(lines, ['Putt 1 · 3–10', 'Putt 2 · Under 3 ft']);
  assert.deepEqual(shotPinsForHoleCamera(shots), pinsBefore);
  assert.equal(pinsBefore.length, 4);
  assert.equal(shotReviewHoleHeader(hole), 'Par 4 · Hole 2 · Score 4 · 2 putts');
});

test('shot review putt with no bucket reads No length and never a yard number', () => {
  const hole = { number: 5, par: 3, score: 3, puttsDone: true, putts: 1, puttLengths: [] };
  const lines = shotReviewPuttLines(hole);
  assert.deepEqual(lines, ['Putt 1 · No length']);
  assert.ok(lines.every((line) => !/\d+\s*yd/.test(line)));
  assert.equal(shotReviewHoleHeader(hole), 'Par 3 · Hole 5 · Score 3 · 1 putt');
});

test('shot review adds nothing for Hole Out with zero putts or an unfinished hole', () => {
  assert.deepEqual(shotReviewPuttLines({ puttsDone: true, putts: 0, puttLengths: [] }), []);
  assert.deepEqual(
    shotReviewPuttLines({ puttsDone: false, putts: 2, puttLengths: ['inside_3', 'inside_3'] }),
    [],
  );
  assert.equal(
    shotReviewHoleHeader({ number: 7, par: 4, score: 3, puttsDone: true, putts: 0, puttLengths: [] }),
    'Par 4 · Hole 7 · Score 3',
  );
  assert.equal(
    shotReviewHoleHeader({ number: 8, par: null, score: null, puttsDone: false, putts: 0, puttLengths: [] }),
    'Par unknown · Hole 8',
  );
});

test('shot review screen keeps putts off the map and the putter off GPS marks', () => {
  assert.equal(putterOpensPuttSheet({ clubId: PUTTER_CLUB_ID }), true);
  const src = readFileSync(new URL('../../app/review/[id]/shots.tsx', import.meta.url), 'utf8');
  assert.match(src, /shotReviewPuttLines\(hole\)/);
  assert.match(src, /shotReviewHoleHeader\(hole\)/);
  // HoleMap only gets the GPS shots; putt lines feed the list, never the map.
  assert.match(src, /shots=\{shots\}/);
  assert.doesNotMatch(src, /shotPinsForHoleCamera\([^)]*putt/i);
  assert.doesNotMatch(src, /<HoleMap[^>]*putt/is);
});
