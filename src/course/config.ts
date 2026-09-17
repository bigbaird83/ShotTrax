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
 * Reads `EXPO_PUBLIC_GOLF_COURSES_API_KEY`, then `expo.extra.golfCoursesApiKey`.
 */
export function getGolfCoursesApiKey(): string | null {
  const fromEnv = trimKey(process.env.EXPO_PUBLIC_GOLF_COURSES_API_KEY);
  if (fromEnv) return fromEnv;
  return extraKey();
}

export function isGolfCoursesApiConfigured(): boolean {
  return getGolfCoursesApiKey() != null;
}
