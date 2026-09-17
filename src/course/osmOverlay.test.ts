import assert from 'node:assert/strict';
import { test } from 'node:test';
import { featuresForHole, fetchOsmOverlay, parseOverpassOverlay } from './osmOverlay';

test('parseOverpassOverlay maps golf=green/fairway/tee/hole and ignores other tags', () => {
  const overlay = parseOverpassOverlay({
    elements: [
      {
        type: 'way',
        tags: { golf: 'green', ref: '1' },
        geometry: [
          { lat: 37.01, lon: -86.43 },
          { lat: 37.011, lon: -86.431 },
          { lat: 37.012, lon: -86.43 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'fairway', ref: '1' },
        geometry: [
          { lat: 37.008, lon: -86.429 },
          { lat: 37.01, lon: -86.43 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'tee', ref: '2' },
        geometry: [
          { lat: 37.02, lon: -86.44 },
          { lat: 37.021, lon: -86.441 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'bunker' },
        geometry: [
          { lat: 37.01, lon: -86.43 },
          { lat: 37.011, lon: -86.431 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'hole', ref: '1', par: '5' },
        geometry: [
          { lat: 37.008, lon: -86.429 },
          { lat: 37.011, lon: -86.431 },
        ],
      },
    ],
  });
  assert.ok(overlay);
  assert.equal(overlay?.source, 'osm');
  assert.equal(overlay?.features.length, 4);
  assert.equal(overlay?.features.some((f) => f.kind === 'green' && f.holeNumber === 1), true);
  assert.equal(overlay?.features.some((f) => f.kind === 'hole' && f.holeNumber === 1), true);
  // OSM par tags are not used as course par.
  assert.equal(overlay?.features.every((f) => f.kind !== 'bunker'), true);
});

test('parseOverpassOverlay returns null when OSM has nothing — never invents', () => {
  assert.equal(parseOverpassOverlay({ elements: [] }), null);
  assert.equal(parseOverpassOverlay({}), null);
});

test('featuresForHole prefers ref-tagged features, else unnumbered, else empty', () => {
  const overlay = parseOverpassOverlay({
    elements: [
      {
        type: 'way',
        tags: { golf: 'green', ref: '3' },
        geometry: [
          { lat: 37.01, lon: -86.43 },
          { lat: 37.011, lon: -86.431 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'fairway' },
        geometry: [
          { lat: 37.0, lon: -86.4 },
          { lat: 37.001, lon: -86.401 },
        ],
      },
    ],
  });
  assert.ok(overlay);
  const hole3 = featuresForHole(overlay, 3);
  assert.equal(hole3.length, 1);
  assert.equal(hole3[0].kind, 'green');
  const hole1 = featuresForHole(overlay, 1);
  assert.equal(hole1.length, 1);
  assert.equal(hole1[0].kind, 'fairway');
  assert.equal(hole1[0].holeNumber, null);
});

test('fetchOsmOverlay returns null on Overpass failure — graceful empty overlay', async () => {
  const overlay = await fetchOsmOverlay(
    { location: { lat: 37.01, lng: -86.43 }, holeNumber: 1 },
    {
      fetch: async () => new Response('nope', { status: 504 }),
    },
  );
  assert.equal(overlay, null);
});

test('fetchOsmOverlay POSTs around a real pin and returns parsed features', async () => {
  let method: string | undefined;
  let url = '';
  let body = '';
  const overlay = await fetchOsmOverlay(
    { location: { lat: 37.01, lng: -86.43 }, holeNumber: 1 },
    {
      fetch: async (input, init) => {
        url = String(input);
        method = init?.method;
        body = decodeURIComponent(String(init?.body ?? ''));
        return new Response(
          JSON.stringify({
            elements: [
              {
                type: 'way',
                tags: { golf: 'green', ref: '1' },
                geometry: [
                  { lat: 37.01, lon: -86.43 },
                  { lat: 37.011, lon: -86.431 },
                  { lat: 37.012, lon: -86.43 },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    },
  );
  assert.match(url, /overpass/);
  assert.equal(method, 'POST');
  assert.match(body, /\["golf"="green"\]/);
  assert.match(body, /\["golf"="fairway"\]/);
  assert.match(body, /\["golf"="tee"\]/);
  assert.match(body, /\["golf"="hole"\]/);
  assert.ok(overlay);
  assert.equal(overlay?.features[0].kind, 'green');
});
