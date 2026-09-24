import { COPY, SHOTTRAXX_BRAND } from './playerCopy';
import { shareMessageIncludesPayloadQuery, type ShareScorecardHole, shareScorecardTotal } from './spectator';

export const LIVE_BOARD_POLL_MS = 8000;

/** Short verbal code. Same value as the share token for new boards. */
const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newShareBoardCode(): string {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += SHARE_CODE_ALPHABET[Math.floor(Math.random() * SHARE_CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * One lookup key for the typed code, the `/s/{code}` deep link, the local
 * share_boards row, and the share-host PUT/GET. Short codes are trimmed,
 * de-spaced, and uppercased ("bk3 mcq" → "BK3MCQ"). A pasted share link
 * yields its `/s/{code}`. Long legacy tokens stay as-is.
 */
export function normalizeShareBoardCode(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  const fromLink = /\/s\/([^/?#\s]+)/.exec(trimmed);
  let core = fromLink ? fromLink[1] : trimmed;
  try {
    core = decodeURIComponent(core);
  } catch {
    // Keep the raw segment.
  }
  core = core.trim();
  const compact = core.replace(/[\s-]+/g, '');
  if (!compact) return null;
  if (compact.length <= 8) return compact.toUpperCase();
  return core;
}

export function liveBoardShowsMap(): false {
  return false;
}

export function liveBoardShowsGps(): false {
  return false;
}

export function liveBoardShowsLatLon(): false {
  return false;
}

export function liveBoardNeedsViewerLocation(): false {
  return false;
}

/** Compact hole scores for a first paint. Never a GPS payload. */
export function encodeScoreSnapshot(holes: ShareScorecardHole[]): string {
  return [...holes]
    .sort((a, b) => a.hole - b.hole)
    .map((row) => (row.score == null || !Number.isFinite(row.score) ? '' : String(Math.round(row.score))))
    .join('.');
}

export function decodeScoreSnapshot(raw: string | null | undefined): (number | null)[] {
  if (raw == null || !raw.trim()) return [];
  return raw.split('.').map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.round(n) : null;
  });
}

export function snapshotQueryIncludesPayload(text: string): boolean {
  return shareMessageIncludesPayloadQuery(text);
}

/**
 * Friends read hole scores. No club path, no map, no GPS.
 * Optional token-only / snapshot URL — never `?p=`.
 */
export function formatLiveBoardShare(args: {
  courseName?: string | null;
  code: string;
  url?: string | null;
  holes: ShareScorecardHole[];
}): string {
  const course = args.courseName?.trim() ? args.courseName.trim() : 'Round';
  const total = shareScorecardTotal(args.holes);
  const headline = total == null ? course : `${course} · ${total}`;
  const rows = [...args.holes]
    .sort((a, b) => a.hole - b.hole)
    .map((row) => `${row.hole}  ${row.score == null ? '—' : String(row.score)}`);
  const lines = [`${SHOTTRAXX_BRAND} live board`, headline, `Code ${args.code}`, ...rows];
  const url = args.url?.trim();
  if (url && !shareMessageIncludesPayloadQuery(url)) lines.push(url);
  lines.push(COPY.liveBoardPrivacy);
  return lines.join('\n');
}
