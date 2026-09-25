/**
 * RevenueCat on the phone. Anonymous SDK user, iOS public key only.
 *
 * The key is process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY (expo.dev / .env).
 * It is never hardcoded. A missing key logs one line and leaves the user
 * not Pro. Configure runs once, after the SQLite settings cache is loaded,
 * so isProCached() is already decided before getCustomerInfo returns.
 *
 * Expo Go: react-native-purchases loads in browser preview mode and does
 * not construct NativeEventEmitter, so import does not crash. Preview mode
 * rejects a native Apple key, so this module does not call configure there.
 * Real sandbox purchases belong on a dev client or TestFlight. The Watch
 * app does not use this module.
 */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo } from 'react-native-purchases';
import type { SQLiteDatabase } from 'expo-sqlite';
import Constants from 'expo-constants';
import { getSetting, setSetting } from '@/src/db/repo';
import { isExpoGoRuntime } from '@/src/domain/buildStamp';
import {
  PRO_CACHE_SETTING_KEY,
  PRO_OVERRIDE_SETTING_KEY,
  noteExpoGoPurchases,
  noteMissingRevenueCatKey,
  parseProCache,
  parseProTestOverride,
  planRevenueCatConfigure,
  proCacheFromCustomerEntitlements,
  resolveProStatus,
  serializeProCache,
  type ProEntitlementCache,
  type ProTestOverride,
  type ResolvedProStatus,
} from '@/src/domain/proEntitlement';

type Listener = () => void;

let cache: ProEntitlementCache | null = null;
let override: ProTestOverride = 'off';
let started = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStatus(nowMs: number): ResolvedProStatus {
  return resolveProStatus({
    dev: __DEV__,
    override,
    cache,
    nowMs,
  });
}

export function hydrateProFromSettings(read: (key: string) => string | null): void {
  cache = parseProCache(read(PRO_CACHE_SETTING_KEY));
  override = parseProTestOverride(read(PRO_OVERRIDE_SETTING_KEY));
  emit();
}

/** Last cached entitlement at `nowMs`, with the dev override applied only in dev. */
export function isProCached(nowMs: number = Date.now()): boolean {
  return readStatus(nowMs).isPro;
}

export function readProStatus(nowMs: number = Date.now()): ResolvedProStatus {
  return readStatus(nowMs);
}

export function useProStatus(nowMs?: number): ResolvedProStatus {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  return readStatus(nowMs ?? Date.now());
}

export function useIsPro(nowMs?: number): boolean {
  return useProStatus(nowMs).isPro;
}

export function useProTestOverride(): ProTestOverride {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  return __DEV__ ? override : 'off';
}

export function setProTestOverride(next: ProTestOverride, db: SQLiteDatabase): void {
  if (!__DEV__) return;
  override = next;
  try {
    setSetting(db, PRO_OVERRIDE_SETTING_KEY, next);
  } catch {
    console.warn('[purchases] could not persist Pro test override');
  }
  emit();
}

function rememberCache(db: SQLiteDatabase, next: ProEntitlementCache): void {
  cache = next;
  try {
    setSetting(db, PRO_CACHE_SETTING_KEY, serializeProCache(next));
  } catch {
    console.warn('[purchases] could not persist Pro cache');
  }
  emit();
}

function applyCustomerInfo(db: SQLiteDatabase, info: CustomerInfo): void {
  rememberCache(db, proCacheFromCustomerEntitlements(info?.entitlements));
}

async function refreshPurchases(db: SQLiteDatabase): Promise<void> {
  try {
    const plan = planRevenueCatConfigure({
      apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
      platform: Platform.OS,
      inExpoGo: isExpoGoRuntime({
        appOwnership: Constants.appOwnership,
        expoVersion: Constants.expoVersion,
      }),
    });
    if (!plan.configure) {
      if (plan.reason === 'missing-key') noteMissingRevenueCatKey();
      else if (plan.reason === 'expo-go') noteExpoGoPurchases();
      return;
    }
    Purchases.configure({ apiKey: plan.apiKey });
    const onInfo = (info: CustomerInfo) => {
      try {
        applyCustomerInfo(db, info);
      } catch {
        // Keep the last cache when a snapshot cannot be stored.
      }
    };
    onInfo(await Purchases.getCustomerInfo());
    Purchases.addCustomerInfoUpdateListener(onInfo);
  } catch {
    console.warn('[purchases] RevenueCat configure failed; Pro stays on the last cache');
  }
}

/** Once per process, after the database is open. Hydrates the cache first. */
export function startPurchases(db: SQLiteDatabase): void {
  if (started) return;
  started = true;
  try {
    hydrateProFromSettings((key) => getSetting(db, key));
  } catch {
    cache = null;
    override = 'off';
  }
  void refreshPurchases(db);
}
