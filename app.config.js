/**
 * Dynamic Expo config. Reads Golf Courses API key at EAS build time so the
 * client can use `expo.extra.golfCoursesApiKey` via expo-constants.
 *
 * Display name is ShotTraxx (`expo.name`, iOS CFBundleDisplayName, Android
 * label). Bundle ID `com.shottrax.app` and slug `shottrax` stay unchanged.
 * Icon paths in app.json (`./assets/images/icon.png` and adaptive siblings)
 * are the locked Build 35 neon-arc Shot/Traxx mark. `splash-icon.png` stays
 * the full ShotTraxx wordmark.
 *
 * Secret name (EAS dashboard, production / preview / development):
 *   GOLF_COURSES_API_KEY
 *
 * Do not commit a key. Do not invent a second secret name in git.
 * Local Expo Go: set EXPO_PUBLIC_GOLF_COURSES_API_KEY in `.env`, or the same
 * GOLF_COURSES_API_KEY name (this file copies either into extra).
 *
 * @param {{ config: Record<string, unknown> }} args
 */
function trimKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

module.exports = ({ config }) => {
  const extra = config.extra && typeof config.extra === 'object' ? config.extra : {};
  const golfCoursesApiKey =
    trimKey(process.env.GOLF_COURSES_API_KEY) ??
    trimKey(process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY) ??
    trimKey(extra.golfCoursesApiKey) ??
    null;

  return {
    ...config,
    extra: {
      ...extra,
      golfCoursesApiKey,
    },
  };
};
