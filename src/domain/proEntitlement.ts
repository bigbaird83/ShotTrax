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

/**
 * Diagnostics only. The key itself is never stored here.
 * `pending` is the gap before configure and the first customer-info fetch finish.
 */
export type RevenueCatStatus =
  | { kind: 'pending' }
  | { kind: 'no-key' }
  | { kind: 'expo-go' }
  | { kind: 'not-ios' }
  | { kind: 'on'; applKey: boolean }
  | { kind: 'error'; message: string };

const REVENUECAT_ERROR_MAX = 80;

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

function errorCandidates(error: unknown): string[] {
  if (typeof error === 'string') return [error];
  if (!error || typeof error !== 'object') return [];
  const rec = error as Record<string, unknown>;
  const out: string[] = [];
  if (typeof rec.message === 'string') out.push(rec.message);
  if (typeof rec.underlyingErrorMessage === 'string') out.push(rec.underlyingErrorMessage);
  if (typeof rec.readableErrorCode === 'string') out.push(rec.readableErrorCode);
  return out;
}

/** Drop the key and any public-key-shaped token. Short keys are removed only as whole tokens. */
function redactRevenueCatKey(message: string, apiKey: string): string {
  const key = apiKey.trim();
  let out = message;
  if (key.length >= 12) {
    const lower = out.toLowerCase();
    const needle = key.toLowerCase();
    let next = '';
    let i = 0;
    while (i < out.length) {
      const at = lower.indexOf(needle, i);
      if (at < 0) {
        next += out.slice(i);
        break;
      }
      next += out.slice(i, at);
      i = at + needle.length;
    }
    out = next;
  } else if (key.length > 0) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'gi'), '$1');
  }
  return out.replace(/(?:appl_|goog_|amzn_|test_|rcb_|strp_)[A-Za-z0-9]+/gi, '');
}

function cleanRevenueCatError(message: string): string {
  let out = message.replace(/\s+/g, ' ').trim();
  out = out.replace(/^[\s:;—-]+|[\s:;—-]+$/g, '').trim();
  if (out.length > REVENUECAT_ERROR_MAX) {
    out = `${out.slice(0, REVENUECAT_ERROR_MAX - 3).trimEnd()}...`;
  }
  return out;
}

function shortRevenueCatError(error: unknown, apiKey: string): string {
  for (const candidate of errorCandidates(error)) {
    const message = cleanRevenueCatError(redactRevenueCatKey(candidate, apiKey));
    if (message) return message;
  }
  return '';
}

/**
 * Map the configure plan plus the first fetch onto a diagnostics status.
 * A skipped plan stays skipped even if `outcome` says ok. The returned value
 * never contains the key; a non-`appl_` key is only a boolean on `on`.
 */
export function mapRevenueCatStatus(args: {
  plan: PurchasesConfigurePlan;
  outcome: 'pending' | 'ok' | { error: unknown };
}): RevenueCatStatus {
  if (!args.plan.configure) {
    if (args.plan.reason === 'missing-key') return { kind: 'no-key' };
    if (args.plan.reason === 'expo-go') return { kind: 'expo-go' };
    return { kind: 'not-ios' };
  }
  if (args.outcome === 'pending') return { kind: 'pending' };
  if (args.outcome === 'ok') return { kind: 'on', applKey: args.plan.apiKey.startsWith('appl_') };
  return { kind: 'error', message: shortRevenueCatError(args.outcome.error, args.plan.apiKey) };
}

/** One diagnostics line. Never includes the key. */
export function formatRevenueCatStatus(status: RevenueCatStatus): string {
  switch (status.kind) {
    case 'pending':
      return 'RevenueCat: checking';
    case 'no-key':
      return 'RevenueCat: no key';
    case 'expo-go':
      return 'RevenueCat: off in Expo Go';
    case 'not-ios':
      return 'RevenueCat: off';
    case 'on':
      return status.applKey ? 'RevenueCat: on' : 'RevenueCat: on (not an appl_ key)';
    case 'error':
      return status.message ? `RevenueCat: error — ${status.message}` : 'RevenueCat: error';
  }
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
