/**
 * Product-locked sensing gates (ShotTrax Lead / Mobile Core).
 *
 * Soft GPS 15–25 m → include the shot and badge it `soft`.
 * Accuracy worse than 25 m → do not auto-accept; user may Force → `forced`.
 * Distances above MAX_SHOT_YD are `impossible_jump` and need Force → `forced`.
 * `soft` and `forced` both stay in club averages, with badges.
 */
export const MAX_SHOT_YD = 400;
export const SOFT_GPS_MIN_M = 15;
export const SOFT_GPS_MAX_M = 25;
export const METERS_PER_YARD = 0.9144;
export const EARTH_RADIUS_M = 6_371_000;
