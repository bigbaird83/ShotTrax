import * as Device from 'expo-device';
import * as Location from 'expo-location';
import type { GpsFix } from '../domain/types';

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Returns the device (or simulator) location as reported by the OS.
 * Does not invent coordinates. Simulator / mock locations are labeled via
 * `mocked` and `isSimulator` so the UI can badge them.
 */
export async function getCurrentFix(): Promise<GpsFix> {
  const granted = await requestLocationPermission();
  if (!granted) {
    throw new Error('Turn on location to mark.');
  }

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
  });

  const lat = loc.coords.latitude;
  const lng = loc.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Couldn’t read your location.');
  }

  const isSimulator = Device.isDevice === false;
  return {
    lat,
    lng,
    accuracyM: loc.coords.accuracy ?? null,
    mocked: Boolean(loc.mocked) || isSimulator,
    isSimulator,
    timestamp: loc.timestamp,
  };
}

export function describeGpsSource(fix: Pick<GpsFix, 'mocked' | 'isSimulator'>): string | null {
  if (fix.isSimulator) {
    return 'Simulator — move the location pin between shots.';
  }
  if (fix.mocked) {
    return 'Simulator — move the location pin between shots.';
  }
  return null;
}
