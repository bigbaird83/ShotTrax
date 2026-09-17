import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCourseDataClient } from './client';
import { fetchOsmOverlay } from './osmOverlay';

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
  const course = await client.getCourse('4');
  assert.deepEqual(nearby, []);
  assert.equal(course, null);
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
        JSON.stringify({ data: [{ id: '4', name: 'Nearby CC', latitude: 37.01, longitude: -122.1 }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  assert.equal(client.isConfigured(), true);
  const nearby = await client.nearbyCourses({ lat: 37, lng: -122 });
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0].name, 'Nearby CC');
});

test('OSM overlay hook is a no-op in P5 part 1', async () => {
  assert.equal(await fetchOsmOverlay('any'), null);
  const client = createCourseDataClient({ getKey: () => 'k' });
  assert.equal(await client.fetchOsmOverlay('any'), null);
});
