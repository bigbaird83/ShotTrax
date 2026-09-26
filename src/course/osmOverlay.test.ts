import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cachedOsmOverlay,
  cachedResolvedTee,
  dropCourseOverlayMemory,
  featuresForHole,
  fetchOsmOverlay,
  fillLayoutTeesFromOsm,
  loadCachedOrFetchCourseOverlay,
  OSM_BUSY_BACKOFF_MS,
  OSM_BUSY_RETRY_AFTER_MAX_MS,
  osmOverlayBusyRemainingMs,
  WORKER_OVERLAY_TIMEOUT_MS,
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

const WORKER = 'https://share.test';
const WORKER_GREEN = {
  elements: [
    {
      type: 'way',
      tags: { golf: 'green', ref: '1' },
      geometry: [
        { lat: 33.267, lon: -93.239 },
        { lat: 33.2672, lon: -93.2388 },
      ],
    },
    {
      type: 'way',
      tags: { golf: 'green', ref: '2' },
      geometry: [
        { lat: 33.271, lon: -93.233 },
        { lat: 33.2712, lon: -93.2328 },
      ],
    },
    {
      type: 'way',
      tags: { golf: 'bunker' },
      geometry: [
        { lat: 33.2672, lon: -93.2388 },
        { lat: 33.2674, lon: -93.2386 },
        { lat: 33.2673, lon: -93.2384 },
        { lat: 33.2672, lon: -93.2388 },
      ],
    },
  ],
};

test('fetchOsmOverlay uses the Worker overlay route when a base is configured', async () => {
  const calls: { url: string; method: string | undefined }[] = [];
  const catalog = { lat: 33.26741, lng: -93.23916 };
  const overlay = await fetchOsmOverlay(
    {
      courseId: 'magnolia-worker',
      location: { lat: 33.28, lng: -93.22 },
      courseLocation: catalog,
      holeNumber: 1,
      radiusM: 900,
    },
    {
      retryDelayMs: 0,
      getBaseUrl: () => WORKER,
      fetch: async (input, init) => {
        calls.push({ url: String(input), method: init?.method });
        return new Response(JSON.stringify(WORKER_GREEN), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Overlay-Cache': 'MISS' },
        });
      },
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, 'GET');
  const url = new URL(calls[0]?.url ?? '');
  assert.equal(url.origin + url.pathname, `${WORKER}/osm/v1/overlay`);
  assert.equal(url.searchParams.get('courseId'), 'magnolia-worker');
  assert.equal(url.searchParams.get('lat'), catalog.lat.toFixed(4));
  assert.equal(url.searchParams.get('lng'), catalog.lng.toFixed(4));
  assert.equal(url.searchParams.get('radius'), '1800');
  assert.notEqual(url.searchParams.get('lat'), '33.2800');
  assert.equal(overlay?.features.some((feature) => feature.kind === 'green' && feature.holeNumber === 1), true);
  assert.equal(overlay?.features.some((feature) => feature.kind === 'bunker'), true);
  assert.equal(overlay?.features.some((feature) => feature.holeNumber === 2), false);

  const wide: string[] = [];
  await fetchOsmOverlay(
    {
      courseId: 'wide-worker',
      location: { lat: 33.267, lng: -93.239 },
      courseLocation: catalog,
      radiusM: 50,
    },
    {
      getBaseUrl: () => `${WORKER}/`,
      fetch: async (input) => {
        wide.push(String(input));
        return new Response(JSON.stringify(WORKER_GREEN), { status: 200 });
      },
    },
  );
  assert.equal(new URL(wide[0] ?? '').searchParams.get('radius'), '1800');
  assert.equal(new URL(wide[0] ?? '').searchParams.get('lat'), catalog.lat.toFixed(4));
  dropCourseOverlayMemory('magnolia-worker');
  dropCourseOverlayMemory('wide-worker');
});

test('Worker no_overlay returns null and does not ask Overpass', async () => {
  const calls: string[] = [];
  const overlay = await fetchOsmOverlay(
    {
      courseId: 'empty-course',
      location: { lat: 33.28, lng: -93.22 },
      courseLocation: { lat: 33.26741, lng: -93.23916 },
      radiusM: 1800,
    },
    {
      retryDelayMs: 0,
      getBaseUrl: () => WORKER,
      fetch: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify({ error: 'no_overlay' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  );
  assert.equal(overlay, null);
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? '', /\/osm\/v1\/overlay\?/);
});

test('a missing Worker overlay route falls back to Overpass', async () => {
  const calls: { url: string; method: string | undefined }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method });
    if (url.includes('/osm/v1/overlay')) {
      return new Response('<html>not found</html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(JSON.stringify(WORKER_GREEN), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const overlay = await fetchOsmOverlay(
    {
      courseId: 'not-deployed',
      location: { lat: 33.28, lng: -93.22 },
      courseLocation: { lat: 33.26741, lng: -93.23916 },
      holeNumber: 2,
      radiusM: 1800,
    },
    { retryDelayMs: 0, getBaseUrl: () => WORKER, fetch: fetchImpl },
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.method, 'GET');
  assert.match(calls[0]?.url ?? '', /\/osm\/v1\/overlay\?/);
  assert.equal(calls[1]?.method, 'POST');
  assert.match(calls[1]?.url ?? '', /overpass/);
  assert.equal(overlay?.features.some((feature) => feature.holeNumber === 2), true);
  assert.equal(overlay?.features.some((feature) => feature.holeNumber === 1), false);

  calls.length = 0;
  const fromHtmlBusy = await fetchOsmOverlay(
    {
      courseId: 'cf-503',
      location: { lat: 33.28, lng: -93.22 },
      courseLocation: { lat: 33.26741, lng: -93.23916 },
      radiusM: 1200,
    },
    {
      retryDelayMs: 0,
      getBaseUrl: () => WORKER,
      fetch: async (input, init) => {
        const url = String(input);
        calls.push({ url, method: init?.method });
        if (url.includes('/osm/v1/overlay')) {
          return new Response('<html>unavailable</html>', { status: 503 });
        }
        return new Response(JSON.stringify(WORKER_GREEN), { status: 200 });
      },
    },
  );
  assert.equal(fromHtmlBusy?.features.length, 3);
  assert.equal(calls.some((call) => call.method === 'POST'), true);
});

test('Worker upstream_busy returns null, retries once, and does not ask Overpass', async () => {
  const calls: string[] = [];
  const overlay = await fetchOsmOverlay(
    {
      courseId: 'busy-course',
      location: { lat: 33.28, lng: -93.22 },
      courseLocation: { lat: 33.26741, lng: -93.23916 },
      radiusM: 1800,
    },
    {
      retryDelayMs: 0,
      getBaseUrl: () => WORKER,
      fetch: async (input) => {
        calls.push(String(input));
        return new Response(JSON.stringify({ error: 'upstream_busy' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '2' },
        });
      },
    },
  );
  assert.equal(overlay, null);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((url) => url.includes('/osm/v1/overlay?')), true);

  let tries = 0;
  const recovered = await fetchOsmOverlay(
    {
      courseId: 'busy-then-ok',
      location: { lat: 33.28, lng: -93.22 },
      courseLocation: { lat: 33.26741, lng: -93.23916 },
      radiusM: 1800,
    },
    {
      retryDelayMs: 0,
      getBaseUrl: () => WORKER,
      fetch: async () => {
        tries += 1;
        if (tries === 1) {
          return new Response(JSON.stringify({ error: 'upstream_busy' }), { status: 503 });
        }
        return new Response(JSON.stringify(WORKER_GREEN), { status: 200 });
      },
    },
  );
  assert.equal(tries, 2);
  assert.equal(recovered?.features.length, 3);
});

test('no Worker base keeps the direct Overpass request', async () => {
  let method: string | undefined;
  let url = '';
  const overlay = await fetchOsmOverlay(
    { courseId: 'direct', location: { lat: 33.267, lng: -93.239 }, radiusM: 1800 },
    {
      getBaseUrl: () => null,
      fetch: async (input, init) => {
        url = String(input);
        method = init?.method;
        return new Response(JSON.stringify(WORKER_GREEN), { status: 200 });
      },
    },
  );
  assert.equal(method, 'POST');
  assert.match(url, /overpass/);
  assert.equal(overlay?.features.length, 3);
});

test('a Worker base without a catalog pin stays on direct Overpass', async () => {
  const calls: string[] = [];
  const overlay = await fetchOsmOverlay(
    { courseId: 'no-catalog', location: { lat: 33.271, lng: -93.233 }, holeNumber: 2, radiusM: 1000 },
    {
      getBaseUrl: () => WORKER,
      retryDelayMs: 0,
      fetch: async (input, init) => {
        calls.push(`${init?.method ?? ''} ${String(input)}`);
        return new Response(JSON.stringify(WORKER_GREEN), { status: 200 });
      },
    },
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? '', /^POST /);
  assert.match(calls[0] ?? '', /overpass/);
  assert.equal(overlay?.features.some((feature) => feature.holeNumber === 2), true);
});

test('every hole shares one Worker URL at the catalog pin and later holes do not fetch', async () => {
  assert.equal(WORKER_OVERLAY_TIMEOUT_MS, 30_000);
  const courseId = 'stable-worker-course';
  dropCourseOverlayMemory(courseId);
  const catalog = { lat: 33.26741, lng: -93.23916 };
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify(WORKER_GREEN), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Overlay-Cache': 'MISS' },
    });
  };
  const deps = {
    getBaseUrl: () => WORKER,
    retryDelayMs: 0,
    fetch: fetchImpl,
  };
  for (let hole = 1; hole <= 18; hole += 1) {
    const green = { lat: 33.3 + hole * 0.01, lng: -93.1 - hole * 0.01 };
    const overlay = await loadCachedOrFetchCourseOverlay(
      {
        courseId,
        holeNumber: hole,
        green,
        location: green,
        courseLocation: catalog,
      },
      { fetchOverlay: (query) => fetchOsmOverlay(query, deps) },
    );
    if (hole === 1) {
      assert.equal(overlay?.features.some((feature) => feature.holeNumber === 1), true);
    }
    if (hole === 2) {
      assert.equal(overlay?.features.some((feature) => feature.kind === 'green' && feature.holeNumber === 2), true);
      assert.equal(overlay?.features.some((feature) => feature.holeNumber === 1), false);
    }
  }
  assert.equal(calls.length, 1);
  const url = new URL(calls[0] ?? '');
  assert.equal(url.pathname, '/osm/v1/overlay');
  assert.equal(url.searchParams.get('courseId'), courseId);
  assert.equal(url.searchParams.get('lat'), catalog.lat.toFixed(4));
  assert.equal(url.searchParams.get('lng'), catalog.lng.toFixed(4));
  assert.equal(url.searchParams.get('radius'), '1800');
  assert.notEqual(url.searchParams.get('lat'), (33.3 + 0.01).toFixed(4));
  dropCourseOverlayMemory(courseId);
});

test('a Worker timeout stores nothing and falls back to Overpass once', async () => {
  const courseId = 'worker-timeout-course';
  dropCourseOverlayMemory(courseId);
  const catalog = { lat: 33.26741, lng: -93.23916 };
  const calls: string[] = [];
  let aborted = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/osm/v1/overlay')) {
      await new Promise((_resolve, reject) => {
        const onAbort = () => {
          aborted = true;
          reject(new DOMException('aborted', 'AbortError'));
        };
        if (init?.signal?.aborted) onAbort();
        else init?.signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    return new Response('no', { status: 500 });
  };
  const deps = {
    getBaseUrl: () => WORKER,
    retryDelayMs: 0,
    workerTimeoutMs: 30,
    fetch: fetchImpl,
  };
  const overlay = await fetchOsmOverlay(
    {
      courseId,
      location: { lat: 33.4, lng: -93.4 },
      courseLocation: catalog,
      holeNumber: 1,
    },
    deps,
  );
  assert.equal(overlay, null);
  assert.equal(aborted, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0] ?? '', /\/osm\/v1\/overlay\?/);
  assert.match(calls[1] ?? '', /overpass/);
  const again = await fetchOsmOverlay(
    { courseId, location: { lat: 33.5, lng: -93.5 }, courseLocation: catalog, holeNumber: 4 },
    { ...deps, fetch: async () => {
      calls.push('again');
      return new Response(JSON.stringify(WORKER_GREEN), { status: 200 });
    } },
  );
  assert.equal(again, null);
  assert.equal(calls.includes('again'), false);
  dropCourseOverlayMemory(courseId);
});

test('Worker upstream_busy succeeds after the cooldown without a restart', async () => {
  const courseId = 'magnolia-busy-later';
  dropCourseOverlayMemory(courseId);
  const catalog = { lat: 33.26741, lng: -93.23916 };
  const green = { lat: 33.267, lng: -93.239 };
  let now = 1_700_000_000_000;
  const nowMs = () => now;
  let calls = 0;
  const urls: string[] = [];
  const lines: string[] = [];
  const originalLog = console.log;
  const dev = globalThis as { __DEV__?: boolean };
  const previousDev = dev.__DEV__;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '));
  };
  dev.__DEV__ = true;
  const fetchImpl: typeof fetch = async (input) => {
    calls += 1;
    urls.push(String(input));
    if (calls <= 2) {
      return new Response(JSON.stringify({ error: 'upstream_busy' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(WORKER_GREEN), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const deps = {
    retryDelayMs: 0,
    nowMs,
    getBaseUrl: () => WORKER,
    fetch: fetchImpl,
  };
  try {
    const blocked = await loadCachedOrFetchCourseOverlay(
      { courseId, holeNumber: 1, green, location: green, courseLocation: catalog },
      { fetchOverlay: (query) => fetchOsmOverlay(query, deps), nowMs },
    );
    assert.equal(blocked, null);
    assert.equal(calls, 2);
    assert.equal(urls.every((url) => url.includes('/osm/v1/overlay?')), true);
    assert.equal(osmOverlayBusyRemainingMs(courseId, nowMs), OSM_BUSY_BACKOFF_MS[0]);
    assert.ok(lines.some((line) => line.includes(courseId) && line.includes('upstream_busy')));

    const stillCooling = await loadCachedOrFetchCourseOverlay(
      { courseId, holeNumber: 4, green, location: green, courseLocation: catalog },
      { fetchOverlay: (query) => fetchOsmOverlay(query, deps), nowMs },
    );
    assert.equal(stillCooling, null);
    assert.equal(calls, 2);

    now += OSM_BUSY_BACKOFF_MS[0];
    const overlay = await loadCachedOrFetchCourseOverlay(
      { courseId, holeNumber: 1, green, location: green, courseLocation: catalog },
      { fetchOverlay: (query) => fetchOsmOverlay(query, deps), nowMs },
    );
    assert.equal(calls, 3);
    assert.equal(overlay?.source, 'osm');
    assert.equal(overlay?.features.some((feature) => feature.kind === 'green' && feature.holeNumber === 1), true);
    assert.equal(
      cachedOsmOverlay({ courseId, holeNumber: 1, green })?.features.some((feature) => feature.holeNumber === 2),
      false,
    );
    assert.ok(lines.some((line) => line.includes(courseId) && line.includes('retrying')));
    const again = await loadCachedOrFetchCourseOverlay(
      { courseId, holeNumber: 2, green: { lat: 33.271, lng: -93.233 }, courseLocation: catalog },
      { fetchOverlay: (query) => fetchOsmOverlay(query, deps), nowMs },
    );
    assert.equal(calls, 3);
    assert.equal(again?.features.some((feature) => feature.holeNumber === 2), true);
  } finally {
    console.log = originalLog;
    dev.__DEV__ = previousDev;
    dropCourseOverlayMemory(courseId);
  }
});

test('repeated Worker upstream_busy backs off and honors a sane Retry-After', async () => {
  const catalog = { lat: 33.26741, lng: -93.23916 };
  const queryFor = (courseId: string) => ({
    courseId,
    location: catalog,
    courseLocation: catalog,
    radiusM: 1800,
  });

  const courseId = 'busy-backoff';
  dropCourseOverlayMemory(courseId);
  let now = 1_700_000_000_000;
  const nowMs = () => now;
  let calls = 0;
  const deps = {
    retryDelayMs: 0,
    nowMs,
    getBaseUrl: () => WORKER,
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'upstream_busy' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  try {
    for (const wait of [OSM_BUSY_BACKOFF_MS[0], OSM_BUSY_BACKOFF_MS[1], OSM_BUSY_BACKOFF_MS[2], OSM_BUSY_BACKOFF_MS[2]]) {
      const before = calls;
      assert.equal(await fetchOsmOverlay(queryFor(courseId), deps), null);
      assert.equal(calls - before, 2);
      assert.equal(osmOverlayBusyRemainingMs(courseId, nowMs), wait);
      const during = await fetchOsmOverlay(queryFor(courseId), deps);
      assert.equal(during, null);
      assert.equal(calls - before, 2);
      now += wait;
    }
  } finally {
    dropCourseOverlayMemory(courseId);
  }

  async function waitFor(courseId: string, retryAfter: string | (() => string)): Promise<number> {
    dropCourseOverlayMemory(courseId);
    const started = nowMs();
    await fetchOsmOverlay(queryFor(courseId), {
      retryDelayMs: 0,
      nowMs,
      getBaseUrl: () => WORKER,
      fetch: async () =>
        new Response(JSON.stringify({ error: 'upstream_busy' }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': typeof retryAfter === 'function' ? retryAfter() : retryAfter,
          },
        }),
    });
    const remaining = osmOverlayBusyRemainingMs(courseId, nowMs);
    assert.equal(nowMs(), started);
    dropCourseOverlayMemory(courseId);
    return remaining;
  }

  assert.equal(await waitFor('busy-retry-after-long', '90'), 90_000);
  assert.equal(await waitFor('busy-retry-after-short', '2'), OSM_BUSY_BACKOFF_MS[0]);
  assert.equal(await waitFor('busy-retry-after-zero', '0'), OSM_BUSY_BACKOFF_MS[0]);
  assert.equal(
    await waitFor('busy-retry-after-huge', String(Math.floor(OSM_BUSY_RETRY_AFTER_MAX_MS / 1000) + 60)),
    OSM_BUSY_BACKOFF_MS[0],
  );
  assert.equal(
    await waitFor('busy-retry-after-date', () => new Date(nowMs() + 45_000).toUTCString()),
    45_000,
  );
  assert.equal(
    await waitFor('busy-retry-after-past', () => new Date(nowMs() - 5_000).toUTCString()),
    OSM_BUSY_BACKOFF_MS[0],
  );
});

test('Worker no_overlay still blocks the course for the session', async () => {
  const courseId = 'session-no-overlay';
  dropCourseOverlayMemory(courseId);
  const catalog = { lat: 33.26741, lng: -93.23916 };
  let now = 1_700_000_000_000;
  const nowMs = () => now;
  let calls = 0;
  const deps = {
    retryDelayMs: 0,
    nowMs,
    getBaseUrl: () => WORKER,
    fetch: async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: 'no_overlay' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(WORKER_GREEN), { status: 200 });
    },
  };
  try {
    const overlay = await fetchOsmOverlay(
      { courseId, location: catalog, courseLocation: catalog, radiusM: 1800 },
      deps,
    );
    assert.equal(overlay, null);
    assert.equal(calls, 1);
    now += 6 * 60 * 60 * 1000;
    const again = await fetchOsmOverlay(
      { courseId, location: catalog, courseLocation: catalog, holeNumber: 3 },
      deps,
    );
    assert.equal(again, null);
    assert.equal(calls, 1);
    const viaHole = await loadCachedOrFetchCourseOverlay(
      { courseId, holeNumber: 3, green: catalog, courseLocation: catalog },
      { fetchOverlay: (query) => fetchOsmOverlay(query, deps), nowMs },
    );
    assert.equal(viaHole, null);
    assert.equal(calls, 1);
    assert.equal(osmOverlayBusyRemainingMs(courseId, nowMs), 0);
  } finally {
    dropCourseOverlayMemory(courseId);
  }
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
