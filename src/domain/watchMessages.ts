/** Watch Connectivity club-pick messages. Phone owns GPS, undo, averages, Drop/Penalty. */

export type ClubId = string;

export type YardsQuality = 'good' | 'soft' | 'none';

export type ClubListMessage = {
  type: 'clubList';
  top3: ClubId[];
  bag: ClubId[];
  labels: Record<ClubId, string>;
  holeNumber: number;
  yardsToGreen: number | null;
  yardsQuality: YardsQuality;
  /** Same-club target on Watch. Extra to the locked clubList fields. */
  lastClubId?: ClubId | null;
};

export type ClubPickMessage = {
  type: 'clubPick';
  clubId: string;
  at: string;
  /** Stretch: Watch GPS. Omitted on the must-ship club-only path. */
  lat?: number;
  lng?: number;
  accuracyM?: number | null;
};

export type ClubPickReply = {
  ok: boolean;
  feedback: string;
};

export function isYardsQuality(value: unknown): value is YardsQuality {
  return value === 'good' || value === 'soft' || value === 'none';
}

export function parseClubList(raw: unknown): ClubListMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'clubList') return null;
  if (!Array.isArray(row.top3) || !row.top3.every((id) => typeof id === 'string')) return null;
  if (!Array.isArray(row.bag) || !row.bag.every((id) => typeof id === 'string')) return null;
  if (!row.labels || typeof row.labels !== 'object' || Array.isArray(row.labels)) return null;
  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.labels as Record<string, unknown>)) {
    if (typeof value === 'string') labels[key] = value;
  }
  const holeNumber = typeof row.holeNumber === 'number' && Number.isFinite(row.holeNumber)
    ? Math.round(row.holeNumber)
    : NaN;
  if (!Number.isFinite(holeNumber) || holeNumber < 1) return null;
  let yardsToGreen: number | null = null;
  if (row.yardsToGreen == null) {
    yardsToGreen = null;
  } else if (typeof row.yardsToGreen === 'number' && Number.isFinite(row.yardsToGreen)) {
    yardsToGreen = Math.round(row.yardsToGreen);
  } else {
    return null;
  }
  if (!isYardsQuality(row.yardsQuality)) return null;
  const lastClubId = typeof row.lastClubId === 'string' && row.lastClubId.trim() ? row.lastClubId : undefined;
  return {
    type: 'clubList',
    top3: row.top3 as string[],
    bag: row.bag as string[],
    labels,
    holeNumber,
    yardsToGreen,
    yardsQuality: row.yardsQuality,
    ...(lastClubId ? { lastClubId } : {}),
  };
}

export function parseClubPick(raw: unknown): ClubPickMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'clubPick') return null;
  if (typeof row.clubId !== 'string' || !row.clubId.trim()) return null;
  if (typeof row.at !== 'string' || !row.at.trim()) return null;
  const pick: ClubPickMessage = {
    type: 'clubPick',
    clubId: row.clubId.trim(),
    at: row.at,
  };
  if (typeof row.lat === 'number' && Number.isFinite(row.lat)) pick.lat = row.lat;
  if (typeof row.lng === 'number' && Number.isFinite(row.lng)) pick.lng = row.lng;
  if (row.accuracyM == null) {
    if ('accuracyM' in row) pick.accuracyM = null;
  } else if (typeof row.accuracyM === 'number' && Number.isFinite(row.accuracyM)) {
    pick.accuracyM = row.accuracyM;
  }
  return pick;
}

export function clubListPayload(args: {
  top3: ClubId[];
  bag: ClubId[];
  labels: Record<ClubId, string>;
  holeNumber: number;
  yardsToGreen: number | null;
  yardsQuality: YardsQuality;
  lastClubId?: ClubId | null;
}): ClubListMessage {
  return {
    type: 'clubList',
    top3: args.top3,
    bag: args.bag,
    labels: args.labels,
    holeNumber: args.holeNumber,
    yardsToGreen: args.yardsToGreen,
    yardsQuality: args.yardsQuality,
    ...(args.lastClubId ? { lastClubId: args.lastClubId } : {}),
  };
}

export function clubPickPayload(args: {
  clubId: string;
  at?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number | null;
}): ClubPickMessage {
  const pick: ClubPickMessage = {
    type: 'clubPick',
    clubId: args.clubId,
    at: args.at ?? new Date().toISOString(),
  };
  if (args.lat != null) pick.lat = args.lat;
  if (args.lng != null) pick.lng = args.lng;
  if (args.accuracyM !== undefined) pick.accuracyM = args.accuracyM;
  return pick;
}

export function formatClubMarkedFeedback(shortName: string): string {
  return `${shortName} marked ✓`;
}

export const PHONE_UNAVAILABLE = 'Phone unavailable';
export const CHECK_PHONE = 'Check phone';
