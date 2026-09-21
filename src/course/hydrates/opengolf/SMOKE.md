# OpenGolf / OSM follow ingest — smoke

Generated `2026-09-21` from `US_Golf_Hole_Tee_Green.csv` (123,294 rows).
Ingest: `npm run opengolf:ingest` (needs `OPEN_GOLF_OSM_HOLES_CSV` or the
uploads CSV).

## Locks

- Centerline only: one rep tee + green = first/last node of `golf=hole`.
  Never invent daily pins from `green_lat`.
- `match_dist_m` > 1000 m is quarantined (readme: review snaps past ~1 km).
- Missing hole number/ref is quarantined — never assigned in order.
- Tee→green must pass the same 5–700 yd paint gates. Fail → miss card.
- Thunderbird CC (Heber Springs, AR) is **absent** in this dump
  (centroid-only). Ingest skips any Thunderbird+Heber identity. Doc TF 63
  pin-sheet greens + A–D stay. Tees stay HARD-MISS.
- Cypress Creek (Cabot), Greystone (Cabot), Pleasant Valley (Little Rock),
  and Mountain Ranch (Fairfield Bay) stay on their hand-verified hydrates.

## Counts (this cut)

| | |
| --- | --- |
| Accepted courses | 7,797 |
| Accepted holes | 96,535 |
| AR courses / holes | 78 / 914 |
| High `match_dist_m` quarantined | 17,549 |
| Missing hole number | 2,316 |
| Gate-fail | 9 |
| Reserved overwrite skipped | 72 |
| Thunderbird Heber rows | 0 |

## Size / perf

- Runtime ships `catalog.json` (~860 KB) plus lazy `holes/{ST}.json` shards
  (largest CA ~436 KB). First search parses the catalog; picking a course
  loads that state only.
- Combined shards ~5.3 MB uncompressed. Ingest also writes `pack.json.gz`
  (~2.14 MB) as an archive (gitignored) — not a second runtime stack.
- Nearby / zip walks 7.8k catalog pins (haversine). Cheap vs Overpass.

## Smoke

1. Search **Thunderbird** / **Heber Springs** → Doc Thunderbird. Greens from
   pin sheets. Tees HARD-MISS. No OpenGolf overwrite.
2. Search **Mountain Ranch** / **Fairfield Bay** → existing 18/18 OSM hydrate.
3. Zip / near-me in AR: Magnolia CC and Camden CC should appear with real
   tee→green on accepted holes. Quarantined holes miss-card.
4. Empty / centroid-only / high-dist match → miss card. Nothing invented.
5. Settings → Credits names OpenStreetMap contributors and OpenGolf (ODbL).
