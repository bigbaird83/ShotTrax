# ShotTrax

Phone GPS golf shot tracker (no club sensors). **This branch is P1 only.**

P1 logs shots when you confirm a club, closes the previous shot on the next mark, stores yards with `fixQuality`, and shows club averages. Maps, voice club pick, top-3 ranking, and watch/mic assists are **not** in this PR.

## Run (iOS first)

```bash
npm install
npx expo start
```

Then:

- iPhone with **Expo Go**: scan the QR code
- iOS Simulator: press `i` (see simulator GPS below)

A development build is not required for P1 (location + SQLite work in Expo Go).

## Permissions

- **Location When In Use** — captured at club confirm (shot start) and again on the next mark (shot end / yards). ShotTrax does not invent coordinates.

There is no microphone / speech / motion permission in P1.

## On-course flow

1. Start a 9- or 18-hole round (optional course name).
2. On a hole, set par and score (large +/− targets).
3. **Mark shot** → tap a club (voice + top-3 are stubbed for a later PR).
4. GPS at confirm = shot **start**. If this hole already had an open shot, that same fix is its **end** and yards are logged (haversine).
5. **End last shot** closes an open shot without starting a new one.
6. Finish the round for a scorecard. Club averages live on the Averages tab.

## Sensing gates (locked)

Defined in `src/config/sensing.ts`. Mark path is `getFix` → `acceptFix`, then `forceMark` after UI confirm (`src/sensing/api.ts`).

| Gate | Value | Behavior |
| --- | --- | --- |
| Soft GPS | **15–25 m** inclusive | `acceptFix` keeps the shot, `fixQuality = soft`, **SOFT** badge |
| Good GPS | **&lt; 15 m** | `fixQuality = good` |
| Poor GPS | **&gt; 25 m** or unknown | `acceptFix` rejects; **Force** runs `forceMark` → `forced` |
| `MAX_SHOT_YD` / `impossible_jump` | **400 yd** | Distance **&gt; 400** needs `forceMark` → `forced` |
| `WALK_BLOCK` | **false** | Walking-length gaps are not blocked |

`soft` and `forced` shots **stay in club averages**. Badges on the Averages tab mean those qualities are in the mix, not that they were dropped.

## Simulator / mock GPS

ShotTrax **does not synthesize a fairway or fake points**.

- On the iOS Simulator a **SIMULATOR / MOCK GPS** banner is shown.
- Marks use whatever location the simulator (or a mock provider) reports.
- If the pin never moves, closed shots will be **0 yd** — that is honest, not a demo path.
- To test yards in Simulator: Features → Location → Custom Location, then move the pin between marks.

## Limitations (P1)

- No Apple Maps / shot polylines (P2).
- Club pick is tap-only; no voice (“seven iron”) and no top-3 ranking UI.
- No Watch motion or mic assist.
- No licensed course polygons / OSM fairways.
- Local SQLite only (no account / cloud).
- iOS is the target; Android location is wired but not the focus.

## Tests

```bash
npm test          # domain tests + sensing smoke 8/8 (getFix/acceptFix/forceMark)
npm run typecheck
```
