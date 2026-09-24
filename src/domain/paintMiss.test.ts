import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { COPY } from './playerCopy';
import { paintMissBannerInventsCoords, planPaintMissBanner } from './paintMiss';

const MISS = { ok: false as const, source: null, fromCache: false };

test('sane cache paint hides the miss banner', () => {
  assert.equal(paintMissBannerInventsCoords(), false);
  assert.equal(
    planPaintMissBanner({
      paintResult: { ok: true, source: 'golfapi', fromCache: true },
      unresolved: true,
      hardMiss: true,
    }),
    null,
  );
  assert.equal(
    planPaintMissBanner({ paintResult: { ok: true, source: 'osm', fromCache: false } }),
    null,
  );
});

test('HARD-MISS is a quiet catalog-only banner and does not invent paint', () => {
  const banner = planPaintMissBanner({ paintResult: MISS, hardMiss: true, unresolved: true });
  assert.ok(banner);
  assert.equal(banner.loud, false);
  assert.equal(banner.testID, 'hard-miss-banner');
  assert.equal(banner.title, COPY.catalogOnlyHardMiss);
  assert.equal(banner.detail, COPY.hardMissNeedPinsDetail);
  assert.match(banner.title, /Catalog only/);
  assert.match(banner.title, /HARD-MISS/);
  assert.doesNotMatch(`${banner.title} ${banner.detail}`, /lat|lng|-?\d+\.\d+/i);
});

test('worker-down and unresolved paint fail loud and are not a GPS bug', () => {
  const missed = planPaintMissBanner({ paintResult: MISS });
  const unresolved = planPaintMissBanner({ unresolved: true });
  assert.deepEqual(missed, unresolved);
  assert.equal(missed?.loud, true);
  assert.equal(missed?.testID, 'paint-miss-banner');
  assert.equal(missed?.title, COPY.paintMissLoud);
  assert.match(missed?.detail ?? '', /Not a GPS problem/);
  assert.doesNotMatch(`${missed?.title} ${missed?.detail}`, /lat|lng|-?\d+\.\d+/i);
  assert.equal(planPaintMissBanner({ paintResult: null }), null);
  assert.equal(planPaintMissBanner({}), null);
});

test('course card, picker, and play entry pair the banner with the paint chip', () => {
  const picker = readFileSync(new URL('../ui/CoursePicker.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  for (const file of [picker, home, hole]) {
    assert.match(file, /planPaintMissBanner/);
    assert.match(file, /formatPaintSourceChip/);
  }
  assert.match(picker, /testID="paint-source-chip"/);
  assert.match(picker, /PaintMissBanner/);
  assert.match(picker, /COPY\.hardMissNeedPins/);
  assert.match(home, /testID="paint-source-chip"/);
  assert.match(home, /PaintMissBanner/);
  assert.match(hole, /planMissCardCopy/);
  assert.match(hole, /paintNotice=\{paintBanner\}/);
  assert.match(hole, /paintSourceChip=\{paintSourceChip\}/);
  assert.match(map, /testID="paint-source-chip"/);
  assert.match(map, /PaintMissBanner/);
  assert.match(map, /COPY\.courseCardMissingFrame/);
  assert.doesNotMatch(picker, /resolveCoursePaint/);
});
