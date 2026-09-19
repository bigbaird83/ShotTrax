import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import { planCourseList, planNearbyCourseSearch } from './coursePick';
import {
  isUsZipQuery,
  parseUsZip,
  planZipGeocode,
  zipGeocodeFallsBackToEmptyList,
  zipGeocodeFallsBackToPhoneNearby,
  zipGeocodeInventCoords,
  zipGeocodeQuery,
  zipPointFromGeocode,
  zipSearchUsesMarkGates,
  zipSearchUsesNearbyPath,
  zipSearchUsesWatchGps,
} from './zipGeocode';

test('detects US 5-digit and ZIP+4; name/city/state stay text', () => {
  assert.equal(parseUsZip('72205'), '72205');
  assert.equal(parseUsZip(' 71753 '), '71753');
  assert.equal(parseUsZip('72205-1234'), '72205');
  assert.equal(isUsZipQuery('90210'), true);
  assert.equal(isUsZipQuery('magnolia'), false);
  assert.equal(isUsZipQuery('Little Rock'), false);
  assert.equal(isUsZipQuery('7220'), false);
  assert.equal(isUsZipQuery('72205 Little Rock'), false);
  assert.equal(zipGeocodeQuery('72205'), '72205, USA');
});

test('zip plan is search-near; name search stays today; empty still needs phone', () => {
  const nowMs = 1_000_000;
  const phone = {
    lat: 35.02,
    lng: -92.06,
    accuracyM: 8,
    mocked: false,
    isSimulator: false,
    timestamp: nowMs,
  };
  assert.deepEqual(planNearbyCourseSearch({ query: '72205', phoneFix: phone, nowMs }), {
    mode: 'zip',
    zip: '72205',
  });
  assert.deepEqual(planNearbyCourseSearch({ query: '71753-0001', phoneFix: null, nowMs }), {
    mode: 'zip',
    zip: '71753',
  });
  assert.deepEqual(planNearbyCourseSearch({ query: '  magnolia  ', phoneFix: phone, nowMs }), {
    mode: 'search',
    q: 'magnolia',
  });
  assert.deepEqual(planNearbyCourseSearch({ query: '', phoneFix: phone, nowMs }), {
    mode: 'nearby',
    from: { lat: phone.lat, lng: phone.lng },
  });
});

test('geocode happy path is a real point; miss is explicit', () => {
  assert.equal(zipSearchUsesNearbyPath(), true);
  assert.equal(zipGeocodeFallsBackToPhoneNearby(), false);
  assert.equal(zipGeocodeFallsBackToEmptyList(), false);
  assert.equal(zipGeocodeInventCoords(), false);
  assert.equal(zipSearchUsesWatchGps(), false);
  assert.equal(zipSearchUsesMarkGates(), false);

  const point = zipPointFromGeocode({ latitude: 34.74, longitude: -92.33 });
  assert.deepEqual(planZipGeocode(point), { ok: true, from: { lat: 34.74, lng: -92.33 } });
  assert.deepEqual(planZipGeocode(null), { ok: false, miss: true });
  assert.equal(zipPointFromGeocode({ latitude: 0, longitude: 0 }), null);
  assert.equal(zipPointFromGeocode({ latitude: Number.NaN, longitude: -92 }), null);
  assert.equal(COPY.zipGeocodeMiss, 'Couldn’t find that zip.');
  assert.equal(COPY.zipGeocodeMissHint, 'Try a city or course name.');
});

test('zip search-near sorts from the geocoded point, not the phone', () => {
  const zipFrom = { lat: 33.27, lng: -93.24 };
  const phone = {
    lat: 35.02,
    lng: -92.06,
    accuracyM: 8,
    mocked: false,
    isSimulator: false,
    timestamp: 1_000_000,
  };
  const courses = [
    { id: 'lr', name: 'Little Rock CC', location: { lat: 35.021, lng: -92.061 } },
    { id: 'mag', name: 'Magnolia CC', location: { lat: 33.271, lng: -93.241 } },
  ];
  assert.deepEqual(
    planCourseList({ courses, phoneFix: phone, from: zipFrom, nowMs: 1_000_000 }).map((row) => row.id),
    ['mag', 'lr'],
  );
});

test('picker geocodes zip then nearby; miss never falls back to phone or an empty list', () => {
  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  const findFn = picker.slice(picker.indexOf('const onFind'), picker.indexOf('useEffect(() => {\n    onRefreshReady'));
  assert.match(findFn, /parseUsZip\(query\)/);
  assert.match(findFn, /zipQuery \? null : await getCurrentFix/);
  assert.match(findFn, /planNearbyCourseSearch/);
  assert.match(findFn, /plan\.mode === 'zip'/);
  assert.match(findFn, /geocodeUsZip\(plan\.zip\)/);
  assert.match(findFn, /nearbyCourses\(geo\.from\)/);
  assert.match(findFn, /COPY\.zipGeocodeMiss/);
  assert.match(findFn, /setResults\(null\)/);
  assert.match(findFn, /searchCourses\(plan\.q\)/);
  assert.match(findFn, /nearbyCourses\(plan\.from\)/);
  assert.doesNotMatch(findFn, /watchFix|preferWatchFix|acceptFix|forceMark/);

  const zipBlock = findFn.slice(findFn.indexOf("plan.mode === 'zip'"), findFn.indexOf("plan.mode === 'search'"));
  assert.match(zipBlock, /geocodeUsZip/);
  assert.match(zipBlock, /COPY\.zipGeocodeMiss/);
  assert.doesNotMatch(zipBlock, /searchCourses/);
  assert.doesNotMatch(zipBlock, /nearbyCourses\(plan\.from\)/);
  assert.doesNotMatch(zipBlock, /nearbyCourses\(rawFix/);
  assert.doesNotMatch(zipBlock, /getCurrentFix/);

  const service = readFileSync(new URL('../services/geocodeZip.ts', import.meta.url), 'utf8');
  assert.match(service, /Location\.geocodeAsync/);
  assert.match(service, /zipPointFromGeocode/);
  assert.match(service, /planZipGeocode/);
  assert.doesNotMatch(service, /72205|71753|34\.74|33\.27/);
});
