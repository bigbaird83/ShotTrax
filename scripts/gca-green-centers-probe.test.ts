import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PROBE_URL,
  classifyHttp,
  formatStatusLine,
  isTlsFailure,
  probeGreenCenters,
  readKey,
} from './gca-green-centers-probe.mjs';

test('readKey uses GOLF_COURSES_API_KEY and does not invent one', () => {
  assert.equal(readKey({}), null);
  assert.equal(readKey({ GOLF_COURSES_API_KEY: '   ' }), null);
  assert.equal(readKey({ GOLF_COURSES_API_KEY: ' eas-secret ' }), 'eas-secret');
  assert.equal(readKey({ EXPO_PUBLIC_GOLF_COURSES_API_KEY: 'local' }), 'local');
});

test('classifyHttp maps Pro 200 vs 403; anything else is OTHER', () => {
  assert.equal(classifyHttp(200), '200');
  assert.equal(classifyHttp(403), '403');
  assert.equal(classifyHttp(401), 'OTHER');
  assert.equal(classifyHttp(500), 'OTHER');
});

test('isTlsFailure catches UNEXPECTED_EOF / TLS box failures', () => {
  const eof = new Error('Client network socket disconnected before secure TLS connection was established');
  eof.cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
  assert.equal(isTlsFailure(eof), true);
  assert.equal(isTlsFailure(new Error('unexpected eof')), true);
  assert.equal(isTlsFailure(new Error('plain 404 from parser')), false);
});

test('probe is GET course 4 green-centers, read-only, never invents on 403', async () => {
  const calls: { url: string; headers: HeadersInit | undefined; method: string | undefined }[] = [];
  const result = await probeGreenCenters({
    env: { GOLF_COURSES_API_KEY: 'k' },
    fetch: async (input, init) => {
      calls.push({ url: String(input), headers: init?.headers, method: init?.method });
      return new Response(JSON.stringify({ message: 'Green-center data requires a Pro or Max plan.' }), {
        status: 403,
      });
    },
  });
  assert.equal(result.code, '403');
  assert.match(result.note, /never invent/i);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, PROBE_URL);
  assert.equal(calls[0]?.method, 'GET');
  const headers = new Headers(calls[0]?.headers);
  assert.equal(headers.get('Authorization'), 'Bearer k');
  assert.equal(headers.get('Accept'), 'application/json');
});

test('probe logs 200 without persisting or inventing greens', async () => {
  const result = await probeGreenCenters({
    env: { GOLF_COURSES_API_KEY: 'pro' },
    fetch: async () =>
      new Response(
        JSON.stringify({
          data: { course_id: 4, holes: [{ hole: 1, lat: 37.01744, lng: -86.43135 }] },
        }),
        { status: 200 },
      ),
  });
  assert.equal(result.code, '200');
  assert.equal(formatStatusLine(result.code), 'GCA_GREENS_PRO=200');
  assert.match(result.note, /1 green-center row/);
  assert.match(result.note, /Read-only/);
});

test('probe prints TLS_FAIL when the box cannot complete TLS', async () => {
  const result = await probeGreenCenters({
    env: { GOLF_COURSES_API_KEY: 'k' },
    fetch: async () => {
      throw new Error('Client network socket disconnected before secure TLS connection was established');
    },
  });
  assert.equal(result.code, 'TLS_FAIL');
});

test('CLI prints GCA_GREENS_PRO=NO_KEY and exits 0 without a key', () => {
  const env = { ...process.env };
  delete env.GOLF_COURSES_API_KEY;
  delete env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  const script = fileURLToPath(new URL('./gca-green-centers-probe.mjs', import.meta.url));
  const ran = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
  assert.equal(ran.status, 0);
  assert.match(ran.stdout, /GCA_GREENS_PRO=NO_KEY/);
  assert.doesNotMatch(ran.stdout, /GCA_GREENS_PRO=200/);
});
