import type { OsmOverlay, OsmOverlayHook } from './types';

/**
 * OSM course overlay hook (fairway / green polygons).
 * P5 part 1 is a no-op: never invents GeoJSON. Part 2 can load OSM here.
 */
export async function fetchOsmOverlay(_courseId: string): Promise<OsmOverlay | null> {
  return null;
}

export const osmOverlayHook: OsmOverlayHook = {
  fetchCourseOverlay: fetchOsmOverlay,
};
