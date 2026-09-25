/**
 * Course-data origin already stored on a round or a paint result.
 * CSV shows a readable word. Unknown stays blank — never a guess.
 */

const SAVED_COPY = new Set(['cache', 'saved_copy', 'saved copy', 'saved']);
const OSM = new Set(['osm', 'manual_verified', 'openstreetmap', 'osm/opengolf']);
const GCA = new Set(['gca', 'gca pro']);
const GOLFAPI = new Set(['golfapi', 'golfapi.io']);

export function normalizeCourseDataSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (SAVED_COPY.has(key)) return 'cache';
  if (OSM.has(key)) return key === 'manual_verified' ? 'manual_verified' : 'osm';
  if (GCA.has(key)) return 'gca';
  if (GOLFAPI.has(key)) return 'golfapi';
  return null;
}

/** Readable CSV word. Blank when the stored value is missing or not one we know. */
export function courseDataSourceLabel(value: unknown): string {
  const token = normalizeCourseDataSource(value);
  if (token === 'cache') return 'saved copy';
  if (token === 'osm' || token === 'manual_verified') return 'OpenStreetMap';
  if (token === 'gca') return 'GCA';
  if (token === 'golfapi') return 'golfapi';
  return '';
}

/**
 * Token to store on the round. A saved copy wins over the underlying source,
 * same order as the course card. A miss stores nothing.
 */
export function courseDataSourceToken(
  result: { ok: boolean; source: string | null; fromCache: boolean } | null | undefined,
): string | null {
  if (!result || result.ok !== true) return null;
  if (result.fromCache === true) return 'cache';
  return normalizeCourseDataSource(result.source);
}
