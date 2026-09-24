# ShotTraxx — P5.x

User-facing name is **ShotTraxx™** (`expo.name`, iOS `CFBundleDisplayName`, Android `label`). Bundle ID `com.shottrax.app` and Expo slug `shottrax` stay unchanged. Home-screen icon files under `assets/images/` are the locked Build 36 night-green Shot/Traxx mark (illuminated pin, three lime arcs). Splash still is the first frame of Doc’s 3s open clip, shown with contain + black letterbox.

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

golfapi runs only after OSM/OpenGolf and GCA Pro hard-miss (`GET /courses?country=US`, then `/courses/{id}` + `/coordinates/{id}`). The on-device golfapi blob remains `settings.golfapi.hydrates`. The paint waterfall also writes `settings.course.paint.cache` and, when configured, the shared JSON host. Next open of that course reads the cache only. No Worker / Worker 503 (no secret) / thin GPS → miss card. Never invents tee/green.

The phone calls golfapi only through the share-sync Worker: `{EXPO_PUBLIC_SHARE_SYNC_URL}/golfapi/v2.3/…`. **`GOLFAPI_KEY`** is a Cloudflare secret on that Worker (and a GitHub Actions secret for the probe script). It is not an EAS env var and not in `expo.extra`. Do not commit a key. Do not call golfapi from CI without a key.

## Golf Courses API (nearby courses, par, green centroids)

Nearby courses, hole par, and green centroids come from [Golf Courses API](https://golfcoursesapi.com/) (Pro green-centers). **Do not hardcode the key.**

### Keys live on the Worker, not the phone

The app never holds a vendor key. It calls the share-sync Worker at `EXPO_PUBLIC_SHARE_SYNC_URL`:

- `{url}/gca/v1/courses?…`, `/courses/{id}`, `/courses/{id}/green-centers` → golfcoursesapi.com
- `{url}/golfapi/v2.3/courses?…`, `/courses/{id}`, `/coordinates/{id}` → golfapi.io

The Worker adds `Authorization: Bearer …` from its Cloudflare secrets `GOLF_COURSES_API_KEY` and `GOLFAPI_KEY`, and passes upstream status codes through. Route example: `worker-golf-proxy.js` (merge it into the existing Worker; it is not deployed from this repo).

```bash
# on the Worker project, not this repo
wrangler secret put GOLF_COURSES_API_KEY
wrangler secret put GOLFAPI_KEY
```

Do **not** set `EXPO_PUBLIC_GOLF_COURSES_API_KEY` / `EXPO_PUBLIC_GOLFAPI_KEY` anywhere (Metro would inline them). `app.config.js` strips `golfCoursesApiKey` / `golfApiKey` from `expo.extra`. `GOLF_COURSES_API_KEY` may stay as an EAS **secret** only for the `eas-build-post-install` probe below; the app bundle never reads it.

Without the Worker URL, course search and nearby use the bundled catalog only and do not call the network. Start 9/18 stays off until a real course (and tee, when the course lists tees) is picked. ShotTraxx never invents a nearby-course list, par, SI, or green coordinate.

When the Worker URL is set:

- Nearby search is `GET https://golfcoursesapi.com/api/v1/courses?lat=&lng=&radius=` (radius km, max 100). Phone Home nearby wakes a **phone** fix. Watch Home nearby (below) uses a fresh Watch fix when the Watch has one, else the phone fix, else the last phone location.
- Text search is `GET /api/v1/courses?q=` (name, city, state). A 5-digit ZIP geocodes, then uses nearby `lat/lng/radius`. Search is text / geocode only — never Watch GPS and never the 15 m / 25 m mark gates.
- Course detail is `GET /api/v1/courses/:id` (named teeboxes → par, SI/handicap, hole yardage, rating, slope)
- Flow: search or nearby → one list with played courses on top → select course → select named tee. Start 9/18 stays off until that pick is real.
- Green centroids are `GET /api/v1/courses/:id/green-centers` (**Pro/Max**; `403` on free → greens stay blank)
- Missing par is **Par unknown**. Missing SI is **SI unknown**. Missing rating/slope/yardage stay blank. Missing green stays empty — yards to green shows **—** and **Waiting on green location.**

### Watch Home

The Watch opens on **Watch Home** when no hole is live (a live round still opens that hole; the hole's Home button comes back here with **Continue · Hole N**).

- **Favorites** — the phone `course.favorites` list. One list; the Watch keeps no copy of its own beyond a display cache.
- **Nearby** — the same Golf Courses API nearby search as the phone, run on the phone. Search point: fresh Watch fix → fresh phone fix → last phone location (`watch.home.lastPhoneFix`). No point → empty Nearby, never a guess.
- A course shows once: a favorite that is also nearby sits under Favorites (with its distance) and is dropped from Nearby.
- Row tap starts the round like the phone (course → 9/18 → tee → Start); the live round's course continues it. A favorite with no API detail starts like the phone Favorites row.
- Star toggles the phone favorite (`favoriteToggle`, sent live + queued; older `at` is ignored). Phone stars/unstars bump the DB, which re-pushes `watchHome` (application context key `watchHome` + live message) so the Watch updates without a relaunch.
- No Export / Restore and no account on the Watch.

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

## Live follow scorecard

Person A shares the live board (code / `shottrax:///s/{code}`). Person B opens that link or enters the code on **Watch a live board** and sees a scorecard: hole, par, score, putts, start and finish time, plus `Thru N · elapsed · ~time left`. No map, no GPS.

- `holes.started_at` is stamped when the player is on a hole whose earlier holes are all finished (Made it / Hole Out or a posted score) — i.e. they finished the last hole and moved on. Looking ahead at later holes and coming back never stamps them (`planHoleStartStamp`). `holes.completed_at` is stamped the first time Made it / Hole Out fires (re-finishing keeps the first stamp).
- The board payload (`SpectatorPayload`, still `v: 1`) now carries `par`, `putts` (only after Made it / Hole Out), `startedAt`, `completedAt` per hole and `updatedAt`. Older payloads parse with those fields null.
- Pace (`src/domain/livePace.ts`): thru = holes with a posted score or finish stamp; elapsed = first start → now (last finish once done); time left = mean start→finish of stamped holes × holes left. No stamps → no pace, never a guess.
- The hole screen republishes after every change, so a follower sees each finished hole on the next poll (`LIVE_BOARD_POLL_MS`).
- Same phone always works (local `share_boards` row). Other phones need `EXPO_PUBLIC_SHARE_SYNC_URL` — the same JSON `GET/PUT /{code}` host; the extra fields ride in the existing JSON. Without it the follower screen says so.
- Round history keeps pace of play. The stamps stay on each hole row, the round summary shows `Pace of play: 4h 02m · 13m a hole` and a start–finish time for each hole, and each finished round in the history list shows its total time. The round history export / restore file carries `startedAt` / `completedAt` per hole. Older files and rounds with no stamps show no pace.
