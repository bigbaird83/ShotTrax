import * as Linking from 'expo-linking';
import { InteractionManager, Share } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureRoundShareToken, getClubMap, getHole, getRound, listHoles, listShotsForHole } from '../db/repo';
import {
  formatShareScorecard,
  planSpectatorPayload,
  type SpectatorHoleInput,
  type SpectatorPayload,
} from '../domain/spectator';
import { putSharedPayload } from './shareSync';

/** Present only after the current Modal/nav transition has released the host screen. */
export function waitForShareHost(run: () => void): void {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(run);
  });
}

function planRoundShare(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): { payload: SpectatorPayload; message: string } | null {
  const round = getRound(db, roundId);
  if (!round) return null;
  const clubs = getClubMap(db);
  const holes = listHoles(db, round.id);
  const current =
    args?.currentHoleNumber ??
    holes.find((hole) => hole.score == null)?.number ??
    holes[holes.length - 1]?.number ??
    1;
  const input: SpectatorHoleInput[] = holes.map((hole) => ({
    number: hole.number,
    score: hole.score,
    cardYards: hole.yards,
    shots: listShotsForHole(db, hole.id).map((shot) => ({
      clubShortName: shot.clubId ? clubs[shot.clubId]?.shortName ?? null : null,
      distanceYards: shot.distanceYards,
      endedAt: shot.endedAt,
      source: shot.source,
      fixQuality: shot.fixQuality,
    })),
  }));
  const payload = planSpectatorPayload({
    token: ensureRoundShareToken(db, round.id),
    courseName: round.courseName,
    finished: round.finishedAt != null,
    currentHoleNumber: getHole(db, round.id, current)?.number ?? current,
    holes: input,
  });
  return {
    payload,
    message: formatShareScorecard({
      courseName: payload.courseName,
      holes: holes.map((hole) => ({ hole: hole.number, score: hole.score })),
      lastClubYards: payload.live?.lastClubYards ?? null,
    }),
  };
}

export function buildRoundSpectatorPayload(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): SpectatorPayload | null {
  return planRoundShare(db, roundId, args)?.payload ?? null;
}

/** Token-only link. Never pasted into Messages — `?p=` stays out of the share sheet. */
export function spectatorShareUrl(payload: SpectatorPayload): string {
  return Linking.createURL(`/s/${payload.token}`);
}

export function formatRoundShareMessage(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): string | null {
  return planRoundShare(db, roundId, args)?.message ?? null;
}

export async function shareRoundSnapshot(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number; anchor?: number | null },
): Promise<boolean> {
  const planned = planRoundShare(db, roundId, args);
  if (!planned) return false;
  void putSharedPayload(planned.payload.token, planned.payload);
  const options = args?.anchor != null ? { anchor: args.anchor } : undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      waitForShareHost(() => {
        Share.share({ message: planned.message, title: 'ShotTraxx' }, options).then(() => resolve(), reject);
      });
    });
    return true;
  } catch {
    return false;
  }
}
