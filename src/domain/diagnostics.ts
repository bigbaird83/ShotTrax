/**
 * Hidden Settings diagnostics. Formatting only.
 * Missing values stay "unknown" or "—". Nothing here is invented.
 */

import { METERS_PER_YARD } from '../config/sensing';
import { isValidLatLng, type LatLng } from './latLng';
import { classifyAccuracyM } from './fixQuality';
import {
  normalizeNativeBuildVersion,
  shortGitSha,
  type BuildStampParts,
} from './buildStamp';
import type { CoursePaintSource } from '../course/paintCache';

export const DIAGNOSTICS_UNKNOWN = 'unknown';
export const DIAGNOSTICS_DASH = '—';
export const DIAGNOSTICS_GREEN_NONE = 'none / Catalog only';

/** Five taps on the version row, counted inside this window. */
export const VERSION_ROW_TAP_WINDOW_MS = 2500;
export const VERSION_ROW_TAPS_TO_OPEN = 5;

export type DiagnosticsFixQuality = 'good' | 'soft' | 'none';

/**
 * Live fix quality the app already uses for yards-to-green.
 * good < 15 m, soft 15–25 m, anything worse or missing → none.
 * No fix → none. Never "forced" (that is a player action, not the live fix).
 */
export function diagnosticsFixQuality(
  fix: { accuracyM: number | null | undefined } | null | undefined,
): DiagnosticsFixQuality {
  if (!fix) return 'none';
  const band = classifyAccuracyM(fix.accuracyM);
  return band === 'poor' ? 'none' : band;
}

function formatMeasure(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  if (!Number.isFinite(rounded)) return null;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Horizontal accuracy in meters and yards. Dash when the fix has no accuracy. */
export function formatHorizontalAccuracy(accuracyM: number | null | undefined): string {
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return DIAGNOSTICS_DASH;
  }
  const meters = formatMeasure(accuracyM);
  const yards = formatMeasure(accuracyM / METERS_PER_YARD);
  if (!meters || !yards) return DIAGNOSTICS_DASH;
  return `${meters} m · ${yards} yd`;
}

/** Age of the last fix. Unknown when the timestamp is missing or in the future. */
export function formatFixAge(timestampMs: number | null | undefined, nowMs: number): string {
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) return DIAGNOSTICS_UNKNOWN;
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return DIAGNOSTICS_UNKNOWN;
  const ageMs = nowMs - timestampMs;
  if (!Number.isFinite(ageMs) || ageMs < 0) return DIAGNOSTICS_UNKNOWN;
  if (ageMs < 10_000) return `${(ageMs / 1000).toFixed(1)} s`;
  const totalSeconds = Math.floor(ageMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin === 0 ? `${hours} h` : `${hours} h ${remMin} min`;
}

/**
 * Paint-waterfall winner already recorded on the course (`source` + `fromCache`).
 * Null means the code has not recorded a winner — do not guess GCA or golfapi.
 * A recorded miss is catalog-only. Cache wins over the underlying source, same
 * order as the course card chip.
 */
export function formatDiagnosticsGreenSource(
  result:
    | {
        ok: boolean;
        source: CoursePaintSource | string | null;
        fromCache: boolean;
      }
    | null
    | undefined,
): string {
  if (result == null) return DIAGNOSTICS_UNKNOWN;
  if (result.ok !== true) return DIAGNOSTICS_GREEN_NONE;
  if (result.fromCache === true) return 'cache';
  if (result.source === 'osm' || result.source === 'manual_verified') return 'OSM/OpenGolf';
  if (result.source === 'gca') return 'GCA Pro';
  if (result.source === 'golfapi') return 'golfapi.io';
  return DIAGNOSTICS_UNKNOWN;
}

export type DiagnosticsPaintMatch = {
  name: string | null;
  city: string | null;
  state: string | null;
  courseKey: string | null;
  location: LatLng | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Identity for the recorded paint lookup. City and state come only from a
 * catalog row the app already has. No name and no id → nothing to look up.
 */
export function paintMatchForRound(
  round: {
    courseName?: string | null;
    courseApiId?: string | null;
    courseLat?: number | null;
    courseLng?: number | null;
  } | null
    | undefined,
  catalog?: {
    city?: string | null;
    state?: string | null;
    location?: LatLng | null;
  } | null,
): DiagnosticsPaintMatch | null {
  if (!round) return null;
  const name = trimOrNull(round.courseName);
  const courseKey = trimOrNull(round.courseApiId);
  if (!name && !courseKey) return null;
  const roundPoint =
    typeof round.courseLat === 'number' && typeof round.courseLng === 'number'
      ? { lat: round.courseLat, lng: round.courseLng }
      : null;
  const location = isValidLatLng(roundPoint)
    ? roundPoint
    : isValidLatLng(catalog?.location)
      ? catalog.location
      : null;
  return {
    name,
    city: trimOrNull(catalog?.city),
    state: trimOrNull(catalog?.state),
    courseKey,
    location,
  };
}

export type DiagnosticsHoleStamp = {
  number: number;
  startedAt?: string | null;
};

/**
 * Hole the round has actually started. Latest `startedAt` wins.
 * A hole that was never stamped is not assumed to be hole 1.
 */
export function currentPlayedHoleNumber(holes: readonly DiagnosticsHoleStamp[]): number | null {
  let bestNumber: number | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const hole of holes) {
    if (typeof hole.number !== 'number' || !Number.isInteger(hole.number) || hole.number < 1) continue;
    if (typeof hole.startedAt !== 'string' || hole.startedAt.trim().length === 0) continue;
    const ms = Date.parse(hole.startedAt);
    if (!Number.isFinite(ms)) continue;
    if (bestNumber == null || ms > bestMs || (ms === bestMs && hole.number > bestNumber)) {
      bestMs = ms;
      bestNumber = hole.number;
    }
  }
  return bestNumber;
}

export function formatDiagnosticsHole(number: number | null | undefined): string {
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) return DIAGNOSTICS_UNKNOWN;
  return String(number);
}

export function formatDiagnosticsYesNo(value: boolean | null | undefined): string {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return DIAGNOSTICS_UNKNOWN;
}

/** WatchConnectivity `remainingComplicationUserInfoTransfers`. Non-integers are not shown. */
export function formatRemainingComplicationTransfers(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return DIAGNOSTICS_UNKNOWN;
  return String(value);
}

/** Epoch ms of the last clubList context update or complication transfer that was accepted. */
export function formatLastWatchSend(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return DIAGNOSTICS_UNKNOWN;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return DIAGNOSTICS_UNKNOWN;
  return date.toISOString();
}

export type WatchLinkSnapshot = {
  paired: boolean | null;
  reachable: boolean | null;
  remainingComplicationTransfers: number | null;
  lastSentAtMs: number | null;
};

const EMPTY_WATCH_LINK: WatchLinkSnapshot = {
  paired: null,
  reachable: null,
  remainingComplicationTransfers: null,
  lastSentAtMs: null,
};

function finiteMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Native `readLinkStatus` dictionary. Paired, reachable, and the transfer
 * budget are omitted unless the session is activated — those WCSession fields
 * are not valid before that. A missing getter is all unknown.
 */
export function watchLinkFromNative(raw: unknown): WatchLinkSnapshot {
  if (raw == null || typeof raw !== 'object') return { ...EMPTY_WATCH_LINK };
  const row = raw as Record<string, unknown>;
  const lastSentAtMs = finiteMs(row.lastSentAtMs);
  if (row.supported !== true || row.activated !== true) {
    return { ...EMPTY_WATCH_LINK, lastSentAtMs };
  }
  return {
    paired: typeof row.paired === 'boolean' ? row.paired : null,
    reachable: typeof row.reachable === 'boolean' ? row.reachable : null,
    remainingComplicationTransfers: nonNegativeInt(row.remainingComplicationTransfers),
    lastSentAtMs,
  };
}

export type DiagnosticsBuildView = {
  version: string;
  buildNumber: string;
  commit: string;
};

function presentVersion(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * App version: native short version outside Expo Go, otherwise the version
 * baked into expo config. Expo Go's own binary version is not ShotTraxx.
 * Commit is the short SHA already stored on `expo.extra.gitCommitHash`.
 */
export function formatDiagnosticsBuild(args: {
  inExpoGo: boolean;
  nativeApplicationVersion: string | null;
  expoConfigVersion: string | null;
  nativeBuildVersion: string | null;
  gitCommitHash: string | null;
}): DiagnosticsBuildView {
  const version = args.inExpoGo
    ? presentVersion(args.expoConfigVersion)
    : presentVersion(args.nativeApplicationVersion) ?? presentVersion(args.expoConfigVersion);
  const buildNumber = args.inExpoGo ? null : normalizeNativeBuildVersion(args.nativeBuildVersion);
  return {
    version: version ?? DIAGNOSTICS_UNKNOWN,
    buildNumber: buildNumber ?? DIAGNOSTICS_UNKNOWN,
    commit: shortGitSha(args.gitCommitHash) ?? DIAGNOSTICS_UNKNOWN,
  };
}

export type VersionRowTapState = {
  count: number;
  firstAtMs: number | null;
};

export function advanceVersionRowTap(
  state: VersionRowTapState,
  nowMs: number,
  windowMs: number = VERSION_ROW_TAP_WINDOW_MS,
): VersionRowTapState & { open: boolean } {
  const stale = state.firstAtMs == null || nowMs - state.firstAtMs > windowMs;
  const count = stale ? 1 : state.count + 1;
  if (count >= VERSION_ROW_TAPS_TO_OPEN) {
    return { count: 0, firstAtMs: null, open: true };
  }
  return { count, firstAtMs: stale ? nowMs : state.firstAtMs, open: false };
}

type ExpoConstantsLike = {
  expoConfig?: { version?: string | null; extra?: unknown } | null;
};

function loadConstants(): ExpoConstantsLike {
  try {
    const loaded = require('expo-constants').default as ExpoConstantsLike | undefined;
    return loaded ?? {};
  } catch {
    return {};
  }
}

function loadNativeApplicationVersion(): string | null {
  try {
    const Application = require('expo-application') as { nativeApplicationVersion?: string | null };
    return typeof Application.nativeApplicationVersion === 'string' ? Application.nativeApplicationVersion : null;
  } catch {
    return null;
  }
}

/** Runtime read. Version, build number, and commit do not change mid-session. */
export function readDiagnosticsBuild(stamp: BuildStampParts): DiagnosticsBuildView {
  const constants = loadConstants();
  const configVersion =
    typeof constants.expoConfig?.version === 'string' ? constants.expoConfig.version : null;
  return formatDiagnosticsBuild({
    inExpoGo: stamp.inExpoGo,
    nativeApplicationVersion: stamp.inExpoGo ? null : loadNativeApplicationVersion(),
    expoConfigVersion: configVersion,
    nativeBuildVersion: stamp.nativeBuildVersion,
    gitCommitHash: stamp.gitCommitHash,
  });
}
