import { Alert } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getWatchBridgeNative } from '@/modules/watch-bridge';
import { COPY } from '../domain/playerCopy';
import { watchBagLabelForPush, watchClubListTop3 } from '../domain/watchClubPick';
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
  toWatchYardsQuality,
  type ClubListMessage,
  type ClubPickReply,
  type PuttPickMessage,
  type PuttPickReply,
  type PuttSheetMessage,
} from '../domain/watchMessages';
import type { PuttLengthId } from '../domain/putts';
import {
  drainWatchClubPickQueueForHole,
  gateWatchClubPick,
  queueWatchClubPickEvent,
  watchClubPickShouldApply,
} from '../domain/watchClubQueue';
import {
  drainWatchPuttPickQueue,
  forgetWatchPuttPickAt,
  queueWatchPuttPickEvent,
  watchPuttPickShouldApply,
} from '../domain/watchPuttSync';
import { hapticMark, hapticSelect, hapticWarn } from '../ui/haptics';
import { markShotWithClub, promptForPlan } from './shotActions';
import { handleWatchNearbyJson, isWatchNearbyJson } from './watchNearby';

export type WatchClubContext = {
  db: SQLiteDatabase;
  roundId: string;
  holeNumber: number;
  readOnly: boolean;
  tee?: { lat: number; lng: number } | null;
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
let lastPuttJson = '';
let lastClubMark: { clubId: string; appliedAtMs: number } | null = null;

function native() {
  return getWatchBridgeNative();
}

export function watchBridgeAvailable(): boolean {
  return native()?.isSupported() === true;
}

export function setWatchClubContext(next: WatchClubContext | null): void {
  context = next;
  if (next) {
    void flushPendingClubPicks(next.holeNumber);
    void flushPendingPuttPicks();
  }
}

export async function pushWatchClubList(msg: ClubListMessage): Promise<void> {
  const json = JSON.stringify(msg);
  if (json === lastJson) return;
  const mod = native();
  if (!mod) return;
  try {
    await mod.pushClubListJson(json);
    lastJson = json;
  } catch {
    // Watch is best-effort on Simulator / Android / web.
  }
}

export async function pushWatchPuttSheet(args: {
  open: boolean;
  holeNumber: number;
  lengths: PuttLengthId[];
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

export function buildClubList(args: {
  top3: { id: string; shortName: string }[];
  bag: { id: string; shortName: string }[];
  holeNumber: number;
  yardsToGreen: number | null;
  yardsQuality: 'good' | 'soft' | 'forced' | 'none';
  lastClubId?: string | null;
  selectedClubId?: string | null;
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
  return clubListPayload({
    top3: watchClubListTop3(args.top3.map((club) => club.id)),
    bag: args.bag.map((club) => club.id),
    labels,
    holeNumber: args.holeNumber,
    yardsToGreen: args.yardsToGreen,
    yardsQuality: toWatchYardsQuality(args.yardsQuality),
    lastClubId: args.lastClubId ?? null,
    selectedClubId: args.selectedClubId ?? null,
  });
}

async function replyToken(token: string, payload: ClubPickReply | PuttPickReply): Promise<void> {
  const mod = native();
  if (!mod) return;
  try {
    await mod.replyClubPick(token, JSON.stringify(payload));
  } catch {
    // reply is best-effort
  }
}

async function handlePick(token: string, json: string): Promise<void> {
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

async function flushPendingClubPicks(holeNumber: number): Promise<void> {
  const rows = drainWatchClubPickQueueForHole(holeNumber);
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
}

export { MADE_IT_FEEDBACK, PUTTS_ON_WATCH };
