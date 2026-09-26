import { COPY, SHOTTRAXX_BRAND } from './playerCopy';
import type { FixQuality, Shot, ShotFixQuality } from './types';

export const SPECTATOR_PAYLOAD_VERSION = 1 as const;

/** Live share is hole + score + last closed club·yards. Never a GPS trail. */
export type SpectatorLiveView = {
  hole: number;
  score: number | null;
  lastClubYards: string | null;
};

export type SpectatorHoleRow = {
  hole: number;
  club: string | null;
  pinToPinYards: number | null;
  score: number | null;
  approximate: boolean;
  /** Live follow. Course par only — null when unknown, never invented. */
  par: number | null;
  /** Putts after Made it / Hole Out. Null while the hole is open. */
  putts: number | null;
  /** ISO time the hole was begun. */
  startedAt: string | null;
  /** ISO time Made it / Hole Out fired. */
  completedAt: string | null;
};

/** One posted hole on the shared group card. Null is unscored — never a filled-in 0. */
export type SpectatorGroupHole = { hole: number; score: number | null };

/**
 * Compact group card for the link page. Handicap is present only when a net
 * game is actually on and this player has one. A blank handicap is omitted,
 * never uploaded as 0.
 */
export type SpectatorGroupPlayer = {
  name: string;
  holes: SpectatorGroupHole[];
  out: number | null;
  in: number | null;
  total: number | null;
  handicap?: number;
};

/** Same standings lines the in-app group results use. Omitted when no side game is on. */
export type SpectatorGroupResult = { title: string; lines: string[] };

export type SpectatorGroup = {
  players: SpectatorGroupPlayer[];
  results?: SpectatorGroupResult[];
};

export type SpectatorPayload = {
  v: typeof SPECTATOR_PAYLOAD_VERSION;
  token: string;
  courseName: string | null;
  finished: boolean;
  live: SpectatorLiveView | null;
  holes: SpectatorHoleRow[];
  /** ISO time the player's phone last published this board. */
  updatedAt: string | null;
  /**
   * Whole-group link page. Absent on Just me and on rounds with no partners.
   * Version stays 1: older builds ignore this field and still render `holes`.
   */
  group?: SpectatorGroup;
};

export type SpectatorShotInput = {
  clubShortName: string | null;
  distanceYards: number | null;
  /** First swing of the hole backs up a missing hole start stamp. */
  startedAt?: string | null;
  endedAt: string | null;
  source: Shot['source'];
  fixQuality: ShotFixQuality | null;
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
};

export type SpectatorHoleInput = {
  number: number;
  score: number | null;
  cardYards?: number | null;
  par?: number | null;
  /** Pass only once putts are entered (Made it / Hole Out). */
  putts?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  shots: SpectatorShotInput[];
};

/** Spectator never needs viewer location. */
export function spectatorNeedsViewerLocation(): false {
  return false;
}

export function spectatorUploadsLiveGpsTrail(): false {
  return false;
}

export function spectatorInventsFromCardYards(): false {
  return false;
}

export function spectatorKeepsApproximateOnSoftForced(): true {
  return true;
}

/** Menu Share fail toast. Lead lock — never swallow. */
export function shareFailToast(): typeof COPY.shareFail {
  return COPY.shareFail;
}

/** Toast copy after Share.share. Success / dismiss stays silent. A string result is already the toast. */
export function toastAfterShareAttempt(
  opened: boolean | string,
  fail: string = shareFailToast(),
): string | null {
  if (typeof opened === 'string') return opened.trim() ? opened : fail;
  return opened ? null : fail;
}

/**
 * Menu is a fullScreen Modal. RN Share.share presents on the hole RNSScreen,
 * which is off-hierarchy until that Modal finishes dismissing. Presenting
 * earlier is a silent iOS drop — the Promise never settles, so no sheet and
 * no fail toast.
 */
export function menuShareMustWaitForDismiss(): true {
  return true;
}

/** Slack after Menu close if Modal onDismiss never fires (Android). iOS slide is ~300ms. */
export const MENU_SHARE_FALLBACK_MS = 600;

export function shouldOpenShareSheet(args: {
  queued: boolean;
  menuVisible: boolean;
  menuDismissed: boolean;
}): boolean {
  return args.queued && !args.menuVisible && args.menuDismissed;
}

/**
 * Any throw / reject becomes the fail toast — never a silent no-op.
 * A string result is a preflight toast (Android image-url gap) and replaces `fail`.
 */
export async function toastFromShareAttempt(
  open: () => Promise<boolean | string>,
  fail: string = shareFailToast(),
): Promise<string | null> {
  try {
    return toastAfterShareAttempt(await open(), fail);
  } catch {
    return fail;
  }
}

/**
 * React Native `Share` on Android sends `message` only and drops `url`.
 * An image-only payload still opens the chooser and the Promise resolves,
 * so the fail toast never runs. That is a dead share.
 * Returns the player toast when the payload must not reach `Share.share`.
 * iOS returns null — `{ url }` still opens the sheet.
 */
export function androidImageUrlShareBlock(
  content: { url?: string | null; message?: string | null } | null | undefined,
  os: string,
): typeof COPY.shareScorecardAndroid | null {
  if (os !== 'android') return null;
  const url = typeof content?.url === 'string' ? content.url.trim() : '';
  if (!url) return null;
  const message = typeof content?.message === 'string' ? content.message.trim() : '';
  if (message.length > 0) return null;
  return COPY.shareScorecardAndroid;
}

/** Messages / the share sheet get a scorecard, never a spectator URL. */
export function shareSheetPassesUrl(): false {
  return false;
}

/** Local PNG only. Spectator `?p=` / http(s) / shottrax links stay out. */
export function shareSheetContent(args: {
  message: string;
  imageUrl?: string | null;
}): { message: string; title: typeof SHOTTRAXX_BRAND; url?: string } {
  const url = args.imageUrl?.trim() ?? '';
  const localPng =
    /^file:\/\//i.test(url) &&
    /\.png$/i.test(url) &&
    !shareMessageIncludesPayloadQuery(url) &&
    !/shottrax:\/\//i.test(url);
  return localPng
    ? { message: args.message, title: SHOTTRAXX_BRAND, url }
    : { message: args.message, title: SHOTTRAXX_BRAND };
}

/** Scorecard Share: the local PNG alone. No message, no link. Anything else → null. */
export function scorecardImageShareContent(imageUrl: string | null | undefined): { url: string } | null {
  const url = shareSheetContent({ message: '', imageUrl }).url;
  return url ? { url } : null;
}

/** Full `?p=` spectator body must never land in the share text. */
export function shareMessageIncludesPayloadQuery(text: string): boolean {
  return /[?&]p=/.test(text);
}

export type ShareScorecardHole = {
  hole: number;
  score: number | null;
};

/** Sum posted scores only. Blank holes stay off the total. */
export function shareScorecardTotal(holes: ShareScorecardHole[]): number | null {
  let sum = 0;
  let n = 0;
  for (const row of holes) {
    if (row.score == null || !Number.isFinite(row.score)) continue;
    sum += row.score;
    n += 1;
  }
  return n === 0 ? null : sum;
}

/**
 * Primary SMS / share body: course · total · hole-by-hole scores.
 * Optional last closed club·yards. No deep link, no GPS.
 */
export function formatShareScorecard(args: {
  courseName?: string | null;
  holes: ShareScorecardHole[];
  lastClubYards?: string | null;
}): string {
  const course = args.courseName?.trim() ? args.courseName.trim() : 'Round';
  const total = shareScorecardTotal(args.holes);
  const headline = total == null ? course : `${course} · ${total}`;
  const rows = [...args.holes]
    .sort((a, b) => a.hole - b.hole)
    .map((row) => `${row.hole}  ${row.score == null ? '—' : String(row.score)}`);
  const lines = [SHOTTRAXX_BRAND, headline, ...rows];
  const last = args.lastClubYards?.trim();
  if (last) lines.push(`Last: ${last}`);
  return lines.join('\n');
}

function isClosedDistanceShot(shot: SpectatorShotInput): boolean {
  if (shot.endedAt == null) return false;
  if (shot.source === 'no_gps') return false;
  return shot.distanceYards != null && Number.isFinite(shot.distanceYards);
}

function isApproximateQuality(quality: ShotFixQuality | null | undefined): boolean {
  return quality === 'soft' || quality === 'forced';
}

function formatClubYards(club: string | null, yards: number | null): string | null {
  if (club == null && yards == null) return null;
  const name = club?.trim() || '—';
  if (yards == null || !Number.isFinite(yards)) return name;
  return `${name} · ${Math.round(yards)}`;
}

/** Last closed shot only. Open / no_gps / card yardage never invent a line. */
export function lastClosedClubYards(shots: SpectatorShotInput[]): string | null {
  const closed = shots.filter(isClosedDistanceShot);
  if (closed.length === 0) return null;
  const last = closed[closed.length - 1];
  const line = formatClubYards(last.clubShortName, last.distanceYards);
  if (!line) return null;
  return isApproximateQuality(last.fixQuality) ? `${line} · ${COPY.approximate}` : line;
}

export function lastClosedShot(shots: SpectatorShotInput[]): SpectatorShotInput | null {
  const closed = shots.filter(isClosedDistanceShot);
  return closed.length > 0 ? closed[closed.length - 1] : null;
}

/** Pin-to-pin yards from a closed GPS/Placed shot. Never scorecard tee yardage. */
export function pinToPinYardsFromShots(shots: SpectatorShotInput[]): number | null {
  const last = lastClosedShot(shots);
  if (last?.distanceYards == null || !Number.isFinite(last.distanceYards)) return null;
  return Math.round(last.distanceYards);
}

export function holeRowIsApproximate(shots: SpectatorShotInput[]): boolean {
  const last = lastClosedShot(shots);
  return last != null && isApproximateQuality(last.fixQuality);
}

export function planSpectatorLive(args: {
  holeNumber: number;
  score: number | null;
  shots: SpectatorShotInput[];
}): SpectatorLiveView {
  return {
    hole: args.holeNumber,
    score: args.score,
    lastClubYards: lastClosedClubYards(args.shots),
  };
}

export function planSpectatorHoleRow(hole: SpectatorHoleInput): SpectatorHoleRow {
  void hole.cardYards;
  const last = lastClosedShot(hole.shots);
  return {
    hole: hole.number,
    club: last?.clubShortName ?? null,
    pinToPinYards: pinToPinYardsFromShots(hole.shots),
    score: hole.score,
    approximate: holeRowIsApproximate(hole.shots),
    par: hole.par ?? null,
    putts: hole.putts ?? null,
    ...planSpectatorHoleTimes(hole),
  };
}

function earliestIso(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const value of values) {
    const iso = asIsoTime(value);
    if (iso && (best == null || Date.parse(iso) < Date.parse(best))) best = iso;
  }
  return best;
}

function latestIso(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const value of values) {
    const iso = asIsoTime(value);
    if (iso && (best == null || Date.parse(iso) > Date.parse(best))) best = iso;
  }
  return best;
}

/**
 * Start / finish for the spectator card. The hole's own stamps win; a hole
 * without one falls back to its first shot start, and a scored hole without
 * a finish stamp to its last shot end. An unscored hole never gets a finish.
 */
export function planSpectatorHoleTimes(hole: SpectatorHoleInput): {
  startedAt: string | null;
  completedAt: string | null;
} {
  const startedAt =
    asIsoTime(hole.startedAt) ?? earliestIso(hole.shots.map((shot) => shot.startedAt ?? shot.endedAt));
  const completedAt =
    asIsoTime(hole.completedAt) ??
    (hole.score != null ? latestIso(hole.shots.map((shot) => shot.endedAt)) : null);
  return { startedAt, completedAt };
}

export function planSpectatorPayload(args: {
  token: string;
  courseName?: string | null;
  finished: boolean;
  currentHoleNumber?: number;
  holes: SpectatorHoleInput[];
  updatedAt?: string | null;
}): SpectatorPayload {
  const holes = [...args.holes]
    .sort((a, b) => a.number - b.number)
    .map((hole) => planSpectatorHoleRow(hole));
  const current =
    args.holes.find((hole) => hole.number === args.currentHoleNumber) ??
    args.holes[args.holes.length - 1] ??
    null;
  return {
    v: SPECTATOR_PAYLOAD_VERSION,
    token: args.token,
    courseName: args.courseName?.trim() ? args.courseName.trim() : null,
    finished: args.finished,
    live: args.finished || !current
      ? null
      : planSpectatorLive({
          holeNumber: current.number,
          score: current.score,
          shots: current.shots,
        }),
    holes,
    updatedAt: asIsoTime(args.updatedAt),
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  const b64 = globalThis.btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = globalThis.atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSpectatorPayload(payload: SpectatorPayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodeSpectatorPayload(raw: string | null | undefined): SpectatorPayload | null {
  if (raw == null || raw.trim() === '') return null;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(raw.trim()));
    return parseSpectatorPayload(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

function asFiniteInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Parseable ISO time or null. A bad stamp is dropped, never guessed. */
export function asIsoTime(value: unknown): string | null {
  const text = asString(value);
  if (!text || !Number.isFinite(Date.parse(text))) return null;
  return text;
}

export function parseSpectatorPayload(raw: unknown): SpectatorPayload | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const token = asString(rec.token);
  if (!token) return null;
  const finished = rec.finished === true;
  const liveRec = rec.live != null && typeof rec.live === 'object' && !Array.isArray(rec.live)
    ? (rec.live as Record<string, unknown>)
    : null;
  const live =
    !finished && liveRec
      ? {
          hole: asFiniteInt(liveRec.hole) ?? 1,
          score: asFiniteInt(liveRec.score),
          lastClubYards: asString(liveRec.lastClubYards),
        }
      : null;
  const holesRaw = Array.isArray(rec.holes) ? rec.holes : [];
  const holes: SpectatorHoleRow[] = [];
  for (const item of holesRaw) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const hole = asFiniteInt(row.hole);
    if (hole == null) continue;
    holes.push({
      hole,
      club: asString(row.club),
      pinToPinYards: asFiniteInt(row.pinToPinYards),
      score: asFiniteInt(row.score),
      approximate: row.approximate === true,
      par: asFiniteInt(row.par),
      putts: asFiniteInt(row.putts),
      startedAt: asIsoTime(row.startedAt),
      completedAt: asIsoTime(row.completedAt),
    });
  }
  const parsed: SpectatorPayload = {
    v: SPECTATOR_PAYLOAD_VERSION,
    token,
    courseName: asString(rec.courseName),
    finished,
    live: finished ? null : live,
    holes,
    updatedAt: asIsoTime(rec.updatedAt),
  };
  // Unknown keys are dropped. A bad `group` is dropped too, so the owner card still parses.
  const group = parseSpectatorGroup(rec.group);
  if (group) parsed.group = group;
  return parsed;
}

function asHoleScore(value: unknown): number | null {
  const score = asFiniteInt(value);
  return score != null && score >= 1 ? score : null;
}

function asTotalStrokes(value: unknown): number | null {
  const total = asFiniteInt(value);
  return total != null && total >= 1 ? total : null;
}

function parseSpectatorGroup(raw: unknown): SpectatorGroup | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const rec = raw as Record<string, unknown>;
  if (!Array.isArray(rec.players)) return undefined;
  const players: SpectatorGroupPlayer[] = [];
  for (const item of rec.players) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = asString(row.name);
    if (!name) continue;
    const holes: SpectatorGroupHole[] = [];
    if (Array.isArray(row.holes)) {
      for (const holeItem of row.holes) {
        if (holeItem == null || typeof holeItem !== 'object' || Array.isArray(holeItem)) continue;
        const holeRow = holeItem as Record<string, unknown>;
        const hole = asFiniteInt(holeRow.hole);
        if (hole == null) continue;
        holes.push({ hole, score: asHoleScore(holeRow.score) });
      }
    }
    const player: SpectatorGroupPlayer = {
      name,
      holes,
      out: asTotalStrokes(row.out),
      in: asTotalStrokes(row.in),
      total: asTotalStrokes(row.total),
    };
    const handicap = asFiniteInt(row.handicap);
    if (handicap != null && handicap >= 0 && handicap <= 54) player.handicap = handicap;
    players.push(player);
  }
  if (!players.length) return undefined;
  const group: SpectatorGroup = { players };
  const results = parseSpectatorGroupResults(rec.results);
  if (results) group.results = results;
  return group;
}

function parseSpectatorGroupResults(raw: unknown): SpectatorGroupResult[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const blocks: SpectatorGroupResult[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const title = asString(row.title);
    if (!title) continue;
    const lines = Array.isArray(row.lines) ? row.lines.filter((line): line is string => typeof line === 'string') : [];
    blocks.push({ title, lines });
  }
  return blocks.length ? blocks : undefined;
}

/** Columns the link page shows. Out / In appear only when the payload has them — a 9-hole card has no fake In. */
export function planSpectatorGroupColumns(group: SpectatorGroup): {
  holes: number[];
  out: boolean;
  inn: boolean;
} {
  const holes = [...new Set(group.players.flatMap((player) => player.holes.map((hole) => hole.hole)))].sort(
    (a, b) => a - b,
  );
  // 18 hole columns get Out and In even when a nine is still blank. A 9-hole card does not.
  const full = holes.length >= 18;
  return { holes, out: full, inn: full };
}

export function formatSpectatorHoleLine(row: SpectatorHoleRow): string {
  const clubYards = formatClubYards(row.club, row.pinToPinYards) ?? '—';
  const score = row.score == null ? '—' : String(row.score);
  const approx = row.approximate ? ` · ${COPY.approximate}` : '';
  return `${row.hole}  ${clubYards}  ${score}${approx}`;
}

export function formatSpectatorShareText(payload: SpectatorPayload): string {
  const course = payload.courseName ?? 'Round';
  if (!payload.finished && payload.live) {
    const last = payload.live.lastClubYards ?? '—';
    const score = payload.live.score == null ? '—' : String(payload.live.score);
    return [
      `${SHOTTRAXX_BRAND} · ${COPY.spectatorLive}`,
      course,
      `Hole ${payload.live.hole} · ${score}`,
      `Last: ${last}`,
    ].join('\n');
  }
  const lines = payload.holes.map((row) => formatSpectatorHoleLine(row));
  return [`${SHOTTRAXX_BRAND} · ${COPY.spectatorFinished}`, course, ...lines].join('\n');
}

export function spectatorPayloadHasCoordinates(payload: SpectatorPayload): boolean {
  const blob = JSON.stringify(payload);
  return /"(lat|lng|startLat|startLng|endLat|endLng)"\s*:/.test(blob);
}

/** Soft / forced stay Approximate. Good and placed stay unmarked. */
export function approximateFromFixQuality(quality: FixQuality | ShotFixQuality | null | undefined): boolean {
  return quality === 'soft' || quality === 'forced';
}
