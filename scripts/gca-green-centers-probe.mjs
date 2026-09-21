#!/usr/bin/env node
/**
 * Read-only Golf Courses API Pro green-centers smoke.
 *
 * GET https://golfcoursesapi.com/api/v1/courses/4/green-centers
 * Course 4 = Bowling Green CC (`green_centers_available=true`).
 *
 * Prints one machine line for EAS build logs / CI:
 *   GCA_GREENS_PRO=200|403|TLS_FAIL|NO_KEY|OTHER
 *
 * Never invents greens. 403 / NO_KEY / TLS_FAIL leave greens blank
 * (same as `src/course/client.ts`). Always exits 0 so TF 60 / EAS is not blocked.
 *
 * Box TLS to golfcoursesapi.com often fails (UNEXPECTED_EOF). EAS builders
 * should work. Zip search is out of scope.
 */
import { pathToFileURL } from 'node:url';

export const PROBE_URL = 'https://golfcoursesapi.com/api/v1/courses/4/green-centers';
export const COURSE_ID = 4;
export const COURSE_NAME = 'Bowling Green CC';
export const TIMEOUT_MS = 15_000;

export function readKey(env = process.env) {
  const raw = env.GOLF_COURSES_API_KEY ?? env.EXPO_PUBLIC_GOLF_COURSES_API_KEY;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isTlsFailure(err) {
  const parts = [];
  let current = err;
  for (let i = 0; i < 4 && current; i += 1) {
    if (current instanceof Error) {
      parts.push(current.name, current.message, current.code);
    } else {
      parts.push(String(current));
    }
    current = typeof current === 'object' && current !== null ? current.cause : undefined;
  }
  const blob = parts.filter(Boolean).join(' ');
  return /tls|ssl|cert|unexpected.?eof|econnreset|enotfound|eai_again|socket hang up|network request failed|failed to fetch|unable_to_verify|err_ssl|UNABLE_TO|EPROTO|ECONNREFUSED/i.test(
    blob,
  );
}

export function classifyHttp(status) {
  if (status === 200) return '200';
  if (status === 403) return '403';
  return 'OTHER';
}

function noteFor(code, detail) {
  switch (code) {
    case 'NO_KEY':
      return 'GOLF_COURSES_API_KEY missing — probe skipped. Greens stay blank (never invented).';
    case '200':
      return `Course 4 ${COURSE_NAME} — Pro green-centers HTTP 200.${detail ? ` ${detail}` : ''} Read-only; not persisted.`;
    case '403':
      return `Course 4 ${COURSE_NAME} — Pro green-centers HTTP 403 (free plan). Greens stay blank — existing client behavior. Never invent greens.`;
    case 'TLS_FAIL':
      return `TLS/network to golfcoursesapi.com failed${detail ? ` (${detail})` : ''}. Box TLS often fails (UNEXPECTED_EOF); EAS builders should work. Greens stay blank.`;
    default:
      return detail ? `Probe other: ${detail}` : 'Probe other.';
  }
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetch?: typeof fetch,
 *   timeoutMs?: number,
 * }} [opts]
 */
export async function probeGreenCenters(opts = {}) {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;

  const key = readKey(env);
  if (!key) {
    return { code: 'NO_KEY', note: noteFor('NO_KEY') };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(PROBE_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    const code = classifyHttp(res.status);
    let extra = `HTTP ${res.status}`;
    if (code === '200' && typeof res.json === 'function') {
      try {
        const json = await res.json();
        const holes = json?.data?.holes ?? json?.green_centers ?? json?.holes;
        if (Array.isArray(holes)) extra = `${holes.length} green-center row(s)`;
      } catch {
        // Status is enough; body is optional for the smoke line.
      }
    }
    return { code, note: noteFor(code, extra), httpStatus: res.status };
  } catch (err) {
    if (err && typeof err === 'object' && err.name === 'AbortError') {
      return { code: 'OTHER', note: noteFor('OTHER', `timed out after ${timeoutMs}ms`) };
    }
    if (isTlsFailure(err)) {
      const msg = err instanceof Error ? err.message : String(err);
      return { code: 'TLS_FAIL', note: noteFor('TLS_FAIL', msg) };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { code: 'OTHER', note: noteFor('OTHER', msg) };
  } finally {
    clearTimeout(timer);
  }
}

export function formatStatusLine(code) {
  return `GCA_GREENS_PRO=${code}`;
}

export async function main() {
  try {
    const result = await probeGreenCenters();
    console.log(formatStatusLine(result.code));
    console.log(result.note);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(formatStatusLine('OTHER'));
    console.log(noteFor('OTHER', msg));
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().then(
    () => process.exit(0),
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(formatStatusLine('OTHER'));
      console.log(`Probe other: ${msg}`);
      process.exit(0);
    },
  );
}
