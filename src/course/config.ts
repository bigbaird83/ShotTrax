const EXTRA_KEY = 'golfCoursesApiKey';

function trimKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extraKey(): string | null {
  try {
    // Lazy: node tests must not load react-native via expo-constants.
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
      manifest?: { extra?: Record<string, unknown> };
    };
    const fromExtra = trimKey(Constants.expoConfig?.extra?.[EXTRA_KEY]);
    if (fromExtra) return fromExtra;
    return trimKey(Constants.manifest?.extra?.[EXTRA_KEY]);
  } catch {
    return null;
  }
}

/**
 * Golf Courses API key. Never hardcode a secret.
 *
 * Resolution order:
 * 1. `EXPO_PUBLIC_GOLF_COURSES_API_KEY` (local Expo / Metro inline)
 * 2. `expo.extra.golfCoursesApiKey` (EAS: `app.config.js` copies the
 *    `GOLF_COURSES_API_KEY` secret at build time)
 * 3. `GOLF_COURSES_API_KEY` (Node tests / config evaluation — not inlined
 *    into the Expo client bundle unless mapped)
 */
export function getGolfCoursesApiKey(): string | null {
  const fromPublic = trimKey(process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY);
  if (fromPublic) return fromPublic;
  const fromExtra = extraKey();
  if (fromExtra) return fromExtra;
  return trimKey(process.env.GOLF_COURSES_API_KEY);
}

export function isGolfCoursesApiConfigured(): boolean {
  return getGolfCoursesApiKey() != null;
}
