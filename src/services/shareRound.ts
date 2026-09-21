import * as Linking from 'expo-linking';
import { InteractionManager, Share } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureRoundShareToken, getClubMap, getHole, getRound, listHoles, listShotsForHole } from '../db/repo';
import {
  encodeSpectatorPayload,
  formatSpectatorShareText,
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

export function buildRoundSpectatorPayload(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): SpectatorPayload | null {
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
  return planSpectatorPayload({
    token: ensureRoundShareToken(db, round.id),
    courseName: round.courseName,
    finished: round.finishedAt != null,
    currentHoleNumber: getHole(db, round.id, current)?.number ?? current,
    holes: input,
  });
}

export function spectatorShareUrl(payload: SpectatorPayload): string {
  return Linking.createURL(`/s/${payload.token}`, {
    queryParams: { p: encodeSpectatorPayload(payload) },
  });
}

export async function shareRoundSnapshot(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number; anchor?: number | null },
): Promise<boolean> {
  const payload = buildRoundSpectatorPayload(db, roundId, args);
  if (!payload) return false;
  void putSharedPayload(payload.token, payload);
  const url = spectatorShareUrl(payload);
  const message = `${formatSpectatorShareText(payload)}\n\n${url}`;
  const options = args?.anchor != null ? { anchor: args.anchor } : undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      waitForShareHost(() => {
        Share.share({ message, url, title: 'ShotTraxx' }, options).then(() => resolve(), reject);
      });
    });
    return true;
  } catch {
    return false;
  }
}
