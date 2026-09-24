import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchSharedBoard, parseSharedBoardBody, putSharedBoard, shareBoardUrl } from './shareBoardSync';
import { planSpectatorPayload, type SpectatorPayload } from './spectator';

const BASE = 'https://share.example.dev/';

function board(): SpectatorPayload {
  return planSpectatorPayload({
    token: 'BK3MCQ',
    courseName: 'Magnolia CC',
    finished: false,
    currentHoleNumber: 5,
    holes: [1, 2, 3, 4].map((number, i) => ({
      number,
      score: [4, 4, 1, 4][i],
      par: 4,
      startedAt: `2026-09-24T14:0${i}:00.000Z`,
      completedAt: `2026-09-24T14:0${i}:30.000Z`,
      shots: [],
    })),
    updatedAt: '2026-09-24T14:05:00.000Z',
  });
}

/** In-memory share host keyed by the request path, like the Worker. */
function fakeHost(wrap: (body: string) => string = (b) => b) {
  const store = new Map<string, string>();
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const key = new URL(url).pathname;
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    if (init?.method === 'PUT') {
      store.set(key, String(init.body));
      return new Response(null, { status: 204 });
    }
    const hit = store.get(key);
    return hit == null ? new Response('not found', { status: 404 }) : new Response(wrap(hit), { status: 200 });
  }) as typeof fetch;
  return { store, calls, fetch: fetchImpl };
}

test('publisher PUT and typed-code GET hit the same URL', async () => {
  const host = fakeHost();
  assert.equal(await putSharedBoard('BK3MCQ', board(), { fetch: host.fetch, baseUrl: BASE }), true);
  for (const typed of ['BK3MCQ', ' bk3mcq ', 'bk3 mcq', 'shottrax:///s/BK3MCQ?h=4.4.1.4']) {
    const got = await fetchSharedBoard(typed, { fetch: host.fetch, baseUrl: BASE });
    assert.equal(got.status, 'ok', typed);
    if (got.status !== 'ok') continue;
    assert.equal(got.payload.courseName, 'Magnolia CC');
    assert.deepEqual(got.payload.holes.map((h) => h.score), [4, 4, 1, 4]);
    assert.equal(got.payload.holes[0].startedAt, '2026-09-24T14:00:00.000Z');
    assert.equal(got.payload.holes[3].completedAt, '2026-09-24T14:03:30.000Z');
  }
  assert.equal(host.calls[0], 'PUT https://share.example.dev/BK3MCQ');
  assert.ok(host.calls.slice(1).every((c) => c === 'GET https://share.example.dev/BK3MCQ'));
});

test('lowercase publisher token still lands on the uppercase key', async () => {
  const host = fakeHost();
  await putSharedBoard('bk3mcq', { ...board(), token: 'bk3mcq' }, { fetch: host.fetch, baseUrl: BASE });
  const got = await fetchSharedBoard('BK3MCQ', { fetch: host.fetch, baseUrl: BASE });
  assert.equal(got.status, 'ok');
});

test('host miss and host error are reported, never a silent empty board', async () => {
  const host = fakeHost();
  assert.deepEqual(await fetchSharedBoard('ZZZZZZ', { fetch: host.fetch, baseUrl: BASE }), { status: 'miss' });
  const broken = (async () => {
    throw new Error('offline');
  }) as typeof fetch;
  assert.deepEqual(await fetchSharedBoard('BK3MCQ', { fetch: broken, baseUrl: BASE }), { status: 'error' });
  assert.deepEqual(await fetchSharedBoard('BK3MCQ', { fetch: host.fetch, baseUrl: null }), { status: 'no-host' });
});

test('wrapped host bodies still paint', async () => {
  const host = fakeHost((b) => JSON.stringify({ ok: true, payload: b }));
  await putSharedBoard('BK3MCQ', board(), { fetch: host.fetch, baseUrl: BASE });
  const got = await fetchSharedBoard('BK3MCQ', { fetch: host.fetch, baseUrl: BASE });
  assert.equal(got.status, 'ok');
  const { token: _drop, ...noToken } = board();
  assert.equal(parseSharedBoardBody({ data: noToken }, 'BK3MCQ')?.token, 'BK3MCQ');
  assert.equal(parseSharedBoardBody('not json', 'BK3MCQ'), null);
  assert.equal(shareBoardUrl('https://h/', ' bk3mcq '), 'https://h/BK3MCQ');
});
