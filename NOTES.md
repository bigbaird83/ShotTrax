# ShotTraxx — P5.x

User-facing name is **ShotTraxx** (`expo.name`, iOS `CFBundleDisplayName`, Android `label`). Bundle ID `com.shottrax.app` and Expo slug `shottrax` stay unchanged. Home-screen icon files under `assets/images/` are the locked Build 36 night-green Shot/Traxx mark (illuminated pin, three lime arcs). Splash still is the first frame of Doc’s 3s open clip, shown with contain + black letterbox.

## Course paint waterfall

Tee/green paint for any course, in this order (`resolveCoursePaint`):

1. **Cache** — device SQLite `settings.course.paint.cache`, then the optional JSON host. A hit skips GCA Pro and golfapi (zero paid calls).
2. **OSM / OpenGolf** — bundled centerlines and manual-verified cards. Paint when tee + green pass the card sanity gates. A 9×2 mirror counts (below).
3. **Bundled golfapi seed** — North Hills, Mountain Ranch, and any card already in `settings.golfapi.hydrates`. This is not a new purchase. It skips GCA Pro. Thunderbird Heber Springs is excluded: that seed is poisoned and HARD-MISS.
4. **GCA Pro** — `GET /courses/:id/green-centers`. Greens paint when coordinates come back. Tees paint only when that payload already has them. Scorecard par/yards with no coordinates is still a miss.
5. **golfapi.io last** — only after OSM and GCA both hard-miss. Same tee+green sanity. One search + course + coordinates fetch. A pass is written to the shared cache so the next resolve does not pay again.

Never invent a tee or a green. A miss stays a miss. Bundled hydrates (North Hills, Mountain Ranch, Cypress, …) still seed the card. Thunderbird Heber Springs does not: golfapi seed, `settings.golfapi.hydrates`, `settings.course.paint.cache` rows from that card, and network golfapi are ignored. Next paint is OSM if mapped, or a Doc pin-sheet only when a green already exists. Pin sheets do not invent greens. CI must not call golfapi without `GOLFAPI_KEY`.

**9×2.** When a source has `numHoles = 9` and holes 10–18 tee+green exactly equal holes 1–9, that is a **9×2 PASS** (the loop played twice), not a hard miss and not a cue to invent or rewrite GPS. That rule is for other courses. Thunderbird Country Club (Heber Springs) stays HARD-MISS until OSM or Doc.

**Cache keys.** `id:<courseId>` and `name:<normalized name>|<city>|<state>`. The record stores source, `numHoles`, `nineByTwo`, and the real tee/green pairs. A hit is ignored when the stored name/city disagrees.

**Server cache.** Optional `EXPO_PUBLIC_COURSE_PAINT_CACHE_URL` (copied to `expo.extra.coursePaintCacheUrl`). JSON `GET/PUT /{key}`, same pattern as share sync. Not a secret. When the URL is unset there is no multi-user host in this repo — the phone keeps the SQLite copy, and a second device buys golfapi once. Point the URL at any JSON object store to share PASSes.

## golfapi.io runtime hydrate (last resort)

golfapi runs only after OSM/OpenGolf and GCA Pro hard-miss (`GET /courses?country=US`, then `/courses/{id}` + `/coordinates/{id}`). The on-device golfapi blob remains `settings.golfapi.hydrates`. The paint waterfall also writes `settings.course.paint.cache` and, when configured, the shared JSON host. Next open of that course reads the cache only. No key / thin GPS → miss card. Never invents tee/green.

EAS / GitHub secret name: **`GOLFAPI_KEY`** (also `EXPO_PUBLIC_GOLFAPI_KEY` for local Metro). Set it on EAS for production / preview / development like `GOLF_COURSES_API_KEY`. `app.config.js` copies it into `expo.extra.golfApiKey`. Do not commit a key. Do not call golfapi from CI without a key.

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
- Text search is `GET /api/v1/courses?q=` (name, city, state). A 5-digit ZIP geocodes, then uses nearby `lat/lng/radius`. Search is text / geocode only — never Watch GPS and never the 15 m / 25 m mark gates.
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

## OSM overlay

`src/course/osmOverlay.ts` queries Overpass for `golf=green|fairway|tee|hole` around a real green pin or course coordinate. Empty / timeout / unmapped → no overlay (never invented). OSM `par=*` tags are **not** used for scorecard par.

## OpenGolf / OSM follow ingest

`scripts/opengolf-osm-ingest.mjs` turns the OpenGolf US hole CSV into `catalog.json` + lazy `holes/{ST}.json`. Centerline tee/green only. `match_dist_m` > 1000 m is quarantined. Thunderbird Heber Springs, The Greens at North Hills (Sherwood), and the other hand-verified AR hydrates are never overwritten. ODbL attribution: `ATTRIBUTION.md`, `NOTICE`, Settings credits. Smoke: `src/course/hydrates/opengolf/SMOKE.md`.

## Yards to green (sensing)

`yardsToGreen(fix, greenCentroid) → { yards, quality }` in `src/sensing/api.ts`.

- Same haversine + good/soft bands as shot marks
- No fix or no green → `{ yards: null, quality: 'none' }` (never invents a pin or range)
- Top-3 `D` uses this yards value **only when `quality !== none`**
