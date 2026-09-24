# GitHub Pages — ShotTraxx™ privacy policy

Public page: `docs/privacy/index.html`.  
App Store Connect does not use this note. Paste the privacy URL below.

`docs/beta-app-review-preflight.md` is a separate checklist. This page does not change it. `.nojekyll` is here so GitHub Pages serves the HTML as-is and does not run Jekyll on that markdown.

## Privacy Policy URL

Once GitHub Pages is live, paste this into **App Store Connect → App Privacy → Privacy Policy URL**:

https://bigbaird83.github.io/ShotTrax/privacy/

The site root (`https://bigbaird83.github.io/ShotTrax/`) only links to that page. Use `/privacy/`.

ShotTraxx.com can point here later. This GitHub Pages URL is enough to unblock App Store Connect now.

## Turn on Pages

The repo is public. In GitHub:

1. Open [bigbaird83/ShotTrax](https://github.com/bigbaird83/ShotTrax) → **Settings** → **Pages**.
2. **Build and deployment** → **Source**: Deploy from a branch.
3. **Branch**: `main`, folder **`/docs`**. Save.
4. Wait until Pages shows a green URL. Open https://bigbaird83.github.io/ShotTrax/privacy/ and confirm the policy loads on a phone.

No build step. Do not start an EAS build and do not change App Store Connect from the repo.

## Contact line

The Contact section currently says **email TBD**. Edit `docs/privacy/index.html` (the paragraph with `id="contact-email"`) before you rely on it. Course-contribution mail in the app already goes to `ShotTraxx@gmail.com` if you want that inbox.

## Export flag

`app.json` already sets `expo.ios.infoPlist.ITSAppUsesNonExemptEncryption` to `false`. This page does not add an encryption or export claim. If App Store Connect asks, answer in line with that existing `false` value.
