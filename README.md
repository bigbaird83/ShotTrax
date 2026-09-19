# ShotTraxx

Phone GPS golf shot tracker (no club sensors). **This branch is P5.x** on P1–P5.2 (GPS mark-shot, scores, club averages, hole map trails, voice club pick, top-3, penalties, nearby courses, OSM outlines).

P5.x is the on-course hero: **pick a club to mark GPS**, sticky **Same club** one-tap, voice applies immediately (no confirm), Drop vs Penalty, delete round, haptics, and a thumb-zone layout. **Player voice only** on screen — no API/OSM/GPS-meter footnotes. F/M/B distances show only when course data includes front and back pins (never invented from a single green). Rating and slope sit on the tee. An Apple Watch companion picks clubs (top-3 + bag + Same club) and finishes the hole with the same Putter → buckets → **Made it** flow. StoreKit and Photos stay out of scope.

User-facing name is **ShotTraxx** (`app.json` `expo.name`, iOS `CFBundleDisplayName`, Android `label` / home screen). Bundle ID `com.shottrax.app` and Expo slug `shottrax` stay unchanged (App Store ID). Home-screen icon is the locked Build 35 neon-arc Shot/Traxx mark at `assets/images/icon.png` (see `assets/images/README.md`). Splash / launch still shows the full wordmark **ShotTraxx**.

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
| **Location When In Use** | Picking a club marks where you hit from. The next club pick closes the prior shot. Green estimate can reuse the current GPS. ShotTraxx does not invent coordinates. Watch location is the same purpose, used only when Watch GPS is more accurate than the phone. |
| **Photo Library** (iOS) | Not used. `NSPhotoLibraryUsageDescription` is in the plist so App Store review (ITMS-90683) can ship. Photos prompts stay out of scope. No add/save key — we do not write to the library. |
| **Microphone** | Only after **Say a club**. Used to capture the utterance. Not on Watch. |
| **Speech Recognition** (iOS) | Maps the utterance to a bag club and applies it immediately. |

Not in this IPA (and not in the plist): Always location, Bluetooth, motion, Watch mic. Watch Connectivity does not need Bluetooth purpose strings.

## Apple Watch (ships in this IPA)

Companion via `@bacons/apple-targets` (`targets/watch`, bundle `com.shottrax.app.watch`) plus a local Expo module (`modules/watch-bridge`) so EAS iOS prebuild links Watch Connectivity.

- Watch Connectivity types this cut:
  - Phone → Watch `clubList`: `{ type, top3, bag, labels, holeNumber, yardsToGreen, yardsQuality }` pushed on hole change / fix quality change / bag rank change (ranking stays on phone). `yardsToGreen` is `yardsToGreen().yards` (`null` when quality is none). `yardsQuality` is `good | soft | none` — same bands as the phone, never invent.
  - Watch → Phone `clubPick`: `{ type, clubId, at: ISO8601 }` plus optional Watch GPS (`lat`, `lng`, `accuracyM`) when the sample is ≤3 s old and accuracy > 0. Stretch prefer lock: `preferWatch = watchFix && ageSec <= 3 && watch.accuracyM > 0 && (phoneFix == null || watch.accuracyM <= phone.accuracyM)`; `markFix = preferWatch ? watchFix : phoneFix`. Then same `acceptFix` bands. Soft → Approximate. Quality none → wait / Mark anyway. Never invent / silent fail. **Putter** does not mark GPS — it opens the putt sheet.
  - Phone → Watch `puttSheet`: `{ type, open, holeNumber, lengths, labels, canAdd, canMake }` when Putter is selected.
  - Watch → Phone `puttPick`: `{ type, action: add|undo|made, at, lengthId? }` — buckets then **Made it** finishes the hole.
- Watch status: **Hole N · XXX yd** (same yardsToGreen as phone); **—** when quality is none; tiny **Approximate** chip when soft (never SOFT on the wrist).
- Watch club UI defaults to **top-3 Suggested only** (#1 larger). **All clubs** opens the full bag grid. Ranking matches the phone (typical-carry seed until ≥5 live GPS shots; putter never in top-3). **Putter** (All clubs) opens the putt sheet: **Under 3 ft · 3–10 · 10–20 · 20+**, then **Made it**.
- **Same club** is the big 1-tap mark on the wrist. Haptic on a successful mark (phone + Watch).
- Watch feedback is **`7i marked ✓`** or **`Phone unavailable`** — never a silent fail.
- Complication (stretch): **Hole N · XXX yd** (`—` when none), via the `ShotTraxxHole` widget.
- Offline: Watch queues **one** pending `clubPick` until reachable, then flushes
- **Undo** stays on the phone. **No** Watch motion, mic, or sensor auto-mark

EAS credentials for `com.shottrax.app.watch` and `com.shottrax.app.watch.widget` are declared under `extra.eas.build.experimental.ios.appExtensions`.

## Maps (`react-native-maps`)

- **iOS:** Apple Maps, `mapType="satellite"` (no Google API key).
- Hole **number comes from the scorecard**, overlaid on the map. OSM `golf=green/fairway/tee/hole` **outlines** are drawn when Overpass returns them; unmapped holes stay empty (nothing invented).
- Polylines are **closed GPS and Placed shots** (start→end). Penalties are list rows, not trails. `no_gps` shots have no coordinates and never draw.
- **Yards to green** uses the sensing hook `yardsToGreen(fix, greenCentroid) → { yards, quality }`. Same haversine and good (<15 m) / soft (15–25 m) bands as shot marks. No fix or no green pin → `{ yards: null, quality: 'none' }` (never invents a pin or a range). Poor GPS (>25 m) is also `none`, matching `acceptFix`. Soft GPS shows a **SOFT** badge. When quality is `none`, the map shows **yards to green — / unavailable**.
- Course API **green centroids** feed that hook. Long-press (or **Mark green (GPS)**) still drops a **user** pin and wins over the centroid.
- Scorecard **par** is course data only. Missing par is **Par unknown** until you tap 3–6.
- **Android** satellite tiles typically need a Google Maps API key in the `react-native-maps` config plugin for store/dev binaries. iOS is the target.

## On-course flow

1. Find a nearby course (GPS) or type a name, then start a 9- or 18-hole round (or attach a course to a round in progress). Nearby list distance is **miles** by default (**Course distance: Miles / Kilometers** in Settings). Shot yards and putt buckets stay as they are.
2. On a hole, par comes from the course when present; otherwise **Par unknown**. Set par and score (large +/− targets).
3. Hole advance opens **Pick a club**. Say or tap a club — that **marks GPS immediately** (start now; closes the prior shot’s end). On-screen: “Picking a club marks where you hit from.” No Confirm sheet. Top-3 **#1 suggested** is larger/highlighted; #2–3 are secondary. **Back** returns to the hole and marks nothing. **Home** returns to Rounds and keeps the round in progress — marks nothing. Neither tap selects a club. Same labels on Watch.
4. **Next** is always allowed even if the hole is unfinished. Nothing invented. A **Finish shot · Hole N** / **Finish putts · Hole N** chip flags unfinished shots or putts.
5. **Walk-away assist** (Pick a club only — shot pending, no club tap yet this lie): dwell ≥10 s inside 8 yd, then leave ≥20 yd for 2 consecutive fixes → auto-mark **#1** at the lie pin (not the cart). Badge **Suggested**. Toast: **“Marked 7i (suggested) · Change club.”** Soft dwell → Approximate + Suggested. Poor/none dwell never silent-marks. Already-marked lie / Drop-Penalty / Change club / no-GPS skip. Re-arm only after the next dwell. Club tap / Watch stay primary.
6. **Change club** on any logged shot later — GPS start/end and yards stay; club averages follow the new club.
7. **All clubs** stays on the hole sheet and opens the full bag. The sticky club chip (e.g. **2 i**) does the same. **Same club** is the one-tap repeat mark. Voice fail offers **Pick a club** (opens the bag) and **Say again** — never voice-only. **Undo last** if the club was wrong (or pick another before you walk). **Mark without club**, Drop / Penalty, and catch-up **Add shot** stay available. GPS at the club pick = shot **start**; if this hole already had an open GPS shot, that same fix is its **end** and yards are logged (haversine).
8. **End last shot** closes an open GPS shot without starting a new one.
9. **+ Penalty** adds 1–5 penalty strokes to the hole score, with reason water / OB / unplayable / other (optional note). Shown as a penalty row — not a map polyline. A penalty is **not a Shot for distance**: it never hits `acceptFix`, haversine, club averages, or top-3.
10. **Add shot** (catch-up only, not live play): tap where you hit from **and** where it landed. Yards are haversine between those two points, shown immediately. Then pick a club — **top 3 ranked against that shot’s yards** (not yards-to-green) plus **All clubs**. Badge **Placed**. Counts in club averages because you confirmed the spots. Tap any shot to **edit**: move **from**, move **to**, or **change club**. Club-only keeps coordinates and moves averages. Moving a pin badges **Placed** and recomputes yards. **Undo edit** if that was wrong. No typed yards, no invented GPS. Live play is unchanged: club tap marks start; next mark or green closes it. Putter stays out of averages. No auto-putts. **Next** is always allowed; a chip flags unfinished shots or putts.
11. **Putter** opens a putt sheet (phone + Watch) — not a GPS mark. Each putt gets a length bucket (**Under 3 ft · 3–10 · 10–20 · 20+**). Add more putts, each with its own bucket. **Made it** confirms the last putt and advances the hole (next hole + Pick a club, or summary after the last). Putts are stats only — no green GPS and not a map mark. Walking off the green / to the next tee does **not** invent putts. Play continues; a **Finish putts · Hole N** chip stays until you enter them. In-round **Menu** reaches Home, previous hole, and Settings.
12. Finish the round for a scorecard. **Nerd out** on that screen shows stored score, putts, and club-book carries (live averages from GPS/Placed shots; estimated seeds stay badged Estimated). No GIR, no strokes gained, no putter. Club averages also live on the Averages tab. Stock wedges are **PW · 48° · 50° · GW · 56° · 60°** (`club_gw` is Gap Wedge, not a second 52° wedge).
13. The hole shot list has a **+** between each pair of shots and after the last. Tap **+** for the same two-point catch-up (from → to → club). The new shot slots into that gap, or appends after the last. Neighbor pins stay put. Yards recompute from pins. Nothing invented.
14. In-round **Scorecard** is a view only (Menu or the Scorecard button). Holes, par, score, putts. Missing par stays blank. Marks: eagle ●, birdie ○, par unmarked, bogey □, double+ □□ — only when both score and par exist. Back returns to the same hole and never marks or closes a shot. No GIR / strokes gained. **Nerd out** stays the end-of-round screen.

Hole **score remains the source of truth**. If you also logged shots and/or penalties, the hole screen and round summary warn when `score ≠ shots + penalty strokes`.

## Penalties (`hole_penalties`)

- Persisted per hole: `strokes`, `reason` (`water` | `ob` | `unplayable` | `other`), optional free-text `note`.
- Adding a penalty **increments the hole score** (from the current score, or par if the score is still blank — same base as +/−).
- **Not a Shot for distance.** Never calls `acceptFix` / haversine. Not included in club distance averages or top-3 ranking.
- Listed on the hole screen and per hole on the round summary.

## Catch-up Add shot (`source = placed`)

Use **Add shot** when you went back to a hole (or forgot a swing) and want to log it from the map. Not live play.

| Field | Stored value |
| --- | --- |
| `source` | `placed` |
| `fix_quality` / start / end quality | `NULL` — no soft/good/forced/none |
| start/end lat, lng | the two points you tapped (from, then landed) |
| accuracy | `NULL` |
| `distance_yards` | haversine between those two points, shown immediately |
| `typed_yards` | always `NULL` — no typed-yards form |
| `ended_at` | set immediately (closed stroke) |

**Never `acceptFix`.** Placed shots have **no** GPS quality. The **400-yard** cap still asks (**That looks too far. Mark anyway?**) before a silent save; confirming still stores `placed` with no quality. Pins are the spots they tap, never the phone GPS fix. The add-shot map frames tee → green (or shot pins, or the green), tee at the bottom and green at the top. Phone GPS does not enter camera bounds, heading, or center — at home or on the course. Pinch-zoom stays on and does not snap back to the phone. The user dot may render off-screen. If tee or green is missing, do not rotate and do not invent a point from the phone.

**Insert / append:** **+** between logged shots and after the last uses this same flow. Sequence numbers stay correct. Neighbors keep their pins.

**Distance averages / top-3:** included because you confirmed both spots. After the two pins, the club picker is **top 3 vs that shot’s yards** (same seed → ≥5 live rule) plus **All clubs**. **Putter** stays out. Live play is unchanged: club tap marks start; next mark or green closes it.

**Edit:** tap a shot (list or map pin). **Move from** / **Move to** stores `placed` with new haversine yards (400-yard confirm still asks). **Change club** keeps coordinates and moves averages to the new club. **Undo edit** restores the last edit. Never invents GPS.

## Add shot without GPS (`source = no_gps`)

Legacy / forgotten-swing storage when there is no map pin. **Add shot** on the hole is the two-point Placed flow above — not this form.

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

There is **no fake stock average**. First open prompts once to customize the bag and each club’s carry (skip is allowed so a round is not blocked). Typed carries are the seed until **≥5** closed **GPS or Placed** shots replace them. Skip leaves top-3 empty until live shots exist. **Bag:** carry is edited on the club row and applies immediately (no save). Estimated fill stays off until **3** clubs have a typed number, then interpolates only between those clubs in loft order (badge **Estimated**). Outside that span stays blank. Typed always wins. Putter is never filled and never in Suggested. Suggested chips show that club’s carry (`7i · 155` or `7i · —`), not yards-to-green. The picker shows remaining yards as **148 left** only when yards-to-green quality is good or soft; otherwise **—**.

- **Live play D** = `yardsToGreen(fix, greenCentroid).yards` **only when `quality !== none`** (good or soft GPS + a real green centroid)
- else **D** = last closed **GPS or Placed** shot distance on this hole
- else full bag (no ranking)
- **Catch-up / edit club picker D** = that shot’s own haversine yards — never yards-to-green

The 3 eligible clubs with the lowest `|rank yards − D|` are surfaced. Rank yards are the **live average** after ≥5 closed GPS shots, else the **typical-carry seed**. Ties prefer the **shorter** club (higher `loftRank`). **Putter** stays in the bag for scoring / green play only — no carry field, no typical-carry seed, no live average, never in Suggested top-3, and putter shots never count toward any club sample. **All clubs** is always one tap away. Penalties do not affect ranking.

## Sensing gates (locked, unchanged from P1)

Defined in `src/config/sensing.ts`. Mark path is `getFix` → `acceptFix`, then `forceMark` after UI confirm (`src/sensing/api.ts`). P5 ranging hook is `yardsToGreen(fix, greenCentroid)` (same good/soft bands; `quality: 'none'` and no number when there is no usable fix or green).

| Gate | Value | Behavior |
| --- | --- | --- |
| Soft GPS | **15–25 m** inclusive | `acceptFix` keeps the shot, `fixQuality = soft`, **SOFT** badge |
| Good GPS | **&lt; 15 m** | `fixQuality = good` |
| Poor GPS | **&gt; 25 m** or unknown | `acceptFix` rejects; **Force** runs `forceMark` → `forced` |
| `MAX_SHOT_YD` / `impossible_jump` | **400 yd** | Distance **&gt; 400** needs `forceMark` → `forced` |
| `WALK_BLOCK` | **false** | Walking-length gaps are not blocked |

`soft` and `forced` GPS shots **stay in club averages** (and therefore in top-3 once a club has 5+ closed GPS or Placed shots). Badges mean those qualities are in the mix, not that they were dropped. History / summary still show SOFT / FORCED on GPS shots. Penalties and `no_gps` (`fixQuality: none`) shots are separate and never distance samples. Catch-up **Placed** shots never go through `acceptFix` and have **no** soft/good quality; they still count in averages after the 400-yard confirm.

**Putts (Signal Lab lock):** `PUTT_ASSIST`, `AUTO_PUTTS_FROM_GPS`, and `AUTO_PUTTS_FROM_LEAVE_GREEN` are **false**. Walking off the green never invents putts. **Made it** stores only user-chosen buckets (not a GPS count) and advances. **Finish putts · Hole N** is score-only — never a fabricated distance. Putter stays out of averages and top-3. The next hole still opens **Pick a club** (club-select = mark).

**Club picker Back / Home:** neither tap selects a club or runs `acceptFix`. No GPS fix is saved and no pending shot is closed. **Back** returns to the hole. **Home** returns to Rounds and keeps the round in progress. Same labels on Watch (`clubNav`, never `clubPick`). Only a real club tap, Watch club tap, or Same club runs `acceptFix`.

## Simulator / mock GPS

ShotTraxx **does not synthesize a fairway or fake points**.

- On the iOS Simulator a **SIMULATOR / MOCK GPS** banner is shown.
- Marks use whatever location the simulator (or a mock provider) reports.
- If the pin never moves, closed GPS shots will be **0 yd** — that is honest, not a demo path.
- Forgotten swings should use **Add shot** (two map points) instead of inventing a pin.
- To test yards in Simulator: Features → Location → Custom Location, then move the pin between marks.

## Limitations

- OSM overlays only where mapped; unmapped holes stay empty.
- No Watch motion, Plays Like invented from a single centroid, auto-detect putts, or mic-based shot detect.
- Watch club-pick (top-3 + bag + Same club) ships with this IPA. Crown / double-tap stay out.
- Local SQLite only (no account / cloud).
- iOS is the target; Android location is wired but maps may need a Google key.
- Nearby course picker requires Golf Courses API key `GOLF_COURSES_API_KEY` (see `NOTES.md`). Smoke nearby search on a device/EAS build if this environment cannot TLS to golfcoursesapi.com.

## Tests

```bash
npm test          # domain tests + sensing smoke + course client, including yards-to-green, sticky club, F/M/B, drop, voice
npm run typecheck
```
