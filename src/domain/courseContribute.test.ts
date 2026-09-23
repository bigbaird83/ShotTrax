import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CONTRIBUTE_GPS_STEPS,
  contributeFixBlockedReason,
  contributeFixQuality,
  contributeGpsHoles,
  contributeHoleYards,
  contributeParOk,
  contributePinFromFix,
  contributionEmail,
  contributionMailto,
  contributionMutatesPaint,
  knownCourseCity,
  listContributions,
  queueContribution,
  validateContribution,
  type ContributeDraft,
  type ContributeGpsHole,
  type JsonStore,
} from './courseContribute';
import { SHOTTRAXX_CONTACT_EMAIL } from './courseRequest';
import { haversineYards } from './haversine';
import type { GpsFix } from './types';

function fix(overrides: Partial<GpsFix> = {}): GpsFix {
  return {
    lat: 35.4912,
    lng: -92.0311,
    accuracyM: 8,
    mocked: false,
    isSimulator: false,
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

function memoryStore(): JsonStore & { writes: number } {
  const map = new Map<string, string>();
  return {
    writes: 0,
    get: (key) => map.get(key) ?? null,
    set(key, value) {
      this.writes += 1;
      map.set(key, value);
    },
  };
}

/** Real-looking tee/green ~330 yd apart per hole. */
function pinnedHoles(count: 9 | 18, par = 4): ContributeGpsHole[] {
  return contributeGpsHoles(count).map((hole) => {
    const lat = 35.48 + hole.hole * 0.004;
    const tee = contributePinFromFix(fix({ lat, lng: -92.03, accuracyM: 6 }));
    const green = contributePinFromFix(fix({ lat: lat + 0.0027, lng: -92.03, accuracyM: 18 }));
    return { ...hole, par, tee, green };
  });
}

function draft(overrides: Partial<ContributeDraft> = {}): ContributeDraft {
  return {
    courseName: 'Cedar Glade',
    city: 'Heber Springs, AR',
    claimedHoleCount: 9,
    sheet: '',
    email: '',
    grantCommercialOdbl: true,
    notes: '',
    now: '2026-09-23T15:00:00.000Z',
    gpsHoles: pinnedHoles(9),
    photo: { uri: 'file:///cache/ImagePicker/scorecard-1.jpg' },
    ...overrides,
  };
}

test('GPS quality gate: good and soft save, none is disabled with a reason', () => {
  assert.equal(contributeFixQuality(fix({ accuracyM: 5 })), 'good');
  assert.equal(contributeFixQuality(fix({ accuracyM: 15 })), 'soft');
  assert.equal(contributeFixQuality(fix({ accuracyM: 25 })), 'soft');
  assert.equal(contributeFixQuality(fix({ accuracyM: 25.1 })), 'none');
  assert.equal(contributeFixQuality(fix({ accuracyM: null })), 'none');
  assert.equal(contributeFixQuality(null), 'none');
  assert.equal(contributeFixQuality(undefined), 'none');
  assert.equal(contributeFixQuality(fix({ mocked: true })), 'none');
  assert.equal(contributeFixQuality(fix({ isSimulator: true })), 'none');
  assert.equal(contributeFixQuality(fix({ lat: 0, lng: 0 })), 'none');
  assert.equal(contributeFixQuality(fix({ lat: Number.NaN })), 'none');

  assert.equal(contributeFixBlockedReason(fix({ accuracyM: 5 })), null);
  assert.equal(contributeFixBlockedReason(fix({ accuracyM: 20 })), null);
  assert.match(contributeFixBlockedReason(null) ?? '', /Waiting for GPS/);
  assert.match(contributeFixBlockedReason(fix({ accuracyM: 40 })) ?? '', /too weak \(±40 m\)/);
  assert.match(contributeFixBlockedReason(fix({ mocked: true })) ?? '', /Simulated/);

  const screen = readFileSync(new URL('../../app/contribute-course.tsx', import.meta.url), 'utf8');
  assert.match(screen, /disabled=\{quality === 'none'/);
  assert.match(screen, /COPY\.contributeOnTee/);
  assert.match(screen, /COPY\.contributeOnGreen/);
});

test('no-invent: pins are the fix as reported, or nothing', () => {
  const good = contributePinFromFix(fix({ lat: 35.123456, lng: -92.654321, accuracyM: 7 }));
  assert.deepEqual(good, { lat: 35.123456, lng: -92.654321, accuracyM: 7, quality: 'good' });
  assert.equal(contributePinFromFix(fix({ accuracyM: 60 })), null);
  assert.equal(contributePinFromFix(null), null);
  assert.equal(contributePinFromFix(fix({ mocked: true })), null);

  const holes = pinnedHoles(9);
  holes[2] = { ...holes[2], green: null };
  const store = memoryStore();
  const missing = queueContribution(store, draft({ gpsHoles: holes }));
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.ok(missing.issues.some((i) => i.code === 'pins' && /Hole 3 needs a green pin/.test(i.message)));
  }
  assert.equal(listContributions(store).length, 0);
  assert.equal(store.writes, 0);

  // A pin claiming "good" with a poor accuracy is not accepted.
  const forged = pinnedHoles(9);
  forged[0] = { ...forged[0], tee: { lat: 35.5, lng: -92.03, accuracyM: 40, quality: 'good' } };
  const bad = validateContribution(draft({ gpsHoles: forged }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.issues.some((i) => i.code === 'gps'));

  // Yards are only shown once both pins exist, and are measured, not typed.
  assert.equal(contributeHoleYards({ tee: holes[2].tee, green: null }), null);
  const h1 = holes[0];
  assert.equal(contributeHoleYards(h1), Math.round(haversineYards(h1.tee!, h1.green!)));
});

test('9 vs 18 holes', () => {
  assert.equal(contributeGpsHoles(9).length, 9);
  assert.equal(contributeGpsHoles(18).length, 18);
  assert.deepEqual(
    contributeGpsHoles(18).map((h) => h.hole),
    Array.from({ length: 18 }, (_, i) => i + 1),
  );
  const nine = pinnedHoles(9);
  const grown = contributeGpsHoles(18, nine);
  assert.equal(grown.length, 18);
  assert.deepEqual(grown[4], nine[4]);
  assert.equal(grown[12].tee, null);
  assert.equal(contributeGpsHoles(9, grown).length, 9);

  const ok9 = validateContribution(draft());
  assert.equal(ok9.ok, true);
  if (ok9.ok) assert.equal(ok9.contribution.rows.length, 9);

  const ok18 = validateContribution(draft({ claimedHoleCount: 18, gpsHoles: pinnedHoles(18) }));
  assert.equal(ok18.ok, true);
  if (ok18.ok) assert.equal(ok18.contribution.rows.length, 18);

  const short = validateContribution(draft({ claimedHoleCount: 18, gpsHoles: pinnedHoles(9) }));
  assert.equal(short.ok, false);
  if (!short.ok) {
    assert.ok(short.issues.some((i) => i.code === 'hole_count'));
    assert.ok(short.issues.some((i) => /Hole 10/.test(i.message)));
  }
});

test('par must be 3–6 on every hole', () => {
  for (const par of [3, 4, 5, 6]) assert.equal(contributeParOk(par), true);
  for (const par of [2, 7, 0, 4.5, Number.NaN, null, undefined]) assert.equal(contributeParOk(par), false);

  const holes = pinnedHoles(9);
  holes[6] = { ...holes[6], par: 7 };
  holes[7] = { ...holes[7], par: null };
  const verdict = validateContribution(draft({ gpsHoles: holes }));
  assert.equal(verdict.ok, false);
  if (!verdict.ok) {
    const parIssues = verdict.issues.filter((i) => i.code === 'par').map((i) => i.message);
    assert.deepEqual(parIssues, ['Hole 7 needs par 3–6.', 'Hole 8 needs par 3–6.']);
  }
});

test('email payload lists pins, pars, yards, name, location, and the attached photo; nothing paints', () => {
  assert.equal(SHOTTRAXX_CONTACT_EMAIL, 'ShotTraxx@gmail.com');
  assert.equal(contributionMutatesPaint(), false);

  const store = memoryStore();
  const holes = pinnedHoles(9);
  holes[0] = { ...holes[0], par: 3 };
  const verdict = queueContribution(store, draft({ gpsHoles: holes }));
  assert.equal(verdict.ok, true);
  if (!verdict.ok) return;
  assert.equal(listContributions(store).length, 1);
  assert.equal(verdict.contribution.source, 'gps');

  const mail = contributionEmail(verdict.contribution);
  assert.deepEqual(mail.recipients, ['ShotTraxx@gmail.com']);
  assert.deepEqual(mail.attachments, ['file:///cache/ImagePicker/scorecard-1.jpg']);
  assert.match(mail.subject, /Cedar Glade — Heber Springs, AR/);
  assert.match(mail.body, /^Course: Cedar Glade$/m);
  assert.match(mail.body, /^City: Heber Springs, AR$/m);
  assert.match(mail.body, /^Holes: 9$/m);
  assert.match(mail.body, /^Scorecard photo: attached \(scorecard\.jpg\)$/m);
  assert.match(mail.body, /does not paint the course/);
  assert.match(mail.body, /^hole,tee_lat,tee_lon,green_lat,green_lon,par,yards,tee_fix,green_fix$/m);
  const h1 = holes[0];
  const yards1 = Math.round(haversineYards(h1.tee!, h1.green!));
  assert.ok(
    mail.body.includes(`1,${h1.tee!.lat},${h1.tee!.lng},${h1.green!.lat},${h1.green!.lng},3,${yards1},good,soft`),
  );
  for (let n = 2; n <= 9; n += 1) assert.match(mail.body, new RegExp(`^${n},.*,4,\\d+,good,soft$`, 'm'));

  // mailto fallback cannot attach; it says so instead of claiming an attachment.
  const mailto = decodeURIComponent(contributionMailto(verdict.contribution));
  assert.match(mailto, /^mailto:ShotTraxx@gmail\.com\?/);
  assert.match(mailto, /Scorecard photo: taken — please attach it/);
  assert.doesNotMatch(mailto, /Scorecard photo: attached/);

  const noPhoto = validateContribution(draft({ photo: null }));
  assert.equal(noPhoto.ok, true);
  if (noPhoto.ok) {
    const plain = contributionEmail(noPhoto.contribution);
    assert.deepEqual(plain.attachments, []);
    assert.match(plain.body, /^Scorecard photo: none$/m);
  }

  const noGrant = validateContribution(draft({ grantCommercialOdbl: false }));
  assert.equal(noGrant.ok, false);
  if (!noGrant.ok) assert.ok(noGrant.issues.some((i) => i.code === 'grant'));
  const noName = validateContribution(draft({ courseName: ' ', city: '' }));
  assert.equal(noName.ok, false);
  if (!noName.ok) {
    assert.ok(noName.issues.some((i) => i.code === 'name'));
    assert.ok(noName.issues.some((i) => i.code === 'location'));
  }

  const domain = readFileSync(new URL('./courseContribute.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(domain, /resolveCoursePaint|setCoursePaintCache|rememberResolvedTee|cache\.put/);
  const screen = readFileSync(new URL('../../app/contribute-course.tsx', import.meta.url), 'utf8');
  assert.match(screen, /contributionEmail/);
  assert.match(screen, /contributionMailto/);
  assert.match(screen, /queueContribution/);
  assert.doesNotMatch(screen, /resolveCoursePaint|setCoursePaintCache/);
});

test('location is asked only when the course is not already known', () => {
  const places = [
    { name: 'Thunderbird Golf Course', city: 'Heber Springs', state: 'AR', aliases: ['Thunderbird'] },
    { name: 'No City Links', city: null },
  ];
  assert.equal(knownCourseCity('thunderbird golf course', places), 'Heber Springs, AR');
  assert.equal(knownCourseCity('Thunderbird', places), 'Heber Springs, AR');
  assert.equal(knownCourseCity('No City Links', places), null);
  assert.equal(knownCourseCity('Brand New Nine', places), null);
  assert.equal(knownCourseCity('  ', places), null);
});

test('on-screen steps say middle of tee, middle of green, wait for GPS, tap', () => {
  const text = CONTRIBUTE_GPS_STEPS.join(' ');
  assert.match(text, /middle of the tee box, wait for GPS, then tap/);
  assert.match(text, /middle of the green, wait for GPS, then tap/);
});
