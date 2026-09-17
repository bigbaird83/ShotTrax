import { Alert } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getWatchBridgeNative } from '@/modules/watch-bridge';
import { COPY } from '../domain/playerCopy';
import {
  CHECK_PHONE,
  PHONE_UNAVAILABLE,
  clubListPayload,
  formatClubMarkedFeedback,
  parseClubPick,
  type ClubListMessage,
  type ClubPickReply,
} from '../domain/watchMessages';
import { hapticMark, hapticWarn } from '../ui/haptics';
import { markShotWithClub, promptForPlan } from './shotActions';

export type WatchClubContext = {
  db: SQLiteDatabase;
  roundId: string;
  holeNumber: number;
  readOnly: boolean;
  bump: () => void;
  onMarked?: () => void;
  labelForClub: (clubId: string) => string | null;
};

let context: WatchClubContext | null = null;
let started = false;
let lastJson = '';

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
  const quality = args.yardsQuality === 'forced' ? 'none' : args.yardsQuality;
  return clubListPayload({
    top3: args.top3.map((club) => club.id),
    bag: args.bag.map((club) => club.id),
    labels,
    holeNumber: args.holeNumber,
    yardsToGreen: args.yardsToGreen,
    yardsQuality: quality,
    lastClubId: args.lastClubId ?? null,
  });
}

async function handlePick(token: string, json: string): Promise<void> {
  const mod = native();
  const reply = async (payload: ClubPickReply) => {
    if (!mod) return;
    try {
      await mod.replyClubPick(token, JSON.stringify(payload));
    } catch {
      // reply is best-effort
    }
  };

  const pick = (() => {
    try {
      return parseClubPick(JSON.parse(json) as unknown);
    } catch {
      return null;
    }
  })();
  if (!pick) {
    await reply({ ok: false, feedback: CHECK_PHONE });
    return;
  }
  const ctx = context;
  if (!ctx || ctx.readOnly) {
    await reply({ ok: false, feedback: PHONE_UNAVAILABLE });
    return;
  }

  const label = ctx.labelForClub(pick.clubId) ?? pick.clubId;
  try {
    // Phone owns GPS. Same club=mark as a phone tap: acceptFix now, never silent-force.
    const { plan } = await markShotWithClub(ctx.db, {
      roundId: ctx.roundId,
      holeNumber: ctx.holeNumber,
      clubId: pick.clubId,
    });
    const waiting = promptForPlan(plan, () => {
      void (async () => {
        try {
          const forced = await markShotWithClub(ctx.db, {
            roundId: ctx.roundId,
            holeNumber: ctx.holeNumber,
            clubId: pick.clubId,
            force: true,
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
      await reply({ ok: false, feedback: CHECK_PHONE });
      return;
    }
    if (plan.status === 'commit') {
      hapticMark();
      ctx.bump();
      ctx.onMarked?.();
      await reply({ ok: true, feedback: formatClubMarkedFeedback(label) });
      return;
    }
    await reply({ ok: false, feedback: CHECK_PHONE });
  } catch {
    hapticWarn();
    Alert.alert(COPY.waitingOnLocation, COPY.locationOff, [{ text: COPY.cancel, style: 'cancel' }]);
    await reply({ ok: false, feedback: CHECK_PHONE });
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
}
