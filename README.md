# ShotTrax

Phone GPS golf shot tracker (no club sensors). **This branch is P2** on top of P1 (GPS mark-shot, scores, club averages).

P2 adds a satellite hole map with closed-shot trails, voice club pick (still confirm), and top-3 club ranking. Watch motion and mic shot-detect assists stay **out of scope** (stubs only).

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
2. On the iPhone, install the **TestFlight** app from the App Store, accept the invite, install ShotTrax.

### Profiles in `eas.json`

| Profile | What it is |
| --- | --- |
| `development` | Expo **dev client** (internal). Use while iterating; not for TestFlight. |
| `preview` | Production-like **internal** / ad hoc distribution (not App Store). |
| `production` | App Store / **TestFlight** (this section). |

## Permissions

| Permission | When |
| --- | --- |
| **Location When In Use** | Club confirm (shot start) and the next mark (shot end / yards). Green estimate can reuse the current GPS. ShotTrax does not invent coordinates. |
| **Microphone** | Only after **Say a club**. Used to capture the utterance. |
| **Speech Recognition** (iOS) | Maps the utterance to a bag club. You still tap **Confirm**. |

There is no Watch / motion / mic-shot-detect permission. Those assists are stubbed off.

## Maps (`react-native-maps`)

- **iOS:** Apple Maps, `mapType="satellite"` (no Google API key).
- Hole **number comes from the scorecard**, overlaid on the map. There are **no** licensed course polygons or OSM fairways.
- Polylines are **closed shots only** (start→end GPS).
- Long-press (or **Mark green (GPS)**) drops a **green estimate** for yards-to-green ranking. That pin is user-placed, not a course database.
- **Android** satellite tiles typically need a Google Maps API key in the `react-native-maps` config plugin for store/dev binaries. iOS is the target.

## On-course flow

1. Start a 9- or 18-hole round (optional course name).
2. On a hole, set par and score (large +/− targets).
3. **Mark shot** → optional **Say a club** (confirm still required) and/or **top-3**, or expand **Full bag** and tap.
4. GPS at confirm = shot **start**. If this hole already had an open shot, that same fix is its **end** and yards are logged (haversine).
5. **End last shot** closes an open shot without starting a new one.
6. Finish the round for a scorecard. Club averages live on the Averages tab.

## Top-3 ranking

After a club has **≥5** closed shots with yards (soft and forced included, same as averages):

- **D** = yards-to-green if this hole has a green estimate and a current GPS fix
- else **D** = last closed shot distance on this hole
- else full bag (no ranking)

The 3 eligible clubs with the lowest `|avgYards − D|` are surfaced. Ties prefer the **shorter** club (higher `loftRank`). Full bag is always one tap away.

## Sensing gates (locked, unchanged from P1)

Defined in `src/config/sensing.ts`. Mark path is `getFix` → `acceptFix`, then `forceMark` after UI confirm (`src/sensing/api.ts`).

| Gate | Value | Behavior |
| --- | --- | --- |
| Soft GPS | **15–25 m** inclusive | `acceptFix` keeps the shot, `fixQuality = soft`, **SOFT** badge |
| Good GPS | **&lt; 15 m** | `fixQuality = good` |
| Poor GPS | **&gt; 25 m** or unknown | `acceptFix` rejects; **Force** runs `forceMark` → `forced` |
| `MAX_SHOT_YD` / `impossible_jump` | **400 yd** | Distance **&gt; 400** needs `forceMark` → `forced` |
| `WALK_BLOCK` | **false** | Walking-length gaps are not blocked |

`soft` and `forced` shots **stay in club averages** (and therefore in top-3 once a club has 5+ closed shots). Badges mean those qualities are in the mix, not that they were dropped.

## Simulator / mock GPS

ShotTrax **does not synthesize a fairway or fake points**.

- On the iOS Simulator a **SIMULATOR / MOCK GPS** banner is shown.
- Marks use whatever location the simulator (or a mock provider) reports.
- If the pin never moves, closed shots will be **0 yd** — that is honest, not a demo path.
- To test yards in Simulator: Features → Location → Custom Location, then move the pin between marks.

## Limitations

- No licensed course polygons / OSM fairways.
- No Watch motion or mic-based shot detect (stubs only).
- Local SQLite only (no account / cloud).
- iOS is the target; Android location is wired but maps may need a Google key.

## Tests

```bash
npm test          # domain tests + sensing smoke, including top-3 ranking + voice nicknames
npm run typecheck
```
