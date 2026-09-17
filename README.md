# ShotTraxx

Phone GPS golf shot tracker (no club sensors). **This branch is P5.x** on P1–P5.2 (GPS mark-shot, scores, club averages, hole map trails, voice club pick, top-3, penalties, nearby courses, OSM outlines).

P5.x is the on-course hero: **pick a club to mark GPS**, sticky **Same club** one-tap, voice applies immediately (no confirm), Drop vs Penalty, delete round, haptics, and a thumb-zone layout. **Player voice only** on screen — no API/OSM/GPS-meter footnotes. F/M/B distances show only when course data includes front and back pins (never invented from a single green). Rating and slope sit on the tee. An Apple Watch companion picks clubs (top-3 + bag + Same club). Putts (P5.y), StoreKit, and Photos stay out of scope.

User-facing name is **ShotTraxx** (`app.json` `expo.name`, iOS `CFBundleDisplayName`, Android `label` / home screen). Bundle ID `com.shottrax.app` and Expo slug `shottrax` stay unchanged (App Store ID). Home-screen icon is the Doc + Lead locked mark at `assets/images/icon.png` (see `assets/images/README.md`).

## Run (iOS first)

```bash
npm install
npx expo start
```

Then:

- iPhone with **Expo Go**: scan the QR code (location + SQLite + Apple Maps via `react-native-maps`)
- iOS Simulator: press `i` (see simulator GPS below)

**Voice club pick** uses `expo-speech-recognition` (microphone + speech recognition). That native module is **not** in Expo Go — use a development build:

```bash
npx expo prebuild
npx expo run:ios
```

or an EAS development build (`eas build -p ios --profile development`). Tap targets remain if speech is unavailable.

To install a store-signed build with voice on a physical iPhone, use **TestFlight** below (Expo Go is not enough).

## Splash

Cold start shows the native Expo splash, then a short JS branded open (**ShotTraxx**, under ~2s). It is not a video.

## Golf Courses API (course picker)

Nearby course search, hole par, and green centroids are behind [Golf Courses API](https://golfcoursesapi.com/) Pro. See `NOTES.md` and `.env.example`.

**EAS secret name:** `GOLF_COURSES_API_KEY` (set for production, preview, and development). `app.config.js` copies it into `expo.extra.golfCoursesApiKey` so the app can read it on EAS builds via `expo-constants`. **Never commit a key. Do not invent a second secret name in git.**

Expo client JS only inlines `EXPO_PUBLIC_*`. For local Expo Go, CoS must also set `EXPO_PUBLIC_GOLF_COURSES_API_KEY` in `.env` **or** map that public name from the existing `GOLF_COURSES_API_KEY` secret in the Expo dashboard (same value).

```bash
EXPO_PUBLIC_GOLF_COURSES_API_KEY=your_key_here
```

Without a key the nearby picker is disabled (graceful copy, no network). You can still type a course name and drop a green pin. Missing par stays **Par unknown**. Missing greens stay blank.

Selecting a nearby course **starts** a new round (Start 9/18) or **attaches** par/greens to a round in progress (blank holes only).

`golfcoursesapi.com` may need **device / EAS smoke** — TLS fails on some boxes even when the client is correct.

## OSM overlays

Hole map draws Overpass `golf=green`, `golf=fairway`, `golf=tee`, and `golf=hole` around a real green pin or course coordinate. Unmapped / timeout / empty → no overlay. OSM par tags are ignored.

## Install on your iPhone (TestFlight)

Voice club pick needs a **native** binary. `expo-speech-recognition` is **not** in Expo Go. A production EAS build submitted to TestFlight is the path that covers voice on a real iPhone.

### You need

- **Apple Developer Program** ($99/year): [developer.apple.com/programs](https://developer.apple.com/programs/)
- An [Expo](https://expo.dev/signup) account

### One-time tooling

```bash
npm i -g eas-cli
eas login
eas build:configure
```

`eas build:configure` (or `eas init`) links this repo to an Expo project.

**TODO:** Expo will write `extra.eas.projectId` into `app.json`. **Commit that UUID** — it is not a secret. Do not invent a project ID.

Do **not** put Apple Team ID, App Store Connect API keys, or `.p8` files in git. Paste them when prompted:

| What | Where Doc pastes it |
| --- | --- |
| iOS distribution cert / provisioning | `eas credentials` → production profile (let EAS manage signing) |
| Apple Team ID | `eas credentials` / `eas submit` prompt — not `eas.json` |
| App Store Connect API key (`.p8`, Key ID, Issuer ID) | App Store Connect → Users and Access → Integrations → App Store Connect API, then `eas credentials` (Manage your API Key) or the `eas submit` prompt. `.p8` is gitignored. |
| Optional later: `ascAppId` (numeric Apple ID of the app) | App Store Connect → App Information → Apple ID. Safe to commit in `eas.json` `submit.production.ios` if you want fewer prompts — still do not invent it. |

Bundle ID is already `com.shottrax.app`. Marketing version is `0.1.0`; iOS `buildNumber` starts at `1`. The `production` profile auto-increments build numbers on EAS (`cli.appVersionSource`: `remote`).

### Build and send to TestFlight

```bash
eas build -p ios --profile production
# or: npm run eas:build:ios

eas submit -p ios
# or: npm run eas:submit:ios
```

`eas submit -p ios` uploads the production `.ipa` to App Store Connect. After Apple processes it (often 10–15 minutes) it appears in **TestFlight**.

### Install on the phone

1. In [App Store Connect](https://appstoreconnect.apple.com), open the app → TestFlight → add yourself as an **internal tester**.
2. On the iPhone, install the **TestFlight** app from the App Store, accept the invite, install ShotTraxx.

### Profiles in `eas.json`

| Profile | What it is |
| --- | --- |
| `development` | Expo **dev client** (internal). Use while iterating; not for TestFlight. |
| `preview` | Production-like **internal** / ad hoc distribution (not App Store). |
| `production` | App Store / **TestFlight** (this section). |

## Permissions

| Permission | When |
| --- | --- |
| **Location When In Use** | Picking a club marks where you hit from. The next club pick closes the prior shot. Green estimate can reuse the current GPS. ShotTraxx does not invent coordinates. |
| **Microphone** | Only after **Say a club**. Used to capture the utterance. |
| **Speech Recognition** (iOS) | Maps the utterance to a bag club and applies it immediately. |

## Apple Watch (ships in this IPA)

Companion via `@bacons/apple-targets` (`targets/watch`, bundle `com.shottrax.app.watch`) plus a local Expo module (`modules/watch-bridge`) so EAS iOS prebuild links Watch Connectivity.

- Watch Connectivity only two types this cut:
  - Phone → Watch `clubList`: `{ type, top3, bag, labels, holeNumber, yardsToGreen, yardsQuality }` pushed on hole change / fix quality change / bag rank change (ranking stays on phone). `yardsToGreen` is `yardsToGreen().yards` (`null` when quality is none). `yardsQuality` is `good | soft | none` — same bands as the phone, never invent.
  - Watch → Phone `clubPick`: `{ type, clubId, at: ISO8601 }` plus optional Watch GPS (`lat`, `lng`, `accuracyM`) when the sample is ≤3 s old and accuracy > 0. Stretch prefer lock: `preferWatch = watchFix && ageSec <= 3 && watch.accuracyM > 0 && (phoneFix == null || watch.accuracyM <= phone.accuracyM)`; `markFix = preferWatch ? watchFix : phoneFix`. Then same `acceptFix` bands. Soft → Approximate. Quality none → wait / Mark anyway. Never invent / silent fail.
- Watch status: **Hole N · XXX yd** (same yardsToGreen as phone); **—** when quality is none; tiny **SOFT** chip when soft.
- **Same club** is the big 1-tap mark on the wrist. Haptic on a successful mark (phone + Watch).
- Watch feedback is **`7i marked ✓`** or **`Phone unavailable`** — never a silent fail.
- Complication (stretch): **Hole N · XXX yd** (`—` when none), via the `ShotTraxxHole` widget.
- Offline: Watch queues **one** pending `clubPick` until reachable, then flushes
- **Undo** stays on the phone. **No** Watch motion, mic, or sensor auto-mark

EAS credentials for `com.shottrax.app.watch` and `com.shottrax.app.watch.widget` are declared under `extra.eas.build.experimental.ios.appExtensions`.

## Maps (`react-native-maps`)

- **iOS:** Apple Maps, `mapType="satellite"` (no Google API key).
- Hole **number comes from the scorecard**, overlaid on the map. OSM `golf=green/fairway/tee/hole` **outlines** are drawn when Overpass returns them; unmapped holes stay empty (nothing invented).
- Polylines are **closed GPS shots only** (start→end). Penalties are list rows, not trails. `no_gps` shots have no coordinates and never draw.
- **Yards to green** uses the sensing hook `yardsToGreen(fix, greenCentroid) → { yards, quality }`. Same haversine and good (<15 m) / soft (15–25 m) bands as shot marks. No fix or no green pin → `{ yards: null, quality: 'none' }` (never invents a pin or a range). Poor GPS (>25 m) is also `none`, matching `acceptFix`. Soft GPS shows a **SOFT** badge. When quality is `none`, the map shows **yards to green — / unavailable**.
- Course API **green centroids** feed that hook. Long-press (or **Mark green (GPS)**) still drops a **user** pin and wins over the centroid.
- Scorecard **par** is course data only. Missing par is **Par unknown** until you tap 3–6.
- **Android** satellite tiles typically need a Google Maps API key in the `react-native-maps` config plugin for store/dev binaries. iOS is the target.

## On-course flow

1. Find a nearby course (GPS) or type a name, then start a 9- or 18-hole round (or attach a course to a round in progress).
2. On a hole, par comes from the course when present; otherwise **Par unknown**. Set par and score (large +/− targets).
3. Hole advance opens **Pick a club**. Say or tap a club — that **marks GPS immediately** (start now; closes the prior shot’s end). On-screen: “Picking a club marks where you hit from.” No Confirm sheet.
4. **Same club** is the one-tap escape after that. **Undo last** if the club was wrong (or pick another before you walk). **Mark without club**, no-GPS, and Drop / Penalty stay available. GPS at the club pick = shot **start**; if this hole already had an open GPS shot, that same fix is its **end** and yards are logged (haversine).
5. **End last shot** closes an open GPS shot without starting a new one.
6. **+ Penalty** adds 1–5 penalty strokes to the hole score, with reason water / OB / unplayable / other (optional note). Shown as a penalty row — not a map polyline. A penalty is **not a Shot for distance**: it never hits `acceptFix`, haversine, club averages, or top-3.
7. **Add shot without GPS** (forgotten swing / no fix): pick a club and optionally type yards (or leave blank). Stored as `source = no_gps`, `fixQuality = none`, **null** lat/lng, **null** `distance_yards`. Typed yards live in `typed_yards` (score/UI only) and are **excluded from distance averages and top-3**. No include-typed-yards toggle in MVP. Never invents a coordinate and never calls `acceptFix`.
8. Finish the round for a scorecard. Club averages live on the Averages tab.

Hole **score remains the source of truth**. If you also logged shots and/or penalties, the hole screen and round summary warn when `score ≠ shots + penalty strokes`.

## Penalties (`hole_penalties`)

- Persisted per hole: `strokes`, `reason` (`water` | `ob` | `unplayable` | `other`), optional free-text `note`.
- Adding a penalty **increments the hole score** (from the current score, or par if the score is still blank — same base as +/−).
- **Not a Shot for distance.** Never calls `acceptFix` / haversine. Not included in club distance averages or top-3 ranking.
- Listed on the hole screen and per hole on the round summary.

## Add shot without GPS (`source = no_gps`)

Use this when you swung but have no GPS fix (or forgot to mark).

| Field | Stored value |
| --- | --- |
| `source` | `no_gps` |
| `fix_quality` | `none` (not good/soft/forced) |
| start/end lat, lng, accuracy | `NULL` — never `0,0` or a synthesized pin |
| `distance_yards` | always `NULL` (GPS haversine only) |
| `typed_yards` | optional user-typed integer, or `NULL` if blank — score/UI only |
| `ended_at` | set immediately (closed stroke, no trail) |

**Distance averages / top-3:** excluded by default (`source = no_gps` and/or `fixQuality = none`). Typed yards do **not** count in averages; there is no toggle to include them. Honest GPS 0 yd (simulator pin that did not move) still counts.

**Score / sequence:** like a GPS mark, this does **not** auto-bump the scorecard; use +/− or **+ Penalty**. The shot still takes the next `seq` on the hole so strokes + penalties can be reconciled with score.

## Top-3 ranking

After a club has **≥5** closed **GPS** shots with yards (soft and forced included, same as averages; `no_gps` / `fixQuality none` excluded):

- **D** = `yardsToGreen(fix, greenCentroid).yards` **only when `quality !== none`** (good or soft GPS + a real green centroid)
- else **D** = last closed **GPS** shot distance on this hole
- else full bag (no ranking)

The 3 eligible clubs with the lowest `|avgYards − D|` are surfaced. Ties prefer the **shorter** club (higher `loftRank`). Full bag is always one tap away. Penalties do not affect ranking.

## Sensing gates (locked, unchanged from P1)

Defined in `src/config/sensing.ts`. Mark path is `getFix` → `acceptFix`, then `forceMark` after UI confirm (`src/sensing/api.ts`). P5 ranging hook is `yardsToGreen(fix, greenCentroid)` (same good/soft bands; `quality: 'none'` and no number when there is no usable fix or green).

| Gate | Value | Behavior |
| --- | --- | --- |
| Soft GPS | **15–25 m** inclusive | `acceptFix` keeps the shot, `fixQuality = soft`, **SOFT** badge |
| Good GPS | **&lt; 15 m** | `fixQuality = good` |
| Poor GPS | **&gt; 25 m** or unknown | `acceptFix` rejects; **Force** runs `forceMark` → `forced` |
| `MAX_SHOT_YD` / `impossible_jump` | **400 yd** | Distance **&gt; 400** needs `forceMark` → `forced` |
| `WALK_BLOCK` | **false** | Walking-length gaps are not blocked |

`soft` and `forced` GPS shots **stay in club averages** (and therefore in top-3 once a club has 5+ closed GPS shots). Badges mean those qualities are in the mix, not that they were dropped. History / summary still show SOFT / FORCED on GPS shots. Penalties and `no_gps` (`fixQuality: none`) shots are separate and never distance samples.

## Simulator / mock GPS

ShotTraxx **does not synthesize a fairway or fake points**.

- On the iOS Simulator a **SIMULATOR / MOCK GPS** banner is shown.
- Marks use whatever location the simulator (or a mock provider) reports.
- If the pin never moves, closed GPS shots will be **0 yd** — that is honest, not a demo path.
- Forgotten swings should use **Add shot without GPS** instead of inventing a pin.
- To test yards in Simulator: Features → Location → Custom Location, then move the pin between marks.

## Limitations

- OSM overlays only where mapped; unmapped holes stay empty.
- No Watch motion, Plays Like invented from a single centroid, auto-detect, or mic-based shot detect.
- Watch club-pick (top-3 + bag + Same club) ships with this IPA. Crown / double-tap stay out.
- Local SQLite only (no account / cloud).
- iOS is the target; Android location is wired but maps may need a Google key.
- Nearby course picker requires Golf Courses API key `GOLF_COURSES_API_KEY` (see `NOTES.md`). Smoke nearby search on a device/EAS build if this environment cannot TLS to golfcoursesapi.com.

## Tests

```bash
npm test          # domain tests + sensing smoke + course client, including yards-to-green, sticky club, F/M/B, drop, voice
npm run typecheck
```
