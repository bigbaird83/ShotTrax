import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCourseDataClient } from './client';
import { fetchOsmOverlay } from './osmOverlay';
import { GOLF_COURSES_API_BASE } from './client';

test('client is unconfigured without a key and does not call the network', async () => {
  let calls = 0;
  const client = createCourseDataClient({
    getKey: () => null,
    fetch: async () => {
      calls += 1;
      throw new Error('network should not run');
    },
  });
  assert.equal(client.isConfigured(), false);
  const nearby = await client.nearbyCourses({ lat: 37, lng: -122 });
  const searched = await client.searchCourses('pebble');
  const course = await client.getCourse('4');
  const catalog = await client.searchCourses('thunderbird');
  assert.deepEqual(nearby, []);
  assert.deepEqual(searched, []);
  assert.equal(course, null);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].name, 'Thunderbird Country Club');
  assert.equal(calls, 0);
});

test('nearbyCourses sends lat/lng/radius with Bearer key and parses data', async () => {
  const client = createCourseDataClient({
    getKey: () => 'test-key',
    fetch: async (input, init) => {
      const url = String(input);
      assert.match(url, /\/courses\?/);
      assert.match(url, /lat=37/);
      assert.match(url, /lng=-122/);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('Authorization'), 'Bearer test-key');
      return new Response(
        JSON.stringify({
          data: [
            {
              id: '4',
              name: 'Nearby CC',
              latitude: 37.01,
              longitude: -122.1,
              distance_km: 1.2,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  assert.equal(client.isConfigured(), true);
  const nearby = await client.nearbyCourses({ lat: 37, lng: -122 });
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].name, 'Nearby CC');
  assert.equal(nearby[0].distanceMeters, 1200);
});

test('searchCourses sends q= for name, city, state, or zip and never invents a course', async () => {
  const urls: string[] = [];
  const client = createCourseDataClient({
    getKey: () => 'test-key',
    fetch: async (input) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({
          data: [{ id: '4', name: 'Bowling Green Country Club', city: 'Bowling Green', state: 'Kentucky' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  const found = await client.searchCourses('  bowling  ');
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'Bowling Green Country Club');
  assert.match(urls[0] ?? '', /\/courses\?/);
  assert.match(urls[0] ?? '', /q=bowling/);
  assert.doesNotMatch(urls[0] ?? '', /lat=/);
  const empty = await client.searchCourses('   ');
  assert.deepEqual(empty, []);
  assert.equal(urls.length, 1);
});

test('getCourse loads scorecard then Pro green-centers', async () => {
  const urls: string[] = [];
  const client = createCourseDataClient({
    getKey: () => 'k',
    fetch: async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/courses/4')) {
        return new Response(
          JSON.stringify({
            data: {
              id: 4,
              name: 'Bowling Green Country Club',
              coordinates: { latitude: 37.0132, longitude: -86.43378 },
              scorecard: {
                hole_count: 18,
                teeboxes: [{ name: 'Gold', holes: [{ hole: 1, par: 4, yards: 437, handicap: 7 }, { hole: 2, par: 5 }] }],
              },
              green_centers_available: true,
            },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/green-centers')) {
        return new Response(
          JSON.stringify({
            data: {
              course_id: 4,
              holes: [{ hole: 1, lat: 37.01744, lng: -86.43135 }],
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  const detail = await client.getCourse('4');
  assert.ok(detail);
  assert.equal(detail?.holes[0].par, 4);
  assert.equal(detail?.holes[0].yards, 437);
  assert.equal(detail?.holes[0].handicap, 7);
  assert.deepEqual(detail?.holes[0].greenCentroid, { lat: 37.01744, lng: -86.43135 });
  assert.equal(detail?.tees[0].name, 'Gold');
  assert.equal(detail?.tees[0].holes[0].handicap, 7);
  assert.deepEqual(detail?.tees[0].holes[0].greenCentroid, { lat: 37.01744, lng: -86.43135 });
  assert.equal(detail?.holes[1].par, 5);
  assert.equal(detail?.holes[1].greenCentroid, null);
  assert.ok(urls[0]?.startsWith(GOLF_COURSES_API_BASE));
  assert.match(urls[1] ?? '', /green-centers/);
});

test('getCourse keeps greens blank on 403 Pro-only green-centers — never invents', async () => {
  const client = createCourseDataClient({
    getKey: () => 'free-key',
    fetch: async (input) => {
      const url = String(input);
      if (url.includes('green-centers')) {
        return new Response(
          JSON.stringify({ message: 'Green-center data requires a Pro or Max plan.' }),
          { status: 403 },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            id: 4,
            name: 'Free Plan CC',
            scorecard: { teeboxes: [{ holes: [{ hole: 1, par: 4 }] }] },
          },
        }),
        { status: 200 },
      );
    },
  });
  const detail = await client.getCourse('4');
  assert.equal(detail?.holes[0].par, 4);
  assert.equal(detail?.holes[0].greenCentroid, null);
});

test('OSM overlay is skipped without a real location — no invented polygons', async () => {
  let calls = 0;
  const overlay = await fetchOsmOverlay(
    { courseId: '4' },
    {
      fetch: async () => {
        calls += 1;
        throw new Error('network should not run');
      },
    },
  );
  assert.equal(overlay, null);
  assert.equal(calls, 0);
});
