/**
 * ITMS-90683 hotfix: expo-location's `motionUsagePermission: false` only
 * deletes NSMotionUsageDescription. The iOS module still compiles
 * CoreMotion / CMMotionActivityManager (Expo #49319). ShotTraxx does not
 * ship Watch swing assist or call motion APIs, so this plugin strips that
 * linkage instead of adding a dead purpose string.
 *
 * Expo's real opt-out (EXPO_LOCATION_DISABLE_MOTION, PR #49409) is not in
 * expo-location 57.0.x. Until it is, prebuild:
 *   1. Drops the prebuilt ExpoLocation xcframework (it already contains
 *      CoreMotion symbols if EAS sets EXPO_USE_PRECOMPILED_MODULES=1).
 *   2. Rewrites the 57.0.x motion sources so a source build has no
 *      CoreMotion import.
 */
const fs = require('fs');
const path = require('path');

const MOTION_RE = /import CoreMotion|\bCMMotionActivity/;

const STUB_REQUESTER = `import ExpoModulesCore

/// ShotTraxx does not ship motion activity. Stub keeps the type without that framework.
class MotionActivityPermissionRequester: NSObject, EXPermissionsRequester {
  static func permissionType() -> String {
    "motionActivity"
  }

  func getPermissions() -> [AnyHashable: Any] {
    ["status": EXPermissionStatusDenied.rawValue]
  }

  func requestPermissions(
    resolver resolve: @escaping EXPromiseResolveBlock,
    rejecter reject: @escaping EXPromiseRejectBlock
  ) {
    resolve(getPermissions())
  }
}
`;

const STUB_STREAMER = `import ExpoModulesCore

/// ShotTraxx does not ship motion activity. Stub keeps the type without that framework.
internal final class MotionActivityStreamer {
  func streamMotionActivity() throws -> AsyncThrowingStream<Never, Error> {
    throw Exceptions.MotionActivityUnavailable()
  }

  func stopStreaming() {}
}
`;

function replaceOnce(src, find, replacement, fileLabel) {
  const index = src.indexOf(find);
  if (index === -1) {
    throw new Error(`ShotTraxx motion strip: missing expected text in ${fileLabel}`);
  }
  if (src.indexOf(find, index + find.length) !== -1) {
    throw new Error(`ShotTraxx motion strip: expected a single match in ${fileLabel}`);
  }
  return src.slice(0, index) + replacement + src.slice(index + find.length);
}

function replaceBlock(src, startMarker, nextMarker, replacement, fileLabel) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(nextMarker);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`ShotTraxx motion strip: could not locate ${startMarker} in ${fileLabel}`);
  }
  return src.slice(0, start) + replacement + src.slice(end);
}

function assertNoMotionSymbols(src, fileLabel) {
  if (MOTION_RE.test(src)) {
    throw new Error(`ShotTraxx motion strip: ${fileLabel} still references CoreMotion`);
  }
}

function patchLocationModule(src) {
  let next = replaceOnce(src, 'import CoreMotion\n', '', 'LocationModule.swift import');
  next = replaceOnce(
    next,
    '          EXBackgroundLocationPermissionRequester(),\n          MotionActivityPermissionRequester()\n',
    '          EXBackgroundLocationPermissionRequester()\n',
    'LocationModule.swift requester list',
  );
  next = replaceBlock(
    next,
    '    AsyncFunction("watchMotionActivityImplAsync")',
    '    AsyncFunction("removeWatchAsync")',
    '    AsyncFunction("watchMotionActivityImplAsync") { (_watchId: Int) in\n      throw Exceptions.MotionActivityUnavailable()\n    }\n\n',
    'LocationModule.swift watchMotionActivityImplAsync',
  );
  next = replaceBlock(
    next,
    '    AsyncFunction("getMotionActivityPermissionsAsync")',
    '    AsyncFunction("getPermissionsAsync")',
    '    AsyncFunction("getMotionActivityPermissionsAsync") { (_promise: Promise) in\n      throw Exceptions.MotionActivityUnavailable()\n    }\n\n    AsyncFunction("requestMotionActivityPermissionsAsync") { (_promise: Promise) in\n      throw Exceptions.MotionActivityUnavailable()\n    }\n\n',
    'LocationModule.swift motion permission functions',
  );
  assertNoMotionSymbols(next, 'LocationModule.swift');
  return next;
}

function rmPrebuilds(pkgRoot) {
  const prebuilds = path.join(pkgRoot, 'prebuilds');
  if (fs.existsSync(prebuilds)) {
    fs.rmSync(prebuilds, { recursive: true, force: true });
  }
}

function motionSourcePaths(pkgRoot) {
  return {
    locationModule: path.join(pkgRoot, 'ios', 'LocationModule.swift'),
    requester: path.join(pkgRoot, 'ios', 'Requesters', 'MotionActivityPermissionRequester.swift'),
    streamer: path.join(pkgRoot, 'ios', 'Providers', 'MotionActivityStreamer.swift'),
  };
}

function alreadyStripped(pkgRoot) {
  const files = motionSourcePaths(pkgRoot);
  return Object.values(files).every((file) => {
    return fs.existsSync(file) && !MOTION_RE.test(fs.readFileSync(file, 'utf8'));
  });
}

/**
 * @param {string} projectRoot
 * @param {{ required?: boolean }} [opts]
 */
function stripExpoLocationMotion(projectRoot, opts = {}) {
  const required = Boolean(opts.required);
  const pkgRoot = path.join(projectRoot, 'node_modules', 'expo-location');
  if (!fs.existsSync(pkgRoot)) {
    if (required) {
      throw new Error('ShotTraxx motion strip: expo-location is not installed');
    }
    return { skipped: true };
  }

  rmPrebuilds(pkgRoot);

  const files = motionSourcePaths(pkgRoot);
  for (const file of Object.values(files)) {
    if (!fs.existsSync(file)) {
      throw new Error(`ShotTraxx motion strip: missing ${file}`);
    }
  }

  if (!alreadyStripped(pkgRoot)) {
    fs.writeFileSync(files.locationModule, patchLocationModule(fs.readFileSync(files.locationModule, 'utf8')));
    fs.writeFileSync(files.requester, STUB_REQUESTER);
    fs.writeFileSync(files.streamer, STUB_STREAMER);
  }

  for (const file of Object.values(files)) {
    assertNoMotionSymbols(fs.readFileSync(file, 'utf8'), path.basename(file));
  }

  if (fs.existsSync(path.join(pkgRoot, 'prebuilds'))) {
    throw new Error('ShotTraxx motion strip: expo-location/prebuilds still present');
  }

  return { skipped: false, pkgRoot };
}

function projectRootFromConfig(config) {
  return config.modRequest?.projectRoot || config._internal?.projectRoot || process.cwd();
}

function withDisableExpoLocationMotion(config) {
  const { withDangerousMod } = require('expo/config-plugins');
  stripExpoLocationMotion(projectRootFromConfig(config));

  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      stripExpoLocationMotion(modConfig.modRequest.projectRoot, { required: true });
      return modConfig;
    },
  ]);
}

module.exports = withDisableExpoLocationMotion;
module.exports.stripExpoLocationMotion = stripExpoLocationMotion;
module.exports.patchLocationModule = patchLocationModule;
module.exports.STUB_REQUESTER = STUB_REQUESTER;
module.exports.STUB_STREAMER = STUB_STREAMER;
