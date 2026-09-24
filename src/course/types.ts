import type { LatLng } from '../domain/latLng';

/**
 * Paint waterfall step that actually returned the card.
 * `cache` is the shared-cache short-circuit. `osm` is the OSM / OpenGolf /
 * manual-verified branch. Absent on a card until paint has resolved.
 */
export type PaintWaterfallStep = 'cache' | 'osm' | 'gca' | 'golfapi' | 'miss';

export type CourseSummary = {
  id: string;
  name: string;
  club: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location: LatLng | null;
  /** Nearby search distance. API returns km; stored as meters. */
  distanceMeters: number | null;
};

export type HoleCourseData = {
  holeNumber: number;
  /** Blank when the API omits par — never invented. */
  par: number | null;
  /** Tee yardage for this hole. Blank if the API omits it. */
  yards: number | null;
  /** Stroke index 1–18. Blank if the API omits it — shown as “SI unknown”. */
  handicap: number | null;
  /** Green centroid when the API provides one — never invented. */
  greenCentroid: LatLng | null;
  /** Front of green when the API provides it — never derived from centroid. */
  greenFront: LatLng | null;
  /** Back of green when the API provides it — never derived from centroid. */
  greenBack: LatLng | null;
  /** Green depth in yards when the API provides it — never derived. */
  greenDepthYards: number | null;
  /** Tee coordinate when the API provides one — never invented, never the phone. */
  teeCentroid: LatLng | null;
};

export type TeeSet = {
  name: string;
  rating: number | null;
  slope: number | null;
  totalYards: number | null;
  holes: HoleCourseData[];
};

export type CourseDetail = {
  id: string;
  name: string;
  holeCount: number | null;
  location: LatLng | null;
  /** City when the API/catalog supplies it — used for golfapi search, never invented. */
  city?: string | null;
  /** State when the API/catalog supplies it — used for golfapi search, never invented. */
  state?: string | null;
  holes: HoleCourseData[];
  tees: TeeSet[];
  /** Pro/Max flag from course detail. Missing/false → no invented greens. */
  greenCentersAvailable: boolean | null;
  /**
   * Winning paint step from the resolve that filled this card.
   * Omitted until that resolve runs. Never inferred from coordinates.
   */
  paintSource?: PaintWaterfallStep | null;
};

export type OsmGolfKind = 'green' | 'fairway' | 'tee' | 'hole';

export type OsmFeature = {
  kind: OsmGolfKind;
  holeNumber: number | null;
  coordinates: LatLng[];
};

/** OSM fairway/green/tee/hole overlay. Empty/unmapped → null, never invented. */
export type OsmOverlay = {
  source: 'osm';
  features: OsmFeature[];
  geojson: object | null;
};

export type OsmOverlayQuery = {
  courseId?: string | null;
  location?: LatLng | null;
  holeNumber?: number;
  /** Search radius in meters. Default depends on whether a hole pin is used. */
  radiusM?: number;
};

export type OsmOverlayHook = {
  fetchCourseOverlay: (query: OsmOverlayQuery) => Promise<OsmOverlay | null>;
};

export interface CourseDataClient {
  isConfigured(): boolean;
  nearbyCourses(from: LatLng, radiusKm?: number): Promise<CourseSummary[]>;
  searchCourses(query: string): Promise<CourseSummary[]>;
  getCourse(id: string): Promise<CourseDetail | null>;
  fetchOsmOverlay(query: OsmOverlayQuery): Promise<OsmOverlay | null>;
}
