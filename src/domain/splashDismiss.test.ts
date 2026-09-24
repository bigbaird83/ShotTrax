import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SPLASH_FADE_MS,
  SPLASH_SAFETY_MS,
  planSplashDismiss,
  shouldPlaySplash,
} from './splashDismiss';

test('splash overlay dismisses on end and tap with a short fade, and on timeout immediately', () => {
  assert.equal(SPLASH_FADE_MS, 200);
  assert.equal(SPLASH_SAFETY_MS, 5000);

  assert.deepEqual(planSplashDismiss('end', false), { dismiss: true, fadeMs: 200 });
  assert.deepEqual(planSplashDismiss('tap', false), { dismiss: true, fadeMs: 200 });
  assert.deepEqual(planSplashDismiss('timeout', false), { dismiss: true, fadeMs: 0 });
  assert.deepEqual(planSplashDismiss('error', false), { dismiss: true, fadeMs: 0 });

  assert.deepEqual(planSplashDismiss('end', true), { dismiss: false, fadeMs: 0 });
  assert.deepEqual(planSplashDismiss('tap', true), { dismiss: false, fadeMs: 0 });
  assert.deepEqual(planSplashDismiss('timeout', true), { dismiss: false, fadeMs: 0 });
});

test('splash plays on cold start only, not when returning from background', () => {
  assert.equal(
    shouldPlaySplash({ isColdStart: true, returningFromBackground: false, alreadyDismissed: false }),
    true,
  );
  assert.equal(
    shouldPlaySplash({ isColdStart: false, returningFromBackground: true, alreadyDismissed: false }),
    false,
  );
  assert.equal(
    shouldPlaySplash({ isColdStart: true, returningFromBackground: true, alreadyDismissed: false }),
    false,
  );
  assert.equal(
    shouldPlaySplash({ isColdStart: true, returningFromBackground: false, alreadyDismissed: true }),
    false,
  );
});
