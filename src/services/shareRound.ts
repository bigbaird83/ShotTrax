import * as Linking from 'expo-linking';
import { InteractionManager, Share } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import {
  ensureRoundShareToken,
  getClubMap,
  getHole,
  getRound,
  listHoles,
  listPenaltiesForHole,
  listShotsForHole,
  putShareBoard,
} from '../db/repo';
import { encodeScoreSnapshot, formatLiveBoardShare, normalizeShareBoardCode } from '../domain/liveBoard';
import { totalPenaltyStrokes } from '../domain/penalty';
import { planScorecard, type ScorecardHole } from '../domain/scorecard';
import { planScorecardImage, renderScorecardPng } from '../domain/scorecardImage';
import {
  formatShareScorecard,
  planSpectatorPayload,
  scorecardImageShareContent,
  shareSheetContent,
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

async function writeScorecardPngFile(png: Uint8Array): Promise<string | null> {
  try {
    const { File, Paths } = await import('expo-file-system');
    const file = new File(Paths.cache, 'shottrax-scorecard.png');
    file.write(png);
    const uri = file.uri;
    return uri.startsWith('file:') ? uri : `file://${uri}`;
  } catch {
    return null;
  }
}

function planRoundShare(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): {
  payload: SpectatorPayload;
  message: string;
  holes: { hole: number; score: number | null }[];
  scorecard: ScorecardHole[];
} | null {
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
    par: hole.par,
    putts: hole.puttsDone ? hole.putts : null,
    startedAt: hole.startedAt,
    completedAt: hole.completedAt,
    shots: listShotsForHole(db, hole.id).map((shot) => ({
      clubShortName: shot.clubId ? clubs[shot.clubId]?.shortName ?? null : null,
      distanceYards: shot.distanceYards,
      startedAt: shot.startedAt,
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
    updatedAt: new Date().toISOString(),
  });
  const cardHoles = holes.map((hole) => ({ hole: hole.number, score: hole.score }));
  // Same rows as the in-app scorecard. A finished round flags every unclosed hole.
  const scorecard = planScorecard(
    holes.map((hole) => ({
      number: hole.number,
      par: hole.par,
      score: hole.score,
      putts: hole.putts,
      puttsDone: hole.puttsDone,
      shotCount: listShotsForHole(db, hole.id).length,
      penaltyStrokes: totalPenaltyStrokes(listPenaltiesForHole(db, hole.id)),
    })),
    { currentHoleNumber: round.finishedAt != null ? undefined : current },
  );
  return {
    payload,
    holes: cardHoles,
    scorecard,
    message: formatShareScorecard({
      courseName: payload.courseName,
      holes: cardHoles,
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

/** Token-only link. Never pasted into Messages as a `?p=` body. */
export function spectatorShareUrl(payload: SpectatorPayload): string {
  return Linking.createURL(`/s/${payload.token}`);
}

export function liveBoardShareUrl(payload: SpectatorPayload): string {
  const snapshot = encodeScoreSnapshot(
    payload.holes.map((row) => ({ hole: row.hole, score: row.score })),
  );
  return Linking.createURL(`/s/${payload.token}`, snapshot ? { queryParams: { h: snapshot } } : undefined);
}

export function formatRoundShareMessage(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): string | null {
  return planRoundShare(db, roundId, args)?.message ?? null;
}

export function publishRoundScoreboard(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): SpectatorPayload | null {
  const planned = planRoundShare(db, roundId, args);
  if (!planned) return null;
  putShareBoard(db, planned.payload);
  void putSharedPayload(planned.payload.token, planned.payload);
  return planned.payload;
}

async function presentShare(
  content: { message: string; title: string; url?: string } | { url: string },
  options?: { anchor?: number },
): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) => {
      waitForShareHost(() => {
        Share.share(content, options).then(() => resolve(), reject);
      });
    });
    return true;
  } catch {
    return false;
  }
}

export async function shareRoundSnapshot(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number; anchor?: number | null },
): Promise<boolean> {
  const planned = planRoundShare(db, roundId, args);
  if (!planned) return false;
  publishRoundScoreboard(db, roundId, args);
  let imageUrl: string | null = null;
  try {
    const png = renderScorecardPng(
      planScorecardImage({
        courseName: planned.payload.courseName,
        holes: planned.scorecard,
        finished: planned.payload.finished,
      }),
    );
    imageUrl = await writeScorecardPngFile(png);
  } catch {
    imageUrl = null;
  }
  // Image only — no message body, no hole list, no link. No image → fail, never a text dump.
  const content = scorecardImageShareContent(imageUrl);
  if (!content) return false;
  const options = args?.anchor != null ? { anchor: args.anchor } : undefined;
  return presentShare(content, options);
}

export async function shareLiveBoard(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number; anchor?: number | null },
): Promise<boolean> {
  const planned = planRoundShare(db, roundId, args);
  if (!planned) return false;
  publishRoundScoreboard(db, roundId, args);
  const code = normalizeShareBoardCode(planned.payload.token) ?? planned.payload.token;
  const message = formatLiveBoardShare({
    courseName: planned.payload.courseName,
    code,
    url: liveBoardShareUrl(planned.payload),
    holes: planned.holes,
  });
  const options = args?.anchor != null ? { anchor: args.anchor } : undefined;
  return presentShare(shareSheetContent({ message }), options);
}
