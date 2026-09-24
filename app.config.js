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
 * Do not commit a key.
 * @param {{ config: Record<string, unknown> }} args
 */
function trimKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    },
  };
};
