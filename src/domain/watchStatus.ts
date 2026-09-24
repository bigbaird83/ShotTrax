import { complicationFromHoleMap } from './watchComplication';
import { COPY } from './playerCopy';

/**
 * Watch status: Hole N · XXX yd only for a live GPS fix and a loaded green.
 * Same number and gate as the phone TO GREEN badge and the complication
 * (`planLiveGpsToPin` → `complicationYards`). Club-suggest / tee / landing
 * fallback yards are not an input — those stay on `yardsToGreen` for re-rank.
 * Otherwise Hole N · — . Approximate only when that live fix is soft.
 * Never SOFT on the wrist. Never an invented yardage.
 */
export function formatWatchStatusLine(args: {
  holeNumber: number;
  /** Live GPS → green. `complicationYards` / `complicationQuality` on clubList. */
  live: { yards: number | null; quality: string };
}): { line: string; soft: boolean; chip: string | null } {
  const face = complicationFromHoleMap({
    holeNumber: args.holeNumber,
    map: args.live,
  });
  const yards = face.yards == null ? '—' : `${face.yards} yd`;
  const soft = face.quality === 'soft' && face.yards != null;
  return {
    line: `Hole ${args.holeNumber} · ${yards}`,
    soft,
    chip: soft ? COPY.approximate : null,
  };
}

/**
 * Status line from a clubList. Reads the live complication yards only.
 * `yardsToGreen` (club-rank fallback) is ignored even when quality is good.
 */
export function watchStatusLineFromClubList(msg: {
  holeNumber: number;
  yardsToGreen?: number | null;
  yardsQuality?: string;
  complicationYards?: number | null;
  complicationQuality?: string;
}): { line: string; soft: boolean; chip: string | null } {
  return formatWatchStatusLine({
    holeNumber: msg.holeNumber,
    live: {
      yards: msg.complicationYards ?? null,
      quality: msg.complicationQuality ?? 'none',
    },
  });
}
