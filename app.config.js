/**
 * Dynamic Expo config.
 *
 * Display name is ShotTraxx™ (`expo.name`, iOS CFBundleDisplayName, Android
 * label). Bundle ID `com.shottrax.app` and slug `shottrax` stay unchanged.
 * Icon paths in app.json (`./assets/images/icon.png` and adaptive siblings)
 * are the locked Build 36 night-green Shot/Traxx mark. `splash-icon.png` is
 * the first frame of Doc’s 3s open clip (same still as splash-first-frame-v2).
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

module.exports = ({ config }) => {
  const {
    golfCoursesApiKey: _golfCoursesApiKey,
    golfApiKey: _golfApiKey,
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
      easBuildId: easBuildIdFromEnv(process.env.EAS_BUILD_ID),
      gitCommitHash: gitSha(process.env.EAS_BUILD_GIT_COMMIT_HASH) ?? gitHeadSha(),
    },
  };
};
