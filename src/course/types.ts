import type { LatLng } from '../domain/latLng';

export type CourseSummary = {
  id: string;
  name: string;
  club: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location: LatLng | null;
  distanceMeters: number | null;
};

export type HoleCourseData = {
  holeNumber: number;
  /** Blank when the API omits par — never invented. */
  par: number | null;
  /** Green centroid when the API provides one — never invented. */
  greenCentroid: LatLng | null;
};

export type CourseDetail = {
  id: string;
  name: string;
  holeCount: number | null;
  holes: HoleCourseData[];
};

/** OSM fairway/green polygons. Part 2 fills this in; P5.1 always returns null. */
export type OsmOverlay = {
  source: 'osm';
  geojson: object | null;
};

export type OsmOverlayHook = {
  fetchCourseOverlay: (courseId: string) => Promise<OsmOverlay | null>;
};

export interface CourseDataClient {
  isConfigured(): boolean;
  nearbyCourses(from: LatLng, radiusKm?: number): Promise<CourseSummary[]>;
  getCourse(id: string): Promise<CourseDetail | null>;
  fetchOsmOverlay(courseId: string): Promise<OsmOverlay | null>;
}
