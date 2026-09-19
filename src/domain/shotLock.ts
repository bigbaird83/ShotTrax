/** Quiet chip after a shot locks. Yards are the logged from→to, never the card or a carry book. */

export function formatShotLockChip(args: {
  shortName: string;
  distanceYards: number | null | undefined;
}): string | null {
  const name = args.shortName.trim();
  if (!name) return null;
  if (args.distanceYards == null || !Number.isFinite(args.distanceYards)) return null;
  return `${name} · ${Math.round(args.distanceYards)}`;
}

export function shotLockIsModal(): false {
  return false;
}

export function shotLockChipUsesHoleCardYards(): false {
  return false;
}

export function shotLockChipUsesCarryAverage(): false {
  return false;
}
