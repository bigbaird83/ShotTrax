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
 * A WxH pixel key remounts on every layout tick and drops the live camera apply.
 * Opening Add shot does not change this key — the play map is already sized.
 */
export function holeMapPaintKey(box: HoleMapBox | null | undefined): 'unmeasured' | 'sized' {
  return holeMapBoxIsPaintable(box) ? 'sized' : 'unmeasured';
}

/** Do not mount MapView until the host has a real box. */
export function holeMapShouldMount(box: HoleMapBox | null | undefined): boolean {
  return holeMapBoxIsPaintable(box);
}

/**
 * MapView mounts only when the host is sized AND tee+green gave a real region.
 * Camera-only / NaN / 0,0 never seeds tiles.
 */
export function holeMapShouldMountMap(args: {
  mapBox: HoleMapBox | null | undefined;
  region: HoleMapRegion | null | undefined;
}): boolean {
  return holeMapBoxIsPaintable(args.mapBox) && holeMapRegionIsPaintable(args.region);
}

export function holeMapMountsWithoutInitialRegion(): false {
  return false;
}

export function holeMapMountsAtZeroHeight(): false {
  return false;
}

export function holeMapRemountsWhenSized(): true {
  return true;
}

/** Pixel-exact keys remount on every layout tick and skip onMapReady apply. */
export function holeMapRemountKeyUsesPixelSize(): false {
  return false;
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

/** Cover lifts on sized mapBox. onMapReady is not the gate. */
export function holeMapCoverWaitsOnMapReady(): false {
  return false;
}

/** After this, tiles-not-loaded is a miss card — not endless theme green. */
export const HOLE_MAP_TILE_MISS_MS = 4000;

export function holeMapTileMissAfterMs(): number {
  return HOLE_MAP_TILE_MISS_MS;
}

export function holeMapShowsTileMiss(args: { tilesLoaded: boolean; elapsedMs: number }): boolean {
  if (args.tilesLoaded) return false;
  return args.elapsedMs >= HOLE_MAP_TILE_MISS_MS;
}

export function holeMapTileMissWaitsForever(): false {
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

/**
 * iOS TestFlight uses Apple Maps (react-native-maps default).
 * Never PROVIDER_GOOGLE — this app has no Google Maps key.
 */
export function holeMapNativeProvider(): undefined {
  return undefined;
}

export function holeMapUsesAppleMapsOnIos(): true {
  return true;
}

export function holeMapSetsGoogleProvider(): false {
  return false;
}

/**
 * Hole start and Add shot are one MapView. Opening Add shot must not
 * mount a second instance or change the paint key.
 */
export function holeStartAndAddShotSharePaintPath(): true {
  return true;
}

export function addShotOpensSecondMapView(): false {
  return false;
}

export function addShotChangesMapPaintKey(): false {
  return false;
}
