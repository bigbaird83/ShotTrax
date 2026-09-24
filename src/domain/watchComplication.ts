import type { YardsQuality } from './watchMessages';

/**
 * Watch face complication for yards-to-green.
 *
 * The number is the phone hole map's `yardsToGreen` (`planPlayHeaderYards`):
 * scorecard yards, or landing → painted green when the phone is on the course.
 * The Watch does not compute a second distance and does not read GPS for this.
 *
 * No trusted yards (missing card and no landing-to-green, quality none, or
 * a non-positive number) → em dash and Unavailable. Never a guessed yardage.
 * Swift `targets/watch-widget/index.swift` must use the same gate.
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
