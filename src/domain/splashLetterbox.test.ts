import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPLASH_BG, SPLASH_RESIZE_MODE, splashLetterboxSize } from './splashLetterbox';

test('TF 65: square splash letterboxes on the short edge — never cover or stretch', () => {
  assert.equal(SPLASH_BG, '#000000');
  assert.equal(SPLASH_RESIZE_MODE, 'contain');
  assert.notEqual(SPLASH_RESIZE_MODE, 'cover');
  assert.notEqual(SPLASH_RESIZE_MODE, 'stretch');

  // iPhone 14 / 15 class — tall portrait. Cover would crop to a huge partial "Tra…".
  assert.deepEqual(splashLetterboxSize(390, 844), { width: 390, height: 390 });
  assert.deepEqual(splashLetterboxSize(393, 852), { width: 393, height: 393 });
  assert.deepEqual(splashLetterboxSize(430, 932), { width: 430, height: 430 });

  // Landscape / tablet: bars on the sides.
  assert.deepEqual(splashLetterboxSize(1024, 768), { width: 768, height: 768 });
});
