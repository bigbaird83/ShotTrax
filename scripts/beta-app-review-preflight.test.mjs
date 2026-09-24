import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync('.eas/workflows/production-ios-testflight.yml', 'utf8');
const preflightScript = readFileSync('scripts/print-beta-app-review-preflight.mjs', 'utf8');
const whatToTest = readFileSync('scripts/testflight-what-to-test.sh', 'utf8');
const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

test('production iOS workflow takes What to Test from the git tip', () => {
  assert.match(workflow, /what_to_test:/);
  assert.match(workflow, /uses: eas\/checkout/);
  assert.match(workflow, /bash scripts\/testflight-what-to-test\.sh/);
  assert.match(workflow, /git log -1 --pretty=format:'%h %s'/);
  assert.match(workflow, /changelog: \$\{\{ needs\.what_to_test\.outputs\.changelog \}\}/);
  assert.match(workflow, /external_groups: \["friends"\]/);
  assert.match(workflow, /submit_beta_review: true/);
  assert.match(workflow, /platform: ios/);
  assert.match(workflow, /profile: production/);
  assert.doesNotMatch(workflow, /\$\{\{[^}]*github\.commit_message/);
  assert.doesNotMatch(workflow, /Production build for the external TestFlight group friends/);
  assert.match(whatToTest, /git log -1 --pretty=format:'%h %s'/);
});

test('what-to-test script prints the checked-out tip', () => {
  const expected = spawnSync('git', ['log', '-1', '--pretty=format:%h %s'], {
    encoding: 'utf8',
  });
  assert.equal(expected.status, 0);
  const note = spawnSync('bash', ['scripts/testflight-what-to-test.sh'], {
    encoding: 'utf8',
  });
  assert.equal(note.status, 0, note.stderr);
  const line = note.stdout.trim();
  assert.ok(line.startsWith(expected.stdout));
  assert.equal(line.includes('\n'), false);
  assert.equal(line.includes('Co-authored-by'), false);
  assert.ok(line.length > 0 && line.length <= 4000);
});

test('preflight script only prints the checklist', () => {
  assert.doesNotMatch(preflightScript, /eas |fetch\(|child_process|https?:\/\//);
  assert.equal(pkg.scripts['eas:ios:testflight:preflight'], 'node scripts/print-beta-app-review-preflight.mjs');
  assert.equal(
    pkg.scripts['eas:ios:testflight'],
    'eas workflow:run .eas/workflows/production-ios-testflight.yml',
  );
  const printed = spawnSync('node', ['scripts/print-beta-app-review-preflight.mjs'], {
    encoding: 'utf8',
  });
  assert.equal(printed.status, 0, printed.stderr);
  const doc = readFileSync('docs/beta-app-review-preflight.md', 'utf8');
  assert.equal(printed.stdout, doc.endsWith('\n') ? doc : `${doc}\n`);
  for (const phrase of [
    'Brian (via CoS)',
    'beta app description',
    'feedback email',
    'External group `friends`',
    'ITSAppUsesNonExemptEncryption',
    'Demo account',
    'EXPO_PUBLIC_SHARE_SYNC_URL',
    'EXPO_PUBLIC_COURSE_PAINT_CACHE_URL',
    'EXPO_PUBLIC_GOLF_COURSES_API_KEY',
    'EXPO_PUBLIC_GOLFAPI_KEY',
  ]) {
    assert.ok(printed.stdout.includes(phrase), phrase);
  }
  assert.equal(appJson.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
});
