import type { YardsQuality } from './watchMessages';

/**
 * Live yards-to-green for the Watch hole header and the face complication.
 *
 * The number is the phone hole map's live path (`planLiveGpsToPin` /
 * `yardsToGreen`): good or soft fix to a real green, inside the live cap.
 * The Watch does not compute a second distance and does not read GPS for this.
 *
 * Quality none, a missing green, or a non-positive number → em dash.
 * Never a guessed yardage. Swift `targets/watch/content.swift` and
 * `targets/watch-widget/index.swift` must use the same gate.
 *
 * Yard-only changes wait `WATCH_LIVE_YTG_MIN_MS` so a walking fix does not
 * send a club-list message every second. Hole, quality, and empty/number
 * flips send immediately. The phone's existing location watch is unchanged.
 */
export const COMPLICATION_KIND = 'ShotTraxxHoleYards';

/** WidgetKit accessory families on the existing watchOS 10 widget target. Not ClockKit. */
export const COMPLICATION_FAMILIES = [
  'accessoryCircular',
  'accessoryCorner',
  'accessoryInline',
  'accessoryRectangular',
] as const;

export const COMPLICATION_EMPTY = '—';
export const COMPLICATION_UNAVAILABLE = 'Unavailable';

/** Minimum gap between Watch pushes that only change the live yardage. */
export const WATCH_LIVE_YTG_MIN_MS = 5_000;

export type ComplicationFace = {
  holeNumber: number | null;
  yards: number | null;
  quality: YardsQuality;
  unavailable: boolean;
  /** accessoryInline. */
  inline: string;
  /** Big glance text. A rounded yardage, or the em dash. */
  value: string;
  /** Rectangular / corner caption. Null when a yardage is shown. */
  detail: string | null;
};

export function complicationFromHoleMap(args: {
  holeNumber: number | null;
  map: { yards: number | null; quality: string };
}): ComplicationFace {
  const holeNumber =
    args.holeNumber != null && Number.isFinite(args.holeNumber) && args.holeNumber >= 1
      ? Math.round(args.holeNumber)
      : null;
  const quality: YardsQuality =
    args.map.quality === 'good' || args.map.quality === 'soft' ? args.map.quality : 'none';
  const yards =
    quality !== 'none' &&
    args.map.yards != null &&
    Number.isFinite(args.map.yards) &&
    args.map.yards > 0
      ? Math.round(args.map.yards)
      : null;
  const unavailable = yards == null;
  const value = yards == null ? COMPLICATION_EMPTY : `${yards}`;
  let inline: string;
  if (holeNumber != null && yards != null) inline = `Hole ${holeNumber} · ${yards} yd`;
  else if (holeNumber != null) inline = `Hole ${holeNumber} · ${COMPLICATION_EMPTY}`;
  else if (yards != null) inline = `${yards} yd`;
  else inline = COMPLICATION_EMPTY;
  return {
    holeNumber,
    yards,
    quality: yards == null ? 'none' : quality,
    unavailable,
    inline,
    value,
    detail: unavailable ? COMPLICATION_UNAVAILABLE : null,
  };
}

/** Small caption under the top-right number. Not a second yardage. */
export const WATCH_LIVE_YTG_CAPTION = 'to hole';

/** Top-right figure: `142 yd`, or an em dash when the live yards are not trusted. */
export function watchLiveYardsLabel(live: {
  yards: number | null;
  quality: string;
}): { text: string; trusted: boolean } {
  const face = complicationFromHoleMap({ holeNumber: null, map: live });
  if (face.yards == null) return { text: COMPLICATION_EMPTY, trusted: false };
  return { text: `${face.yards} yd`, trusted: true };
}

export type WatchLiveYtgSnapshot = {
  holeNumber: number;
  yards: number | null;
  quality: YardsQuality;
  atMs: number;
};

/**
 * Latest live yards to put on the club list.
 * `force` is for a push that is already happening (hole, bag, club).
 * Otherwise yard drift waits out the minimum interval.
 */
export function nextWatchLiveYtgSnapshot(args: {
  previous: WatchLiveYtgSnapshot | null;
  holeNumber: number;
  live: { yards: number | null; quality: string };
  nowMs: number;
  force?: boolean;
}): { snapshot: WatchLiveYtgSnapshot; commit: boolean } {
  const face = complicationFromHoleMap({
    holeNumber: args.holeNumber,
    map: args.live,
  });
  const next: WatchLiveYtgSnapshot = {
    holeNumber: args.holeNumber,
    yards: face.yards,
    quality: face.quality,
    atMs: args.nowMs,
  };
  const prev = args.previous;
  if (!prev || args.force || prev.holeNumber !== args.holeNumber) {
    return { snapshot: next, commit: true };
  }
  if (prev.quality !== face.quality || (prev.yards == null) !== (face.yards == null)) {
    return { snapshot: next, commit: true };
  }
  if (prev.yards !== face.yards && args.nowMs - prev.atMs >= WATCH_LIVE_YTG_MIN_MS) {
    return { snapshot: next, commit: true };
  }
  return { snapshot: prev, commit: false };
}
