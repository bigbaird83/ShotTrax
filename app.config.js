/**
 * Dynamic Expo config.
 *
 * Display name is ShotTraxx™ (`expo.name`, iOS CFBundleDisplayName, Android
 * label). Bundle ID `com.shottrax.app` and slug `shottrax` stay unchanged.
 * `expo.icon` (`./assets/images/icon.png`) is the owner flag mark on `#010101`.
 * Android adaptive siblings are unchanged. `splash-icon.png` is the first
 * frame of Doc’s 3s open clip (same still as splash-first-frame-v2).
 *
 * No vendor key rides in the app. Course search and paint go through the
 * share-sync Worker (EXPO_PUBLIC_SHARE_SYNC_URL → expo.extra.shareSyncUrl),
 * which holds GOLF_COURSES_API_KEY and GOLFAPI_KEY as Cloudflare secrets.
 * `golfCoursesApiKey` / `golfApiKey` are stripped from extra even if an old
 * app.json or env still carries them.
 *
 * Optional shared paint cache (not a secret): EXPO_PUBLIC_COURSE_PAINT_CACHE_URL
 * is copied into expo.extra.coursePaintCacheUrl. JSON GET/PUT. Unset → device only.
 *
 * Settings build stamp (not secrets):
 * - expo.extra.easBuildId ← EAS_BUILD_ID (set only while app.config.js runs on an EAS builder)
 * - expo.extra.gitCommitHash ← EAS_BUILD_GIT_COMMIT_HASH, else `git rev-parse HEAD`
 * The TestFlight number is not copied here. `cli.appVersionSource` is remote, so
 * app.json `ios.buildNumber` is not the store build. The device reads
 * Application.nativeBuildVersion (CFBundleVersion) at runtime.
 *
 * TEMP yard test course (Goode Circle Test, on-device QA only):
 * expo.extra.debugYardCourse is true only when EXPO_PUBLIC_DEBUG_YARD_COURSE=1
 * and the EAS profile is not `production`. The production profile is always
 * false, even if app.json or the env says otherwise. `__DEV__` builds pass the
 * gate without it. The Settings switch (default off) still has to be on.
 *
 * Do not commit a key.
 * @param {{ config: Record<string, unknown> }} args
 */
function trimKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** EAS build ids are UUIDs. Anything else is dropped, never rewritten. */
function easBuildIdFromEnv(value) {
  const trimmed = trimKey(value);
  if (!trimmed || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }
  return trimmed.toLowerCase();
}

/** Full or short hex commit. Rejects prose so a missing env cannot become a fake SHA. */
function gitSha(value) {
  const trimmed = trimKey(value);
  if (!trimmed || !/^[0-9a-f]{7,40}$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function gitHeadSha() {
  try {
    const { execFileSync } = require('node:child_process');
    return gitSha(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    return null;
  }
}

/** Never true on the production EAS profile. */
function debugYardCourseFromEnv(env) {
  if (trimKey(env.EAS_BUILD_PROFILE) === 'production') return false;
  return trimKey(env.EXPO_PUBLIC_DEBUG_YARD_COURSE) === '1';
}

module.exports = ({ config }) => {
  const {
    golfCoursesApiKey: _golfCoursesApiKey,
    golfApiKey: _golfApiKey,
    debugYardCourse: _debugYardCourse,
    ...extra
  } = config.extra && typeof config.extra === 'object' ? config.extra : {};
  const shareSyncUrl =
    trimKey(process.env.EXPO_PUBLIC_SHARE_SYNC_URL) ??
    trimKey(extra.shareSyncUrl) ??
    null;
  const coursePaintCacheUrl =
    trimKey(process.env.EXPO_PUBLIC_COURSE_PAINT_CACHE_URL) ??
    trimKey(process.env.COURSE_PAINT_CACHE_URL) ??
    trimKey(extra.coursePaintCacheUrl) ??
    null;

  return {
    ...config,
    extra: {
      ...extra,
      shareSyncUrl,
      coursePaintCacheUrl,
      debugYardCourse: debugYardCourseFromEnv(process.env),
      easBuildId: easBuildIdFromEnv(process.env.EAS_BUILD_ID),
      gitCommitHash: gitSha(process.env.EAS_BUILD_GIT_COMMIT_HASH) ?? gitHeadSha(),
    },
  };
};
