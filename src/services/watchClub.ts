import { Alert, AppState } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getWatchBridgeNative } from '@/modules/watch-bridge';
import { COPY } from '../domain/playerCopy';
import { watchBagLabelForPush, watchClubListTop3 } from '../domain/watchClubPick';
import type { WatchGreenFields } from '../domain/watchLive';
import { watchFixFromPick } from '../domain/preferWatchFix';
import {
  MADE_IT_FEEDBACK,
  PHONE_UNAVAILABLE,
  PUTTS_ON_WATCH,
  clubListPayload,
  formatClubMarkedFeedback,
  parsePuttPick,
  parseWatchInboundIntent,
  puttSheetPayload,
  watchConfirmPayload,
  toWatchYardsQuality,
  type ClubListMessage,
  type ClubPickReply,
  type PuttPickMessage,
  type PuttPickReply,
  type PuttSheetMessage,
  type ShotClubChangeMessage,
  type ShotUndoMessage,
} from '../domain/watchMessages';
import { holeAfterDone, type PuttLengthId } from '../domain/putts';
import {
  drainWatchClubPickQueueForHole,
  gateWatchClubPick,
  queueWatchClubPickEvent,
  watchClubPickShouldApply,
  watchFinishShotOverlayBlocksClubPick,
} from '../domain/watchClubQueue';
import {
  drainWatchPuttPickQueue,
  forgetWatchPuttPickAt,
  planWatchMadeItAdvance,
  queueWatchPuttPickEvent,
  watchPuttPickShouldApply,
} from '../domain/watchPuttSync';
import { getHole, insertPenalty, listShotsForHole, undoLastShot } from '../db/repo';
import {
  drainWatchShotUndoQueue,
  planWatchShotUndo,
  queueWatchShotUndoEvent,
  WATCH_SHOT_UNDO_FAILED,
  WATCH_SHOT_UNDO_SKIPPED,
  watchNamedLastShot,
} from '../domain/watchShotUndo';
import {
  drainWatchShotClubChangeQueue,
  planWatchShotClubChange,
  queueWatchShotClubChangeEvent,
  rememberWatchClubChange,
  WATCH_CLUB_CHANGE_FAILED,
  WATCH_CLUB_CHANGE_UNCHANGED,
  watchClubChangeAlreadyApplied,
} from '../domain/watchShotClubChange';
import {
  drainWatchPenaltyQueue,
  formatWatchPenaltyFeedback,
  planWatchPenaltyInsert,
  queueWatchPenaltyEvent,
  WATCH_PENALTY_SAVE_FAILED,
} from '../domain/watchPenalty';
import { hapticMark, hapticSelect, hapticWarn } from '../ui/haptics';
import { changeShotClub, markShotWithClub, promptForPlan } from './shotActions';
import { handleWatchHomeJson, isWatchHomeJson } from './watchHome';
import { handleWatchNearbyJson, isWatchNearbyJson } from './watchNearby';

export type WatchClubContext = {
  db: SQLiteDatabase;
  roundId: string;
  holeNumber: number;
  readOnly: boolean;
  tee?: { lat: number; lng: number } | null;
  /** Finish shot · Hole N on another hole — reject every Watch clubPick. */
  openShotHoles?: number[];
  bump: () => void;
  onMarked?: () => void;
  onPutter?: () => void;
  onLeave?: (action: 'back' | 'home') => void;
  onPuttPick?: (msg: PuttPickMessage) => PuttPickReply | Promise<PuttPickReply>;
  onSelectClub?: (clubId: string) => void;
  labelForClub: (clubId: string) => string | null;
};

let context: WatchClubContext | null = null;
let started = false;
let lastJson = '';
let lastClubList: ClubListMessage | null = null;
/** Round whose golf workout must stay ended. Cleared when a different round becomes current. */
let endedRoundId: string | null = null;
let clubListChain: Promise<void> = Promise.resolve();
let lastPuttJson = '';
let lastClubMark: { clubId: string; appliedAtMs: number } | null = null;

function native() {
  return getWatchBridgeNative();
}

export function watchBridgeAvailable(): boolean {
  return native()?.isSupported() === true;
}

export function setWatchClubContext(next: WatchClubContext | null): void {
  if (next && endedRoundId && next.roundId !== endedRoundId) {
    endedRoundId = null;
  }
  context = next;
  if (next) {
    void flushPendingClubPicks(next.holeNumber);
    void flushPendingPuttPicks();
    void flushPendingPenalties();
    void flushPendingShotUndos();
    void flushPendingShotClubChanges();
  }
}

function enqueueClubList(work: () => Promise<void>): Promise<void> {
  const run = clubListChain.then(work, work);
  clubListChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function pushWatchClubList(msg: ClubListMessage): Promise<void> {
  const queuedForRound = context?.roundId ?? endedRoundId;
  return enqueueClubList(() => deliverClubList(msg, queuedForRound));
}

/**
 * Finish / delete of the open round. Tells the Watch the round is over so the
 * golf workout ends. Later club lists for this round cannot restart it.
 */
export function endWatchRound(roundId: string): void {
  endedRoundId = roundId;
  const base = lastClubList;
  const msg: ClubListMessage = base
    ? { ...base, roundComplete: true, roundLive: false }
    : {
        type: 'clubList',
        top3: [],
        bag: [],
        labels: {},
        holeNumber: 1,
        yardsToGreen: null,
        yardsQuality: 'none',
        roundComplete: true,
        roundLive: false,
        shotCount: 0,
        lastShotId: '',
        lastShotClubId: '',
      };
  void pushWatchClubList(msg);
}

async function deliverClubList(
  msg: ClubListMessage,
  queuedForRound: string | null,
  opts?: { force?: boolean },
): Promise<void> {
  const roundId = context?.roundId ?? null;
  if (msg.roundComplete !== true && endedRoundId && (queuedForRound == null || queuedForRound === endedRoundId)) {
    if (roundId == null || roundId === endedRoundId) return;
  }
  if (msg.roundComplete === true && roundId && queuedForRound && roundId !== queuedForRound) return;
  if (msg.roundComplete === true && queuedForRound) endedRoundId = queuedForRound;
  const json = JSON.stringify(msg);
  // A repeat of the same list still goes out when the Watch may have cleared
  // its own copy. Foreground, reachability, and a confirm all force that.
  if (!opts?.force && json === lastJson) return;
  const mod = native();
  if (!mod) return;
  const stamped = { ...msg, listSeq: clubListSeq + 1 };
  try {
    await mod.pushClubListJson(JSON.stringify(stamped));
    clubListSeq += 1;
    lastJson = json;
    lastClubList = stamped;
  } catch {
    // Watch is best-effort on Simulator / Android / web.
  }
}

export async function pushWatchPuttSheet(args: {
  open: boolean;
  holeNumber: number;
  lengths: PuttLengthId[];
  done?: boolean;
}): Promise<void> {
  const msg: PuttSheetMessage = puttSheetPayload(args);
  const json = JSON.stringify(msg);
  if (json === lastPuttJson) return;
  const mod = native();
  if (!mod) return;
  lastPuttJson = json;
  try {
    if (typeof mod.pushWatchMessageJson === 'function') {
      await mod.pushWatchMessageJson(json);
    } else {
      await mod.pushClubListJson(json);
    }
  } catch {
    // Watch is best-effort on Simulator / Android / web.
  }
}

/**
 * Made it / Hole Out finished `holeNumber`: close the Watch putt sheet and move
 * the wrist to Hole N+1 (or Round complete) right away. The next hole screen
 * pushes its own clubList with real yards after it mounts.
 */
/** Shots already on the hole Hole Out is moving to. Zero when that hole has none. */
export function watchAdvanceNamedShot(
  db: SQLiteDatabase,
  roundId: string,
  finishedHole: number,
  holeCount: number,
): { lastShotId: string | null; lastShotClubId: string | null; shotCount: number } {
  const dest = holeAfterDone(finishedHole, holeCount);
  if (dest.kind !== 'hole') return { lastShotId: null, lastShotClubId: null, shotCount: 0 };
  const row = getHole(db, roundId, dest.holeNumber);
  if (!row) return { lastShotId: null, lastShotClubId: null, shotCount: 0 };
  const shots = listShotsForHole(db, row.id);
  return { ...watchNamedLastShot(shots), shotCount: shots.length };
}

/**
 * Send the phone's current hole shot count and last shot again.
 * Used after a confirm, on foreground, and when the Watch becomes reachable,
 * so a local clear on the Watch cannot outlive the phone's rows.
 */
export async function republishWatchHoleShots(): Promise<void> {
  const ctx = context;
  const base = lastClubList;
  if (!ctx || ctx.readOnly || !base) return;
  if (endedRoundId && endedRoundId === ctx.roundId) return;
  const hole = getHole(ctx.db, ctx.roundId, ctx.holeNumber);
  const shots = hole ? listShotsForHole(ctx.db, hole.id) : [];
  const named = watchNamedLastShot(shots);
  const { listSeq: _listSeq, roundComplete: _roundComplete, ...rest } = base;
  const msg: ClubListMessage = {
    ...rest,
    holeNumber: ctx.holeNumber,
    roundLive: true,
    shotCount: shots.length,
    lastShotId: named.lastShotId ?? '',
    lastShotClubId: named.lastShotClubId ?? '',
  };
  await enqueueClubList(() => deliverClubList(msg, ctx.roundId, { force: true }));
}

export async function pushWatchMadeItAdvance(args: {
  holeNumber: number;
  holeCount: number;
  lengths: PuttLengthId[];
  /** Shots already stored on the hole the wrist is moving to. */
  shotCount?: number | null;
  lastShotId?: string | null;
  lastShotClubId?: string | null;
}): Promise<void> {
  const plan = planWatchMadeItAdvance({
    ...args,
    last: lastClubList,
    nextShotCount: args.shotCount,
    nextLastShotId: args.lastShotId,
    nextLastShotClubId: args.lastShotClubId,
  });
  if (plan.clubList.roundComplete === true && context?.roundId) {
    endedRoundId = context.roundId;
  }
  // clubList goes out first, in this tick — before the next hole screen mounts
  // and pushes its real clubList, so this placeholder never lands on top of it.
  await Promise.all([
    pushWatchClubList(plan.clubList),
    pushWatchPuttSheet({
      open: false,
      holeNumber: plan.puttSheet.holeNumber,
      lengths: plan.puttSheet.lengths,
      done: true,
    }),
  ]);
}

/** Wire shape `clubListPayload` already parses. Front/back only when both coords exist. */
function clubListGreen(fields: WatchGreenFields): {
  lat: number;
  lng: number;
  front?: { lat: number; lng: number } | null;
  back?: { lat: number; lng: number } | null;
} {
  return {
    lat: fields.greenLat,
    lng: fields.greenLng,
    front:
      fields.greenFrontLat != null && fields.greenFrontLng != null
        ? { lat: fields.greenFrontLat, lng: fields.greenFrontLng }
        : null,
    back:
      fields.greenBackLat != null && fields.greenBackLng != null
        ? { lat: fields.greenBackLat, lng: fields.greenBackLng }
        : null,
  };
}

export function buildClubList(args: {
  top3: { id: string; shortName: string }[];
  bag: { id: string; shortName: string }[];
  holeNumber: number;
  yardsToGreen: number | null;
  yardsQuality: 'good' | 'soft' | 'forced' | 'none';
  lastClubId?: string | null;
  selectedClubId?: string | null;
  /** Hole-map `planLiveGpsToPin`. Omit to leave the complication unchanged. */
  complication?: { yards: number | null; quality: string; atMs?: number | null } | null;
  /** False on a finished round so the Watch ends the golf workout and still shows the hole. */
  roundLive?: boolean;
  teeLengthYards?: number | null;
  /** Course cup from `watchGreenFields`. Null means the Watch must not invent yards. */
  green?: WatchGreenFields | null;
  clubCarry?: Record<string, number | null | undefined> | null;
  /** Shots on this hole. The Watch copies this count; it does not infer one. */
  shotCount?: number | null;
  /** Shot Edit shot would change or delete on this hole. Null sends an explicit empty id. */
  lastShotId?: string | null;
  /** Club on that shot, so Change club can highlight it after a hole change. */
  lastShotClubId?: string | null;
}): ClubListMessage {
  const labels: Record<string, string> = {};
  // Phone bag is source of truth. Full enabled bag — never a pre-trimmed top-3.
  for (const club of args.bag) {
    labels[club.id] = watchBagLabelForPush({ id: club.id, shortName: club.shortName });
  }
  for (const club of args.top3) {
    if (labels[club.id]) continue;
    labels[club.id] = watchBagLabelForPush({ id: club.id, shortName: club.shortName });
  }
  const msg = clubListPayload({
    top3: watchClubListTop3(args.top3.map((club) => club.id)),
    bag: args.bag.map((club) => club.id),
    labels,
    holeNumber: args.holeNumber,
    yardsToGreen: args.yardsToGreen,
    yardsQuality: toWatchYardsQuality(args.yardsQuality),
    lastClubId: args.lastClubId ?? null,
    selectedClubId: args.selectedClubId ?? null,
    ...(args.complication ? { complication: args.complication } : {}),
    ...(args.teeLengthYards != null ? { teeLengthYards: args.teeLengthYards } : {}),
    ...(args.green ? { green: clubListGreen(args.green) } : {}),
    ...(args.clubCarry ? { clubCarry: args.clubCarry } : {}),
    shotCount: args.shotCount ?? 0,
    lastShotId: args.lastShotId ?? null,
    lastShotClubId: args.lastShotClubId ?? null,
  });
  if (args.roundLive === false) msg.roundLive = false;
  return msg;
}

/**
 * transferUserInfo has no reply channel. Push the accepted id so the Watch
 * can drop it even when the sendMessage reply never arrives. A duplicate id
 * still confirms: the phone did not insert a second stroke.
 */
async function replyToken(token: string, payload: ClubPickReply | PuttPickReply): Promise<void> {
  const mod = native();
  if (!mod) return;
  try {
    await mod.replyClubPick(token, JSON.stringify(payload));
  } catch {
    // reply is best-effort
  }
}

let clubListSeq = 0;
let clubPickTail: Promise<void> = Promise.resolve();

async function pushWatchConfirm(
  kind: 'penalty' | 'undo' | 'club',
  id: string,
  feedback?: string,
): Promise<void> {
  const message = watchConfirmPayload(kind, id, feedback);
  if (!message) return;
  const mod = native();
  if (!mod || typeof mod.pushWatchMessageJson !== 'function') return;
  try {
    await mod.pushWatchMessageJson(JSON.stringify(message));
  } catch {
    // The sendMessage reply is the other confirm path.
  }
}

function enqueueClubPick(work: () => Promise<void>): Promise<void> {
  const run = clubPickTail.then(work, work);
  clubPickTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function handlePick(token: string, json: string): Promise<void> {
  // Watch Home (nearby search, favorite star) may hit the network — never let
  // it hold up a club mark in the serialized pick queue.
  if (isWatchHomeJson(json)) {
    await replyToken(token, await handleWatchHomeJson(json));
    return;
  }
  return enqueueClubPick(() => handlePickNow(token, json));
}

async function handlePickNow(token: string, json: string): Promise<void> {
  if (isWatchNearbyJson(json)) {
    const result = await handleWatchNearbyJson(json);
    await replyToken(token, result);
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
    return;
  }
  const intent = parseWatchInboundIntent(raw);
  if (!intent) {
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
    return;
  }
  const ctx = context;
  if (!ctx || ctx.readOnly) {
    if (!ctx && intent.kind === 'club') {
      queueWatchClubPickEvent({
        token,
        json,
        at: intent.pick.at,
        holeNumber: intent.pick.holeNumber ?? null,
      });
      return;
    }
    if (intent.kind === 'penalty') {
      if (!ctx) {
        queueWatchPenaltyEvent({ token, json, id: intent.pick.id });
        return;
      }
      await replyToken(token, { ok: false, feedback: WATCH_PENALTY_SAVE_FAILED });
      return;
    }
    if (intent.kind === 'undo') {
      if (!ctx) {
        queueWatchShotUndoEvent({ token, json, id: intent.undo.id });
        return;
      }
      await replyToken(token, { ok: false, feedback: WATCH_SHOT_UNDO_FAILED });
      return;
    }
    if (intent.kind === 'shotClub') {
      if (!ctx) {
        queueWatchShotClubChangeEvent({ token, json, id: intent.change.id });
        return;
      }
      await replyToken(token, { ok: false, feedback: WATCH_CLUB_CHANGE_FAILED });
      return;
    }
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
    return;
  }

  if (intent.kind === 'select') {
    ctx.onSelectClub?.(intent.clubId);
    hapticSelect();
    const label = ctx.labelForClub(intent.clubId) ?? intent.clubId;
    await replyToken(token, { ok: true, feedback: label });
    return;
  }

  if (intent.kind === 'leave') {
    // Signal Lab: never mark, never acceptFix, never save GPS, never close a pending shot.
    ctx.onLeave?.(intent.action);
    await replyToken(token, { ok: true, feedback: intent.action === 'home' ? COPY.home : COPY.back });
    return;
  }

  if (intent.kind === 'putter') {
    hapticSelect();
    ctx.onPutter?.();
    await replyToken(token, { ok: true, feedback: PUTTS_ON_WATCH });
    return;
  }

  if (intent.kind === 'penalty') {
    await applyWatchPenalty(token, intent.pick);
    return;
  }

  if (intent.kind === 'undo') {
    await applyWatchShotUndo(token, intent.undo);
    return;
  }

  if (intent.kind === 'shotClub') {
    await applyWatchShotClubChange(token, intent.change);
    return;
  }

  const pick = intent.pick;
  const alreadyApplied = !watchClubPickShouldApply(pick.at);
  const gate = gateWatchClubPick({
    at: pick.at,
    clubId: pick.clubId,
    holeNumber: pick.holeNumber ?? null,
    currentHole: ctx.holeNumber,
    last: lastClubMark,
    nowMs: Date.now(),
    alreadyApplied,
    openShotHoles: ctx.openShotHoles,
  });
  if (!gate.apply) {
    const label = ctx.labelForClub(pick.clubId) ?? pick.clubId;
    await replyToken(token, { ok: true, feedback: formatClubMarkedFeedback(label) });
    return;
  }
  ctx.onSelectClub?.(pick.clubId);
  const label = ctx.labelForClub(pick.clubId) ?? pick.clubId;
  const watchFix = watchFixFromPick(pick);
  const markHole = pick.holeNumber ?? ctx.holeNumber;
  try {
    // Top-3 and bag taps share this mark. Same 600-yard tee check.
    // Watch GPS when fresh and within 15/25 m; phone fallback otherwise.
    const { plan } = await markShotWithClub(ctx.db, {
      roundId: ctx.roundId,
      holeNumber: markHole,
      clubId: pick.clubId,
      watchFix,
      tee: ctx.tee ?? null,
    });
    const waiting = promptForPlan(plan, () => {
      void (async () => {
        try {
          const live = context;
          if (!live || live.holeNumber !== markHole) return;
          const forced = await markShotWithClub(live.db, {
            roundId: live.roundId,
            holeNumber: markHole,
            clubId: pick.clubId,
            force: true,
            watchFix,
            tee: live.tee ?? null,
          });
          if (forced.plan.status === 'commit') {
            lastClubMark = { clubId: pick.clubId, appliedAtMs: Date.now() };
            hapticMark();
            live.bump();
            live.onMarked?.();
          }
        } catch {
          hapticWarn();
        }
      })();
    });
    if (waiting) {
      lastClubMark = { clubId: pick.clubId, appliedAtMs: Date.now() };
      hapticWarn();
      await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
      return;
    }
    if (plan.status === 'commit') {
      lastClubMark = { clubId: pick.clubId, appliedAtMs: Date.now() };
      hapticMark();
      ctx.bump();
      ctx.onMarked?.();
      await replyToken(token, { ok: true, feedback: formatClubMarkedFeedback(label) });
      return;
    }
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
  } catch {
    hapticWarn();
    Alert.alert(COPY.waitingOnLocation, COPY.locationOff, [{ text: COPY.cancel, style: 'cancel' }]);
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
  }
}

/**
 * Phone writes the penalty row. Same id (Watch retry, sendMessage, and
 * transferUserInfo) inserts once and does not overwrite a reason edited on
 * the phone. A deleted id is already handled: no stroke, and the Watch still
 * gets ok. No GPS and no club mark.
 */
async function applyWatchPenalty(
  token: string,
  pick: { id: string; reason: 'water' | 'ob' | 'unplayable' | 'other'; at: string; holeNumber: number },
): Promise<void> {
  const ctx = context;
  if (!ctx) {
    queueWatchPenaltyEvent({ token, json: JSON.stringify(pick), id: pick.id });
    return;
  }
  if (ctx.readOnly) {
    await replyToken(token, { ok: false, feedback: WATCH_PENALTY_SAVE_FAILED });
    return;
  }
  const hole = getHole(ctx.db, ctx.roundId, pick.holeNumber);
  if (!hole) {
    await replyToken(token, { ok: false, feedback: WATCH_PENALTY_SAVE_FAILED });
    return;
  }
  const planned = planWatchPenaltyInsert({
    id: pick.id,
    reason: pick.reason,
    shots: listShotsForHole(ctx.db, hole.id),
  });
  try {
    const saved = insertPenalty(ctx.db, {
      id: planned.id,
      holeId: hole.id,
      par: hole.par,
      currentScore: hole.score,
      strokes: planned.strokes,
      reason: planned.reason,
      note: planned.note,
      kind: planned.kind,
      afterShotId: planned.afterShotId,
      afterShotSeq: planned.afterShotSeq,
    });
    // Existing row and tombstone both mean the id is done. Reply ok either way.
    if (saved.replay === 'deleted' || saved.replay === 'existing' || saved.replay === 'inserted') {
      ctx.bump();
      await republishWatchHoleShots();
      await pushWatchConfirm('penalty', pick.id);
      await replyToken(token, { ok: true, feedback: formatWatchPenaltyFeedback(pick.reason) });
      return;
    }
  } catch {
    await replyToken(token, { ok: false, feedback: WATCH_PENALTY_SAVE_FAILED });
    return;
  }
}

/**
 * Watch Undo runs the phone's Undo last shot on the phone's current hole, only
 * while the named shot is still the last one. A resend (Retry, sendMessage plus
 * transferUserInfo) finds the shot gone and replies ok without removing another.
 * Putts and penalties are separate rows and are never touched. No shot hold.
 */
async function applyWatchShotUndo(token: string, undo: ShotUndoMessage): Promise<void> {
  const ctx = context;
  if (!ctx) {
    queueWatchShotUndoEvent({ token, json: JSON.stringify(undo), id: undo.id });
    return;
  }
  if (ctx.readOnly) {
    await replyToken(token, { ok: false, feedback: WATCH_SHOT_UNDO_FAILED });
    return;
  }
  const hole = getHole(ctx.db, ctx.roundId, undo.holeNumber);
  const decision = planWatchShotUndo({
    shotId: undo.shotId,
    holeNumber: undo.holeNumber,
    currentHole: ctx.holeNumber,
    shots: hole ? listShotsForHole(ctx.db, hole.id) : [],
  });
  if (decision.action !== 'undo') {
    await republishWatchHoleShots();
    await pushWatchConfirm('undo', undo.id, decision.feedback);
    await replyToken(token, { ok: true, feedback: decision.feedback });
    return;
  }
  try {
    const result = undoLastShot(ctx.db, ctx.roundId, undo.holeNumber, undo.shotId);
    if (!result.ok) {
      // Checked again inside the repo: the shot is no longer the last one. Remove nothing.
      await republishWatchHoleShots();
      await pushWatchConfirm('undo', undo.id, WATCH_SHOT_UNDO_SKIPPED);
      await replyToken(token, { ok: true, feedback: WATCH_SHOT_UNDO_SKIPPED });
      return;
    }
    // The same club may be marked again right away; the double-tap guard is for the undone mark.
    lastClubMark = null;
    hapticSelect();
    ctx.bump();
    await republishWatchHoleShots();
    await pushWatchConfirm('undo', undo.id, decision.feedback);
    await replyToken(token, { ok: true, feedback: decision.feedback });
  } catch {
    await replyToken(token, { ok: false, feedback: WATCH_SHOT_UNDO_FAILED });
  }
}

async function flushPendingShotUndos(): Promise<void> {
  const rows = drainWatchShotUndoQueue();
  for (const row of rows) {
    await handlePick(row.token, row.json);
  }
}

/**
 * Change club on the last shot only. Same id (Retry, sendMessage, and
 * transferUserInfo) applies once. A shot that is no longer last, another hole,
 * or the putter replies ok and changes nothing. Coordinates stay. No shot hold.
 */
async function applyWatchShotClubChange(token: string, change: ShotClubChangeMessage): Promise<void> {
  const ctx = context;
  if (!ctx) {
    queueWatchShotClubChangeEvent({ token, json: JSON.stringify(change), id: change.id });
    return;
  }
  if (ctx.readOnly) {
    await replyToken(token, { ok: false, feedback: WATCH_CLUB_CHANGE_FAILED });
    return;
  }
  const hole = getHole(ctx.db, ctx.roundId, change.holeNumber);
  const shots = hole ? listShotsForHole(ctx.db, hole.id) : [];
  const decision = planWatchShotClubChange({
    id: change.id,
    shotId: change.shotId,
    clubId: change.clubId,
    holeNumber: change.holeNumber,
    currentHole: ctx.holeNumber,
    shots,
    alreadyApplied: watchClubChangeAlreadyApplied(change.id),
  });
  if (decision.action !== 'apply') {
    await republishWatchHoleShots();
    await pushWatchConfirm('club', change.id, decision.feedback);
    await replyToken(token, { ok: true, feedback: decision.feedback });
    return;
  }
  try {
    const saved = changeShotClub(ctx.db, { roundId: ctx.roundId, shotId: change.shotId, clubId: change.clubId });
    if (saved.status !== 'commit') {
      await republishWatchHoleShots();
      await pushWatchConfirm('club', change.id, WATCH_CLUB_CHANGE_UNCHANGED);
      await replyToken(token, { ok: true, feedback: WATCH_CLUB_CHANGE_UNCHANGED });
      return;
    }
    rememberWatchClubChange(change.id);
    ctx.bump();
    await republishWatchHoleShots();
    await pushWatchConfirm('club', change.id, decision.feedback);
    await replyToken(token, { ok: true, feedback: decision.feedback });
  } catch {
    await replyToken(token, { ok: false, feedback: WATCH_CLUB_CHANGE_FAILED });
  }
}

async function flushPendingShotClubChanges(): Promise<void> {
  const rows = drainWatchShotClubChangeQueue();
  for (const row of rows) {
    await handlePick(row.token, row.json);
  }
}

async function flushPendingPenalties(): Promise<void> {
  const rows = drainWatchPenaltyQueue();
  for (const row of rows) {
    await handlePick(row.token, row.json);
  }
}

async function flushPendingClubPicks(holeNumber: number): Promise<void> {
  const rows = drainWatchClubPickQueueForHole(holeNumber);
  if (
    watchFinishShotOverlayBlocksClubPick({
      currentHole: holeNumber,
      openShotHoles: context?.openShotHoles,
    })
  ) {
    return;
  }
  for (const row of rows) {
    await handlePick(row.token, row.json);
  }
}

let puttPickTail: Promise<void> = Promise.resolve();

function enqueuePuttPick(work: () => Promise<void>): Promise<void> {
  const run = puttPickTail.then(work, work);
  puttPickTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function handlePuttPick(token: string, json: string): Promise<void> {
  return enqueuePuttPick(() => handlePuttPickNow(token, json));
}

async function handlePuttPickNow(token: string, json: string): Promise<void> {
  const pick = (() => {
    try {
      return parsePuttPick(JSON.parse(json) as unknown);
    } catch {
      return null;
    }
  })();
  if (!pick) {
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
    return;
  }
  const ctx = context;
  if (!ctx || !ctx.onPuttPick) {
    queueWatchPuttPickEvent({ token, json, at: pick.at });
    return;
  }
  if (ctx.readOnly) {
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
    return;
  }
  if (!watchPuttPickShouldApply(pick.at)) {
    await replyToken(token, { ok: true, feedback: PUTTS_ON_WATCH });
    return;
  }
  try {
    const result = await ctx.onPuttPick(pick);
    if (!result.ok) forgetWatchPuttPickAt(pick.at);
    if (result.ok && pick.action === 'made') {
      hapticMark();
    } else if (result.ok) {
      hapticSelect();
    } else {
      hapticWarn();
    }
    await replyToken(token, result.ok ? result : { ok: false, feedback: result.feedback || PHONE_UNAVAILABLE });
  } catch {
    forgetWatchPuttPickAt(pick.at);
    hapticWarn();
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
  }
}

async function flushPendingPuttPicks(): Promise<void> {
  const rows = drainWatchPuttPickQueue();
  for (const row of rows) {
    await handlePuttPick(row.token, row.json);
  }
}

export function startWatchClubBridge(): void {
  if (started) return;
  started = true;
  const mod = native();
  if (!mod) return;
  mod.addListener('onClubPick', (event) => {
    if (!event?.json || !event.token) return;
    void handlePick(event.token, event.json);
  });
  mod.addListener('onPuttPick', (event) => {
    if (!event?.json || !event.token) return;
    void handlePuttPick(event.token, event.json);
  });
  mod.addListener('onReachabilityChange', (event) => {
    if (event?.reachable === true) void republishWatchHoleShots();
  });
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void republishWatchHoleShots();
  });
}

export { MADE_IT_FEEDBACK, PUTTS_ON_WATCH };
