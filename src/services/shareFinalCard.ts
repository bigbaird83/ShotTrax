import { InteractionManager, Platform, Share } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getRound, listHoles, listPenaltiesForHole, listShotsForHole } from '../db/repo';
import {
  finalCardPlayedAt,
  formatFinalCardSummary,
  planFinalCard,
  planFinalCardImage,
  roundCompleteForFinalCard,
} from '../domain/finalCard';
import { totalPenaltyStrokes } from '../domain/penalty';
import { planScorecard } from '../domain/scorecard';
import { renderScorecardPng } from '../domain/scorecardImage';
import { androidImageUrlShareBlock, shareSheetContent } from '../domain/spectator';

/**
 * Opt-in final card for a finished round.
 * The share sheet opens only when this function runs (the button tap).
 * Built from rows already on the phone. Does not publish the live board
 * and does not call the share-sync Worker.
 */
export async function shareFinalCard(
  db: SQLiteDatabase,
  roundId: string,
  args?: { anchor?: number | null },
): Promise<boolean | string> {
  const round = getRound(db, roundId);
  if (!round) return false;
  const holes = listHoles(db, round.id);
  if (
    !roundCompleteForFinalCard({
      finishedAt: round.finishedAt,
      holeCount: round.holeCount,
      holes,
    })
  ) {
    return false;
  }

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
  );
  const card = planFinalCard({
    courseName: round.courseName,
    playedAt: finalCardPlayedAt({
      finishedAt: round.finishedAt,
      startedAt: round.startedAt,
      holes,
    }),
    holes: scorecard.map((hole) => ({ number: hole.number, par: hole.par, score: hole.score })),
  });
  const message = formatFinalCardSummary(card);
  let imageUrl: string | null = null;
  try {
    const png = renderScorecardPng(
      planFinalCardImage({
        courseName: round.courseName,
        holes: scorecard,
        scoreVsPar: card.scoreVsPar,
      }),
    );
    imageUrl = await writeFinalCardPng(png);
  } catch {
    imageUrl = null;
  }

  const content = shareSheetContent({ message, imageUrl });
  const blocked = androidImageUrlShareBlock(content, Platform.OS);
  if (blocked) return blocked;
  const options = args?.anchor != null ? { anchor: args.anchor } : undefined;
  return presentFinalCardShare(content, options);
}

async function writeFinalCardPng(png: Uint8Array): Promise<string | null> {
  try {
    const { File, Paths } = await import('expo-file-system');
    const file = new File(Paths.cache, 'shottrax-final-card.png');
    file.write(png);
    const uri = file.uri;
    return uri.startsWith('file:') ? uri : `file://${uri}`;
  } catch {
    return null;
  }
}

async function presentFinalCardShare(
  content: { message: string; title: string; url?: string },
  options?: { anchor?: number },
): Promise<boolean> {
  if (androidImageUrlShareBlock(content, Platform.OS)) return false;
  try {
    await new Promise<void>((resolve, reject) => {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          Share.share(content, options).then(() => resolve(), reject);
        });
      });
    });
    return true;
  } catch {
    return false;
  }
}
