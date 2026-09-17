import type { YardsQuality } from './watchMessages';

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
