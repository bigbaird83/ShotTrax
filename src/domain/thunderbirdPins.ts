import { isValidLatLng, type LatLng } from './latLng';

export const THUNDERBIRD_PIN_SHEETS = ['A', 'B', 'C', 'D'] as const;
export type ThunderbirdPinSheetId = (typeof THUNDERBIRD_PIN_SHEETS)[number];

export type ThunderbirdPinHole = {
  hole: number;
  par: number | null;
  whiteYards: number | null;
  greenCenter: LatLng | null;
  greenFront: LatLng | null;
  greenBack: LatLng | null;
  greenDepthYards: number | null;
  greenWidthYards: number | null;
  pins: Record<ThunderbirdPinSheetId, LatLng | null>;
};

function asFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function point(lat: unknown, lng: unknown): LatLng | null {
  const point = { lat: asFinite(lat) ?? Number.NaN, lng: asFinite(lng) ?? Number.NaN };
  return isValidLatLng(point) ? point : null;
}

/** Plays as 18. CSV 10–18 already mirror 1–9 — never invent a new hole. */
export function thunderbirdMirrorHole(hole: number): number {
  if (!Number.isInteger(hole) || hole < 1) return hole;
  if (hole >= 10 && hole <= 18) return hole - 9;
  return hole;
}

export function thunderbirdInventTees(): false {
  return false;
}

export function thunderbirdTeesStayHardMiss(): true {
  return true;
}

export function isThunderbirdPinSheetId(value: string | null | undefined): value is ThunderbirdPinSheetId {
  return THUNDERBIRD_PIN_SHEETS.includes(value as ThunderbirdPinSheetId);
}

/** Weekday → sheet is not documented as 7→4. Picker stays A–D. Never invent a day map. */
export function thunderbirdPinSheetFromWeekday(_weekday: number): null {
  return null;
}

/**
 * Parse one Doc pin-sheet row. Missing / invalid coords stay null.
 * Never averages, never invents a tee.
 */
export function parseThunderbirdPinRow(row: {
  hole?: unknown;
  par?: unknown;
  white_yds?: unknown;
  green_center_lat?: unknown;
  green_center_lon?: unknown;
  green_front_lat?: unknown;
  green_front_lon?: unknown;
  green_back_lat?: unknown;
  green_back_lon?: unknown;
  green_depth_yd?: unknown;
  green_width_yd?: unknown;
  pin_a_lat?: unknown;
  pin_a_lon?: unknown;
  pin_b_lat?: unknown;
  pin_b_lon?: unknown;
  pin_c_lat?: unknown;
  pin_c_lon?: unknown;
  pin_d_lat?: unknown;
  pin_d_lon?: unknown;
}): ThunderbirdPinHole | null {
  const hole = asFinite(row.hole);
  if (hole == null || hole < 1 || hole > 18) return null;
  return {
    hole: Math.round(hole),
    par: asFinite(row.par),
    whiteYards: asFinite(row.white_yds),
    greenCenter: point(row.green_center_lat, row.green_center_lon),
    greenFront: point(row.green_front_lat, row.green_front_lon),
    greenBack: point(row.green_back_lat, row.green_back_lon),
    greenDepthYards: asFinite(row.green_depth_yd),
    greenWidthYards: asFinite(row.green_width_yd),
    pins: {
      A: point(row.pin_a_lat, row.pin_a_lon),
      B: point(row.pin_b_lat, row.pin_b_lon),
      C: point(row.pin_c_lat, row.pin_c_lon),
      D: point(row.pin_d_lat, row.pin_d_lon),
    },
  };
}
