import type { YardsQuality } from './watchMessages';

/** Watch status: Hole N · XXX yd, or Hole N · — when quality is none. Tiny SOFT when soft. */
export function formatWatchStatusLine(args: {
  holeNumber: number;
  yardsToGreen: number | null;
  yardsQuality: YardsQuality;
}): { line: string; soft: boolean } {
  const yards =
    args.yardsQuality !== 'none' && args.yardsToGreen != null
      ? `${Math.round(args.yardsToGreen)} yd`
      : '—';
  return {
    line: `Hole ${args.holeNumber} · ${yards}`,
    soft: args.yardsQuality === 'soft',
  };
}
