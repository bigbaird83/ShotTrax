import { isValidLatLng } from './latLng';
import type { HoleMapRegion, HoleNativeCamera } from './holeCamera';

/** Host must be at least this big before MapView mounts. 1px still never paints. */
export const HOLE_MAP_MIN_PAINT_PX = 80;

export type HoleMapBox = { width: number; height: number };

/**
 * True only when the measured host can actually paint Apple tiles.
 * Zero / NaN / collapsed layouts stay unmeasured.
 */
export function holeMapBoxIsPaintable(box: HoleMapBox | null | undefined): boolean {
  if (!box) return false;
  if (!Number.isFinite(box.width) || !Number.isFinite(box.height)) return false;
  if (box.width <= 0 || box.height <= 0) return false;
  return box.width >= HOLE_MAP_MIN_PAINT_PX && box.height >= HOLE_MAP_MIN_PAINT_PX;
}

/**
 * Key changes once from unmeasured → sized so MapView remounts with real size.
 * Resizing a MapView that first mounted at height 0 often never paints tiles.
 * Opening Add shot does not change this key — the play map is already sized.
 */
export function holeMapPaintKey(box: HoleMapBox | null | undefined): 'unmeasured' | 'sized' {
  return holeMapBoxIsPaintable(box) ? 'sized' : 'unmeasured';
}

/** Do not mount MapView until the host has a real box. */
export function holeMapShouldMount(box: HoleMapBox | null | undefined): boolean {
  return holeMapBoxIsPaintable(box);
}

export function holeMapMountsAtZeroHeight(): false {
  return false;
}

export function holeMapRemountsWhenSized(): true {
  return true;
}

/**
 * Green cover is only the measuring veil. Once the host is sized, lift it.
 * A missing tee+green is the miss card — never this cover.
 */
export function holeMapShowsCover(args: {
  mapBox: HoleMapBox | null | undefined;
  hasFrame: boolean;
}): boolean {
  if (!args.hasFrame) return false;
  return !holeMapBoxIsPaintable(args.mapBox);
}

export function holeMapCoverStaysAfterSized(): false {
  return false;
}

export function holeMapCoverReplacesMapView(): false {
  return false;
}

export function missingCourseCardShowsGreenCover(): false {
  return false;
}

/** MapView must not wait on location permission or a phone fix. */
export function holeMapGatesOnLocationPermission(): false {
  return false;
}

export function holeMapWaitsForLocationPermission(): false {
  return false;
}

export function holeMapWaitsForPhoneFixToMount(): false {
  return false;
}

/**
 * Native region that Apple Maps can fetch tiles for.
 * NaN / 0,0 / non-positive deltas paint a void, not the hole.
 */
export function holeMapRegionIsPaintable(region: HoleMapRegion | null | undefined): boolean {
  if (!region) return false;
  if (!Number.isFinite(region.latitude) || !Number.isFinite(region.longitude)) return false;
  if (!Number.isFinite(region.latitudeDelta) || !Number.isFinite(region.longitudeDelta)) return false;
  if (region.latitudeDelta <= 0 || region.longitudeDelta <= 0) return false;
  if (!isValidLatLng({ lat: region.latitude, lng: region.longitude })) return false;
  return true;
}

export function holeNativeCameraIsPaintable(camera: HoleNativeCamera | null | undefined): boolean {
  if (!camera) return false;
  if (!isValidLatLng({ lat: camera.center.latitude, lng: camera.center.longitude })) return false;
  if (!Number.isFinite(camera.heading) || !Number.isFinite(camera.altitude) || !Number.isFinite(camera.zoom)) {
    return false;
  }
  if (camera.altitude <= 0) return false;
  return true;
}

/** First paint uses the course-card region. Phone never seeds it. */
export function holeMapInitialRegionUsesPhone(): false {
  return false;
}

/** Always pass initialRegion so tiles fetch even if initialCamera is ignored. */
export function holeMapAlwaysPassesInitialRegion(): true {
  return true;
}

/** Opacity hide is a no-op on native maps and can also block the first tile paint. */
export function holeMapHidesWithOpacity(): false {
  return false;
}

/** Theme green behind the map is the host, not a MapView substitute. */
export function holeMapThemeBackgroundIsMapView(): false {
  return false;
}
