/**
 * One Settings line so a fail note names the binary.
 *
 * TestFlight / build number — `Application.nativeBuildVersion` from
 * expo-application (iOS CFBundleVersion, Android versionCode). That is the
 * number TestFlight shows. `eas.json` uses remote app versions, so
 * `ios.buildNumber` in app.json is not this number and is never read.
 * Inside Expo Go the same API returns Expo Go's own binary, so the line
 * says "unavailable in Expo Go" instead of printing it. Fallback when
 * expo-application is missing: `Constants.platform.ios.buildNumber`, which
 * expo-constants reads from the same Info.plist key.
 *
 * EAS build id — `EAS_BUILD_ID`, copied to `expo.extra.easBuildId` when
 * app.config.js is evaluated on the EAS builder, then read from
 * `Constants.expoConfig.extra`. `Updates.updateId` is an OTA update UUID.
 * This app does not ship expo-updates, and that id is not the build id.
 *
 * Git SHA — `EAS_BUILD_GIT_COMMIT_HASH` when the builder sets it, otherwise
 * `git rev-parse HEAD` at config time, stored as `expo.extra.gitCommitHash`.
 * The line shows the first 7 hex characters. A value that is not hex is dropped.
 */

export const EXPO_GO_FIELD_UNAVAILABLE = 'unavailable in Expo Go';

const SHA_RE = /^[0-9a-f]{7,40}$/i;
const EAS_BUILD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NATIVE_BUILD_RE = /^[0-9]+(?:\.[0-9]+)*$/;

export type BuildStampParts = {
  /** True only inside the Expo Go app. */
  inExpoGo: boolean;
  /** Native CFBundleVersion / versionCode. Ignored while inExpoGo. */
  nativeBuildVersion: string | null;
  easBuildId: string | null;
  /** Full hex SHA from the build env or git. */
  gitCommitHash: string | null;
};

export function isExpoGoRuntime(source: {
  appOwnership?: string | null;
  expoVersion?: string | null;
}): boolean {
  if (source.appOwnership === 'expo') return true;
  return typeof source.expoVersion === 'string' && source.expoVersion.trim().length > 0;
}

export function shortGitSha(hash: string | null | undefined): string | null {
  if (typeof hash !== 'string') return null;
  const trimmed = hash.trim().toLowerCase();
  if (!SHA_RE.test(trimmed)) return null;
  return trimmed.slice(0, 7);
}

export function normalizeEasBuildId(id: string | null | undefined): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim().toLowerCase();
  return EAS_BUILD_ID_RE.test(trimmed) ? trimmed : null;
}

/** Store build numbers are numeric. Prose and blanks are not a TestFlight number. */
export function normalizeNativeBuildVersion(version: string | null | undefined): string | null {
  if (typeof version !== 'string') return null;
  const trimmed = version.trim();
  return NATIVE_BUILD_RE.test(trimmed) ? trimmed : null;
}

/**
 * Prefer expo-application. Fall back to the Info.plist value expo-constants
 * already exposes. Never the app.json copy.
 */
export function nativeBuildVersionFromSources(args: {
  inExpoGo: boolean;
  applicationNativeBuildVersion: string | null;
  platformIosBuildNumber: string | null;
}): string | null {
  if (args.inExpoGo) return null;
  return (
    normalizeNativeBuildVersion(args.applicationNativeBuildVersion) ??
    normalizeNativeBuildVersion(args.platformIosBuildNumber)
  );
}

export function formatBuildStamp(parts: BuildStampParts): string {
  const bits: string[] = [];
  if (parts.inExpoGo) {
    bits.push(`TF ${EXPO_GO_FIELD_UNAVAILABLE}`);
  } else {
    const build = normalizeNativeBuildVersion(parts.nativeBuildVersion);
    if (build) bits.push(`TF ${build}`);
  }

  const eas = normalizeEasBuildId(parts.easBuildId);
  if (eas) bits.push(`eas ${eas}`);
  else if (parts.inExpoGo) bits.push(`EAS ${EXPO_GO_FIELD_UNAVAILABLE}`);

  const sha = shortGitSha(parts.gitCommitHash);
  if (sha) bits.push(sha);
  else if (parts.inExpoGo) bits.push(`git ${EXPO_GO_FIELD_UNAVAILABLE}`);

  return bits.join(' · ');
}

type ExpoConstantsLike = {
  appOwnership?: string | null;
  expoVersion?: string | null;
  expoConfig?: { extra?: Record<string, unknown> | null } | null;
  platform?: { ios?: { buildNumber?: string | null } | null } | null;
};

function readExtra(extra: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = extra?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function loadConstants(): ExpoConstantsLike {
  try {
    const loaded = require('expo-constants').default as ExpoConstantsLike | undefined;
    return loaded ?? {};
  } catch {
    return {};
  }
}

function loadApplicationBuildVersion(): string | null {
  try {
    const Application = require('expo-application') as { nativeBuildVersion?: string | null };
    return typeof Application.nativeBuildVersion === 'string' ? Application.nativeBuildVersion : null;
  } catch {
    return null;
  }
}

/** Runtime read for Settings. Safe to call once; the values do not change mid-session. */
export function readBuildStamp(): BuildStampParts {
  const constants = loadConstants();
  const inExpoGo = isExpoGoRuntime(constants);
  const extra = constants.expoConfig?.extra ?? null;
  return {
    inExpoGo,
    nativeBuildVersion: nativeBuildVersionFromSources({
      inExpoGo,
      applicationNativeBuildVersion: inExpoGo ? null : loadApplicationBuildVersion(),
      platformIosBuildNumber: constants.platform?.ios?.buildNumber ?? null,
    }),
    easBuildId: readExtra(extra, 'easBuildId'),
    gitCommitHash: readExtra(extra, 'gitCommitHash'),
  };
}
