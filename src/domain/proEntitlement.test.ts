import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXPO_GO_PURCHASES_LOG,
  MISSING_REVENUECAT_KEY_LOG,
  PRO_ENTITLEMENT_ID,
  isProFromCache,
  noteExpoGoPurchases,
  noteMissingRevenueCatKey,
  parseProCache,
  planRevenueCatConfigure,
  proCacheFromCustomerEntitlements,
  resolveProStatus,
  serializeProCache,
  type ProEntitlementCache,
} from './proEntitlement';

const NOW = Date.parse('2026-09-25T12:00:00.000Z');
const FUTURE = '2026-10-09T12:00:00.000Z';
const PAST = '2026-09-24T12:00:00.000Z';

function cache(partial: Partial<ProEntitlementCache> & Pick<ProEntitlementCache, 'active' | 'isTrial'>): ProEntitlementCache {
  return {
    active: partial.active,
    expirationDate: partial.expirationDate === undefined ? FUTURE : partial.expirationDate,
    isTrial: partial.isTrial,
  };
}

test('active entitlement with a future expiration is Pro', () => {
  const row = cache({ active: true, expirationDate: FUTURE, isTrial: false });
  assert.equal(isProFromCache(row, NOW), true);
  assert.equal(resolveProStatus({ dev: false, override: 'off', cache: row, nowMs: NOW }).label, 'Pro');
  assert.equal(isProFromCache(row, Date.parse(FUTURE) - 1), true);
  assert.equal(isProFromCache({ active: true, expirationDate: null, isTrial: false }, NOW), true);
  assert.equal(isProFromCache({ active: false, expirationDate: FUTURE, isTrial: true }, NOW), false);
});

test('past expiration is Free even when the active flag is still set', () => {
  const row = cache({ active: true, expirationDate: PAST, isTrial: false });
  assert.equal(isProFromCache(row, NOW), false);
  assert.equal(isProFromCache(row, Date.parse(PAST)), false);
  const status = resolveProStatus({ dev: false, override: 'off', cache: row, nowMs: NOW });
  assert.equal(status.isPro, false);
  assert.equal(status.label, 'Free');
  assert.equal(status.expirationDate, new Date(PAST).toISOString());
});

test('missing cache is Free', () => {
  assert.equal(isProFromCache(null, NOW), false);
  assert.equal(isProFromCache(undefined, NOW), false);
  assert.equal(parseProCache(null), null);
  assert.equal(parseProCache(''), null);
  assert.equal(parseProCache('{'), null);
  const status = resolveProStatus({ dev: false, override: null, cache: null, nowMs: NOW });
  assert.deepEqual(status, { isPro: false, isTrial: false, expirationDate: null, label: 'Free' });
});

test('trial flag is carried on the cache and shown only while Pro', () => {
  const trial = cache({ active: true, expirationDate: FUTURE, isTrial: true });
  const raw = serializeProCache(trial);
  const parsed = parseProCache(raw);
  assert.equal(parsed?.isTrial, true);
  assert.equal(parsed?.active, true);
  const live = resolveProStatus({ dev: false, override: 'off', cache: parsed, nowMs: NOW });
  assert.equal(live.isPro, true);
  assert.equal(live.isTrial, true);
  assert.equal(live.label, 'Pro trial');

  const expired = parseProCache(serializeProCache(cache({ active: true, expirationDate: PAST, isTrial: true })));
  assert.equal(expired?.isTrial, true);
  const done = resolveProStatus({ dev: false, override: 'off', cache: expired, nowMs: NOW });
  assert.equal(done.isPro, false);
  assert.equal(done.isTrial, false);
  assert.equal(done.label, 'Free');
});

test('CustomerInfo pro entitlement keeps trial and ignores other ids', () => {
  const fromTrial = proCacheFromCustomerEntitlements({
    active: {
      [PRO_ENTITLEMENT_ID]: { isActive: true, expirationDate: FUTURE, periodType: 'TRIAL' },
    },
    all: {
      [PRO_ENTITLEMENT_ID]: { isActive: true, expirationDate: FUTURE, periodType: 'TRIAL' },
    },
  });
  assert.equal(fromTrial.isTrial, true);
  assert.equal(fromTrial.active, true);
  assert.equal(isProFromCache(fromTrial, NOW), true);

  const other = proCacheFromCustomerEntitlements({
    active: { premium: { isActive: true, expirationDate: FUTURE, periodType: 'NORMAL' } },
  });
  assert.equal(other.active, false);
  assert.equal(isProFromCache(other, NOW), false);

  const lapsedTrial = proCacheFromCustomerEntitlements({
    active: {},
    all: {
      [PRO_ENTITLEMENT_ID]: { isActive: false, expirationDate: PAST, periodType: 'TRIAL' },
    },
  });
  assert.equal(lapsedTrial.active, false);
  assert.equal(lapsedTrial.isTrial, true);
  assert.equal(isProFromCache(lapsedTrial, NOW), false);
});

test('dev override: forced values win; dev off ignores a stored override', () => {
  const proTrial = cache({ active: true, expirationDate: FUTURE, isTrial: true });

  const forcedPro = resolveProStatus({ dev: true, override: 'force-pro', cache: null, nowMs: NOW });
  assert.equal(forcedPro.isPro, true);
  assert.equal(forcedPro.isTrial, false);
  assert.equal(forcedPro.label, 'Pro');

  const forcedFree = resolveProStatus({ dev: true, override: 'force-free', cache: proTrial, nowMs: NOW });
  assert.equal(forcedFree.isPro, false);
  assert.equal(forcedFree.label, 'Free');
  assert.equal(forcedFree.isTrial, false);

  const real = resolveProStatus({ dev: true, override: 'off', cache: proTrial, nowMs: NOW });
  assert.equal(real.label, 'Pro trial');

  const ignoredPro = resolveProStatus({ dev: false, override: 'force-pro', cache: null, nowMs: NOW });
  assert.equal(ignoredPro.isPro, false);
  assert.equal(ignoredPro.label, 'Free');

  const ignoredFree = resolveProStatus({ dev: false, override: 'force-free', cache: proTrial, nowMs: NOW });
  assert.equal(ignoredFree.isPro, true);
  assert.equal(ignoredFree.isTrial, true);
  assert.equal(ignoredFree.label, 'Pro trial');
});

test('missing RevenueCat key does not throw and does not configure', () => {
  const lines: string[] = [];
  assert.doesNotThrow(() => {
    for (const apiKey of [undefined, null, '', '   ', 0]) {
      const plan = planRevenueCatConfigure({ apiKey, platform: 'ios', inExpoGo: false });
      assert.equal(plan.configure, false);
      if (!plan.configure && plan.reason === 'missing-key') {
        noteMissingRevenueCatKey((line) => lines.push(line));
      }
    }
  });
  assert.equal(lines.length, 5);
  assert.equal(new Set(lines).size, 1);
  assert.equal(lines[0], MISSING_REVENUECAT_KEY_LOG);
  assert.equal(lines[0].includes('appl_'), false);

  const present = planRevenueCatConfigure({
    apiKey: ' appl_public ',
    platform: 'ios',
    inExpoGo: false,
  });
  assert.deepEqual(present, { configure: true, apiKey: 'appl_public' });
});

test('Expo Go and non-iOS do not configure and do not throw', () => {
  const lines: string[] = [];
  assert.doesNotThrow(() => {
    const expoGo = planRevenueCatConfigure({
      apiKey: 'appl_public',
      platform: 'ios',
      inExpoGo: true,
    });
    assert.deepEqual(expoGo, { configure: false, reason: 'expo-go' });
    if (!expoGo.configure && expoGo.reason === 'expo-go') noteExpoGoPurchases((line) => lines.push(line));

    const android = planRevenueCatConfigure({
      apiKey: 'appl_public',
      platform: 'android',
      inExpoGo: false,
    });
    assert.deepEqual(android, { configure: false, reason: 'not-ios' });
  });
  assert.deepEqual(lines, [EXPO_GO_PURCHASES_LOG]);
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

test('diagnostics is the only screen that reads Pro, and the test switch is dev-only', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const appFiles = walk(join(root, 'app')).filter((file) => /\.(tsx|ts)$/.test(file));
  const readers = appFiles.filter((file) =>
    /useIsPro|isProCached|useProStatus|useProTestOverride/.test(readFileSync(file, 'utf8')),
  );
  assert.deepEqual(
    readers.map((file) => file.slice(file.indexOf('/app/') + 1)),
    ['app/diagnostics.tsx'],
  );

  const screen = readFileSync(new URL('../../app/diagnostics.tsx', import.meta.url), 'utf8');
  const switchAt = screen.indexOf('Pro (test)');
  assert.ok(switchAt > 0);
  const gate = screen.lastIndexOf('__DEV__', switchAt);
  assert.ok(gate > 0 && gate < switchAt);
  assert.ok(screen.indexOf('label="Status"') < switchAt);
  assert.match(screen, /setProTestOverride/);

  const service = readFileSync(new URL('../services/purchases.ts', import.meta.url), 'utf8');
  assert.match(service, /dev: __DEV__/);
  assert.match(service, /if \(!__DEV__\) return/);
  assert.match(service, /Purchases\.configure\(\{ apiKey: plan\.apiKey \}\)/);
  assert.doesNotMatch(service, /appUserID|logIn\(|collectDeviceIdentifiers|setEmail|setAttributes|setAdjustID/);

  const watchFiles = walk(join(root, 'targets'));
  for (const file of watchFiles) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /RevenueCat|react-native-purchases|useIsPro|EXPO_PUBLIC_REVENUECAT/);
  }
});
