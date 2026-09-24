import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import {
  DIAGNOSTICS_DASH,
  DIAGNOSTICS_GREEN_NONE,
  DIAGNOSTICS_UNKNOWN,
  VERSION_ROW_TAP_WINDOW_MS,
  advanceVersionRowTap,
  currentPlayedHoleNumber,
  diagnosticsFixQuality,
  formatDiagnosticsBuild,
  formatDiagnosticsGreenSource,
  formatDiagnosticsHole,
  formatDiagnosticsYesNo,
  formatFixAge,
  formatHorizontalAccuracy,
  formatLastWatchSend,
  formatRemainingComplicationTransfers,
  paintMatchForRound,
  watchLinkFromNative,
} from './diagnostics';

const SHA = '88f28ab5ea39108ade978de2d0d1adeedf0ece76';

test('live fix quality uses the app bands and collapses poor to none', () => {
  assert.equal(diagnosticsFixQuality(null), 'none');
  assert.equal(diagnosticsFixQuality(undefined), 'none');
  assert.equal(diagnosticsFixQuality({ accuracyM: null }), 'none');
  assert.equal(diagnosticsFixQuality({ accuracyM: Number.NaN }), 'none');
  assert.equal(diagnosticsFixQuality({ accuracyM: -1 }), 'none');
  assert.equal(diagnosticsFixQuality({ accuracyM: SOFT_GPS_MIN_M - 0.1 }), 'good');
  assert.equal(diagnosticsFixQuality({ accuracyM: SOFT_GPS_MIN_M }), 'soft');
  assert.equal(diagnosticsFixQuality({ accuracyM: SOFT_GPS_MAX_M }), 'soft');
  assert.equal(diagnosticsFixQuality({ accuracyM: SOFT_GPS_MAX_M + 0.1 }), 'none');
});

test('horizontal accuracy is meters and yards, or a dash', () => {
  assert.equal(formatHorizontalAccuracy(null), DIAGNOSTICS_DASH);
  assert.equal(formatHorizontalAccuracy(undefined), DIAGNOSTICS_DASH);
  assert.equal(formatHorizontalAccuracy(Number.NaN), DIAGNOSTICS_DASH);
  assert.equal(formatHorizontalAccuracy(-2), DIAGNOSTICS_DASH);
  assert.equal(formatHorizontalAccuracy(0), '0 m · 0 yd');
  assert.equal(formatHorizontalAccuracy(15), '15 m · 16.4 yd');
});

test('fix age is unknown when the timestamp is missing or ahead of now', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatFixAge(null, now), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatFixAge(now + 1, now), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatFixAge(Number.NaN, now), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatFixAge(now, Number.NaN), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatFixAge(now, now), '0.0 s');
  assert.equal(formatFixAge(now - 1500, now), '1.5 s');
  assert.equal(formatFixAge(now - 10_000, now), '10 s');
  assert.equal(formatFixAge(now - 59_000, now), '59 s');
  assert.equal(formatFixAge(now - 60_000, now), '1 min');
  assert.equal(formatFixAge(now - 61_000, now), '1 min 1 s');
  assert.equal(formatFixAge(now - 3_600_000, now), '1 h');
  assert.equal(formatFixAge(now - 3_600_000 - 120_000, now), '1 h 2 min');
});

test('green source uses the recorded paint winner and does not guess', () => {
  assert.equal(formatDiagnosticsGreenSource(null), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatDiagnosticsGreenSource(undefined), DIAGNOSTICS_UNKNOWN);
  assert.equal(
    formatDiagnosticsGreenSource({ ok: false, source: null, fromCache: false }),
    DIAGNOSTICS_GREEN_NONE,
  );
  assert.equal(
    formatDiagnosticsGreenSource({ ok: true, source: 'gca', fromCache: true }),
    'cache',
  );
  assert.equal(
    formatDiagnosticsGreenSource({ ok: true, source: 'osm', fromCache: false }),
    'OSM/OpenGolf',
  );
  assert.equal(
    formatDiagnosticsGreenSource({ ok: true, source: 'manual_verified', fromCache: false }),
    'OSM/OpenGolf',
  );
  assert.equal(
    formatDiagnosticsGreenSource({ ok: true, source: 'gca', fromCache: false }),
    'GCA Pro',
  );
  assert.equal(
    formatDiagnosticsGreenSource({ ok: true, source: 'golfapi', fromCache: false }),
    'golfapi.io',
  );
  assert.equal(
    formatDiagnosticsGreenSource({ ok: true, source: null, fromCache: false }),
    DIAGNOSTICS_UNKNOWN,
  );
  assert.equal(
    formatDiagnosticsGreenSource({ ok: true, source: 'seed', fromCache: false }),
    DIAGNOSTICS_UNKNOWN,
  );
});

test('paint lookup identity needs a course name or id and does not invent a city', () => {
  assert.equal(paintMatchForRound(null, { city: 'Cabot', state: 'AR' }), null);
  assert.equal(paintMatchForRound({ courseName: '  ', courseApiId: '' }, null), null);
  assert.deepEqual(
    paintMatchForRound(
      { courseName: ' Cypress ', courseApiId: ' abc ', courseLat: 35, courseLng: -92 },
      { city: ' Cabot ', state: ' AR ', location: { lat: 1, lng: 2 } },
    ),
    {
      name: 'Cypress',
      city: 'Cabot',
      state: 'AR',
      courseKey: 'abc',
      location: { lat: 35, lng: -92 },
    },
  );
  assert.deepEqual(
    paintMatchForRound(
      { courseName: 'Cypress', courseApiId: null, courseLat: null, courseLng: null },
      { city: null, state: null, location: { lat: 34.7, lng: -92.4 } },
    ),
    {
      name: 'Cypress',
      city: null,
      state: null,
      courseKey: null,
      location: { lat: 34.7, lng: -92.4 },
    },
  );
  assert.equal(
    paintMatchForRound(
      { courseName: 'Cypress', courseLat: 0, courseLng: 0 },
      null,
    )?.location,
    null,
  );
});

test('current hole is the latest started hole, never an assumed hole 1', () => {
  assert.equal(currentPlayedHoleNumber([]), null);
  assert.equal(
    currentPlayedHoleNumber([
      { number: 1, startedAt: null },
      { number: 2, startedAt: 'not-a-date' },
    ]),
    null,
  );
  assert.equal(formatDiagnosticsHole(null), DIAGNOSTICS_UNKNOWN);
  assert.equal(
    currentPlayedHoleNumber([
      { number: 1, startedAt: '2026-09-24T14:00:00.000Z' },
      { number: 4, startedAt: '2026-09-24T15:00:00.000Z' },
      { number: 3, startedAt: '2026-09-24T14:30:00.000Z' },
    ]),
    4,
  );
  assert.equal(
    currentPlayedHoleNumber([
      { number: 2, startedAt: '2026-09-24T14:00:00.000Z' },
      { number: 5, startedAt: '2026-09-24T14:00:00.000Z' },
    ]),
    5,
  );
  assert.equal(formatDiagnosticsHole(4), '4');
});

test('watch fields stay unknown until WatchConnectivity reports them', () => {
  assert.equal(formatDiagnosticsYesNo(null), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatDiagnosticsYesNo(undefined), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatDiagnosticsYesNo(true), 'yes');
  assert.equal(formatDiagnosticsYesNo(false), 'no');
  assert.equal(formatRemainingComplicationTransfers(null), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatRemainingComplicationTransfers(-1), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatRemainingComplicationTransfers(1.5), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatRemainingComplicationTransfers(0), '0');
  assert.equal(formatRemainingComplicationTransfers(8), '8');
  assert.equal(formatLastWatchSend(null), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatLastWatchSend(Number.NaN), DIAGNOSTICS_UNKNOWN);
  assert.equal(formatLastWatchSend(1_700_000_000_000), '2023-11-14T22:13:20.000Z');

  assert.deepEqual(watchLinkFromNative(null), {
    paired: null,
    reachable: null,
    remainingComplicationTransfers: null,
    lastSentAtMs: null,
  });
  assert.deepEqual(watchLinkFromNative({ supported: false, paired: true, reachable: true }), {
    paired: null,
    reachable: null,
    remainingComplicationTransfers: null,
    lastSentAtMs: null,
  });
  assert.deepEqual(
    watchLinkFromNative({ supported: true, activated: false, lastSentAtMs: 42, paired: true }),
    {
      paired: null,
      reachable: null,
      remainingComplicationTransfers: null,
      lastSentAtMs: 42,
    },
  );
  assert.deepEqual(
    watchLinkFromNative({
      supported: true,
      activated: true,
      paired: true,
      reachable: false,
      remainingComplicationTransfers: 7,
      lastSentAtMs: 5,
    }),
    {
      paired: true,
      reachable: false,
      remainingComplicationTransfers: 7,
      lastSentAtMs: 5,
    },
  );
  assert.equal(
    watchLinkFromNative({
      supported: true,
      activated: true,
      paired: 'yes',
      remainingComplicationTransfers: 7.2,
    }).paired,
    null,
  );
  assert.equal(
    watchLinkFromNative({
      supported: true,
      activated: true,
      remainingComplicationTransfers: 7.2,
    }).remainingComplicationTransfers,
    null,
  );
});

test('build line uses the real version, native build, and short commit', () => {
  assert.deepEqual(
    formatDiagnosticsBuild({
      inExpoGo: false,
      nativeApplicationVersion: '0.1.0',
      expoConfigVersion: '9.9.9',
      nativeBuildVersion: '142',
      gitCommitHash: SHA,
    }),
    { version: '0.1.0', buildNumber: '142', commit: '88f28ab' },
  );
  assert.deepEqual(
    formatDiagnosticsBuild({
      inExpoGo: true,
      nativeApplicationVersion: '2.31.0',
      expoConfigVersion: '0.1.0',
      nativeBuildVersion: '54',
      gitCommitHash: null,
    }),
    { version: '0.1.0', buildNumber: DIAGNOSTICS_UNKNOWN, commit: DIAGNOSTICS_UNKNOWN },
  );
  assert.deepEqual(
    formatDiagnosticsBuild({
      inExpoGo: false,
      nativeApplicationVersion: '   ',
      expoConfigVersion: null,
      nativeBuildVersion: 'nope',
      gitCommitHash: 'HEAD',
    }),
    { version: DIAGNOSTICS_UNKNOWN, buildNumber: DIAGNOSTICS_UNKNOWN, commit: DIAGNOSTICS_UNKNOWN },
  );
  assert.equal(
    formatDiagnosticsBuild({
      inExpoGo: false,
      nativeApplicationVersion: null,
      expoConfigVersion: '0.1.0',
      nativeBuildVersion: null,
      gitCommitHash: SHA,
    }).version,
    '0.1.0',
  );
});

test('five taps on the version row open diagnostics; a pause starts over', () => {
  let state = { count: 0, firstAtMs: null as number | null };
  const start = 10_000;
  for (let i = 0; i < 4; i += 1) {
    const next = advanceVersionRowTap(state, start + i * 100);
    assert.equal(next.open, false);
    state = next;
  }
  assert.equal(state.count, 4);
  const opened = advanceVersionRowTap(state, start + 400);
  assert.equal(opened.open, true);
  assert.equal(opened.count, 0);

  const first = advanceVersionRowTap({ count: 0, firstAtMs: null }, start);
  const reset = advanceVersionRowTap(first, start + VERSION_ROW_TAP_WINDOW_MS + 1);
  assert.equal(reset.open, false);
  assert.equal(reset.count, 1);
  assert.equal(reset.firstAtMs, start + VERSION_ROW_TAP_WINDOW_MS + 1);

  const still = advanceVersionRowTap(first, start + VERSION_ROW_TAP_WINDOW_MS);
  assert.equal(still.count, 2);
  assert.equal(still.firstAtMs, start);
});

test('settings hides the screen behind the version row and the watch getter is read-only', () => {
  const settings = readFileSync(new URL('../../app/settings.tsx', import.meta.url), 'utf8');
  assert.match(settings, /advanceVersionRowTap/);
  assert.match(settings, /onLongPress/);
  assert.match(settings, /\/diagnostics/);
  assert.doesNotMatch(settings, /linkRow\([^)]*diagnostics/i);
  assert.doesNotMatch(settings, /['"]Diagnostics['"]/);

  const screen = readFileSync(new URL('../../app/diagnostics.tsx', import.meta.url), 'utf8');
  assert.match(screen, /recordedPaintWaterfallStep/);
  assert.match(screen, /useLiveFix/);
  assert.match(screen, /readLinkStatus/);
  assert.doesNotMatch(screen, /resolveCoursePaint|fetchGolfApi|pushClubListJson|pushWatchMessageJson/);

  const bridge = readFileSync(
    new URL('../../modules/watch-bridge/ios/WatchBridgeModule.swift', import.meta.url),
    'utf8',
  );
  assert.match(bridge, /Function\("readLinkStatus"\)/);
  assert.match(bridge, /noteSuccessfulClubOrComplicationSend/);
  assert.match(bridge, /transferCurrentComplicationUserInfo/);
  assert.match(bridge, /session\.sendMessage\(safe, replyHandler: nil, errorHandler: nil\)/);
  assert.doesNotMatch(bridge, /readLinkStatus[\s\S]{0,400}activate\(\)/);
});
