import { holeCameraHeading, projectHoleCameraScreen } from './holeCamera';
import { isValidLatLng, type LatLng } from './latLng';
import { HOLE_MAP_MIN_PAINT_PX } from './mapPaint';
import { COPY, formatParLabel, formatPuttCount } from './playerCopy';
import { planFinishedPuttRows } from './putts';

/**
 * Shot review layout. The header, course name, hole chips, and par line stay
 * put. The map is the only flexible region. The shot list and Previous / Next
 * sit under it, so they rest at the bottom of the screen. A long list scrolls
 * inside a cap instead of crushing the map.
 * The review camera also fits the green and the shot pins, with edge padding
 * so the pin glyphs and yard chips stay inside the map. A missing green is
 * not invented. Yardage, GPS, and shot values are not changed here.
 */

/** Floor for the map slot. Above the paint threshold so a short phone still frames. */
export const SHOT_REVIEW_MAP_MIN_HEIGHT = 160;

/**
 * Visible shot-line window before the list scrolls.
 * Four lines of the review type size, with the same gap the screen already uses.
 */
export const SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT = 120;

export function shotReviewMapMeetsPaintFloor(): boolean {
  return SHOT_REVIEW_MAP_MIN_HEIGHT >= HOLE_MAP_MIN_PAINT_PX;
}

/**
 * Short lists shrink-wrap so the lines sit on the buttons.
 * Longer lists use the cap and scroll. Zero or junk measurements stay at 0
 * until the list reports a real content height.
 */
export function shotReviewShotListWindow(contentHeight: number): number {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 0;
  return Math.min(contentHeight, SHOT_REVIEW_SHOT_LIST_MAX_HEIGHT);
}

/**
 * Extra screen around the fit, as a fraction of the hole span, on every edge.
 * The green pin sits above its coordinate and the yard chips have a size, so
 * fitting the raw points puts those glyphs through the top of the map.
 */
export const SHOT_REVIEW_FRAME_EDGE_PAD = 0.22;

/** Smallest pad for a pin cluster that has almost no span of its own. */
const SHOT_REVIEW_FRAME_MIN_PAD_DEG = 0.00045;

/**
 * Points the shot-review camera should fit.
 * Tee, green, and shot pins — but only coordinates that were actually passed.
 * A missing or invalid green is left out. Padding corners keep the pins and
 * yardage labels inside the map; they are not a stand-in green.
 */
export function shotReviewFramePoints(args: {
  tee?: LatLng | null;
  green?: LatLng | null;
  shotPins?: readonly LatLng[] | null;
}): LatLng[] {
  const tee = isValidLatLng(args.tee) ? args.tee : null;
  const green = isValidLatLng(args.green) ? args.green : null;
  const pins = (args.shotPins ?? []).filter((pin) => isValidLatLng(pin));
  const ordered: LatLng[] = [];
  if (tee && green) ordered.push(tee, green, ...pins);
  else if (pins.length > 0) {
    ordered.push(...pins);
    if (tee) ordered.push(tee);
    if (green) ordered.push(green);
  } else if (tee) ordered.push(tee);
  else if (green) ordered.push(green);
  if (ordered.length === 0) return [];

  const center = {
    lat: ordered.reduce((sum, point) => sum + point.lat, 0) / ordered.length,
    lng: ordered.reduce((sum, point) => sum + point.lng, 0) / ordered.length,
  };
  const heading =
    (tee && green ? holeCameraHeading(tee, green) : null) ??
    (ordered.length >= 2 ? holeCameraHeading(ordered[0], ordered[1]) : null) ??
    0;
  const projected = ordered.map((point) => projectHoleCameraScreen(point, center, heading));
  if (projected.some((point) => point == null)) return ordered;
  const screens = projected as { x: number; y: number }[];
  const minX = Math.min(...screens.map((point) => point.x));
  const maxX = Math.max(...screens.map((point) => point.x));
  const minY = Math.min(...screens.map((point) => point.y));
  const maxY = Math.max(...screens.map((point) => point.y));
  // Pad from the long axis. A hole is a thin line, and the yard chips
  // stick out sideways from it; a per-axis fraction would leave them no room.
  const span = Math.max(maxX - minX, maxY - minY);
  const pad = Math.max(span * SHOT_REVIEW_FRAME_EDGE_PAD, SHOT_REVIEW_FRAME_MIN_PAD_DEG);
  const xPad = pad;
  const yPad = pad;
  const mirrors = ordered
    .map((point) => ({ lat: 2 * center.lat - point.lat, lng: 2 * center.lng - point.lng }))
    .filter((point) => isValidLatLng(point));
  const corners = [
    { x: minX - xPad, y: minY - yPad },
    { x: maxX + xPad, y: minY - yPad },
    { x: minX - xPad, y: maxY + yPad },
    { x: maxX + xPad, y: maxY + yPad },
  ]
    .map((screen) => unprojectHoleCameraScreen(screen, center, heading))
    .filter((point) => isValidLatLng(point));
  // Real points stay first so a heading derived from point 0 → 1 does not change.
  return [...ordered, ...mirrors, ...corners];
}

function unprojectHoleCameraScreen(
  screen: { x: number; y: number },
  center: LatLng,
  headingDeg: number,
): LatLng | null {
  if (!isValidLatLng(center) || !Number.isFinite(headingDeg)) return null;
  if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
  const rad = (headingDeg * Math.PI) / 180;
  const east = Math.cos(rad) * screen.x - Math.sin(rad) * screen.y;
  const north = -Math.sin(rad) * screen.x - Math.cos(rad) * screen.y;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const point = {
    lat: center.lat + north,
    lng: center.lng + east / (Math.abs(cosLat) < 1e-6 ? 1 : cosLat),
  };
  return isValidLatLng(point) ? point : null;
}

type ShotReviewPuttHole = {
  puttsDone?: boolean;
  putts: number;
  puttLengths?: readonly (string | null | undefined)[];
};

/**
 * Putt lines after the GPS shot list: "Putt 1 · 3–10", "Putt 2 · No length".
 * Stats only — never a map pin, a yard number, or a GPS invent.
 * An unfinished hole or a Hole Out with zero putts adds nothing.
 */
export function shotReviewPuttLines(hole: ShotReviewPuttHole): string[] {
  return planFinishedPuttRows({
    puttsDone: hole.puttsDone,
    putts: hole.putts,
    lengths: hole.puttLengths ?? [],
  }).map((row) => `Putt ${row.n} · ${row.label}`);
}

/** "Par 4 · Hole 2 · Score 4 · 2 putts". Putt count only when putts were logged. */
export function shotReviewHoleHeader(
  hole: ShotReviewPuttHole & { par: number | null; number: number; score: number | null },
): string {
  const putts = shotReviewPuttLines(hole).length;
  return [
    formatParLabel(hole.par),
    `Hole ${hole.number}`,
    hole.score != null ? `${COPY.score} ${hole.score}` : null,
    putts > 0 ? formatPuttCount(putts) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
