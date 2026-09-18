import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SHOT_YD } from '../config/sensing';
import { isValidLatLng } from './latLng';
import {
  lastClubMark,
  markToGreen,
  planToGreenDisplay,
  resolveGreenPin,
  toGreenDisplayFromHole,
  yardsToGreenLabel,
} from './yardsToGreen';

const from = { lat: 37.0, lng: -122.0 };
const green = { lat: 37.0 + 150 / 111_320, lng: -122.0 };

test('isValidLatLng rejects missing, 0,0, and out-of-range — never invent a pin', () => {
  assert.equal(isValidLatLng(null), false);
  assert.equal(isValidLatLng(undefined), false);
  assert.equal(isValidLatLng({ lat: 0, lng: 0 }), false);
  assert.equal(isValidLatLng({ lat: 91, lng: 0.1 }), false);
  assert.equal(isValidLatLng({ lat: 37, lng: -122 }), true);
});

test('resolveGreenPin prefers user estimate, then course centroid, else null', () => {
  assert.equal(resolveGreenPin({ user: null, course: null }), null);
  assert.deepEqual(resolveGreenPin({ user: null, course: green }), {
    ...green,
    source: 'course_centroid',
  });
  assert.deepEqual(resolveGreenPin({ user: from, course: green }), {
    ...from,
    source: 'user_estimate',
  });
  assert.equal(resolveGreenPin({ user: { lat: 0, lng: 0 }, course: null }), null);
});

test('yardsToGreenLabel shows — when quality is none', () => {
  const copy = yardsToGreenLabel(
    { yards: null, quality: 'none' },
    { hasFix: true, hasGreen: false },
  );
  assert.equal(copy.value, '—');
  assert.equal(copy.detail, 'Waiting on green location.');
});

test('yardsToGreenLabel shows yards without GPS preaching', () => {
  const copy = yardsToGreenLabel({ yards: 164, quality: 'soft' });
  assert.equal(copy.value, '164 yd');
});

test('home-scale phone distance does not replace the course tee yardage', () => {
  const home = planToGreenDisplay({
    courseYards: 282,
    liveYards: 14167,
    liveQuality: 'good',
    shotCount: 0,
    hasGreen: true,
  });
  assert.deepEqual(home, { yards: 282, source: 'course', quality: 'good' });

  const fromHole = toGreenDisplayFromHole({
    courseYards: 282,
    green,
    shots: [],
    phone: { yards: 14167, quality: 'good' },
  });
  assert.equal(fromHole.yards, 282);
  assert.equal(fromHole.source, 'course');
});

test('a mark more than 50 yards off the card switches to mark-to-green', () => {
  const keepCard = planToGreenDisplay({
    courseYards: 282,
    liveYards: 240,
    liveQuality: 'good',
    shotCount: 1,
    hasGreen: true,
  });
  assert.deepEqual(keepCard, { yards: 282, source: 'course', quality: 'good' });

  const switchLive = planToGreenDisplay({
    courseYards: 282,
    liveYards: 200,
    liveQuality: 'good',
    shotCount: 1,
    hasGreen: true,
  });
  assert.deepEqual(switchLive, { yards: 200, source: 'live', quality: 'good' });

  const mark = { lat: 37.0 + 200 / 111_320, lng: -122.0 };
  const live = markToGreen(mark, { lat: 37.0 + 400 / 111_320, lng: -122.0 });
  assert.ok(live.yards != null && live.yards > 50);
  const fromMark = toGreenDisplayFromHole({
    courseYards: 282,
    green: { lat: 37.0 + 400 / 111_320, lng: -122.0 },
    shots: [{ seq: 1, startLat: mark.lat, startLng: mark.lng }],
    phone: { yards: 14167, quality: 'good' },
  });
  assert.equal(fromMark.source, 'live');
  assert.equal(fromMark.yards, live.yards);
  assert.notEqual(fromMark.yards, 14167);
});

test('over 600 falls back to the course number or dash', () => {
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 282,
      liveYards: 14167,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: 282, source: 'course', quality: 'good' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 520,
      liveYards: 601,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: 520, source: 'course', quality: 'good' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 520,
      liveYards: 600,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: 600, source: 'live', quality: 'good' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: null,
      liveYards: 700,
      liveQuality: 'good',
      shotCount: 1,
      hasGreen: true,
    }),
    { yards: null, source: 'none', quality: 'none' },
  );
});

test('no course yardage uses live at 600 or under; quality none and no green stay —', () => {
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: null,
      liveYards: 148,
      liveQuality: 'good',
      shotCount: 0,
      hasGreen: true,
    }),
    { yards: 148, source: 'live', quality: 'good' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: null,
      liveYards: 14167,
      liveQuality: 'good',
      shotCount: 0,
      hasGreen: true,
    }),
    { yards: null, source: 'none', quality: 'none' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 282,
      liveYards: 148,
      liveQuality: 'none',
      shotCount: 0,
      hasGreen: true,
    }),
    { yards: 282, source: 'course', quality: 'good' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: null,
      liveYards: 148,
      liveQuality: 'none',
      shotCount: 0,
      hasGreen: true,
    }),
    { yards: null, source: 'none', quality: 'none' },
  );
  assert.deepEqual(
    planToGreenDisplay({
      courseYards: 282,
      liveYards: 200,
      liveQuality: 'good',
      shotCount: 0,
      hasGreen: false,
    }),
    { yards: null, source: 'none', quality: 'none' },
  );
});

test('400-yard shot-save confirm stays a separate gate from to-green display', () => {
  assert.equal(MAX_SHOT_YD, 400);
  const at401 = planToGreenDisplay({
    courseYards: 282,
    liveYards: 401,
    liveQuality: 'good',
    shotCount: 1,
    hasGreen: true,
  });
  assert.equal(at401.yards, 401);
  assert.equal(at401.source, 'live');
});

test('lastClubMark is the latest from pin, never invented', () => {
  assert.equal(lastClubMark([]), null);
  assert.equal(lastClubMark([{ seq: 1, startLat: null, startLng: null }]), null);
  assert.deepEqual(
    lastClubMark([
      { seq: 1, startLat: 37, startLng: -122 },
      { seq: 2, startLat: 37.1, startLng: -122.1 },
    ]),
    { lat: 37.1, lng: -122.1 },
  );
});
