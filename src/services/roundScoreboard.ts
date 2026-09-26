import type { SQLiteDatabase } from 'expo-sqlite';
import { loadGroup, listGroupPlayers } from '../db/groupRepo';
import {
  ensureRoundShareToken,
  getClubMap,
  getHole,
  getRound,
  getRoundShareAudience,
  isRoundShared,
  listHoles,
  listPenaltiesForHole,
  listShotsForHole,
  markRoundShared,
  putShareBoard,
  setRoundShareAudience,
} from '../db/repo';
import { planSpectatorGroup } from '../domain/groupScorecard';
import { totalPenaltyStrokes } from '../domain/penalty';
import { planScorecard, type ScorecardHole } from '../domain/scorecard';
import { shareAudienceForPublish, type ScorecardAudience } from '../domain/shareChoice';
import { formatShareScorecard, planSpectatorPayload, type SpectatorHoleInput, type SpectatorPayload } from '../domain/spectator';

export type SharedPayloadUpload = (
  token: string,
  payload: SpectatorPayload,
) => Promise<boolean> | boolean;

type RoundSharePlan = {
  payload: SpectatorPayload;
  message: string;
  holes: { hole: number; score: number | null }[];
  scorecard: ScorecardHole[];
};

export type PublishRoundScoreboardArgs = {
  currentHoleNumber?: number;
  /** Test seam. Production uses `putSharedPayload` in shareSync. */
  upload?: SharedPayloadUpload;
  /** Whole group or Just me. Omitted calls follow the choice stored for this round. */
  audience?: ScorecardAudience;
};

export function planRoundShare(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number; audience?: ScorecardAudience },
): RoundSharePlan | null {
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
  const partnerCount = listGroupPlayers(db, round.id).filter((player) => !player.isMe).length;
  const choice = shareAudienceForPublish({
    explicit: args?.audience,
    stored: getRoundShareAudience(db, round.id),
    partnerCount,
  });
  if (choice === 'group') {
    const snapshot = loadGroup(db, round.id);
    const group = planSpectatorGroup({
      holes: snapshot.holes,
      players: snapshot.players,
      settings: snapshot.settings,
    });
    if (group) payload.group = group;
  }
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

/** Production uploader. Loaded only when a shared round actually publishes. */
function uploadSharedPayload(token: string, payload: SpectatorPayload): Promise<boolean> {
  return import('./shareSync').then(({ putSharedPayload }) => putSharedPayload(token, payload));
}

/**
 * Hole changes, hole close, and the live-board screen call this.
 * No local board write and no worker PUT until this round has been shared.
 */
export function publishRoundScoreboard(
  db: SQLiteDatabase,
  roundId: string,
  args?: PublishRoundScoreboardArgs,
): SpectatorPayload | null {
  if (!isRoundShared(db, roundId)) return null;
  const planned = planRoundShare(db, roundId, args);
  if (!planned) return null;
  putShareBoard(db, planned.payload);
  const upload = args?.upload ?? uploadSharedPayload;
  void Promise.resolve(upload(planned.payload.token, planned.payload));
  return planned.payload;
}

/** Summary Share and live-board Share. Sets the per-round flag, then uploads. */
export function publishExplicitRoundShare(
  db: SQLiteDatabase,
  roundId: string,
  args?: PublishRoundScoreboardArgs,
): SpectatorPayload | null {
  if (!getRound(db, roundId)) return null;
  if (args?.audience === 'group' || args?.audience === 'me') {
    setRoundShareAudience(db, roundId, args.audience);
  }
  markRoundShared(db, roundId);
  return publishRoundScoreboard(db, roundId, args);
}

export function buildRoundSpectatorPayload(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): SpectatorPayload | null {
  return planRoundShare(db, roundId, args)?.payload ?? null;
}

export function formatRoundShareMessage(
  db: SQLiteDatabase,
  roundId: string,
  args?: { currentHoleNumber?: number },
): string | null {
  return planRoundShare(db, roundId, args)?.message ?? null;
}
