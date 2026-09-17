import { COPY } from './playerCopy';
import type { YardsQuality } from './watchMessages';

/** Watch status: Hole N · XXX yd, or Hole N · — when quality is none.
 * Tiny Approximate chip when quality is soft — never SOFT on the wrist.
 */
export function formatWatchStatusLine(args: {
  holeNumber: number;
  yardsToGreen: number | null;
  yardsQuality: YardsQuality;
}): { line: string; soft: boolean; chip: string | null } {
  const yards =
    args.yardsQuality !== 'none' && args.yardsToGreen != null
      ? `${Math.round(args.yardsToGreen)} yd`
      : '—';
  const soft = args.yardsQuality === 'soft';
  return {
    line: `Hole ${args.holeNumber} · ${yards}`,
    soft,
    chip: soft ? COPY.approximate : null,
  };
}
