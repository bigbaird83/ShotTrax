/**
 * Golf vendor proxy routes for the existing share-sync Worker
 * (the host behind EXPO_PUBLIC_SHARE_SYNC_URL).
 *
 * This file is an example to merge into that Worker. It is not deployed from
 * this repo. The phone never holds a vendor key: it calls
 *
 *   GET {share sync}/gca/v1/courses?lat=&lng=&radius=     nearby
 *   GET {share sync}/gca/v1/courses?q=                     search
 *   GET {share sync}/gca/v1/courses/{id}                   scorecard
 *   GET {share sync}/gca/v1/courses/{id}/green-centers     Pro greens
 *   GET {share sync}/golfapi/v2.3/courses?country=US&q=    last-resort search
 *   GET {share sync}/golfapi/v2.3/courses/{id}
 *   GET {share sync}/golfapi/v2.3/coordinates/{id}
 *
 * and the Worker adds `Authorization: Bearer <secret>` upstream.
 *
 * Cloudflare secrets (set on the Worker, never in EAS / app extra):
 *   wrangler secret put GOLF_COURSES_API_KEY
 *   wrangler secret put GOLFAPI_KEY
 *
 * Upstream status codes pass through unchanged (401 / 403 / 404 / 5xx) so the
 * app keeps its existing behavior: GCA 403 on green-centers stays a miss, a
 * golfapi non-2xx is a miss, and the paint waterfall (cache → OSM → GCA →
 * golfapi) plus the course paint cache are untouched on the phone.
 *
 * Share boards stay on `GET/PUT /{code}` (one path segment). These routes are
 * always two or more segments, so they never collide with a board code.
 *
 * Wiring into the existing Worker's fetch handler:
 *
 *   import { handleGolfProxy } from './worker-golf-proxy.js';
 *
 *   export default {
 *     async fetch(request, env, ctx) {
 *       const golf = await handleGolfProxy(request, env, ctx);
 *       if (golf) return golf;
 *       // ...existing share-board GET/PUT /{code} handling...
 *     },
 *   };
 */

const VENDORS = {
  gca: {
    prefix: '/gca/v1/',
    upstream: 'https://golfcoursesapi.com/api/v1/',
    secret: 'GOLF_COURSES_API_KEY',
    // Only the reads the app makes.
    routes: [/^courses$/, /^courses\/[^/]+$/, /^courses\/[^/]+\/green-centers$/],
  },
  golfapi: {
    prefix: '/golfapi/v2.3/',
    upstream: 'https://golfapi.io/api/v2.3/',
    secret: 'GOLFAPI_KEY',
    routes: [/^courses$/, /^courses\/[^/]+$/, /^coordinates\/[^/]+$/],
  },
};

/** Edge cache for successful reads. Course data changes rarely; golfapi is paid per call. */
const CACHE_SECONDS = 60 * 60 * 24;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function matchVendor(pathname) {
  for (const vendor of Object.values(VENDORS)) {
    if (!pathname.startsWith(vendor.prefix)) continue;
    const rest = pathname.slice(vendor.prefix.length);
    if (vendor.routes.some((route) => route.test(rest))) return { vendor, rest };
    return { vendor, rest: null };
  }
  return null;
}

/**
 * Returns a Response for a golf proxy route, or null when the path is not one
 * (so the caller falls through to share-board handling).
 *
 * @param {Request} request
 * @param {Record<string, string | undefined>} env
 * @param {{ waitUntil(promise: Promise<unknown>): void } | undefined} ctx
 * @returns {Promise<Response | null>}
 */
export async function handleGolfProxy(request, env, ctx) {
  const url = new URL(request.url);
  const hit = matchVendor(url.pathname);
  if (!hit) return null;
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' });
  if (hit.rest == null) return json(404, { error: 'unknown_route' });

  const key = typeof env[hit.vendor.secret] === 'string' ? env[hit.vendor.secret].trim() : '';
  // No secret → the app treats this like any non-2xx: a miss, never invented.
  if (!key) return json(503, { error: 'not_configured' });

  const upstreamUrl = `${hit.vendor.upstream}${hit.rest}${url.search}`;
  // Cache key is the public URL (no key in it).
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
    });
  } catch {
    return json(502, { error: 'upstream_unreachable' });
  }

  const body = await upstream.arrayBuffer();
  const ok = upstream.status >= 200 && upstream.status < 300;
  const response = new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      'Cache-Control': ok ? `public, max-age=${CACHE_SECONDS}` : 'no-store',
    },
  });
  if (ok && cache) {
    const put = cache.put(cacheKey, response.clone());
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(put);
    else await put;
  }
  return response;
}
