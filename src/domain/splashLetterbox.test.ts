import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SPLASH_BG, SPLASH_FRAME, SPLASH_RESIZE_MODE, splashLetterboxSize } from './splashLetterbox';

test('splash frame is contained on a tall phone — never a square crop or cover', () => {
  assert.equal(SPLASH_BG, '#000101');
  assert.equal(SPLASH_RESIZE_MODE, 'contain');
  assert.notEqual(SPLASH_RESIZE_MODE, 'cover');
  assert.notEqual(SPLASH_RESIZE_MODE, 'stretch');
  assert.deepEqual(SPLASH_FRAME, { width: 784, height: 1168 });

  // iPhone 14 / 15 class. Width-limited: full width, letterbox above and below.
  // A square or cover fit would crop the wordmark into a huge partial Traxx.
  const tall = splashLetterboxSize(393, 852);
  assert.equal(tall.width, 393);
  assert.ok(Math.abs(tall.height - 1168 * (393 / 784)) < 1e-9);
  assert.ok(tall.height < 852);
  assert.ok(tall.height > 393);

  const fourteen = splashLetterboxSize(390, 844);
  assert.equal(fourteen.width, 390);
  assert.ok(fourteen.height < 844);

  const max = splashLetterboxSize(430, 932);
  assert.equal(max.width, 430);
  assert.ok(max.height < 932);

  // Landscape / tablet: bars on the sides, full height.
  const wide = splashLetterboxSize(1024, 768);
  assert.equal(wide.height, 768);
  assert.ok(wide.width < 1024);
  assert.ok(Math.abs(wide.width - 784 * (768 / 1168)) < 1e-9);
});
