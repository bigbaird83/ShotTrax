import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SOFT_GPS_MAX_M, SOFT_GPS_MIN_M } from '../config/sensing';
import { haversineYards, roundYards } from './haversine';
import type { GpsFix } from './types';
import { clubListPayload } from './watchMessages';
import { planLiveGpsToPin } from './yardsToGreen';
import { formatWatchStatusLine, watchStatusLineFromClubList } from './watchStatus';

function fixAt(lat: number, lng: number, accuracyM: number | null): GpsFix {
  return {
    lat,
    lng,
    accuracyM,
    mocked: false,
    isSimulator: false,
    timestamp: 0,
  };
}

const origin = { lat: 37, lng: -122 };
const green = { lat: 37 + 150 / 111_320, lng: -122 };
const liveYards = roundYards(haversineYards(origin, green));

const listBase = {
  top3: ['club_7i'],
  bag: ['club_7i'],
  labels: { club_7i: '7i' },
};

test('Watch status is Hole N · live yards when the fix is good or soft', () => {
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 3, live: { yards: 164, quality: 'good' } }), {
    line: 'Hole 3 · 164 yd',
    soft: false,
    chip: null,
  });
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 3, live: { yards: 150, quality: 'soft' } }), {
    line: 'Hole 3 · 150 yd',
    soft: true,
    chip: 'Approximate',
  });
});

test('Watch soft quality uses Approximate, never SOFT', () => {
  const row = formatWatchStatusLine({ holeNumber: 7, live: { yards: 142, quality: 'soft' } });
  assert.equal(row.chip, 'Approximate');
  assert.doesNotMatch(row.chip ?? '', /SOFT/i);
  assert.doesNotMatch(row.line, /SOFT/i);
});

test('live fix and a loaded green show yards equal to the live distance', () => {
  const good = planLiveGpsToPin({
    fix: fixAt(origin.lat, origin.lng, SOFT_GPS_MIN_M - 0.1),
    green,
  });
  assert.equal(good.quality, 'good');
  assert.equal(good.yards, liveYards);
  const row = formatWatchStatusLine({ holeNumber: 3, live: good });
  assert.equal(row.line, `Hole 3 · ${liveYards} yd`);
  assert.equal(row.chip, null);
  assert.doesNotMatch(row.line, /410/);

  const soft = planLiveGpsToPin({
    fix: fixAt(origin.lat, origin.lng, SOFT_GPS_MIN_M),
    green,
  });
  assert.equal(soft.quality, 'soft');
  assert.equal(soft.yards, liveYards);
  const softRow = formatWatchStatusLine({ holeNumber: 3, live: soft });
  assert.equal(softRow.line, `Hole 3 · ${liveYards} yd`);
  assert.equal(softRow.chip, 'Approximate');

  const msg = clubListPayload({
    ...listBase,
    holeNumber: 3,
    yardsToGreen: 410,
    yardsQuality: 'good',
    complication: good,
  });
  assert.equal(msg.yardsToGreen, 410);
  assert.equal(msg.complicationYards, liveYards);
  const fromList = watchStatusLineFromClubList(msg);
  assert.equal(fromList.line, `Hole 3 · ${liveYards} yd`);
  assert.doesNotMatch(fromList.line, /410/);
});

test('no fix shows a dash even when club-suggest has fallback yards', () => {
  const missing = planLiveGpsToPin({ fix: null, green });
  assert.equal(missing.yards, null);
  assert.equal(missing.quality, 'none');
  const weak = planLiveGpsToPin({
    fix: fixAt(origin.lat, origin.lng, SOFT_GPS_MAX_M + 0.1),
    green,
  });
  assert.equal(weak.quality, 'none');

  for (const live of [missing, weak]) {
    const row = formatWatchStatusLine({ holeNumber: 4, live });
    assert.equal(row.line, 'Hole 4 · —');
    assert.equal(row.soft, false);
    assert.equal(row.chip, null);
    assert.doesNotMatch(row.line, /yd/);

    const msg = clubListPayload({
      ...listBase,
      holeNumber: 4,
      yardsToGreen: 410,
      yardsQuality: 'good',
      complication: live,
    });
    assert.equal(msg.yardsToGreen, 410);
    assert.equal(msg.yardsQuality, 'good');
    assert.equal(msg.complicationYards, null);
    assert.equal(msg.complicationQuality, 'none');
    const shown = watchStatusLineFromClubList(msg);
    assert.equal(shown.line, 'Hole 4 · —');
    assert.equal(shown.chip, null);
    assert.doesNotMatch(shown.line, /410/);
    assert.doesNotMatch(JSON.stringify(shown), /410/);
  }
});

test('no green loaded (Catalog only / HARD-MISS) shows a dash', () => {
  const fix = fixAt(origin.lat, origin.lng, 8);
  for (const greenPin of [null, { lat: 0, lng: 0 }]) {
    const live = planLiveGpsToPin({ fix, green: greenPin });
    assert.equal(live.yards, null);
    assert.equal(live.quality, 'none');
    const msg = clubListPayload({
      ...listBase,
      holeNumber: 8,
      yardsToGreen: 385,
      yardsQuality: 'good',
      complication: live,
    });
    assert.equal(msg.yardsToGreen, 385);
    const shown = watchStatusLineFromClubList(msg);
    assert.equal(shown.line, 'Hole 8 · —');
    assert.equal(shown.chip, null);
    assert.doesNotMatch(shown.line, /385/);
    assert.doesNotMatch(JSON.stringify(shown), /385/);
  }
});

test('Watch status uses an em dash when live yards are missing or not positive', () => {
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 1, live: { yards: null, quality: 'none' } }), {
    line: 'Hole 1 · —',
    soft: false,
    chip: null,
  });
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 1, live: { yards: 90, quality: 'none' } }), {
    line: 'Hole 1 · —',
    soft: false,
    chip: null,
  });
  assert.deepEqual(formatWatchStatusLine({ holeNumber: 1, live: { yards: 0, quality: 'good' } }), {
    line: 'Hole 1 · —',
    soft: false,
    chip: null,
  });
  const forced = watchStatusLineFromClubList({
    holeNumber: 2,
    yardsToGreen: 140,
    yardsQuality: 'good',
    complicationYards: 140,
    complicationQuality: 'forced',
  });
  assert.equal(forced.line, 'Hole 2 · —');
  assert.doesNotMatch(forced.line, /140/);
});

test('Watch status line renders complication yards, not club-rank yardsToGreen', () => {
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const status = session.slice(session.indexOf('var statusLine'), session.indexOf('var showSoft'));
  assert.match(status, /liveYardsTrusted/);
  assert.match(status, /complicationYards/);
  assert.match(status, /Hole \\\(holeNumber\) · \\\(yards\) yd/);
  assert.match(status, /Hole \\\(holeNumber\) · —/);
  assert.doesNotMatch(status, /yardsToGreen/);
  assert.doesNotMatch(status, /yardsQuality/);
  const soft = session.slice(session.indexOf('var showSoft'), session.indexOf('var liveYardsLabel'));
  assert.match(soft, /complicationQuality == "soft"/);
  assert.match(soft, /liveYardsTrusted/);
  assert.doesNotMatch(soft, /yardsQuality/);

  const content = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  assert.match(content, /session\.list\.yardsToGreen/);
  const rank = content.slice(content.indexOf('private var stripPickId'), content.indexOf('private var stripWindowToken'));
  assert.match(rank, /yardsToGreen/);
});
