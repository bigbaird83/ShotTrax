import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldAutoFlipPlayHighContrast } from '../domain/playTheme';
import { readAmbientLight } from './ambientLight';

test('ambient light is parked when the phone has no clean lux reading', () => {
  const reading = readAmbientLight();
  assert.equal(reading.quality, 'unavailable');
  assert.equal(reading.lux, null);
  assert.equal(shouldAutoFlipPlayHighContrast(reading), false);
});
