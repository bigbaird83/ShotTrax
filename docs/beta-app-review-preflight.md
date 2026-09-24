# Beta App Review preflight

Run this **before** the next external TestFlight build:

```bash
npm run eas:ios:testflight:preflight
```

That command only prints this file. It does not start an EAS build or submit, and it does not change App Store Connect.

Then, only after every box below is true:

```bash
eas workflow:run .eas/workflows/production-ios-testflight.yml
# or: npm run eas:ios:testflight
```

The workflow builds iOS with profile `production`, sets TestFlight **What to Test** from the git tip (`short SHA` + subject), adds external group `friends`, and submits Beta App Review (`submit_beta_review: true`). Expo will fail that job if TestFlight test information is missing in App Store Connect.

## Checklist

- [ ] **Brian (via CoS) has explicitly okay'd THIS build.** A standing yes does not cover a new tip.
- [ ] **TestFlight test information** is filled in App Store Connect for ShotTraxx (bundle `com.shottrax.app`, `eas.json` `submit.production.ios.ascAppId`): beta app description, feedback email, and the contact fields on that form. [Provide test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information).
- [ ] **External group `friends`** exists in TestFlight. The name must match exactly. It is an external group (`eas submit --groups` cannot add it).
- [ ] **Export compliance** matches the repo. `app.json` → `expo.ios.infoPlist.ITSAppUsesNonExemptEncryption` is already `false`. Do not file a new encryption claim. If App Store Connect still asks for this build, answer in line with that existing `false` value.
- [ ] **Demo account / review notes.** This app has no account and no login (local SQLite only; the Watch has no account). Leave sign-in required off. Do not invent a username or password. If the form has review notes, say the app opens without signing in.
- [ ] **EAS production URLs** are still set: `EXPO_PUBLIC_SHARE_SYNC_URL` and `EXPO_PUBLIC_COURSE_PAINT_CACHE_URL` (plain URLs, not secrets). Read-only check: `eas env:list --environment production`. Do not paste values into git.
- [ ] **No Expo golf vendor keys on EAS.** `EXPO_PUBLIC_GOLF_COURSES_API_KEY` and `EXPO_PUBLIC_GOLFAPI_KEY` are unset (Metro would inline them). `GOLFAPI_KEY` stays a Cloudflare Worker secret, not an EAS variable. `GOLF_COURSES_API_KEY` may already be an EAS secret used only by the `eas-build-post-install` greens probe (`NOTES.md`); do not copy it into `expo.extra`, and do not add any other golf vendor key. Do not delete Worker secrets as part of this checklist.

## What to Test

Job `what_to_test` checks out the same sources the build uses and runs `git log -1 --pretty=format:'%h %s'` (plus a short commit body when there is one). That string is `testflight.params.changelog`.

Manual `eas workflow:run` is `workflow_dispatch` and does not set `github.commit_message`. Commit the tip you want friends to see before you start the run. A local run without `--ref` uploads the working tree as well as that git tip, so leave the tree clean when the note should describe the binary.
