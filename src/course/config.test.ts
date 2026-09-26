import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  getCourseProxyHost,
  getGolfApiProxyBase,
  getGolfCoursesProxyBase,
  isGolfCoursesApiConfigured,
  OSM_OVERLAY_PROXY_PATH,
} from './config';

function withShareSyncUrl(value: string | undefined, run: () => void): void {
  const previous = process.env.EXPO_PUBLIC_SHARE_SYNC_URL;
  if (value == null) delete process.env.EXPO_PUBLIC_SHARE_SYNC_URL;
  else process.env.EXPO_PUBLIC_SHARE_SYNC_URL = value;
  try {
    run();
  } finally {
    if (previous == null) delete process.env.EXPO_PUBLIC_SHARE_SYNC_URL;
    else process.env.EXPO_PUBLIC_SHARE_SYNC_URL = previous;
  }
}

test('course vendors are unconfigured without the share-sync Worker', () => {
  withShareSyncUrl(undefined, () => {
    assert.equal(getCourseProxyHost(), null);
    assert.equal(getGolfCoursesProxyBase(), null);
    assert.equal(getGolfApiProxyBase(), null);
    assert.equal(isGolfCoursesApiConfigured(), false);
  });
});

test('course vendors route through EXPO_PUBLIC_SHARE_SYNC_URL', () => {
  withShareSyncUrl('  https://share.example.dev/  ', () => {
    assert.equal(getCourseProxyHost(), 'https://share.example.dev');
    assert.equal(getGolfCoursesProxyBase(), 'https://share.example.dev/gca/v1');
    assert.equal(getGolfApiProxyBase(), 'https://share.example.dev/golfapi/v2.3');
    assert.equal(OSM_OVERLAY_PROXY_PATH, '/osm/v1/overlay');
    assert.equal(isGolfCoursesApiConfigured(), true);
  });
});

test('no vendor key is read by the app or copied into expo.extra', () => {
  for (const rel of ['./config.ts', './client.ts', './golfapi.ts', '../../app.config.js']) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(src, /process\.env\.[A-Z_]*(GOLFAPI|GOLF_API_IO|GOLF_COURSES_API)_KEY/, rel);
    assert.doesNotMatch(src, /Authorization/, rel);
    assert.doesNotMatch(src, /https:\/\/(golfcoursesapi\.com|golfapi\.io)/, rel);
  }
  const appJson = readFileSync(new URL('../../app.json', import.meta.url), 'utf8');
  assert.doesNotMatch(appJson, /golfCoursesApiKey|golfApiKey/);

  const envKeys = ['GOLF_COURSES_API_KEY', 'EXPO_PUBLIC_GOLF_COURSES_API_KEY', 'GOLFAPI_KEY', 'EXPO_PUBLIC_GOLFAPI_KEY'];
  const previous = Object.fromEntries(envKeys.map((name) => [name, process.env[name]]));
  try {
    for (const name of envKeys) process.env[name] = 'leak';
    const makeConfig = require('../../app.config.js') as (args: { config: Record<string, unknown> }) => {
      extra: Record<string, unknown>;
    };
    const { extra } = makeConfig({ config: { extra: { golfCoursesApiKey: 'old', golfApiKey: 'old' } } });
    assert.equal('golfCoursesApiKey' in extra, false);
    assert.equal('golfApiKey' in extra, false);
    assert.equal(Object.values(extra).includes('leak'), false);
  } finally {
    for (const name of envKeys) {
      if (previous[name] == null) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
