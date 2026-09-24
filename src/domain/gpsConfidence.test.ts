import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import { clubMarkGpsConfidence, gpsConfidenceFromAccuracyM } from './gpsConfidence';

test('club-mark confidence uses the existing 15 m / 25 m horizontal-accuracy bands', () => {
  assert.equal(SOFT_GPS_MIN_M, 15);
  assert.equal(SOFT_GPS_MAX_M, 25);
  assert.equal(gpsConfidenceFromAccuracyM(0), 'good');
  assert.equal(gpsConfidenceFromAccuracyM(SOFT_GPS_MIN_M - 0.01), 'good');
  assert.equal(gpsConfidenceFromAccuracyM(SOFT_GPS_MIN_M), 'ok');
  assert.equal(gpsConfidenceFromAccuracyM(20), 'ok');
  assert.equal(gpsConfidenceFromAccuracyM(SOFT_GPS_MAX_M), 'ok');
  assert.equal(gpsConfidenceFromAccuracyM(SOFT_GPS_MAX_M + 0.01), 'weak');
  assert.equal(gpsConfidenceFromAccuracyM(80), 'weak');
});

test('missing or invalid accuracy does not invent a confidence cue', () => {
  assert.equal(gpsConfidenceFromAccuracyM(null), null);
  assert.equal(gpsConfidenceFromAccuracyM(undefined), null);
  assert.equal(gpsConfidenceFromAccuracyM(Number.NaN), null);
  assert.equal(gpsConfidenceFromAccuracyM(Number.POSITIVE_INFINITY), null);
  assert.equal(gpsConfidenceFromAccuracyM(-1), null);
});

test('only a GPS club mark with stored start accuracy gets a chip', () => {
  assert.equal(clubMarkGpsConfidence({ source: 'gps', startAccuracyM: 8 }), 'good');
  assert.equal(clubMarkGpsConfidence({ source: 'gps', startAccuracyM: 18 }), 'ok');
  assert.equal(clubMarkGpsConfidence({ source: 'gps', startAccuracyM: 40 }), 'weak');
  assert.equal(clubMarkGpsConfidence({ source: 'gps', startAccuracyM: null }), null);
  assert.equal(clubMarkGpsConfidence({ source: 'placed', startAccuracyM: 8 }), null);
  assert.equal(clubMarkGpsConfidence({ source: 'no_gps', startAccuracyM: 8 }), null);
  assert.equal(clubMarkGpsConfidence({ source: null, startAccuracyM: 8 }), null);
});

test('confidence chip sits on the club-mark pin and does not move it', () => {
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  const start = map.indexOf('{shots.filter(hasGpsStart)');
  const startBlock = map.slice(start, map.indexOf('{closed.map((shot) =>', start));
  assert.match(startBlock, /coordinate=\{toCoord\(shot\.startLat, shot\.startLng\)\}/);
  assert.match(startBlock, /pinColor=\{shot\.endedAt \? 'tomato' : 'yellow'\}/);
  assert.match(startBlock, /anchor=\{\{ x: 0\.5, y: 1 \}\}/);
  assert.match(startBlock, /clubMarkGpsConfidence\(shot\)/);
  assert.match(startBlock, /<GpsConfidenceChip confidence=\{confidence\} \/>/);
  assert.match(startBlock, /styles\.confidenceOnMark/);
  assert.doesNotMatch(startBlock, /endAccuracyM|endLat|endLng/);
  assert.match(map, /confidenceOnMark: \{[\s\S]*paddingBottom: CLUB_MARK_CONFIDENCE_LIFT_PX/);
  assert.doesNotMatch(startBlock, /confidenceLat|offsetLat|nudge/);

  const chip = readFileSync(new URL('../ui/GpsConfidenceChip.tsx', import.meta.url), 'utf8');
  assert.match(chip, /COPY\.gpsConfidenceGood/);
  assert.match(chip, /COPY\.gpsConfidenceOk/);
  assert.match(chip, /COPY\.gpsConfidenceWeak/);
});
