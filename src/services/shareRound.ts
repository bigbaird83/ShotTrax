import * as Linking from 'expo-linking';
import { InteractionManager, Platform, Share } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { encodeScoreSnapshot, formatLiveBoardShare, normalizeShareBoardCode } from '../domain/liveBoard';
import { planScorecardImage, renderScorecardPng } from '../domain/scorecardImage';
import {
  androidImageUrlShareBlock,
  scorecardImageShareContent,
  shareSheetContent,
  type SpectatorPayload,
} from '../domain/spectator';
import { planRoundShare, publishExplicitRoundShare } from './roundScoreboard';

export {
  buildRoundSpectatorPayload,
  formatRoundShareMessage,
  publishRoundScoreboard,
} from './roundScoreboard';

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

async function presentShare(
  content: { message: string; title: string; url?: string } | { url: string },
  options?: { anchor?: number },
): Promise<boolean> {
  // Android image-only `{ url }` opens an empty chooser and still resolves.
  if (androidImageUrlShareBlock(content, Platform.OS)) return false;
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
): Promise<boolean | string> {
  const planned = planRoundShare(db, roundId, args);
  if (!planned) return false;
  publishExplicitRoundShare(db, roundId, args);
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
  // Preflight the payload. Android cannot carry image `url`; toast instead of a dead sheet.
  const blocked = androidImageUrlShareBlock(content, Platform.OS);
  if (blocked) return blocked;
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
  publishExplicitRoundShare(db, roundId, args);
  const code = normalizeShareBoardCode(planned.payload.token) ?? planned.payload.token;
  const message = formatLiveBoardShare({
    code,
    url: liveBoardShareUrl(planned.payload),
  });
  const options = args?.anchor != null ? { anchor: args.anchor } : undefined;
  return presentShare(shareSheetContent({ message }), options);
}
