import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  EXPO_GO_FIELD_UNAVAILABLE,
  extraRecordFromConstants,
  formatBuildStamp,
  isExpoGoRuntime,
  nativeBuildVersionFromSources,
  normalizeEasBuildId,
  normalizeNativeBuildVersion,
  shortGitSha,
} from './buildStamp';

const SHA = '88f28ab5ea39108ade978de2d0d1adeedf0ece76';
const EAS = 'f51831f0-ea30-406a-8c5f-f8e1cc57d39c';

test('TestFlight line is native build · eas id · 7-char SHA', () => {
  assert.equal(
    formatBuildStamp({
      inExpoGo: false,
      nativeBuildVersion: '142',
      easBuildId: EAS,
      gitCommitHash: SHA,
    }),
    `TF 142 · eas ${EAS} · 88f28ab`,
  );
  assert.equal(shortGitSha(SHA), '88f28ab');
  assert.equal(shortGitSha(`  ${SHA.toUpperCase()}  `), '88f28ab');
});

test('EAS id is omitted outside Expo Go when the builder did not set one', () => {
  assert.equal(
    formatBuildStamp({
      inExpoGo: false,
      nativeBuildVersion: '87',
      easBuildId: null,
      gitCommitHash: SHA,
    }),
    'TF 87 · 88f28ab',
  );
});

test('Expo Go labels missing TF and EAS and does not print Expo Go’s own build number', () => {
  const line = formatBuildStamp({
    inExpoGo: true,
    nativeBuildVersion: '54',
    easBuildId: null,
    gitCommitHash: SHA,
  });
  assert.equal(line, `TF ${EXPO_GO_FIELD_UNAVAILABLE} · EAS ${EXPO_GO_FIELD_UNAVAILABLE} · 88f28ab`);
  assert.equal(line.includes('54'), false);
  assert.equal(line.includes('TF 1'), false);
});

test('Expo Go labels git when no real SHA was baked', () => {
  assert.equal(
    formatBuildStamp({
      inExpoGo: true,
      nativeBuildVersion: null,
      easBuildId: null,
      gitCommitHash: null,
    }),
    `TF ${EXPO_GO_FIELD_UNAVAILABLE} · EAS ${EXPO_GO_FIELD_UNAVAILABLE} · git ${EXPO_GO_FIELD_UNAVAILABLE}`,
  );
});

test('a missing field outside Expo Go is left off instead of a made-up number or SHA', () => {
  assert.equal(
    formatBuildStamp({
      inExpoGo: false,
      nativeBuildVersion: null,
      easBuildId: null,
      gitCommitHash: null,
    }),
    '',
  );
  assert.equal(shortGitSha('HEAD'), null);
  assert.equal(shortGitSha('unknown'), null);
  assert.equal(shortGitSha('abc'), null);
  assert.equal(normalizeEasBuildId('not-a-build'), null);
  assert.equal(normalizeEasBuildId('1'), null);
  assert.equal(normalizeNativeBuildVersion('Expo Go'), null);
  assert.equal(normalizeNativeBuildVersion(''), null);
});

test('native build version prefers expo-application and never Expo Go’s plist', () => {
  assert.equal(
    nativeBuildVersionFromSources({
      inExpoGo: false,
      applicationNativeBuildVersion: '142',
      platformIosBuildNumber: '1',
    }),
    '142',
  );
  assert.equal(
    nativeBuildVersionFromSources({
      inExpoGo: false,
      applicationNativeBuildVersion: null,
      platformIosBuildNumber: '88',
    }),
    '88',
  );
  assert.equal(
    nativeBuildVersionFromSources({
      inExpoGo: true,
      applicationNativeBuildVersion: '54',
      platformIosBuildNumber: '54',
    }),
    null,
  );
});

test('baked extra is read from expoConfig, then the embedded manifest', () => {
  assert.equal(
    extraRecordFromConstants({
      expoConfig: { extra: { easBuildId: EAS, gitCommitHash: SHA } },
      manifest: { extra: { easBuildId: 'other', gitCommitHash: 'abc' } },
    })?.easBuildId,
    EAS,
  );
  assert.equal(
    extraRecordFromConstants({
      expoConfig: null,
      manifest: { extra: { easBuildId: EAS, gitCommitHash: SHA } },
    })?.gitCommitHash,
    SHA,
  );
  assert.equal(extraRecordFromConstants({ expoConfig: null, manifest: null }), null);
});

test('Expo Go is the Expo Go app, not a dev client that merely lacks an EAS id', () => {
  assert.equal(isExpoGoRuntime({ appOwnership: 'expo', expoVersion: null }), true);
  assert.equal(isExpoGoRuntime({ appOwnership: null, expoVersion: '57.0.0' }), true);
  assert.equal(isExpoGoRuntime({ appOwnership: null, expoVersion: null }), false);
  assert.equal(isExpoGoRuntime({ appOwnership: null, expoVersion: '  ' }), false);
});

test('app.config.js bakes EAS_BUILD_ID and the EAS git SHA and does not invent them', () => {
  const previousId = process.env.EAS_BUILD_ID;
  const previousSha = process.env.EAS_BUILD_GIT_COMMIT_HASH;
  const makeConfig = require('../../app.config.js') as (args: { config: Record<string, unknown> }) => {
    extra: { easBuildId: string | null; gitCommitHash: string | null };
  };
  try {
    delete process.env.EAS_BUILD_ID;
    delete process.env.EAS_BUILD_GIT_COMMIT_HASH;
    const plain = makeConfig({ config: { extra: {} } }).extra;
    assert.equal(plain.easBuildId, null);
    assert.ok(plain.gitCommitHash == null || /^[0-9a-f]{40}$/.test(plain.gitCommitHash));

    process.env.EAS_BUILD_ID = 'not-a-uuid';
    process.env.EAS_BUILD_GIT_COMMIT_HASH = 'HEAD';
    const junk = makeConfig({ config: { extra: {} } }).extra;
    assert.equal(junk.easBuildId, null);
    assert.equal(junk.gitCommitHash === 'HEAD', false);
    assert.ok(junk.gitCommitHash == null || /^[0-9a-f]{40}$/.test(junk.gitCommitHash));

    process.env.EAS_BUILD_ID = EAS.toUpperCase();
    process.env.EAS_BUILD_GIT_COMMIT_HASH = SHA.toUpperCase();
    const baked = makeConfig({ config: { extra: {} } }).extra;
    assert.equal(baked.easBuildId, EAS);
    assert.equal(baked.gitCommitHash, SHA);
  } finally {
    if (previousId == null) delete process.env.EAS_BUILD_ID;
    else process.env.EAS_BUILD_ID = previousId;
    if (previousSha == null) delete process.env.EAS_BUILD_GIT_COMMIT_HASH;
    else process.env.EAS_BUILD_GIT_COMMIT_HASH = previousSha;
  }
});

test('Settings renders the stamp from the reader and does not read app.json buildNumber', () => {
  const settings = readFileSync(new URL('../../app/settings.tsx', import.meta.url), 'utf8');
  const stamp = readFileSync(new URL('./buildStamp.ts', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    '',
  );
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  assert.match(settings, /formatBuildStamp\(readBuildStamp\(\)\)/);
  assert.match(settings, /selectable/);
  assert.doesNotMatch(stamp, /expoConfig\?\.ios/);
  assert.doesNotMatch(stamp, /expo-updates|Updates\./);
  assert.match(stamp, /expo-application/);
  assert.match(stamp, /nativeBuildVersion/);
  assert.equal(pkg.dependencies['expo-updates'], undefined);
  assert.ok(pkg.dependencies['expo-application']);
});
