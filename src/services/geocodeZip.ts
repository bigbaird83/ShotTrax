import * as Location from 'expo-location';
import { isValidLatLng, type LatLng } from '../domain/latLng';
import {
  parseUsZip,
  planZipGeocode,
  zipGeocodeQuery,
  zipPointFromGeocode,
  type ZipGeocodeResult,
} from '../domain/zipGeocode';

export type ZipGeocoder = (query: string) => Promise<LatLng | null>;

async function defaultZipGeocoder(query: string): Promise<LatLng | null> {
  const hits = await Location.geocodeAsync(query);
  return zipPointFromGeocode(hits[0] ?? null);
}

/**
 * Geocode a US ZIP to a real point. Does not invent coordinates.
 * Miss is explicit — callers must not fall back to phone-nearby.
 */
export async function geocodeUsZip(
  raw: string,
  geocode: ZipGeocoder = defaultZipGeocoder,
): Promise<ZipGeocodeResult> {
  const zip = parseUsZip(raw);
  if (!zip) return { ok: false, miss: true };
  let point: LatLng | null = null;
  try {
    point = await geocode(zipGeocodeQuery(zip));
  } catch {
    return { ok: false, miss: true };
  }
  return planZipGeocode(isValidLatLng(point) ? point : null);
}
