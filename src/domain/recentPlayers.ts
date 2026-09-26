/** How many recent partners a phone keeps. Newest stays; the oldest drops off. */
export const RECENT_PLAYERS_CAP = 15;

/** Partners besides the round owner. The Group screen hides recents at this count. */
export const RECENT_PARTNER_LIMIT = 3;

export type RecentPlayer = {
  id: string;
  name: string;
  /** Trimmed, lowercased name. `bob`, `Bob `, and `BOB` share one key. */
  nameKey: string;
  handicap: number | null;
  lastUsedAt: string;
};

/**
 * Identity for a partner name: one line, trimmed, cut to the saved-name length, lowercased.
 * Blank is null. A missing handicap is never turned into 0 here — callers pass null through.
 */
export function recentPlayerNameKey(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, 24);
  return name ? name.toLowerCase() : null;
}

/**
 * Recent partners to show on the add form.
 * Newest first, at most {@link RECENT_PLAYERS_CAP}, skipping anyone already in this round.
 * Empty once three partners are already in the group.
 */
export function recentPlayersToOffer(input: {
  recent: readonly RecentPlayer[];
  inRoundNames: readonly string[];
  partnerCount: number;
}): RecentPlayer[] {
  if (input.partnerCount >= RECENT_PARTNER_LIMIT) return [];
  const taken = new Set(
    input.inRoundNames.map((name) => recentPlayerNameKey(name)).filter((key): key is string => key != null),
  );
  return [...input.recent]
    .filter((row) => {
      const key = row.nameKey || recentPlayerNameKey(row.name);
      return key != null && !taken.has(key);
    })
    .sort((a, b) => {
      if (a.lastUsedAt === b.lastUsedAt) return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
      return a.lastUsedAt < b.lastUsedAt ? 1 : -1;
    })
    .slice(0, RECENT_PLAYERS_CAP);
}
