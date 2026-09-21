# ShotTraxx — P5.x

User-facing name is **ShotTraxx** (`expo.name`, iOS `CFBundleDisplayName`, Android `label`). Bundle ID `com.shottrax.app` and Expo slug `shottrax` stay unchanged. Home-screen icon files under `assets/images/` are the locked Build 36 night-green Shot/Traxx mark (illuminated pin, three lime arcs). Splash still uses the full **ShotTraxx** wordmark.

## Golf Courses API (nearby courses, par, green centroids)

Nearby courses, hole par, and green centroids come from [Golf Courses API](https://golfcoursesapi.com/) (Pro green-centers). **Do not hardcode the key.**

### EAS secret (the only secret name)

Create **one** EAS secret named `GOLF_COURSES_API_KEY` for **production**, **preview**, and **development**.

`app.config.js` copies that value into `expo.extra.golfCoursesApiKey` at EAS build time. The app reads it with `expo-constants`. Do **not** add a second secret name in git.

Expo Go / Metro only inlines `EXPO_PUBLIC_*` into client JS. For local dev without EAS, CoS should **also** set `EXPO_PUBLIC_GOLF_COURSES_API_KEY` in `.env` (same key value — not a second EAS secret). Optional: map `EXPO_PUBLIC_GOLF_COURSES_API_KEY` from the existing `GOLF_COURSES_API_KEY` secret in the Expo dashboard env UI, not by committing a key.

```bash
# local / Expo Go (copy .env.example → .env; .env is gitignored)
EXPO_PUBLIC_GOLF_COURSES_API_KEY=your_key_here
# optional: same name EAS uses (app.config.js copies it into extra)
GOLF_COURSES_API_KEY=your_key_here
```

Without a key, course search and nearby are disabled and do not call the network. Start 9/18 stays off until a real course (and tee, when the course lists tees) is picked. ShotTraxx never invents a nearby-course list, par, SI, or green coordinate.

When a key is present:

- Nearby search is `GET https://golfcoursesapi.com/api/v1/courses?lat=&lng=&radius=` (radius km, max 100). Nearby wakes a **phone** fix — never Watch GPS.
- Text search is `GET /api/v1/courses?q=` (name, city, state, or zip). Search is text / geocode only — never Watch GPS and never the 15 m / 25 m mark gates.
- Course detail is `GET /api/v1/courses/:id` (named teeboxes → par, SI/handicap, hole yardage, rating, slope)
- Flow: search or nearby → one list with played courses on top → select course → select named tee. Start 9/18 stays off until that pick is real.
- Green centroids are `GET /api/v1/courses/:id/green-centers` (**Pro/Max**; `403` on free → greens stay blank)
- Missing par is **Par unknown**. Missing SI is **SI unknown**. Missing rating/slope/yardage stay blank. Missing green stays empty — yards to green shows **—** and **Waiting on green location.**

**Smoke:** `golfcoursesapi.com` may fail TLS on some boxes. Confirm nearby search on a **device or EAS build**, not only CI.

Auth: `Authorization: Bearer <key>` and `Accept: application/json`.

### Pro greens probe (read-only, course 4)

`scripts/gca-green-centers-probe.mjs` does `GET /api/v1/courses/4/green-centers` (Bowling Green CC, `green_centers_available=true`) with Bearer `GOLF_COURSES_API_KEY`. It never invents greens. On **403** greens stay blank (same as the client).

Prints one machine line for EAS build logs / CI:

```text
GCA_GREENS_PRO=200|403|TLS_FAIL|NO_KEY|OTHER
```

Always exits 0 (does **not** block TF 60). Box TLS often fails (`UNEXPECTED_EOF`); EAS builders should work.

```bash
# local / CI — skip cleanly when the key is absent
npm run gca:greens-probe
# or: GOLF_COURSES_API_KEY=your_key node scripts/gca-green-centers-probe.mjs
```

Wired as the EAS `eas-build-post-install` npm hook (Expo lifecycle hook in `package.json`, not `eas.json`). Production EAS already injects `GOLF_COURSES_API_KEY`. Optional GitHub Action `.github/workflows/gca-greens-probe.yml` runs the same script only when that secret is present, and never fails the job.

Zip search is out of scope.

### Pro greens nightly batch (AR-first, then US)

`scripts/gca-green-centers-batch.mjs` walks ~7.4k US courses that advertise Pro green-centers and persists **only** parsed `GET /api/v1/courses/:id/green-centers` rows into `src/course/hydrates/gca/green-centers.json` (the catalog / hydrate store). OSM / HARD-MISS stay for the rest. **Never invents** greens, tees, or Thunderbird pins.

**AR / Doc belt first:** Heber Springs (Thunderbird), Fairfield Bay (Mountain Ranch), Cabot (Cypress Creek, Greystone), Little Rock (Pleasant Valley), Magnolia region — then the rest of Arkansas, then the rest of US.

**Nightly cap:** **350** courses (`GCA_GREENS_BATCH_CAP`, default `DEFAULT_NIGHTLY_CAP`). GCA Pro published limits are 10,000 req/day and 120/min burst. 350 green-center GETs plus ~10 searches and a few list pages is ~365 requests (~4% of daily quota) at 600 ms gaps (~100/min, under burst). ~7.4k / 350 ≈ 21 nights. Consecutive `403` aborts so a free key does not burn the cap.

**Logs (redacted):** status counts only — `fetched`, `skipped_empty`, `403`, `errors`. Never API keys, Bearer tokens, or payloads with PII (address / phone / full hole lists).

```bash
# local — skip cleanly when the key is absent
npm run gca:greens-batch
# optional cap
GCA_GREENS_BATCH_CAP=50 GOLF_COURSES_API_KEY=your_key npm run gca:greens-batch
```

GitHub Action `.github/workflows/gca-greens-batch.yml` cron `0 7 * * *` UTC ≈ **02:00 America/Chicago during CDT** (01:00 CT during CST). Uses repo secret `GOLF_COURSES_API_KEY` (same name as EAS). Skips the job when the secret is missing. Does not block polish / TF 61. Zip search is out of scope.

Signal: empty / `403` / missing → no coordinates written. Clubhouse pins are denied. Thunderbird’s curated catalog row stays HARD-MISS unless a later live Pro payload is selected by API id.

## OSM overlay

`src/course/osmOverlay.ts` queries Overpass for `golf=green|fairway|tee|hole` around a real green pin or course coordinate. Empty / timeout / unmapped → no overlay (never invented). OSM `par=*` tags are **not** used for scorecard par.

## Yards to green (sensing)

`yardsToGreen(fix, greenCentroid) → { yards, quality }` in `src/sensing/api.ts`.

- Same haversine + good/soft bands as shot marks
- No fix or no green → `{ yards: null, quality: 'none' }` (never invents a pin or range)
- Top-3 `D` uses this yards value **only when `quality !== none`**
