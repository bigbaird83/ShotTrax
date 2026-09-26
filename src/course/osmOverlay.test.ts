import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cachedOsmOverlay,
  cachedResolvedTee,
  featuresForHole,
  fetchOsmOverlay,
  fillLayoutTeesFromOsm,
  osmFeatureRendersAsLine,
  parseOverpassOverlay,
  rememberOsmOverlay,
  rememberResolvedTee,
  resolveOverlayTee,
  teePointForHole,
  teePointFromFairway,
  teePointFromHoleFeature,
} from './osmOverlay';

test('parseOverpassOverlay maps golf=green/fairway/tee/hole and ignores non-overlay tags', () => {
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
        tags: { golf: 'pin' },
        geometry: [
          { lat: 37.01, lon: -86.43 },
          { lat: 37.011, lon: -86.431 },
        ],
      },
      {
        type: 'way',
        tags: { highway: 'service' },
        geometry: [
          { lat: 37.009, lon: -86.428 },
          { lat: 37.010, lon: -86.429 },
        ],
      },
      {
        type: 'way',
        tags: { natural: 'water', water: 'pond' },
        geometry: [
          { lat: 37.007, lon: -86.427 },
          { lat: 37.008, lon: -86.428 },
          { lat: 37.007, lon: -86.429 },
          { lat: 37.007, lon: -86.427 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'hazard' },
        geometry: [
          { lat: 37.006, lon: -86.426 },
          { lat: 37.007, lon: -86.427 },
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
  // OSM par tags are not used as course par. Pins, bare service roads, bare water, and golf=hazard are not overlays.
  assert.equal(
    overlay?.features.every(
      (f) => f.kind === 'green' || f.kind === 'fairway' || f.kind === 'tee' || f.kind === 'hole',
    ),
    true,
  );
});

test('parseOverpassOverlay maps bunker, water hazard, and cartpath only when OSM tags them', () => {
  const bunker = [
    { lat: 37.01, lon: -86.43 },
    { lat: 37.011, lon: -86.431 },
    { lat: 37.012, lon: -86.43 },
    { lat: 37.01, lon: -86.43 },
  ];
  const water = [
    { lat: 37.02, lon: -86.44 },
    { lat: 37.021, lon: -86.441 },
    { lat: 37.022, lon: -86.44 },
    { lat: 37.02, lon: -86.44 },
  ];
  const cart = [
    { lat: 37.008, lon: -86.429 },
    { lat: 37.009, lon: -86.43 },
  ];
  const overlay = parseOverpassOverlay({
    elements: [
      {
        type: 'way',
        tags: { golf: 'bunker', natural: 'sand' },
        geometry: bunker,
      },
      {
        type: 'relation',
        tags: { golf: 'water_hazard', natural: 'water', type: 'multipolygon' },
        members: [
          { type: 'way', role: 'outer', geometry: water },
          {
            type: 'way',
            role: 'inner',
            geometry: [
              { lat: 37.0205, lon: -86.4405 },
              { lat: 37.021, lon: -86.4405 },
            ],
          },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'lateral_water_hazard', ref: '1' },
        geometry: [
          { lat: 37.03, lon: -86.45 },
          { lat: 37.031, lon: -86.451 },
          { lat: 37.032, lon: -86.45 },
          { lat: 37.03, lon: -86.45 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'cartpath', highway: 'service', golf_cart: 'designated' },
        geometry: cart,
      },
      {
        type: 'way',
        tags: { highway: 'service', golf_cart: 'yes' },
        geometry: [
          { lat: 37.04, lon: -86.46 },
          { lat: 37.041, lon: -86.461 },
        ],
      },
    ],
  });
  assert.ok(overlay);
  assert.equal(overlay?.features.length, 4);
  const kinds = overlay?.features.map((feature) => feature.kind);
  assert.deepEqual(kinds, ['bunker', 'water_hazard', 'lateral_water_hazard', 'cartpath']);
  assert.deepEqual(overlay?.features[0].coordinates, [
    { lat: 37.01, lng: -86.43 },
    { lat: 37.011, lng: -86.431 },
    { lat: 37.012, lng: -86.43 },
    { lat: 37.01, lng: -86.43 },
  ]);
  assert.equal(overlay?.features[0].holeNumber, null);
  assert.deepEqual(overlay?.features[1].coordinates, [
    { lat: 37.02, lng: -86.44 },
    { lat: 37.021, lng: -86.441 },
    { lat: 37.022, lng: -86.44 },
    { lat: 37.02, lng: -86.44 },
  ]);
  assert.equal(overlay?.features[2].holeNumber, 1);
  assert.deepEqual(overlay?.features[3].coordinates, [
    { lat: 37.008, lng: -86.429 },
    { lat: 37.009, lng: -86.43 },
  ]);
  assert.equal(osmFeatureRendersAsLine(overlay!.features[0]), false);
  assert.equal(osmFeatureRendersAsLine(overlay!.features[1]), false);
  assert.equal(osmFeatureRendersAsLine(overlay!.features[3]), true);
  assert.equal(
    osmFeatureRendersAsLine({
      kind: 'bunker',
      coordinates: [
        { lat: 37.01, lng: -86.43 },
        { lat: 37.011, lng: -86.431 },
      ],
    }),
    true,
  );
  assert.equal(
    osmFeatureRendersAsLine({
      kind: 'green',
      coordinates: [
        { lat: 37.01, lng: -86.43 },
        { lat: 37.011, lng: -86.431 },
      ],
    }),
    false,
  );
});

test('parseOverpassOverlay returns null when hazard and cartpath tags are absent', () => {
  assert.equal(
    parseOverpassOverlay({
      elements: [
        {
          type: 'way',
          tags: { highway: 'service' },
          geometry: [
            { lat: 37.01, lon: -86.43 },
            { lat: 37.011, lon: -86.431 },
          ],
        },
        {
          type: 'way',
          tags: { natural: 'water', water: 'pond' },
          geometry: [
            { lat: 37.02, lon: -86.44 },
            { lat: 37.021, lon: -86.441 },
            { lat: 37.02, lon: -86.44 },
          ],
        },
        {
          type: 'way',
          tags: { golf: 'hazard' },
          geometry: [
            { lat: 37.03, lon: -86.45 },
            { lat: 37.031, lon: -86.451 },
          ],
        },
        {
          type: 'way',
          tags: { golf_cart: 'designated', highway: 'path' },
          geometry: [
            { lat: 37.04, lon: -86.46 },
            { lat: 37.041, lon: -86.461 },
          ],
        },
        {
          type: 'way',
          tags: { golf: 'rough' },
          geometry: [
            { lat: 37.05, lon: -86.47 },
            { lat: 37.051, lon: -86.471 },
          ],
        },
      ],
    }),
    null,
  );
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

test('featuresForHole keeps unnumbered hazards and drops hazards numbered for another hole', () => {
  const overlay = parseOverpassOverlay({
    elements: [
      {
        type: 'way',
        tags: { golf: 'green', ref: '1' },
        geometry: [
          { lat: 37.01, lon: -86.43 },
          { lat: 37.011, lon: -86.431 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'bunker' },
        geometry: [
          { lat: 37.0105, lon: -86.4305 },
          { lat: 37.0115, lon: -86.4315 },
          { lat: 37.0105, lon: -86.432 },
          { lat: 37.0105, lon: -86.4305 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'bunker', ref: '2' },
        geometry: [
          { lat: 37.02, lon: -86.44 },
          { lat: 37.021, lon: -86.441 },
          { lat: 37.02, lon: -86.442 },
          { lat: 37.02, lon: -86.44 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'cartpath', highway: 'service' },
        geometry: [
          { lat: 37.009, lon: -86.429 },
          { lat: 37.012, lon: -86.432 },
        ],
      },
    ],
  });
  assert.ok(overlay);
  const hole1 = featuresForHole(overlay, 1);
  assert.deepEqual(
    hole1.map((feature) => feature.kind),
    ['green', 'bunker', 'cartpath'],
  );
  assert.equal(hole1.filter((feature) => feature.kind === 'bunker').length, 1);
  assert.equal(hole1.find((feature) => feature.kind === 'bunker')?.holeNumber, null);
  const hole2 = featuresForHole(overlay, 2);
  assert.equal(hole2.some((feature) => feature.kind === 'bunker' && feature.holeNumber === 2), true);
  assert.equal(hole2.some((feature) => feature.kind === 'green'), false);
});

test('featuresForHole does not invent hazards when OSM returned none', () => {
  const overlay = parseOverpassOverlay({
    elements: [
      {
        type: 'way',
        tags: { golf: 'green', ref: '4' },
        geometry: [
          { lat: 37.01, lon: -86.43 },
          { lat: 37.011, lon: -86.431 },
        ],
      },
    ],
  });
  const hole4 = featuresForHole(overlay, 4);
  assert.equal(hole4.length, 1);
  assert.equal(hole4[0].kind, 'green');
});

test('hole line still supplies a tee when the OSM tee box is missing', () => {
  const overlay = parseOverpassOverlay({
    elements: [
      {
        type: 'way',
        tags: { golf: 'hole', ref: '1' },
        geometry: [
          { lat: 37.0, lon: -122.0 },
          { lat: 37.01, lon: -122.0 },
        ],
      },
      {
        type: 'way',
        tags: { golf: 'green', ref: '1' },
        geometry: [
          { lat: 37.01, lon: -122.0 },
          { lat: 37.011, lon: -122.0 },
        ],
      },
    ],
  });
  assert.ok(overlay);
  assert.equal(teePointForHole(overlay, 1), null);
  assert.deepEqual(teePointFromHoleFeature(overlay, 1, { lat: 37.01, lng: -122.0 }), {
    lat: 37.0,
    lng: -122.0,
  });
  assert.deepEqual(resolveOverlayTee(overlay, 1, { lat: 37.01, lng: -122.0 }), {
    lat: 37.0,
    lng: -122.0,
  });
});

test('fairway farthest from the green is the tee when the hole line is missing', () => {
  const overlay = parseOverpassOverlay({
    elements: [
      {
        type: 'way',
        tags: { golf: 'fairway', ref: '1' },
        geometry: [
          { lat: 37.0, lon: -122.0 },
          { lat: 37.008, lon: -122.0 },
        ],
      },
    ],
  });
  const green = { lat: 37.008, lng: -122.0 };
  assert.deepEqual(teePointFromFairway(overlay, 1, green), { lat: 37.0, lng: -122.0 });
  assert.deepEqual(resolveOverlayTee(overlay, 1, green), { lat: 37.0, lng: -122.0 });
  assert.equal(teePointFromFairway(overlay, 1, null), null);
});

test('cached overlay is available without a phone fix', () => {
  const green = { lat: 37.01, lng: -122.0 };
  const overlay = parseOverpassOverlay({
    elements: [
      {
        type: 'way',
        tags: { golf: 'hole', ref: '1' },
        geometry: [
          { lat: 37.0, lon: -122.0 },
          { lat: 37.01, lon: -122.0 },
        ],
      },
    ],
  });
  assert.ok(overlay);
  rememberOsmOverlay({ courseId: 'c1', holeNumber: 1, green }, overlay);
  assert.equal(cachedOsmOverlay({ courseId: 'c1', holeNumber: 1, green }), overlay);
  assert.equal(
    cachedOsmOverlay({
      courseId: 'c1',
      holeNumber: 1,
      green: { lat: green.lat + 0.00021, lng: green.lng - 0.00019 },
    }),
    overlay,
  );
  assert.equal(cachedOsmOverlay({ courseId: 'c1', holeNumber: 1, green: null }), overlay);
  assert.equal(cachedOsmOverlay({ courseId: 'c1', holeNumber: 2, green }), null);
  const tee = { lat: 37.0, lng: -122.0 };
  rememberResolvedTee({ courseId: 'c1', holeNumber: 1, green }, tee);
  assert.deepEqual(cachedResolvedTee({ courseId: 'c1', holeNumber: 1, green }), tee);
  assert.equal(cachedResolvedTee({ courseId: 'c1', holeNumber: 1, green: null }), null);
});

test('fetchOsmOverlay returns null on Overpass failure — graceful empty overlay', async () => {
  let calls = 0;
  const overlay = await fetchOsmOverlay(
    { location: { lat: 37.01, lng: -86.43 }, holeNumber: 1 },
    {
      retryDelayMs: 0,
      fetch: async () => {
        calls += 1;
        return new Response('nope', { status: 504 });
      },
    },
  );
  assert.equal(overlay, null);
  assert.equal(calls, 2);
});

test('fetchOsmOverlay retries once after 429 or a timeout, then keeps the real features', async () => {
  let busy = 0;
  const retried = await fetchOsmOverlay(
    { location: { lat: 37.01, lng: -86.43 }, holeNumber: 1 },
    {
      retryDelayMs: 0,
      fetch: async () => {
        busy += 1;
        if (busy === 1) return new Response('busy', { status: 429 });
        return new Response(
          JSON.stringify({
            elements: [
              {
                type: 'way',
                tags: { golf: 'green', ref: '1' },
                geometry: [
                  { lat: 37.01, lon: -86.43 },
                  { lat: 37.011, lon: -86.431 },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(busy, 2);
  assert.equal(retried?.features[0]?.kind, 'green');

  let timeouts = 0;
  const afterTimeout = await fetchOsmOverlay(
    { location: { lat: 37.02, lng: -86.44 }, holeNumber: 4 },
    {
      retryDelayMs: 0,
      fetch: async () => {
        timeouts += 1;
        if (timeouts === 1) throw new Error('timeout');
        return new Response(
          JSON.stringify({
            elements: [
              {
                type: 'way',
                tags: { golf: 'tee', ref: '4' },
                geometry: [
                  { lat: 37.02, lon: -86.44 },
                  { lat: 37.021, lon: -86.441 },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    },
  );
  assert.equal(timeouts, 2);
  assert.equal(afterTimeout?.features[0]?.holeNumber, 4);

  let denied = 0;
  const skipped = await fetchOsmOverlay(
    { location: { lat: 37.03, lng: -86.45 } },
    {
      retryDelayMs: 0,
      fetch: async () => {
        denied += 1;
        return new Response('no', { status: 500 });
      },
    },
  );
  assert.equal(skipped, null);
  assert.equal(denied, 1);
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
  assert.match(body, /\["golf"="bunker"\]/);
  assert.match(body, /\["golf"="water_hazard"\]/);
  assert.match(body, /\["golf"="lateral_water_hazard"\]/);
  assert.match(body, /\["golf"="cartpath"\]/);
  assert.doesNotMatch(body, /highway/);
  assert.doesNotMatch(body, /natural/);
  assert.doesNotMatch(body, /\["golf"="hazard"\]/);
  assert.match(body, /around:1000/);
  assert.ok(overlay);
  assert.equal(overlay?.features[0].kind, 'green');
});

test('fillLayoutTeesFromOsm keeps API tees and fills missing tees from the hole line', async () => {
  const apiTee = { lat: 37.02, lng: -122.01 };
  const layout = await fillLayoutTeesFromOsm(
    {
      apiId: 'c1',
      location: { lat: 37.01, lng: -122.0 },
      holes: [
        {
          number: 1,
          par: 4,
          yards: 282,
          handicap: 1,
          greenCentroid: { lat: 37.01, lng: -122.0 },
          teeCentroid: apiTee,
        },
        {
          number: 2,
          par: 3,
          yards: 150,
          handicap: 2,
          greenCentroid: { lat: 37.012, lng: -122.002 },
          teeCentroid: null,
        },
      ],
    },
    {
      fetch: async () =>
        new Response(
          JSON.stringify({
            elements: [
              {
                type: 'way',
                tags: { golf: 'hole', ref: '2' },
                geometry: [
                  { lat: 37.008, lon: -122.002 },
                  { lat: 37.012, lon: -122.002 },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    },
  );
  assert.deepEqual(layout.holes?.[0].teeCentroid, apiTee);
  assert.deepEqual(layout.holes?.[1].teeCentroid, { lat: 37.008, lng: -122.002 });
  assert.deepEqual(cachedResolvedTee({ courseId: 'c1', holeNumber: 1, green: { lat: 37.01, lng: -122.0 } }), apiTee);
});
