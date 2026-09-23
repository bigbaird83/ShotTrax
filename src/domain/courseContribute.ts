import { classifyAccuracyM } from './fixQuality';
import { haversineYards } from './haversine';
import { courseCardSpanIsAbsurd, courseCardSpanIsSamePoint } from './holeCamera';
import { isCourseCardLatLng, type LatLng } from './latLng';
import { classifyNineByTwo } from './nineByTwo';
import { isClubhousePin } from '../course/hydrate';
import { SHOTTRAXX_CONTACT_EMAIL, SHOTTRAXX_X_HANDLE } from './courseRequest';
import type { GpsFix } from './types';

/**
 * Contributor sheets are validated and queued. They are not painted.
 * A published map's free year is manual ops — this screen does not grant it.
 */

export const COURSE_CONTRIBUTIONS_SETTING_KEY = 'course.contributions';

export const CONTRIBUTE_THANKS =
  'Thanks — if we accept and publish your map, you get 1 free year.';

export const CONTRIBUTE_YARDS_FRACTION = 0.15;
export const CONTRIBUTE_NO_YARDS_SLACK_YD = 40;

export const CONTRIBUTE_HELP =
  'WGS84 coordinates. Claimed hole count is 9 or 18. Tee to green must be within 15% of the stated yards, or clear a 40 yard span when yards are blank. Clubhouse, centroid, and approx-from-satellite pins are rejected. Email is required. An exact 9×2 mirror is allowed.';

/** On-course steps for “Add this course”. Short on purpose. */
export const CONTRIBUTE_GPS_STEPS = [
  'Stand in the middle of the tee box, wait for GPS, then tap “I’m on this tee”.',
  'Stand in the middle of the green, wait for GPS, then tap “I’m on this green”.',
  'Set par for each hole. Snap the paper scorecard if you have one.',
] as const;

export const CONTRIBUTE_PAR_MIN = 3;
export const CONTRIBUTE_PAR_MAX = 6;
export const CONTRIBUTE_PARS = [3, 4, 5, 6] as const;

export const CONTRIBUTE_GPS_NONE_HELP =
  'No usable GPS yet. Wait for a fix of 25 m or better — ShotTraxx never guesses a pin.';

export type JsonStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type ContributeRow = {
  hole: number;
  tee: LatLng;
  green: LatLng;
  par: number | null;
  yards: number | null;
  approxFromSatellite: boolean;
  /** GPS quality of each pin when the row came from on-course taps. */
  teeFix?: ContributePinQuality;
  greenFix?: ContributePinQuality;
};

/** `none` is no fix, a poor (>25 m) fix, a simulated fix, or a bad coordinate. */
export type ContributeFixQuality = 'good' | 'soft' | 'none';
export type ContributePinQuality = Exclude<ContributeFixQuality, 'none'>;

/** A pin saved from a real GPS fix. Never typed, never guessed. */
export type ContributePin = {
  lat: number;
  lng: number;
  accuracyM: number;
  quality: ContributePinQuality;
};

export type ContributeGpsHole = {
  hole: number;
  par: number | null;
  tee: ContributePin | null;
  green: ContributePin | null;
};

export type ContributePhoto = { uri: string };

export type ContributeIssueCode =
  | 'email'
  | 'grant'
  | 'hole_count'
  | 'sheet'
  | 'wgs84'
  | 'clubhouse'
  | 'centroid'
  | 'satellite'
  | 'yards'
  | 'name'
  | 'location'
  | 'pins'
  | 'par'
  | 'gps';

export type ContributeIssue = {
  code: ContributeIssueCode;
  message: string;
};

export type ContributeDraft = {
  courseName: string;
  city: string;
  claimedHoleCount: 9 | 18;
  sheet: string;
  email: string;
  grantCommercialOdbl: boolean;
  notes: string;
  now?: string;
  /** On-course pins. When present, rows come from here and `sheet` is ignored. */
  gpsHoles?: ContributeGpsHole[];
  /** Paper scorecard photo, attached to the email. */
  photo?: ContributePhoto | null;
};

export type CourseContribution = {
  courseName: string;
  city: string;
  claimedHoleCount: 9 | 18;
  nineByTwo: boolean;
  rows: ContributeRow[];
  email: string;
  to: typeof SHOTTRAXX_CONTACT_EMAIL;
  handle: typeof SHOTTRAXX_X_HANDLE;
  grantCommercialOdbl: true;
  notes: string;
  submittedAt: string;
  reward: 'manual-ops-only';
  source?: 'sheet' | 'gps';
  photo?: ContributePhoto | null;
};

export function contributionMutatesPaint(): false {
  return false;
}

export function contributionSendsWithoutConfirm(): false {
  return false;
}

/** The free year is not applied in the app. */
export function contributionRewardIsManualOpsOnly(): true {
  return true;
}

export function contributionAppliesRewardAutomatically(): false {
  return false;
}

/**
 * Quality gate for a contribute pin. Only a real, non-simulated fix of
 * 25 m or better counts. Anything else is `none` and the button stays off.
 */
export function contributeFixQuality(fix: GpsFix | null | undefined): ContributeFixQuality {
  if (!fix) return 'none';
  if (fix.mocked || fix.isSimulator) return 'none';
  if (!isCourseCardLatLng({ lat: fix.lat, lng: fix.lng })) return 'none';
  const cls = classifyAccuracyM(fix.accuracyM);
  return cls === 'poor' ? 'none' : cls;
}

/** Why a pin button is off, or null when it can save. */
export function contributeFixBlockedReason(fix: GpsFix | null | undefined): string | null {
  if (!fix) return 'Waiting for GPS. Turn on location if this does not change.';
  if (fix.mocked || fix.isSimulator) return 'Simulated location — a course pin needs real GPS on the course.';
  if (contributeFixQuality(fix) === 'none') {
    const m = fix.accuracyM != null && Number.isFinite(fix.accuracyM) ? ` (±${Math.round(fix.accuracyM)} m)` : '';
    return `GPS too weak${m}. ${CONTRIBUTE_GPS_NONE_HELP}`;
  }
  return null;
}

/** The fix as a pin, exactly as reported. Null when quality is none. */
export function contributePinFromFix(fix: GpsFix | null | undefined): ContributePin | null {
  const quality = contributeFixQuality(fix);
  if (!fix || quality === 'none' || fix.accuracyM == null) return null;
  return { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM, quality };
}

export function contributeParOk(par: number | null | undefined): par is number {
  return (
    typeof par === 'number' &&
    Number.isInteger(par) &&
    par >= CONTRIBUTE_PAR_MIN &&
    par <= CONTRIBUTE_PAR_MAX
  );
}

/** Blank holes 1..count. Keeps whatever the player already set on holes that survive. */
export function contributeGpsHoles(
  count: 9 | 18,
  previous: ReadonlyArray<ContributeGpsHole> = [],
): ContributeGpsHole[] {
  const out: ContributeGpsHole[] = [];
  for (let n = 1; n <= count; n += 1) {
    const kept = previous.find((hole) => hole.hole === n);
    out.push(kept ? { ...kept } : { hole: n, par: null, tee: null, green: null });
  }
  return out;
}

/** Haversine yards tee→green once both pins exist. Null otherwise. */
export function contributeHoleYards(hole: Pick<ContributeGpsHole, 'tee' | 'green'>): number | null {
  if (!hole.tee || !hole.green) return null;
  const yards = haversineYards(hole.tee, hole.green);
  return Number.isFinite(yards) ? Math.round(yards) : null;
}

function pinIsReal(pin: ContributePin | null): pin is ContributePin {
  return (
    pin != null &&
    isCourseCardLatLng(pin) &&
    (pin.quality === 'good' || pin.quality === 'soft') &&
    classifyAccuracyM(pin.accuracyM) === pin.quality
  );
}

function gpsRows(
  count: 9 | 18,
  holes: ReadonlyArray<ContributeGpsHole>,
): { rows: ContributeRow[]; issues: ContributeIssue[] } {
  const rows: ContributeRow[] = [];
  const issues: ContributeIssue[] = [];
  if (holes.length !== count) {
    issues.push(issue('hole_count', `Set up ${count} holes.`));
  }
  for (let n = 1; n <= count; n += 1) {
    const hole = holes.find((h) => h.hole === n);
    if (!hole) {
      issues.push(issue('pins', `Hole ${n} is missing.`));
      continue;
    }
    if (!contributeParOk(hole.par)) {
      issues.push(issue('par', `Hole ${n} needs par ${CONTRIBUTE_PAR_MIN}–${CONTRIBUTE_PAR_MAX}.`));
    }
    if (!hole.tee || !hole.green) {
      const missing = [!hole.tee && 'tee', !hole.green && 'green'].filter(Boolean).join(' and ');
      issues.push(issue('pins', `Hole ${n} needs a ${missing} pin from GPS.`));
      continue;
    }
    if (!pinIsReal(hole.tee) || !pinIsReal(hole.green)) {
      issues.push(issue('gps', `Hole ${n} has a pin without good or soft GPS. Re-tap it on the course.`));
      continue;
    }
    const yards = contributeHoleYards(hole);
    rows.push({
      hole: n,
      tee: { lat: hole.tee.lat, lng: hole.tee.lng },
      green: { lat: hole.green.lat, lng: hole.green.lng },
      par: contributeParOk(hole.par) ? hole.par : null,
      yards,
      approxFromSatellite: false,
      teeFix: hole.tee.quality,
      greenFix: hole.green.quality,
    });
  }
  return { rows, issues };
}

function validateGpsContribution(
  draft: ContributeDraft,
  holes: ReadonlyArray<ContributeGpsHole>,
): { ok: true; contribution: CourseContribution } | { ok: false; issues: ContributeIssue[] } {
  const issues: ContributeIssue[] = [];
  const courseName = draft.courseName.trim();
  const city = draft.city.trim();
  const email = draft.email.trim();
  if (!courseName) issues.push(issue('name', 'Add the course name.'));
  if (!city) issues.push(issue('location', 'Add the city or town.'));
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push(issue('email', 'That email does not look right.'));
  }
  if (draft.grantCommercialOdbl !== true) {
    issues.push(issue('grant', 'Commercial use / ODbL-safe grant is required.'));
  }
  if (draft.claimedHoleCount !== 9 && draft.claimedHoleCount !== 18) {
    issues.push(issue('hole_count', 'Pick 9 or 18 holes.'));
    return { ok: false, issues };
  }
  const built = gpsRows(draft.claimedHoleCount, holes);
  issues.push(...built.issues);
  for (const row of built.rows) {
    if (isClubhousePin(row.tee) || isClubhousePin(row.green)) {
      issues.push(issue('clubhouse', `Hole ${row.hole} uses a clubhouse pin.`));
    }
    const measured = haversineYards(row.tee, row.green);
    if (courseCardSpanIsSamePoint(measured)) {
      issues.push(issue('centroid', `Hole ${row.hole} tee and green are the same spot. Re-tap one of them.`));
    } else if (!teeGreenYardGate(measured, null)) {
      issues.push(issue('yards', `Hole ${row.hole} tee to green (${Math.round(measured)} yd) is not a hole span.`));
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  const photoUri = draft.photo?.uri?.trim();
  return {
    ok: true,
    contribution: {
      courseName,
      city,
      claimedHoleCount: draft.claimedHoleCount,
      nineByTwo: false,
      rows: built.rows,
      email,
      to: SHOTTRAXX_CONTACT_EMAIL,
      handle: SHOTTRAXX_X_HANDLE,
      grantCommercialOdbl: true,
      notes: draft.notes.trim(),
      submittedAt: (draft.now ?? new Date().toISOString()).trim(),
      reward: 'manual-ops-only',
      source: 'gps',
      photo: photoUri ? { uri: photoUri } : null,
    },
  };
}

const REQUIRED_HEADERS = ['hole', 'tee_lat', 'tee_lon', 'green_lat', 'green_lon'] as const;

function issue(code: ContributeIssueCode, message: string): ContributeIssue {
  return { code, message };
}

function splitCells(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  return line.split(delimiter).map((cell) => cell.trim());
}

function finite(value: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function looksSatellite(value: string): boolean {
  return /satellite|approx|centroid|clubhouse/i.test(value);
}

/**
 * Tee→green vs the sheet.
 * Stated yards: measured distance within 15%.
 * No yards: do not invent a yardage. Reject a blob of 40 yards or less
 * (centroid) and an absurd span. A real hole span passes.
 */
export function teeGreenYardGate(measuredYards: number, statedYards: number | null): boolean {
  if (!Number.isFinite(measuredYards) || measuredYards <= 0) return false;
  if (statedYards != null && statedYards > 0) {
    return Math.abs(measuredYards - statedYards) <= statedYards * CONTRIBUTE_YARDS_FRACTION;
  }
  if (measuredYards <= CONTRIBUTE_NO_YARDS_SLACK_YD) return false;
  if (courseCardSpanIsAbsurd(measuredYards) || courseCardSpanIsSamePoint(measuredYards)) return false;
  return true;
}

export function parseContributeSheet(sheet: string): { rows: ContributeRow[]; issues: ContributeIssue[] } {
  const lines = sheet
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return { rows: [], issues: [issue('sheet', 'Paste a header and one row per hole.')] };
  }
  const header = splitCells(lines[0]).map((cell) => cell.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((name) => !header.includes(name));
  if (missing.length > 0) {
    return {
      rows: [],
      issues: [issue('sheet', `Header needs ${REQUIRED_HEADERS.join(', ')}.`)],
    };
  }
  const index = new Map(header.map((name, i) => [name, i]));
  const cell = (cells: string[], name: string): string => {
    const at = index.get(name);
    if (at == null) return '';
    return cells[at] ?? '';
  };
  const rows: ContributeRow[] = [];
  const issues: ContributeIssue[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCells(line);
    const hole = finite(cell(cells, 'hole'));
    const teeLat = finite(cell(cells, 'tee_lat'));
    const teeLon = finite(cell(cells, 'tee_lon'));
    const greenLat = finite(cell(cells, 'green_lat'));
    const greenLon = finite(cell(cells, 'green_lon'));
    const parRaw = cell(cells, 'par');
    const yardsRaw = cell(cells, 'yards');
    const source = [cell(cells, 'source'), cell(cells, 'note'), cell(cells, 'notes')].join(' ');
    if (hole == null || !Number.isInteger(hole)) {
      issues.push(issue('sheet', 'Each row needs an integer hole.'));
      continue;
    }
    if (teeLat == null || teeLon == null || greenLat == null || greenLon == null) {
      issues.push(issue('wgs84', `Hole ${hole} is missing a coordinate. Nothing was filled in.`));
      continue;
    }
    const tee = { lat: teeLat, lng: teeLon };
    const green = { lat: greenLat, lng: greenLon };
    if (!isCourseCardLatLng(tee) || !isCourseCardLatLng(green)) {
      issues.push(issue('wgs84', `Hole ${hole} is not a WGS84 coordinate.`));
      continue;
    }
    const par = parRaw ? finite(parRaw) : null;
    const yards = yardsRaw ? finite(yardsRaw) : null;
    rows.push({
      hole,
      tee,
      green,
      par: par != null && Number.isInteger(par) ? par : null,
      yards: yards != null && yards > 0 ? yards : yardsRaw ? null : null,
      approxFromSatellite: looksSatellite(source),
    });
    if (yardsRaw && !(yards != null && yards > 0)) {
      issues.push(issue('yards', `Hole ${hole} yards are not a positive number.`));
    }
  }
  return { rows, issues };
}

function countOk(claimed: 9 | 18, rows: ContributeRow[]): { ok: boolean; nineByTwo: boolean } {
  const byHole = new Map<number, ContributeRow>();
  for (const row of rows) {
    if (byHole.has(row.hole)) return { ok: false, nineByTwo: false };
    byHole.set(row.hole, row);
  }
  const nine = classifyNineByTwo({
    numHoles: 9,
    holes: rows.map((row) => ({ hole: row.hole, tee: row.tee, green: row.green })),
  });
  if (claimed === 9 && nine.ok) return { ok: true, nineByTwo: true };
  const expected = claimed === 9 ? 9 : 18;
  for (let n = 1; n <= expected; n += 1) {
    if (!byHole.has(n)) return { ok: false, nineByTwo: false };
  }
  if (byHole.size !== expected) return { ok: false, nineByTwo: nine.ok };
  return { ok: true, nineByTwo: claimed === 18 && nine.ok };
}

export function validateContribution(
  draft: ContributeDraft,
): { ok: true; contribution: CourseContribution } | { ok: false; issues: ContributeIssue[] } {
  if (draft.gpsHoles) return validateGpsContribution(draft, draft.gpsHoles);
  const issues: ContributeIssue[] = [];
  const email = draft.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push(issue('email', 'Contributor email is required.'));
  }
  if (draft.grantCommercialOdbl !== true) {
    issues.push(issue('grant', 'Commercial use / ODbL-safe grant is required.'));
  }
  if (draft.claimedHoleCount !== 9 && draft.claimedHoleCount !== 18) {
    issues.push(issue('hole_count', 'Claim 9 or 18 holes.'));
  }
  const parsed = parseContributeSheet(draft.sheet);
  issues.push(...parsed.issues);
  if (issues.length > 0) return { ok: false, issues };

  for (const row of parsed.rows) {
    if (isClubhousePin(row.tee) || isClubhousePin(row.green)) {
      issues.push(issue('clubhouse', `Hole ${row.hole} uses a clubhouse pin.`));
    }
    if (row.approxFromSatellite) {
      issues.push(issue('satellite', `Hole ${row.hole} is marked approx-from-satellite or centroid.`));
    }
    const measured = haversineYards(row.tee, row.green);
    if (courseCardSpanIsSamePoint(measured)) {
      issues.push(issue('centroid', `Hole ${row.hole} tee and green are the same point.`));
    }
    if (!teeGreenYardGate(measured, row.yards)) {
      issues.push(
        row.yards == null
          ? issue('yards', `Hole ${row.hole} has no yards and the tee–green span is not a hole (±${CONTRIBUTE_NO_YARDS_SLACK_YD} yd).`)
          : issue('yards', `Hole ${row.hole} tee–green is outside ±15% of the stated yards.`),
      );
    }
  }
  const counted = countOk(draft.claimedHoleCount, parsed.rows);
  if (!counted.ok) {
    issues.push(issue('hole_count', 'Rows must match the claimed hole count. An exact 9×2 mirror is allowed.'));
  }
  if (issues.length > 0) return { ok: false, issues };

  const submittedAt = (draft.now ?? new Date().toISOString()).trim();
  return {
    ok: true,
    contribution: {
      courseName: draft.courseName.trim(),
      city: draft.city.trim(),
      claimedHoleCount: draft.claimedHoleCount,
      nineByTwo: counted.nineByTwo,
      rows: parsed.rows,
      email,
      to: SHOTTRAXX_CONTACT_EMAIL,
      handle: SHOTTRAXX_X_HANDLE,
      grantCommercialOdbl: true,
      notes: draft.notes.trim(),
      submittedAt,
      reward: 'manual-ops-only',
      source: 'sheet',
      photo: draft.photo?.uri ? { uri: draft.photo.uri } : null,
    },
  };
}

export const CONTRIBUTE_PHOTO_FILENAME = 'scorecard.jpg';

/**
 * `attached`: the composer carries the photo. `ask`: plain mailto cannot
 * attach, so the body asks the player to add it.
 */
export type ContributePhotoMode = 'attached' | 'ask';

function photoLine(contribution: CourseContribution, mode: ContributePhotoMode): string {
  if (!contribution.photo?.uri) return 'Scorecard photo: none';
  return mode === 'attached'
    ? `Scorecard photo: attached (${CONTRIBUTE_PHOTO_FILENAME})`
    : 'Scorecard photo: taken — please attach it to this email before sending';
}

export function contributionSubject(contribution: CourseContribution): string {
  return `Course contribution: ${contribution.courseName || 'untitled'}${contribution.city ? ` — ${contribution.city}` : ''}`;
}

export function contributionBody(
  contribution: CourseContribution,
  photoMode: ContributePhotoMode = 'ask',
): string {
  const gps = contribution.source === 'gps';
  const lines = [
    `Course: ${contribution.courseName || '—'}`,
    `City: ${contribution.city || '—'}`,
    `Holes: ${contribution.claimedHoleCount}${contribution.nineByTwo ? ' (exact 9×2 mirror)' : ''}`,
    `Contributor: ${contribution.email || 'sender of this email'}`,
    `Grant: commercial use / ODbL-safe`,
    `Submitted: ${contribution.submittedAt}`,
    `To: ${contribution.to}`,
    `X: ${contribution.handle}`,
    photoLine(contribution, photoMode),
  ];
  if (gps) {
    lines.push('Pins: on-course GPS taps (good ≤15 m, soft 15–25 m). Yards: haversine tee→green.');
  }
  lines.push(
    CONTRIBUTE_THANKS,
    'Reward is manual. This message does not paint the course. Held for manual review.',
    '',
    gps
      ? 'hole,tee_lat,tee_lon,green_lat,green_lon,par,yards,tee_fix,green_fix'
      : 'hole,tee_lat,tee_lon,green_lat,green_lon,par,yards',
  );
  for (const row of contribution.rows) {
    const cells: Array<string | number> = [
      row.hole,
      row.tee.lat,
      row.tee.lng,
      row.green.lat,
      row.green.lng,
      row.par ?? '',
      row.yards ?? '',
    ];
    if (gps) cells.push(row.teeFix ?? '', row.greenFix ?? '');
    lines.push(cells.join(','));
  }
  if (contribution.notes) {
    lines.push('', `Notes: ${contribution.notes}`);
  }
  return lines.join('\n');
}

/** Plain mailto fallback. Cannot carry the photo, so the body asks for it. */
export function contributionMailto(contribution: CourseContribution): string {
  const subject = encodeURIComponent(contributionSubject(contribution));
  const body = encodeURIComponent(contributionBody(contribution, 'ask'));
  return `mailto:${contribution.to}?subject=${subject}&body=${body}`;
}

/** Composer payload with the scorecard photo attached. The player still taps Send. */
export function contributionEmail(contribution: CourseContribution): {
  recipients: string[];
  subject: string;
  body: string;
  attachments: string[];
} {
  const attachments = contribution.photo?.uri ? [contribution.photo.uri] : [];
  return {
    recipients: [contribution.to],
    subject: contributionSubject(contribution),
    body: contributionBody(contribution, attachments.length > 0 ? 'attached' : 'ask'),
    attachments,
  };
}

/** City for a course already in saved favorites or the local catalog. Null asks the player. */
export function knownCourseCity(
  name: string,
  places: ReadonlyArray<{ name: string; city: string | null; state?: string | null; aliases?: readonly string[] }>,
): string | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  for (const place of places) {
    const names = [place.name, ...(place.aliases ?? [])].map((n) => n.trim().toLowerCase());
    if (!names.includes(want)) continue;
    const city = place.city?.trim();
    if (!city) continue;
    const state = place.state?.trim();
    return state ? `${city}, ${state}` : city;
  }
  return null;
}

export function listContributions(store: JsonStore): CourseContribution[] {
  const raw = store.get(COURSE_CONTRIBUTIONS_SETTING_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CourseContribution[]) : [];
  } catch {
    return [];
  }
}

/** Queue a validated sheet. Invalid drafts are not stored and nothing is painted. */
export function queueContribution(
  store: JsonStore,
  draft: ContributeDraft,
): { ok: true; contribution: CourseContribution } | { ok: false; issues: ContributeIssue[] } {
  const verdict = validateContribution(draft);
  if (!verdict.ok) return verdict;
  const next = [...listContributions(store), verdict.contribution];
  store.set(COURSE_CONTRIBUTIONS_SETTING_KEY, JSON.stringify(next));
  return verdict;
}
