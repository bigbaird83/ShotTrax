/** Watch Connectivity: clubList + clubPick, plus puttSheet + puttPick for hole finish,
 * and clubNav (Back / Home — never a mark).
 * Phone owns undo, averages, Drop/Penalty. Ranking/seeds/avgs stay on phone.
 * Watch UI shows top-3 Suggested by default; All clubs reveals the bag payload.
 * Putter opens the putt sheet (buckets + Made it) — never a GPS mark.
 * Stretch: prefer a fresh Watch GPS fix; else phone GPS. Same acceptFix bands.
 * Watch never marks alone, never silent-forces, no motion/mic, no auto-detect putts.
 */

import { isPuttLengthId, PUTT_LENGTHS, type PuttLengthId } from './putts';

export type ClubId = string;

export type YardsQuality = 'good' | 'soft' | 'none';

export const WATCH_MESSAGE_TYPES = ['clubList', 'clubPick', 'puttSheet', 'puttPick', 'clubNav'] as const;
export type WatchMessageType = (typeof WATCH_MESSAGE_TYPES)[number];

/** Phone → Watch. Push on hole change / fix quality change / bag rank change.
 * Exact required keys: type, top3, bag, labels, holeNumber, yardsToGreen, yardsQuality.
 * yardsToGreen is yardsToGreen().yards (null when quality is none).
 * yardsQuality is the same good/soft/none bands as the phone — never invent.
 * lastClubId is optional (Same club on the wrist).
 */
export type ClubListMessage = {
  type: 'clubList';
  top3: ClubId[];
  bag: ClubId[];
  labels: Record<ClubId, string>;
  holeNumber: number;
  yardsToGreen: number | null;
  yardsQuality: YardsQuality;
  lastClubId?: ClubId | null;
};

export const CLUB_LIST_KEYS = [
  'type',
  'top3',
  'bag',
  'labels',
  'holeNumber',
  'yardsToGreen',
  'yardsQuality',
] as const;

/** Watch → Phone on tap. Phone runs the same club=mark as a phone tap (acceptFix). */
export type ClubPickMessage = {
  type: 'clubPick';
  clubId: string;
  at: string;
  /** Stretch: Watch GPS when age ≤ 3s and accuracy > 0. Phone prefers it if ≤ phone accuracy. */
  lat?: number;
  lng?: number;
  accuracyM?: number | null;
};

/** Watch → Phone Back / Home. Never a club tap and never a mark. */
export type ClubNavMessage = {
  type: 'clubNav';
  action: 'back' | 'home';
  at: string;
};

export type ClubPickReply = {
  ok: boolean;
  feedback: string;
};

export function isYardsQuality(value: unknown): value is YardsQuality {
  return value === 'good' || value === 'soft' || value === 'none';
}

/** Phone shot quality → Watch. Poor/forced/unknown is none — never invent. */
export function toWatchYardsQuality(
  quality: 'good' | 'soft' | 'forced' | 'none',
): YardsQuality {
  return quality === 'good' || quality === 'soft' ? quality : 'none';
}

/** ISO-8601 instant (date + time). Fractional seconds and Z/offset allowed. */
export function isIso8601(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(value));
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
  const holeNumber =
    typeof row.holeNumber === 'number' && Number.isFinite(row.holeNumber)
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
  if (row.yardsQuality === 'none') yardsToGreen = null;
  const msg: ClubListMessage = {
    type: 'clubList',
    top3: row.top3 as string[],
    bag: row.bag as string[],
    labels,
    holeNumber,
    yardsToGreen,
    yardsQuality: row.yardsQuality,
  };
  const lastClubId = typeof row.lastClubId === 'string' && row.lastClubId.trim() ? row.lastClubId : undefined;
  if (lastClubId) msg.lastClubId = lastClubId;
  return msg;
}

export function parseClubNav(raw: unknown): ClubNavMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'clubNav') return null;
  if (row.action !== 'back' && row.action !== 'home') return null;
  if (typeof row.at !== 'string' || !isIso8601(row.at)) return null;
  return { type: 'clubNav', action: row.action, at: row.at };
}

export function clubNavPayload(args: { action: 'back' | 'home'; at?: string }): ClubNavMessage {
  return {
    type: 'clubNav',
    action: args.action,
    at: args.at ?? new Date().toISOString(),
  };
}

export function parseClubPick(raw: unknown): ClubPickMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'clubPick') return null;
  if (typeof row.clubId !== 'string' || !row.clubId.trim()) return null;
  if (typeof row.at !== 'string' || !isIso8601(row.at)) return null;
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
  const yardsToGreen =
    args.yardsQuality === 'none' || args.yardsToGreen == null
      ? null
      : Math.round(args.yardsToGreen);
  return {
    type: 'clubList',
    top3: args.top3,
    bag: args.bag,
    labels: args.labels,
    holeNumber: args.holeNumber,
    yardsToGreen,
    yardsQuality: args.yardsQuality,
    ...(args.lastClubId ? { lastClubId: args.lastClubId } : {}),
  };
}

/** Identity for Watch pushes: hole, yards/quality (same bands as phone), bag rank. */
export function clubListPushKey(msg: ClubListMessage): string {
  return JSON.stringify({
    type: msg.type,
    top3: msg.top3,
    bag: msg.bag,
    labels: msg.labels,
    holeNumber: msg.holeNumber,
    yardsToGreen: msg.yardsToGreen,
    yardsQuality: msg.yardsQuality,
  });
}

export function clubPickPayload(args: { clubId: string; at?: string }): ClubPickMessage {
  return {
    type: 'clubPick',
    clubId: args.clubId,
    at: args.at ?? new Date().toISOString(),
  };
}

export function formatClubMarkedFeedback(shortName: string): string {
  return `${shortName} marked ✓`;
}

export const PHONE_UNAVAILABLE = 'Phone unavailable';
export const CHECK_PHONE = 'Check phone';
export const PUTTS_ON_WATCH = 'Putts';
export const MADE_IT_FEEDBACK = 'Made it ✓';

export const PUTT_PICK_ACTIONS = ['add', 'undo', 'made'] as const;
export type PuttPickAction = (typeof PUTT_PICK_ACTIONS)[number];

/** Phone → Watch. Putter selected: buckets + Made it. Never a GPS mark. */
export type PuttSheetMessage = {
  type: 'puttSheet';
  open: boolean;
  holeNumber: number;
  lengths: PuttLengthId[];
  labels: Record<PuttLengthId, string>;
  canAdd: boolean;
  canMake: boolean;
};

/** Watch → Phone. Add a bucket, undo last, or Made it (finishes the hole). */
export type PuttPickMessage = {
  type: 'puttPick';
  action: PuttPickAction;
  at: string;
  lengthId?: PuttLengthId;
};

export type PuttPickReply = {
  ok: boolean;
  feedback: string;
};

export function puttLengthLabels(): Record<PuttLengthId, string> {
  const labels = {} as Record<PuttLengthId, string>;
  for (const row of PUTT_LENGTHS) labels[row.id] = row.label;
  return labels;
}

export function puttSheetPayload(args: {
  open: boolean;
  holeNumber: number;
  lengths: PuttLengthId[];
}): PuttSheetMessage {
  const lengths = args.lengths.filter(isPuttLengthId).slice(0, 5);
  return {
    type: 'puttSheet',
    open: args.open,
    holeNumber: args.holeNumber,
    lengths,
    labels: puttLengthLabels(),
    canAdd: lengths.length < 5,
    canMake: lengths.length > 0,
  };
}

export function parsePuttSheet(raw: unknown): PuttSheetMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'puttSheet') return null;
  if (typeof row.open !== 'boolean') return null;
  const holeNumber =
    typeof row.holeNumber === 'number' && Number.isFinite(row.holeNumber)
      ? Math.round(row.holeNumber)
      : NaN;
  if (!Number.isFinite(holeNumber) || holeNumber < 1) return null;
  if (!Array.isArray(row.lengths) || !row.lengths.every((id) => typeof id === 'string' && isPuttLengthId(id))) {
    return null;
  }
  return puttSheetPayload({
    open: row.open,
    holeNumber,
    lengths: row.lengths as PuttLengthId[],
  });
}

export function puttPickPayload(args: {
  action: PuttPickAction;
  at?: string;
  lengthId?: PuttLengthId;
}): PuttPickMessage {
  const msg: PuttPickMessage = {
    type: 'puttPick',
    action: args.action,
    at: args.at ?? new Date().toISOString(),
  };
  if (args.lengthId && isPuttLengthId(args.lengthId)) msg.lengthId = args.lengthId;
  return msg;
}

export function parsePuttPick(raw: unknown): PuttPickMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'puttPick') return null;
  if (row.action !== 'add' && row.action !== 'undo' && row.action !== 'made') return null;
  if (typeof row.at !== 'string' || !isIso8601(row.at)) return null;
  if (row.action === 'add') {
    if (typeof row.lengthId !== 'string' || !isPuttLengthId(row.lengthId)) return null;
    return { type: 'puttPick', action: 'add', at: row.at, lengthId: row.lengthId };
  }
  return { type: 'puttPick', action: row.action, at: row.at };
}
