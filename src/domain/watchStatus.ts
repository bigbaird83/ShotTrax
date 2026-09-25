import { complicationFromHoleMap } from './watchComplication';
import { COPY } from './playerCopy';

/**
 * Watch status line is the fixed tee-to-green length (`teeLengthYards` /
 * `holes.yards`). Missing course yards → "Hole N" only. No dash and no live
 * GPS number — those stay on the top-right figure and the complication.
 * Approximate still follows the live fix quality, not the card length.
 */
export function formatWatchStatusLine(args: {
  holeNumber: number;
  teeLengthYards?: number | null;
  /** Live GPS → green. Drives the Approximate chip only. */
  live: { yards: number | null; quality: string };
}): { line: string; soft: boolean; chip: string | null } {
  const face = complicationFromHoleMap({
    holeNumber: args.holeNumber,
    map: args.live,
  });
  const tee =
    args.teeLengthYards != null && Number.isFinite(args.teeLengthYards) && args.teeLengthYards > 0
      ? Math.round(args.teeLengthYards)
      : null;
  const soft = face.quality === 'soft' && face.yards != null;
  return {
    line: tee == null ? `Hole ${args.holeNumber}` : `Hole ${args.holeNumber} · ${tee} yd`,
    soft,
    chip: soft ? COPY.approximate : null,
  };
}

/** Status line from a clubList. Live complication yards never become the line. */
export function watchStatusLineFromClubList(msg: {
  holeNumber: number;
  yardsToGreen?: number | null;
  yardsQuality?: string;
  teeLengthYards?: number | null;
  complicationYards?: number | null;
  complicationQuality?: string;
}): { line: string; soft: boolean; chip: string | null } {
  return formatWatchStatusLine({
    holeNumber: msg.holeNumber,
    teeLengthYards: msg.teeLengthYards ?? null,
    live: {
      yards: msg.complicationYards ?? null,
      quality: msg.complicationQuality ?? 'none',
    },
  });
}
