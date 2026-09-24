import { shareMessageIncludesPayloadQuery, type ShareScorecardHole } from './spectator';

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
 * Live-round share sheet / message body: the board code and the join link.
 * Course name, totals, and per-hole scores stay off this text — friends
 * read the card on the board the link opens. A `?p=` spectator body is dropped.
 * `holes` / `courseName` are accepted so a caller can pass the card and
 * still get code + link only.
 */
export function formatLiveBoardShare(args: {
  code: string;
  url?: string | null;
  courseName?: string | null;
  holes?: ShareScorecardHole[];
}): string {
  void args.courseName;
  void args.holes;
  const lines: string[] = [];
  const code = args.code.trim();
  if (code) lines.push(code);
  const url = args.url?.trim();
  if (url && !shareMessageIncludesPayloadQuery(url)) lines.push(url);
  return lines.join('\n');
}
