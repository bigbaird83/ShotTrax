import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { THUNDERBIRD_HEBER_SPRINGS_AR_KEY, loadCourseHydrate } from '../course/hydrate';
import {
  classifyNineByTwo,
  courseTeeGreenPasses,
  nineByTwoDoesNotInventCoords,
  nineByTwoMirrorIsPass,
  type NineByTwoHole,
} from './nineByTwo';

const thunderbirdFile = new URL('../course/hydrates/thunderbird-heber-springs-ar.json', import.meta.url);

function thunderbirdHoles(): NineByTwoHole[] {
  const raw = JSON.parse(readFileSync(thunderbirdFile, 'utf8')) as {
    holes: NineByTwoHole[];
  };
  return raw.holes.map((hole) => ({
    hole: hole.hole,
    tee: hole.tee ? { lat: hole.tee.lat, lng: hole.tee.lng } : null,
    green: hole.green ? { lat: hole.green.lat, lng: hole.green.lng } : null,
  }));
}

test('9×2 mirror is a PASS for other courses; Thunderbird golfapi seed does not paint', () => {
  assert.equal(nineByTwoMirrorIsPass(), true);
  assert.equal(nineByTwoDoesNotInventCoords(), true);
  const before = readFileSync(thunderbirdFile, 'utf8');
  const holes = thunderbirdHoles().map((hole) => ({
    ...hole,
    tee: hole.tee ? { lat: hole.tee.lat + 1, lng: hole.tee.lng } : null,
    green: hole.green ? { lat: hole.green.lat + 1, lng: hole.green.lng } : null,
  }));
  const verdict = classifyNineByTwo({ numHoles: 9, holes });
  assert.deepEqual(verdict, { ok: true, kind: 'nine_by_two' });
  assert.deepEqual(courseTeeGreenPasses(holes, 9), { ok: true, kind: 'nine_by_two' });

  for (let n = 1; n <= 9; n += 1) {
    const front = holes.find((hole) => hole.hole === n);
    const back = holes.find((hole) => hole.hole === n + 9);
    assert.deepEqual(back?.tee, front?.tee);
    assert.deepEqual(back?.green, front?.green);
  }
  assert.equal(holes.length, 18);
  assert.equal(readFileSync(thunderbirdFile, 'utf8'), before);

  const loaded = loadCourseHydrate(THUNDERBIRD_HEBER_SPRINGS_AR_KEY);
  assert.equal(loaded, null);
});

test('9×2 does not invent a mirror when the back nine differs or a tee is missing', () => {
  const holes = thunderbirdHoles();
  const shifted = holes.map((hole) =>
    hole.hole === 10 && hole.green
      ? { ...hole, green: { lat: hole.green.lat + 0.01, lng: hole.green.lng } }
      : hole,
  );
  const snapshot = JSON.parse(JSON.stringify(shifted)) as NineByTwoHole[];
  const verdict = classifyNineByTwo({ numHoles: 9, holes: shifted });
  assert.deepEqual(verdict, { ok: false, kind: 'not_nine_by_two', reason: 'not_mirror' });
  assert.deepEqual(shifted, snapshot);
  assert.notEqual(shifted.find((hole) => hole.hole === 10)?.green?.lat, holes[0]?.green?.lat);

  const missingTee = holes.map((hole) => (hole.hole === 1 ? { ...hole, tee: null } : hole));
  assert.deepEqual(classifyNineByTwo({ numHoles: 9, holes: missingTee }), {
    ok: false,
    kind: 'not_nine_by_two',
    reason: 'missing_pair',
  });
  assert.deepEqual(courseTeeGreenPasses(missingTee, 9), {
    ok: false,
    kind: 'hard_miss',
    reason: 'failed_sanity',
  });
  assert.equal(missingTee[0]?.tee, null);

  const frontOnly = holes.filter((hole) => hole.hole <= 9);
  assert.equal(classifyNineByTwo({ numHoles: 9, holes: frontOnly }).ok, false);
  assert.equal(frontOnly.some((hole) => hole.hole > 9), false);
  assert.deepEqual(courseTeeGreenPasses(frontOnly, 9), { ok: true, kind: 'tee_green' });
});

test('scorecard with no coordinates is a hard miss', () => {
  const scorecard: NineByTwoHole[] = [
    { hole: 1, tee: null, green: null },
    { hole: 2, tee: null, green: null },
  ];
  assert.deepEqual(courseTeeGreenPasses(scorecard, 18), {
    ok: false,
    kind: 'hard_miss',
    reason: 'no_coords',
  });
  assert.equal(classifyNineByTwo({ numHoles: 18, holes: scorecard }).ok, false);
});
