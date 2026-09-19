import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  patchLocationModule,
  stripExpoLocationMotion,
} = require('../../plugins/withDisableExpoLocationMotion.js') as {
  patchLocationModule: (src: string) => string;
  stripExpoLocationMotion: (
    projectRoot: string,
    opts?: { required?: boolean },
  ) => { skipped: boolean; pkgRoot?: string };
};

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const fixtureIos = fileURLToPath(new URL('../../plugins/__fixtures__/expo-location-ios', import.meta.url));

test('ITMS-90683: Watch and phone app code do not ship motion APIs', () => {
  const watch = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  assert.match(watch, /No motion detection/);
  assert.doesNotMatch(watch, /CoreMotion|CMMotionActivity|CMPedometer/);

  const watchPlist = readFileSync(new URL('../../targets/watch/Info.plist', import.meta.url), 'utf8');
  assert.doesNotMatch(watchPlist, /NSMotionUsageDescription/);

  const location = readFileSync(new URL('../services/location.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    location,
    /getMotionActivity|watchMotionActivity|requestMotionActivity|DeviceMotion/,
  );
  assert.match(location, /getCurrentPositionAsync|watchPositionAsync/);
});

test('ITMS-90683: expo-location false still needs a CoreMotion strip, not a dead purpose string', () => {
  const app = readFileSync(new URL('../../app.json', import.meta.url), 'utf8');
  assert.match(app, /"motionUsagePermission": false/);
  assert.match(app, /"\.\/plugins\/withDisableExpoLocationMotion"/);
  assert.doesNotMatch(app, /NSMotionUsageDescription/);
  assert.doesNotMatch(app, /improve GPS accuracy|detect swings|motion data from your Apple Watch/i);

  const plugin = readFileSync(
    new URL('../../plugins/withDisableExpoLocationMotion.js', import.meta.url),
    'utf8',
  );
  assert.match(plugin, /ITMS-90683/);
  assert.match(plugin, /CoreMotion/);
  assert.match(plugin, /prebuilds/);
  assert.doesNotMatch(plugin, /NSMotionUsageDescription": "/);
});

test('ITMS-90683: strip removes CoreMotion from expo-location 57.0.18 sources', () => {
  const original = readFileSync(join(fixtureIos, 'LocationModule.swift'), 'utf8');
  assert.match(original, /import CoreMotion/);
  assert.match(original, /CMMotionActivityManager/);

  const patched = patchLocationModule(original);
  assert.doesNotMatch(patched, /CoreMotion|CMMotionActivity/);
  assert.match(patched, /throw Exceptions\.MotionActivityUnavailable\(\)/);
  assert.match(patched, /getCurrentPositionAsync/);

  const root = mkdtempSync(join(tmpdir(), 'shottrax-motion-'));
  try {
    const pkg = join(root, 'node_modules', 'expo-location');
    mkdirSync(join(pkg, 'ios'), { recursive: true });
    cpSync(fixtureIos, join(pkg, 'ios'), { recursive: true });
    mkdirSync(join(pkg, 'prebuilds', 'output', 'release', 'xcframeworks'), { recursive: true });
    writeFileSync(join(pkg, 'prebuilds', 'output', 'release', 'xcframeworks', 'ExpoLocation.tar.gz'), 'fake');

    const first = stripExpoLocationMotion(root, { required: true });
    assert.equal(first.skipped, false);
    assert.equal(existsSync(join(pkg, 'prebuilds')), false);
    assert.doesNotMatch(
      readFileSync(join(pkg, 'ios', 'LocationModule.swift'), 'utf8'),
      /CoreMotion|CMMotionActivity/,
    );
    assert.doesNotMatch(
      readFileSync(join(pkg, 'ios', 'Requesters', 'MotionActivityPermissionRequester.swift'), 'utf8'),
      /CoreMotion|CMMotionActivity/,
    );
    assert.doesNotMatch(
      readFileSync(join(pkg, 'ios', 'Providers', 'MotionActivityStreamer.swift'), 'utf8'),
      /CoreMotion|CMMotionActivity/,
    );

    const second = stripExpoLocationMotion(root, { required: true });
    assert.equal(second.skipped, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ITMS-90683: strip is a no-op when expo-location is not installed', () => {
  assert.deepEqual(stripExpoLocationMotion(join(repoRoot, 'does-not-exist')), { skipped: true });
});
