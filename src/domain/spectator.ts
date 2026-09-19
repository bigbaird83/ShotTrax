import { COPY } from './playerCopy';
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
};

export type SpectatorPayload = {
  v: typeof SPECTATOR_PAYLOAD_VERSION;
  token: string;
  courseName: string | null;
  finished: boolean;
  live: SpectatorLiveView | null;
  holes: SpectatorHoleRow[];
};

export type SpectatorShotInput = {
  clubShortName: string | null;
  distanceYards: number | null;
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
  };
}

export function planSpectatorPayload(args: {
  token: string;
  courseName?: string | null;
  finished: boolean;
  currentHoleNumber?: number;
  holes: SpectatorHoleInput[];
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
    holes: args.finished ? holes : [],
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
    });
  }
  return {
    v: SPECTATOR_PAYLOAD_VERSION,
    token,
    courseName: asString(rec.courseName),
    finished,
    live: finished ? null : live,
    holes: finished ? holes : [],
  };
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
      `ShotTraxx · ${COPY.spectatorLive}`,
      course,
      `Hole ${payload.live.hole} · ${score}`,
      `Last: ${last}`,
    ].join('\n');
  }
  const lines = payload.holes.map((row) => formatSpectatorHoleLine(row));
  return [`ShotTraxx · ${COPY.spectatorFinished}`, course, ...lines].join('\n');
}

export function spectatorPayloadHasCoordinates(payload: SpectatorPayload): boolean {
  const blob = JSON.stringify(payload);
  return /"(lat|lng|startLat|startLng|endLat|endLng)"\s*:/.test(blob);
}

/** Soft / forced stay Approximate. Good and placed stay unmarked. */
export function approximateFromFixQuality(quality: FixQuality | ShotFixQuality | null | undefined): boolean {
  return quality === 'soft' || quality === 'forced';
}
