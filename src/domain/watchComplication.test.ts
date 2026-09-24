import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { clubListPayload, clubListPushKey, parseClubList } from './watchMessages';
import { planPlayHeaderYards } from './yardsToGreen';
import {
  COMPLICATION_EMPTY,
  COMPLICATION_FAMILIES,
  COMPLICATION_KIND,
  COMPLICATION_UNAVAILABLE,
  complicationFromHoleMap,
} from './watchComplication';

const listBase = {
  top3: ['club_7i'],
  bag: ['club_7i'],
  labels: { club_7i: '7i' },
};

test('complication shows the hole-map yards and nothing else', () => {
  const face = complicationFromHoleMap({
    holeNumber: 3,
    map: { yards: 164.4, quality: 'good' },
  });
  assert.equal(face.unavailable, false);
  assert.equal(face.yards, 164);
  assert.equal(face.quality, 'good');
  assert.equal(face.value, '164');
  assert.equal(face.inline, 'Hole 3 · 164 yd');
  assert.equal(face.detail, null);

  const soft = complicationFromHoleMap({
    holeNumber: 7,
    map: { yards: 150, quality: 'soft' },
  });
  assert.equal(soft.yards, 150);
  assert.equal(soft.quality, 'soft');
  assert.equal(soft.inline, 'Hole 7 · 150 yd');
});

test('complication shows Unavailable when the hole map has no trusted yards', () => {
  const missing = planPlayHeaderYards({
    phone: null,
    green: null,
    tee: null,
    courseYards: null,
  });
  assert.equal(missing.yards, null);
  assert.equal(missing.quality, 'none');
  const face = complicationFromHoleMap({ holeNumber: 4, map: missing });
  assert.equal(face.yards, null);
  assert.equal(face.unavailable, true);
  assert.equal(face.value, COMPLICATION_EMPTY);
  assert.equal(face.detail, COMPLICATION_UNAVAILABLE);
  assert.equal(face.inline, `Hole 4 · ${COMPLICATION_EMPTY}`);
  assert.doesNotMatch(face.inline, /\d+ yd/);
  assert.doesNotMatch(face.value, /\d/);

  const untrusted = complicationFromHoleMap({
    holeNumber: 4,
    map: { yards: 90, quality: 'none' },
  });
  assert.equal(untrusted.yards, null);
  assert.equal(untrusted.value, COMPLICATION_EMPTY);
  assert.doesNotMatch(untrusted.inline, /90/);
  assert.doesNotMatch(JSON.stringify(untrusted), /90/);

  const zero = complicationFromHoleMap({
    holeNumber: 1,
    map: { yards: 0, quality: 'good' },
  });
  assert.equal(zero.yards, null);
  assert.equal(zero.unavailable, true);

  const forced = complicationFromHoleMap({
    holeNumber: 2,
    map: { yards: 140, quality: 'forced' },
  });
  assert.equal(forced.yards, null);
  assert.doesNotMatch(forced.inline, /140/);

  // Missing green and no scorecard yards: the hole map has no number, so the face stays empty.
  const missingGreen = planPlayHeaderYards({
    phone: null,
    green: null,
    tee: null,
    courseYards: null,
  });
  const missingFace = complicationFromHoleMap({ holeNumber: 8, map: missingGreen });
  assert.equal(missingGreen.yards, null);
  assert.equal(missingFace.yards, null);
  assert.equal(missingFace.detail, COMPLICATION_UNAVAILABLE);

  // A published card yardage is the hole map's number even before a green is painted.
  const card = planPlayHeaderYards({
    phone: null,
    green: null,
    tee: null,
    courseYards: 371,
  });
  const cardFace = complicationFromHoleMap({ holeNumber: 8, map: card });
  assert.equal(cardFace.yards, card.yards);
  assert.equal(cardFace.unavailable, card.yards == null);
});

test('complication does not invent Hole 1 when no hole is live', () => {
  const face = complicationFromHoleMap({
    holeNumber: null,
    map: { yards: null, quality: 'none' },
  });
  assert.equal(face.holeNumber, null);
  assert.equal(face.inline, COMPLICATION_EMPTY);
  assert.doesNotMatch(face.inline, /Hole/);

  const zeroHole = complicationFromHoleMap({
    holeNumber: 0,
    map: { yards: 164, quality: 'good' },
  });
  assert.equal(zeroHole.holeNumber, null);
  assert.equal(zeroHole.inline, '164 yd');
  assert.doesNotMatch(zeroHole.inline, /Hole 1/);
  assert.doesNotMatch(zeroHole.inline, /Hole 0/);
});

test('complication yards ride on clubList and do not replace club-rank yards', () => {
  const msg = clubListPayload({
    ...listBase,
    holeNumber: 5,
    yardsToGreen: 180,
    yardsQuality: 'good',
    complication: { yards: 164, quality: 'good' },
  });
  assert.equal(msg.yardsToGreen, 180);
  assert.equal(msg.complicationYards, 164);
  assert.equal(msg.complicationQuality, 'good');
  assert.deepEqual(parseClubList(JSON.parse(JSON.stringify(msg))), msg);

  const cleared = clubListPayload({
    ...listBase,
    holeNumber: 5,
    yardsToGreen: 180,
    yardsQuality: 'good',
    complication: { yards: 90, quality: 'none' },
  });
  assert.equal(cleared.yardsToGreen, 180);
  assert.equal(cleared.complicationYards, null);
  assert.equal(cleared.complicationQuality, 'none');
  assert.equal(parseClubList(cleared)?.complicationYards, null);
  assert.doesNotMatch(JSON.stringify(parseClubList(cleared)), /"complicationYards":90/);

  const sameRank = clubListPayload({
    ...listBase,
    holeNumber: 5,
    yardsToGreen: 180,
    yardsQuality: 'good',
    complication: { yards: 150, quality: 'soft' },
  });
  assert.notEqual(clubListPushKey(msg), clubListPushKey(sameRank));
  assert.equal(
    clubListPushKey(msg),
    clubListPushKey(
      clubListPayload({
        ...listBase,
        holeNumber: 5,
        yardsToGreen: 180,
        yardsQuality: 'good',
        complication: { yards: 164, quality: 'good' },
      }),
    ),
  );
});

test('complication uses the watch widget families and the phone hole-map number', () => {
  assert.deepEqual(COMPLICATION_FAMILIES, [
    'accessoryCircular',
    'accessoryCorner',
    'accessoryInline',
    'accessoryRectangular',
  ]);
  assert.equal(COMPLICATION_KIND, 'ShotTraxxHoleYards');

  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const pick = readFileSync(new URL('../../app/round/[id]/club-pick.tsx', import.meta.url), 'utf8');
  const watchPush = hole.slice(hole.indexOf('useWatchClubList'), hole.indexOf('if (!round || !hole)'));
  assert.match(watchPush, /complication:\s*\{[^}]*playHeaderYards\.yards/s);
  assert.match(watchPush, /quality: playHeaderYards\.quality/);
  assert.doesNotMatch(watchPush, /complication:[\s\S]*liveToGreen/);
  assert.doesNotMatch(watchPush, /complication:[\s\S]*liveGpsToPin/);
  assert.match(pick, /complication:\s*\{[^}]*playHeaderYards\.yards/s);
  assert.match(pick, /planPlayHeaderYards\(/);

  const widget = readFileSync(new URL('../../targets/watch-widget/index.swift', import.meta.url), 'utf8');
  assert.match(widget, /kind: "ShotTraxxHoleYards"/);
  assert.match(widget, /complicationYards/);
  assert.match(widget, /complicationQuality/);
  assert.match(widget, /complicationHole/);
  assert.match(widget, /policy: \.never/);
  assert.match(widget, /"Unavailable"/);
  assert.match(widget, /\.accessoryCircular/);
  assert.match(widget, /\.accessoryCorner/);
  assert.match(widget, /\.accessoryInline/);
  assert.match(widget, /\.accessoryRectangular/);
  assert.doesNotMatch(widget, /CoreLocation|CLLocation|WCSession|WatchConnectivity/);
  assert.doesNotMatch(widget, /addingTimeInterval/);
  assert.doesNotMatch(widget, /Hole 1/);
  assert.doesNotMatch(widget, /yardsToGreen/);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(session, /reloadTimelines\(ofKind: "ShotTraxxHoleYards"\)/);
  assert.match(session, /complicationQuality/);
  assert.match(session, /forKey: "complicationYards"/);
  assert.doesNotMatch(
    session.slice(session.indexOf('private func persist'), session.indexOf('private func loadFromDefaults')),
    /CLLocation|requestLocation|startUpdatingLocation/,
  );
});
