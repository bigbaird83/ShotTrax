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
- Text search is `GET /api/v1/courses?q=` (name, city, or state). Search is text only — never Watch GPS and never the 15 m / 25 m mark gates.
- US ZIP / ZIP+4 is detected, geocoded to a point, then nearby (`GET /courses?lat=&lng=&radius=`). Geocode miss is an explicit error — never phone-nearby and never a silent empty list. ShotTraxx does not invent zip coordinates.
- Course detail is `GET /api/v1/courses/:id` (named teeboxes → par, SI/handicap, hole yardage, rating, slope)
- Flow: search or nearby → one list with played courses on top → select course → select named tee. Start 9/18 stays off until that pick is real.
- Green centroids are `GET /api/v1/courses/:id/green-centers` (**Pro/Max**; `403` on free → greens stay blank)
- Missing par is **Par unknown**. Missing SI is **SI unknown**. Missing rating/slope/yardage stay blank. Missing green stays empty — yards to green shows **—** and **Waiting on green location.**

**Smoke:** `golfcoursesapi.com` may fail TLS on some boxes. Confirm nearby search on a **device or EAS build**, not only CI.

Auth: `Authorization: Bearer <key>` and `Accept: application/json`.

## OSM overlay

`src/course/osmOverlay.ts` queries Overpass for `golf=green|fairway|tee|hole` around a real green pin or course coordinate. Empty / timeout / unmapped → no overlay (never invented). OSM `par=*` tags are **not** used for scorecard par.

## Yards to green (sensing)

`yardsToGreen(fix, greenCentroid) → { yards, quality }` in `src/sensing/api.ts`.

- Same haversine + good/soft bands as shot marks
- No fix or no green → `{ yards: null, quality: 'none' }` (never invents a pin or range)
- Top-3 `D` uses this yards value **only when `quality !== none`**
