import assert from 'node:assert/strict';
import { test } from 'node:test';
import { METERS_PER_YARD } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';

test('haversineYards: 100 m due north is about 109 yards', () => {
  const start = { lat: 37.0, lng: -122.0 };
  const meters = 100;
  const dLat = meters / 111_320;
  const yards = haversineYards(start, { lat: start.lat + dLat, lng: start.lng });
  const expected = meters / METERS_PER_YARD;
  assert.ok(Math.abs(yards - expected) < 0.5, `got ${yards}, expected ~${expected}`);
});

test('haversineYards: identical points are 0', () => {
  const p = { lat: 36.5, lng: -121.9 };
  assert.equal(roundYards(haversineYards(p, p)), 0);
});

test('roundYards rounds to nearest yard', () => {
  assert.equal(roundYards(162.4), 162);
  assert.equal(roundYards(162.5), 163);
});
