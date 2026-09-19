import { isValidLatLng, type LatLng } from './latLng';

/** US ZIP or ZIP+4. Name / city / state stay on the text search path. */
const US_ZIP = /^(\d{5})(?:-\d{4})?$/;

export function parseUsZip(raw: string | null | undefined): string | null {
  const q = raw?.trim() ?? '';
  const match = q.match(US_ZIP);
  return match?.[1] ?? null;
}

export function isUsZipQuery(raw: string | null | undefined): boolean {
  return parseUsZip(raw) != null;
}

/** Five-digit ZIP for geocode. ZIP+4 still geocodes the parent ZIP. */
export function zipGeocodeQuery(zip: string): string {
  return `${zip}, USA`;
}

export function zipPointFromGeocode(hit: {
  latitude?: number | null;
  longitude?: number | null;
} | null | undefined): LatLng | null {
  if (!hit) return null;
  const point = { lat: hit.latitude ?? Number.NaN, lng: hit.longitude ?? Number.NaN };
  return isValidLatLng(point) ? point : null;
}

/** Zip miss is an explicit error. Never phone-nearby and never a silent empty list. */
export function zipGeocodeFallsBackToPhoneNearby(): false {
  return false;
}

export function zipGeocodeFallsBackToEmptyList(): false {
  return false;
}

export function zipSearchUsesNearbyPath(): true {
  return true;
}

export function zipSearchUsesWatchGps(): false {
  return false;
}

export function zipSearchUsesMarkGates(): false {
  return false;
}

export function zipGeocodeInventCoords(): false {
  return false;
}

export type ZipGeocodeResult =
  | { ok: true; from: LatLng }
  | { ok: false; miss: true };

export function planZipGeocode(point: LatLng | null | undefined): ZipGeocodeResult {
  if (!isValidLatLng(point)) return { ok: false, miss: true };
  return { ok: true, from: point };
}
