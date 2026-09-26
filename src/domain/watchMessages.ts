/** Watch Connectivity: clubList + clubPick, plus puttSheet + puttPick for hole finish,
 * clubNav (Back / Home — never a mark), and nearbyCourses / startRound.
 * Phone owns undo, averages, Drop/Penalty, GPS, and marks.
 * A Watch penalty is one score stroke the phone writes (`penaltyPick`). It is not a club mark.
 * Nearby course list uses the phone fix only. Watch never guesses a course.
 * Ranking/seeds/avgs stay on phone. Bag, settings, and scoring stay off the Watch.
 * Watch UI shows a carry-sorted bag strip by default; All clubs opens the bag menu.
 * Putter opens the putt sheet (pick length → Add putt → Made it) — never a GPS mark.
 * Stretch: prefer a fresh Watch GPS fix; else phone GPS. Same acceptFix bands.
 * Watch never marks alone, never silent-forces, no motion/mic, no auto-detect putts.
 */

import { complicationFromHoleMap } from './watchComplication';
import { isCourseCardLatLng } from './latLng';
import { watchClubCarry } from './watchLive';
import { isPutterClubId } from './defaultBag';
import { isPuttLengthId, PUTT_LENGTHS, type PuttLengthId } from './putts';
import type { PenaltyReason } from './types';
import { OPEN_PHONE } from './watchNearby';

export type ClubId = string;

export type YardsQuality = 'good' | 'soft' | 'none';

export const WATCH_MESSAGE_TYPES = [
  'clubList',
  'clubPick',
  'clubSelect',
  'puttSheet',
  'puttPick',
  'penaltyPick',
  'clubNav',
  'nearbyCourses',
  'nearbyTees',
  'nearbyRequest',
  'nearbyCoursePick',
  'startRound',
] as const;
export type WatchMessageType = (typeof WATCH_MESSAGE_TYPES)[number];

/** Phone → Watch. Push on hole change / fix quality change / bag rank change.
 * Exact required keys: type, top3, bag, labels, holeNumber, yardsToGreen, yardsQuality.
 * yardsToGreen is yardsToGreen().yards (null when quality is none).
 * yardsQuality is the same good/soft/none bands as the phone — never invent.
 * lastClubId is optional (Same club on the wrist).
 * complicationYards / complicationQuality / complicationAt are the phone's live
 * GPS yards (`planLiveGpsToPin`) and that fix's timestamp in epoch ms. The Watch
 * shows them only when they are newer than yards it already computed for this
 * hole. Older watches ignore the extra fields. They are not the fixed tee length.
 * teeLengthYards is the course tee-to-green length (`holes.yards`). Omit when
 * unknown. greenLat/greenLng is the cup the phone passed to planLiveGpsToPin,
 * only when that point is course data. clubCarry is the play-wheel carry for
 * each bag club so the Watch can re-rank while the phone is locked.
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
  selectedClubId?: ClubId | null;
  complicationYards?: number | null;
  complicationQuality?: YardsQuality;
  /** Epoch ms of the phone fix behind complicationYards. Omit when there is no fix. */
  complicationAt?: number;
  /** Fixed tee-to-green length from course data. Omit when unknown. Older watches ignore it. */
  teeLengthYards?: number | null;
  /** Course cup used by planLiveGpsToPin. Omit when the phone has no course green. */
  greenLat?: number;
  greenLng?: number;
  greenFrontLat?: number;
  greenFrontLng?: number;
  greenBackLat?: number;
  greenBackLng?: number;
  /** Play-wheel carry by club id. Putter omitted. Older watches ignore it. */
  clubCarry?: Record<string, number>;
  /** Last hole finished (Made it / Hole Out). Watch shows Round complete, not the putt sheet. */
  roundComplete?: boolean;
  /** False while the phone is showing a finished round. Omitted means the round is live. */
  roundLive?: boolean;
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

/** Watch wheel tap. Selects only — never a mark. */
export type ClubSelectMessage = {
  type: 'clubSelect';
  clubId: string;
  at: string;
};

export function parseClubSelect(raw: unknown): ClubSelectMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'clubSelect') return null;
  if (typeof row.clubId !== 'string' || !row.clubId.trim()) return null;
  if (typeof row.at !== 'string' || !isIso8601(row.at)) return null;
  return { type: 'clubSelect', clubId: row.clubId.trim(), at: row.at };
}

export function clubSelectPayload(args: { clubId: string; at?: string }): ClubSelectMessage {
  return {
    type: 'clubSelect',
    clubId: args.clubId,
    at: args.at ?? new Date().toISOString(),
  };
}

/** Watch → Phone on tap. Phone runs the same club=mark as a phone tap (acceptFix). */
export type ClubPickMessage = {
  type: 'clubPick';
  clubId: string;
  at: string;
  /** Hole at tap time. Phone must not apply this mark after hole advance. */
  holeNumber?: number;
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
  if (row.yardsQuality === 'none' || yardsToGreen == null || yardsToGreen <= 0) yardsToGreen = null;
  const complication = isYardsQuality(row.complicationQuality)
    ? complicationFromHoleMap({
        holeNumber,
        map: {
          yards: typeof row.complicationYards === 'number' ? row.complicationYards : null,
          quality: row.complicationQuality,
        },
      })
    : null;
  const msg: ClubListMessage = {
    type: 'clubList',
    top3: row.top3 as string[],
    bag: row.bag as string[],
    labels,
    holeNumber,
    yardsToGreen,
    yardsQuality: row.yardsQuality,
  };
  if (complication) {
    msg.complicationQuality = complication.quality;
    msg.complicationYards = complication.yards;
  }
  const lastClubId = typeof row.lastClubId === 'string' && row.lastClubId.trim() ? row.lastClubId : undefined;
  if (lastClubId) msg.lastClubId = lastClubId;
  const selectedClubId =
    typeof row.selectedClubId === 'string' && row.selectedClubId.trim() ? row.selectedClubId : undefined;
  if (selectedClubId) msg.selectedClubId = selectedClubId;
  if (row.roundComplete === true) msg.roundComplete = true;
  if (row.roundLive === false) msg.roundLive = false;
  const teeLength = optionalPositiveYards(row.teeLengthYards);
  if (teeLength != null) msg.teeLengthYards = teeLength;
  const at = optionalEpochMs(row.complicationAt);
  if (at != null) msg.complicationAt = at;
  const green = parseGreenPair(row.greenLat, row.greenLng);
  if (green) {
    msg.greenLat = green.lat;
    msg.greenLng = green.lng;
  }
  const front = parseGreenPair(row.greenFrontLat, row.greenFrontLng);
  if (front) {
    msg.greenFrontLat = front.lat;
    msg.greenFrontLng = front.lng;
  }
  const back = parseGreenPair(row.greenBackLat, row.greenBackLng);
  if (back) {
    msg.greenBackLat = back.lat;
    msg.greenBackLng = back.lng;
  }
  if (row.clubCarry && typeof row.clubCarry === 'object' && !Array.isArray(row.clubCarry)) {
    const carry = watchClubCarry(row.clubCarry as Record<string, number>);
    if (Object.keys(carry).length > 0) msg.clubCarry = carry;
  }
  return msg;
}

function optionalPositiveYards(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function optionalEpochMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function parseGreenPair(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!isCourseCardLatLng({ lat, lng })) return null;
  return { lat, lng };
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

export const PENALTY_PICK_REASONS = ['water', 'ob', 'unplayable', 'other'] as const satisfies readonly PenaltyReason[];

/** Watch → Phone. One penalty stroke after the last shot. Phone writes the row. */
export type PenaltyPickMessage = {
  type: 'penaltyPick';
  /** Stable id. sendMessage, transferUserInfo, and Retry all reuse it. */
  id: string;
  reason: PenaltyReason;
  /** Always one stroke. The Watch has no stroke stepper. */
  strokes: 1;
  at: string;
  /** Hole at tap time. The phone attaches the penalty on this hole. */
  holeNumber: number;
};

export function isPenaltyReason(value: unknown): value is PenaltyReason {
  return value === 'water' || value === 'ob' || value === 'unplayable' || value === 'other';
}

export function parsePenaltyPick(raw: unknown): PenaltyPickMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'penaltyPick') return null;
  if (typeof row.id !== 'string') return null;
  const id = row.id.trim();
  if (!id || id.length > 80 || /\s/.test(id)) return null;
  if (!isPenaltyReason(row.reason)) return null;
  if (row.strokes !== 1) return null;
  if (typeof row.at !== 'string' || !isIso8601(row.at)) return null;
  const holeNumber = watchPenaltyHoleNumber(row.holeNumber);
  if (holeNumber == null) return null;
  return {
    type: 'penaltyPick',
    id,
    reason: row.reason,
    strokes: 1,
    at: row.at,
    holeNumber,
  };
}

function watchPenaltyHoleNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) return Math.round(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const hole = Number(value);
    if (hole >= 1) return hole;
  }
  return null;
}

export function penaltyPickPayload(args: {
  id: string;
  reason: PenaltyReason;
  at?: string;
  holeNumber: number;
}): PenaltyPickMessage {
  return {
    type: 'penaltyPick',
    id: args.id.trim(),
    reason: args.reason,
    strokes: 1,
    at: args.at ?? new Date().toISOString(),
    holeNumber: Math.round(args.holeNumber),
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
  if (typeof row.holeNumber === 'number' && Number.isFinite(row.holeNumber) && row.holeNumber >= 1) {
    pick.holeNumber = Math.round(row.holeNumber);
  } else if (typeof row.holeNumber === 'string' && /^\d+$/.test(row.holeNumber)) {
    const hole = Number(row.holeNumber);
    if (hole >= 1) pick.holeNumber = hole;
  }
  if (typeof row.lat === 'number' && Number.isFinite(row.lat)) pick.lat = row.lat;
  if (typeof row.lng === 'number' && Number.isFinite(row.lng)) pick.lng = row.lng;
  if (row.accuracyM == null) {
    if ('accuracyM' in row) pick.accuracyM = null;
  } else if (typeof row.accuracyM === 'number' && Number.isFinite(row.accuracyM)) {
    pick.accuracyM = row.accuracyM;
  }
  return pick;
}

/**
 * Signal Lab: Back / Home never mark. Putter never marks GPS.
 * Only a real club tap / Watch club tap / Same club runs acceptFix.
 */
export type WatchInboundIntent =
  | {
      kind: 'leave';
      action: 'back' | 'home';
      runsAcceptFix: false;
      savesGps: false;
      closesPendingShot: false;
    }
  | {
      kind: 'putter';
      clubId: string;
      runsAcceptFix: false;
      savesGps: false;
      closesPendingShot: false;
    }
  | {
      kind: 'select';
      clubId: string;
      runsAcceptFix: false;
      savesGps: false;
      closesPendingShot: false;
    }
  | {
      kind: 'penalty';
      pick: PenaltyPickMessage;
      runsAcceptFix: false;
      savesGps: false;
      closesPendingShot: false;
    }
  | {
      kind: 'club';
      pick: ClubPickMessage;
      runsAcceptFix: true;
    };

export function parseWatchInboundIntent(raw: unknown): WatchInboundIntent | null {
  const nav = parseClubNav(raw);
  if (nav) {
    return {
      kind: 'leave',
      action: nav.action,
      runsAcceptFix: false,
      savesGps: false,
      closesPendingShot: false,
    };
  }
  const select = parseClubSelect(raw);
  if (select) {
    return {
      kind: 'select',
      clubId: select.clubId,
      runsAcceptFix: false,
      savesGps: false,
      closesPendingShot: false,
    };
  }
  const penalty = parsePenaltyPick(raw);
  if (penalty) {
    return {
      kind: 'penalty',
      pick: penalty,
      runsAcceptFix: false,
      savesGps: false,
      closesPendingShot: false,
    };
  }
  const pick = parseClubPick(raw);
  if (!pick) return null;
  if (isPutterClubId(pick.clubId)) {
    return {
      kind: 'putter',
      clubId: pick.clubId,
      runsAcceptFix: false,
      savesGps: false,
      closesPendingShot: false,
    };
  }
  return { kind: 'club', pick, runsAcceptFix: true };
}

/** Only a club tap / Watch tap / Same club runs acceptFix. Back/Home never do. */
export function watchPayloadRunsAcceptFix(raw: unknown): boolean {
  return parseWatchInboundIntent(raw)?.runsAcceptFix === true;
}

export function clubListPayload(args: {
  top3: ClubId[];
  bag: ClubId[];
  labels: Record<ClubId, string>;
  holeNumber: number;
  yardsToGreen: number | null;
  yardsQuality: YardsQuality;
  lastClubId?: ClubId | null;
  selectedClubId?: ClubId | null;
  /** Hole-map yards. Omit to leave the Watch complication unchanged. */
  complication?: { yards: number | null; quality: string; atMs?: number | null } | null;
  teeLengthYards?: number | null;
  green?: {
    lat: number;
    lng: number;
    front?: { lat: number; lng: number } | null;
    back?: { lat: number; lng: number } | null;
  } | null;
  clubCarry?: Record<string, number | null | undefined> | null;
}): ClubListMessage {
  const yardsToGreen =
    args.yardsQuality === 'none' ||
    args.yardsToGreen == null ||
    !Number.isFinite(args.yardsToGreen) ||
    args.yardsToGreen <= 0
      ? null
      : Math.round(args.yardsToGreen);
  const complication = args.complication
    ? complicationFromHoleMap({
        holeNumber: args.holeNumber,
        map: args.complication,
      })
    : null;
  const teeLength = optionalPositiveYards(args.teeLengthYards);
  const green = parseGreenPair(args.green?.lat, args.green?.lng);
  const front = parseGreenPair(args.green?.front?.lat, args.green?.front?.lng);
  const back = parseGreenPair(args.green?.back?.lat, args.green?.back?.lng);
  const carry = watchClubCarry(args.clubCarry);
  const at = optionalEpochMs(args.complication?.atMs);
  return {
    type: 'clubList',
    top3: args.top3,
    bag: args.bag,
    labels: args.labels,
    holeNumber: args.holeNumber,
    yardsToGreen,
    yardsQuality: args.yardsQuality,
    ...(args.lastClubId ? { lastClubId: args.lastClubId } : {}),
    ...(args.selectedClubId ? { selectedClubId: args.selectedClubId } : {}),
    ...(complication
      ? { complicationQuality: complication.quality, complicationYards: complication.yards }
      : {}),
    ...(at != null ? { complicationAt: at } : {}),
    ...(teeLength != null ? { teeLengthYards: teeLength } : {}),
    ...(green ? { greenLat: green.lat, greenLng: green.lng } : {}),
    ...(front ? { greenFrontLat: front.lat, greenFrontLng: front.lng } : {}),
    ...(back ? { greenBackLat: back.lat, greenBackLng: back.lng } : {}),
    ...(Object.keys(carry).length > 0 ? { clubCarry: carry } : {}),
  };
}

/** Suggested yards on the wrist move when they change by at least this much. */
export const WATCH_SUGGEST_YARDS_STEP = 5;

export type WatchSuggestSent = {
  holeNumber: number;
  top3: ClubId[];
  yardsToGreen: number | null;
  yardsQuality: YardsQuality;
};

/**
 * Yards to put on the next clubList while walking in. A new top-3 set or order,
 * a new hole, a quality flip, or a move of ≥5 yd sends the fresh number.
 * Smaller drift keeps the last sent yards so the wrist is not pinged every step.
 */
export function watchSuggestYardsToSend(args: {
  previous: WatchSuggestSent | null;
  next: WatchSuggestSent;
}): number | null {
  const prev = args.previous;
  const next = args.next;
  if (!prev) return next.yardsToGreen;
  if (prev.holeNumber !== next.holeNumber) return next.yardsToGreen;
  if (prev.yardsQuality !== next.yardsQuality) return next.yardsToGreen;
  if (prev.top3.join('|') !== next.top3.join('|')) return next.yardsToGreen;
  if (prev.yardsToGreen == null || next.yardsToGreen == null) return next.yardsToGreen;
  if (Math.abs(next.yardsToGreen - prev.yardsToGreen) >= WATCH_SUGGEST_YARDS_STEP) return next.yardsToGreen;
  return prev.yardsToGreen;
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
    lastClubId: msg.lastClubId ?? null,
    selectedClubId: msg.selectedClubId ?? null,
    complicationYards: msg.complicationYards ?? null,
    complicationQuality: msg.complicationQuality ?? null,
    complicationAt: msg.complicationAt ?? null,
    teeLengthYards: msg.teeLengthYards ?? null,
    greenLat: msg.greenLat ?? null,
    greenLng: msg.greenLng ?? null,
    clubCarry: msg.clubCarry ?? null,
    roundComplete: msg.roundComplete === true,
    roundLive: msg.roundLive !== false,
  });
}

export function clubPickPayload(args: { clubId: string; at?: string; holeNumber?: number }): ClubPickMessage {
  return {
    type: 'clubPick',
    clubId: args.clubId,
    at: args.at ?? new Date().toISOString(),
    ...(args.holeNumber != null && args.holeNumber >= 1 ? { holeNumber: Math.round(args.holeNumber) } : {}),
  };
}

export function formatClubMarkedFeedback(shortName: string): string {
  return `${shortName} marked ✓`;
}

export const PHONE_UNAVAILABLE = 'Phone unavailable';
/** Watch stays live when the phone is in the cart — queue, do not freeze. */
export const QUEUED_WILL_SYNC = 'Queued · will sync';
export const CHECK_PHONE = 'Check phone';
export const PUTTS_ON_WATCH = 'Putts';
export const MADE_IT_FEEDBACK = 'Hole Out ✓';

export const PUTT_PICK_ACTIONS = ['add', 'undo', 'made'] as const;
export type PuttPickAction = (typeof PUTT_PICK_ACTIONS)[number];

/** Phone → Watch. Putter selected: pick length, Add putt, Made it. Never a GPS mark. */
export type PuttSheetMessage = {
  type: 'puttSheet';
  open: boolean;
  holeNumber: number;
  lengths: PuttLengthId[];
  labels: Record<PuttLengthId, string>;
  canAdd: boolean;
  canMake: boolean;
  /** Made it / Hole Out finished this hole. Watch closes the sheet even if it opened it locally. */
  done?: boolean;
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
  done?: boolean;
}): PuttSheetMessage {
  const lengths = args.lengths.filter(isPuttLengthId).slice(0, 5);
  return {
    type: 'puttSheet',
    open: args.done ? false : args.open,
    holeNumber: args.holeNumber,
    lengths,
    labels: puttLengthLabels(),
    canAdd: lengths.length < 5,
    canMake: true,
    ...(args.done ? { done: true } : {}),
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
    done: row.done === true,
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
  const lengthId =
    typeof row.lengthId === 'string' && isPuttLengthId(row.lengthId) ? row.lengthId : undefined;
  if (row.action === 'add') {
    if (!lengthId) return null;
    return { type: 'puttPick', action: 'add', at: row.at, lengthId };
  }
  return {
    type: 'puttPick',
    action: row.action,
    at: row.at,
    ...(lengthId ? { lengthId } : {}),
  };
}

export type NearbyCourseRow = {
  id: string;
  name: string;
  distanceMeters: number | null;
};

export type NearbyTeeRow = {
  name: string;
  rating: number | null;
  slope: number | null;
  totalYards: number | null;
};

/** Phone → Watch. Short nearby list from the phone fix, or open the phone. */
export type NearbyCoursesMessage = {
  type: 'nearbyCourses';
  status: 'ok' | 'open_phone';
  line: string | null;
  courses: NearbyCourseRow[];
};

/** Phone → Watch. Named tees for the course the wrist just tapped. */
export type NearbyTeesMessage = {
  type: 'nearbyTees';
  courseId: string;
  courseName: string;
  tees: NearbyTeeRow[];
};

/** Watch → Phone. Ask for the nearby list. Never carries Watch GPS. */
export type NearbyRequestMessage = {
  type: 'nearbyRequest';
  at: string;
};

/** Watch → Phone. Player tapped a course. Phone loads tees. */
export type NearbyCoursePickMessage = {
  type: 'nearbyCoursePick';
  courseId: string;
  at: string;
};

/** Watch → Phone. Player tapped 9 or 18, then a tee (or no-tee start). */
export type StartRoundMessage = {
  type: 'startRound';
  courseId: string;
  teeName?: string;
  holeCount: 9 | 18;
  at: string;
};

export type WatchNearbyIntent =
  | { kind: 'nearbyRequest'; runsAcceptFix: false; usesWatchFix: false }
  | { kind: 'nearbyCoursePick'; courseId: string; runsAcceptFix: false; usesWatchFix: false }
  | {
      kind: 'startRound';
      courseId: string;
      teeName?: string;
      holeCount: 9 | 18;
      runsAcceptFix: false;
      usesWatchFix: false;
    };

export function nearbyRequestPayload(args?: { at?: string }): NearbyRequestMessage {
  return {
    type: 'nearbyRequest',
    at: args?.at ?? new Date().toISOString(),
  };
}

export function nearbyCoursePickPayload(args: { courseId: string; at?: string }): NearbyCoursePickMessage {
  return {
    type: 'nearbyCoursePick',
    courseId: args.courseId,
    at: args.at ?? new Date().toISOString(),
  };
}

export function startRoundPayload(args: {
  courseId: string;
  teeName?: string;
  holeCount: 9 | 18;
  at?: string;
}): StartRoundMessage {
  return {
    type: 'startRound',
    courseId: args.courseId,
    holeCount: args.holeCount,
    at: args.at ?? new Date().toISOString(),
    ...(args.teeName?.trim() ? { teeName: args.teeName.trim() } : {}),
  };
}

export function parseNearbyRequest(raw: unknown): NearbyRequestMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'nearbyRequest') return null;
  if (typeof row.at !== 'string' || !isIso8601(row.at)) return null;
  return { type: 'nearbyRequest', at: row.at };
}

export function parseNearbyCoursePick(raw: unknown): NearbyCoursePickMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'nearbyCoursePick') return null;
  if (typeof row.courseId !== 'string' || !row.courseId.trim()) return null;
  if (typeof row.at !== 'string' || !isIso8601(row.at)) return null;
  return { type: 'nearbyCoursePick', courseId: row.courseId.trim(), at: row.at };
}

export function parseStartRound(raw: unknown): StartRoundMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'startRound') return null;
  if (typeof row.courseId !== 'string' || !row.courseId.trim()) return null;
  if (row.holeCount !== 9 && row.holeCount !== 18) return null;
  if (typeof row.at !== 'string' || !isIso8601(row.at)) return null;
  const teeName =
    typeof row.teeName === 'string' && row.teeName.trim() ? row.teeName.trim() : undefined;
  return {
    type: 'startRound',
    courseId: row.courseId.trim(),
    holeCount: row.holeCount,
    at: row.at,
    ...(teeName ? { teeName } : {}),
  };
}

export function parseNearbyCourses(raw: unknown): NearbyCoursesMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'nearbyCourses') return null;
  if (row.status !== 'ok' && row.status !== 'open_phone') return null;
  if (!Array.isArray(row.courses)) return null;
  const courses: NearbyCourseRow[] = [];
  for (const item of row.courses) {
    if (!item || typeof item !== 'object') continue;
    const course = item as Record<string, unknown>;
    if (typeof course.id !== 'string' || !course.id.trim()) continue;
    if (typeof course.name !== 'string' || !course.name.trim()) continue;
    courses.push({
      id: course.id,
      name: course.name,
      distanceMeters:
        typeof course.distanceMeters === 'number' && Number.isFinite(course.distanceMeters)
          ? course.distanceMeters
          : null,
    });
  }
  if (row.status === 'open_phone') {
    return { type: 'nearbyCourses', status: 'open_phone', line: OPEN_PHONE, courses: [] };
  }
  return {
    type: 'nearbyCourses',
    status: 'ok',
    line: null,
    courses,
  };
}

export function parseNearbyTees(raw: unknown): NearbyTeesMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.type !== 'nearbyTees') return null;
  if (typeof row.courseId !== 'string' || !row.courseId.trim()) return null;
  if (typeof row.courseName !== 'string' || !row.courseName.trim()) return null;
  if (!Array.isArray(row.tees)) return null;
  const tees: NearbyTeeRow[] = [];
  for (const item of row.tees) {
    if (!item || typeof item !== 'object') continue;
    const tee = item as Record<string, unknown>;
    if (typeof tee.name !== 'string' || !tee.name.trim()) continue;
    tees.push({
      name: tee.name,
      rating: typeof tee.rating === 'number' && Number.isFinite(tee.rating) ? tee.rating : null,
      slope: typeof tee.slope === 'number' && Number.isFinite(tee.slope) ? tee.slope : null,
      totalYards:
        typeof tee.totalYards === 'number' && Number.isFinite(tee.totalYards) ? tee.totalYards : null,
    });
  }
  return {
    type: 'nearbyTees',
    courseId: row.courseId.trim(),
    courseName: row.courseName.trim(),
    tees,
  };
}

/** Nearby / start-round Watch messages never mark GPS. */
export function parseWatchNearbyIntent(raw: unknown): WatchNearbyIntent | null {
  if (parseNearbyRequest(raw)) {
    return { kind: 'nearbyRequest', runsAcceptFix: false, usesWatchFix: false };
  }
  const pick = parseNearbyCoursePick(raw);
  if (pick) {
    return {
      kind: 'nearbyCoursePick',
      courseId: pick.courseId,
      runsAcceptFix: false,
      usesWatchFix: false,
    };
  }
  const start = parseStartRound(raw);
  if (start) {
    return {
      kind: 'startRound',
      courseId: start.courseId,
      holeCount: start.holeCount,
      runsAcceptFix: false,
      usesWatchFix: false,
      ...(start.teeName ? { teeName: start.teeName } : {}),
    };
  }
  return null;
}
