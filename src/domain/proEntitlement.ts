/**
 * Pro entitlement, offline. The round is never locked here.
 *
 * Cache is the last CustomerInfo snapshot (active, expiration, trial).
 * isPro is that cache at a given timestamp: active and not past expiration.
 * No cache means not Pro. A dev-only override can force Pro or Free; a
 * release build ignores it even when a stored value is still on disk.
 *
 * The iOS public key is EXPO_PUBLIC_REVENUECAT_IOS_KEY. A missing key does
 * not configure RevenueCat and does not throw.
 */

export const PRO_ENTITLEMENT_ID = 'pro';

/** SQLite `settings` row. Same table as theme, bag, and the paint cache. */
export const PRO_CACHE_SETTING_KEY = 'pro.entitlement';

/** SQLite `settings` row. Read in every build; applied only when dev is true. */
export const PRO_OVERRIDE_SETTING_KEY = 'pro.test.override';

export const MISSING_REVENUECAT_KEY_LOG =
  '[purchases] EXPO_PUBLIC_REVENUECAT_IOS_KEY missing; Pro stays off';

export const EXPO_GO_PURCHASES_LOG =
  '[purchases] Expo Go preview mode does not configure the iOS key; Pro stays off';

export type ProEntitlementCache = {
  active: boolean;
  /** ISO-8601, or null when the entitlement has no end (lifetime). */
  expirationDate: string | null;
  isTrial: boolean;
};

export const PRO_TEST_OVERRIDES = ['off', 'force-pro', 'force-free'] as const;
export type ProTestOverride = (typeof PRO_TEST_OVERRIDES)[number];

export type ProStatusLabel = 'Free' | 'Pro' | 'Pro trial';

export type ResolvedProStatus = {
  isPro: boolean;
  isTrial: boolean;
  expirationDate: string | null;
  label: ProStatusLabel;
};

export type PurchasesConfigurePlan =
  | { configure: false; reason: 'missing-key' | 'expo-go' | 'not-ios' }
  | { configure: true; apiKey: string };

type EntitlementSnapshot = {
  isActive?: boolean;
  expirationDate?: string | null;
  periodType?: string | null;
};

/** One line. Never includes the key. */
export function noteMissingRevenueCatKey(log: (line: string) => void = console.warn): void {
  log(MISSING_REVENUECAT_KEY_LOG);
}

/** One line. Expo Go can load the SDK; the Apple public key is not configured there. */
export function noteExpoGoPurchases(log: (line: string) => void = console.warn): void {
  log(EXPO_GO_PURCHASES_LOG);
}

/**
 * Configure only on iOS with a non-empty public key, and never inside Expo Go.
 * Expo Go's preview mode rejects native Apple keys (`appl_`). Skipping
 * configure keeps that smoke path from throwing. Does not throw.
 */
export function planRevenueCatConfigure(args: {
  apiKey: unknown;
  platform: string;
  inExpoGo: boolean;
}): PurchasesConfigurePlan {
  const apiKey = typeof args.apiKey === 'string' ? args.apiKey.trim() : '';
  if (!apiKey) return { configure: false, reason: 'missing-key' };
  if (args.inExpoGo) return { configure: false, reason: 'expo-go' };
  if (args.platform !== 'ios') return { configure: false, reason: 'not-ios' };
  return { configure: true, apiKey };
}

export function canonicalExpiration(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function parseProCache(raw: string | null | undefined): ProEntitlementCache | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.active !== 'boolean' || typeof rec.isTrial !== 'boolean') return null;
  if (rec.expirationDate === null) {
    return { active: rec.active, expirationDate: null, isTrial: rec.isTrial };
  }
  if (typeof rec.expirationDate !== 'string') return null;
  const expirationDate = canonicalExpiration(rec.expirationDate);
  if (!expirationDate) return null;
  return { active: rec.active, expirationDate, isTrial: rec.isTrial };
}

export function serializeProCache(cache: ProEntitlementCache): string {
  const expirationDate = cache.expirationDate === null ? null : canonicalExpiration(cache.expirationDate);
  return JSON.stringify({
    active: cache.active === true,
    expirationDate,
    isTrial: cache.isTrial === true,
  });
}

/**
 * Last known `pro` entitlement from a CustomerInfo-shaped snapshot.
 * Active map wins. Trial is RevenueCat periodType TRIAL and is stored either way.
 */
export function proCacheFromCustomerEntitlements(
  entitlements:
    | {
        active?: Record<string, EntitlementSnapshot | undefined>;
        all?: Record<string, EntitlementSnapshot | undefined>;
      }
    | null
    | undefined,
): ProEntitlementCache {
  const active = entitlements?.active?.[PRO_ENTITLEMENT_ID];
  const any = entitlements?.all?.[PRO_ENTITLEMENT_ID];
  const ent = active ?? any;
  if (!ent) return { active: false, expirationDate: null, isTrial: false };
  return {
    active: active != null && ent.isActive !== false,
    expirationDate: canonicalExpiration(ent.expirationDate),
    isTrial: ent.periodType === 'TRIAL',
  };
}

/**
 * Active and not past expiration. The expiration instant itself is Free.
 * No cache, inactive, or an unreadable date is Free. Null expiration
 * (lifetime) stays Pro while active.
 */
export function isProFromCache(cache: ProEntitlementCache | null | undefined, nowMs: number): boolean {
  if (!cache || cache.active !== true) return false;
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return false;
  if (cache.expirationDate == null) return true;
  const exp = Date.parse(cache.expirationDate);
  if (!Number.isFinite(exp)) return false;
  return nowMs < exp;
}

export function parseProTestOverride(raw: string | null | undefined): ProTestOverride {
  if (raw === 'force-pro' || raw === 'force-free' || raw === 'off') return raw;
  return 'off';
}

/**
 * Dev on: Force Pro / Force Free replace the cache. Dev off: the stored
 * override is ignored and the cache decides. Force Pro is not a trial.
 */
export function resolveProStatus(args: {
  dev: boolean;
  override: string | null | undefined;
  cache: ProEntitlementCache | null | undefined;
  nowMs: number;
}): ResolvedProStatus {
  const override = args.dev === true ? parseProTestOverride(args.override) : 'off';
  if (override === 'force-pro') {
    return { isPro: true, isTrial: false, expirationDate: null, label: 'Pro' };
  }
  if (override === 'force-free') {
    return { isPro: false, isTrial: false, expirationDate: null, label: 'Free' };
  }
  const cache = args.cache ?? null;
  const isPro = isProFromCache(cache, args.nowMs);
  const isTrial = isPro && cache?.isTrial === true;
  return {
    isPro,
    isTrial,
    expirationDate: cache?.expirationDate ?? null,
    label: !isPro ? 'Free' : isTrial ? 'Pro trial' : 'Pro',
  };
}

/** Diagnostics date. Null when there is nothing to show. */
export function formatProExpiration(expirationDate: string | null | undefined): string | null {
  return canonicalExpiration(expirationDate);
}
