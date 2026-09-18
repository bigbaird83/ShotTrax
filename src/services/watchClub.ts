import { Alert } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getWatchBridgeNative } from '@/modules/watch-bridge';
import { COPY } from '../domain/playerCopy';
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
  labelForClub: (clubId: string) => string | null;
};

let context: WatchClubContext | null = null;
let started = false;
let lastJson = '';
let lastPuttJson = '';

function native() {
  return getWatchBridgeNative();
}

export function watchBridgeAvailable(): boolean {
  return native()?.isSupported() === true;
}

export function setWatchClubContext(next: WatchClubContext | null): void {
  context = next;
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
}): ClubListMessage {
  const labels: Record<string, string> = {};
  for (const club of [...args.top3, ...args.bag]) {
    labels[club.id] = club.shortName;
  }
  return clubListPayload({
    top3: args.top3.map((club) => club.id),
    bag: args.bag.map((club) => club.id),
    labels,
    holeNumber: args.holeNumber,
    yardsToGreen: args.yardsToGreen,
    yardsQuality: toWatchYardsQuality(args.yardsQuality),
    lastClubId: args.lastClubId ?? null,
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
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
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
  const label = ctx.labelForClub(pick.clubId) ?? pick.clubId;
  const watchFix = watchFixFromPick(pick);
  try {
    // Club tap / Watch tap / Same club — the only Watch path that runs acceptFix.
    const { plan } = await markShotWithClub(ctx.db, {
      roundId: ctx.roundId,
      holeNumber: ctx.holeNumber,
      clubId: pick.clubId,
      watchFix,
      tee: ctx.tee ?? null,
    });
    const waiting = promptForPlan(plan, () => {
      void (async () => {
        try {
          const forced = await markShotWithClub(ctx.db, {
            roundId: ctx.roundId,
            holeNumber: ctx.holeNumber,
            clubId: pick.clubId,
            force: true,
            watchFix,
            tee: ctx.tee ?? null,
          });
          if (forced.plan.status === 'commit') {
            hapticMark();
            ctx.bump();
            ctx.onMarked?.();
          }
        } catch {
          hapticWarn();
        }
      })();
    });
    if (waiting) {
      hapticWarn();
      await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
      return;
    }
    if (plan.status === 'commit') {
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

async function handlePuttPick(token: string, json: string): Promise<void> {
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
  if (!ctx || ctx.readOnly || !ctx.onPuttPick) {
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
    return;
  }
  try {
    const result = await ctx.onPuttPick(pick);
    if (result.ok && pick.action === 'made') {
      hapticMark();
    } else if (result.ok) {
      hapticSelect();
    } else {
      hapticWarn();
    }
    await replyToken(token, result.ok ? result : { ok: false, feedback: result.feedback || PHONE_UNAVAILABLE });
  } catch {
    hapticWarn();
    await replyToken(token, { ok: false, feedback: PHONE_UNAVAILABLE });
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
