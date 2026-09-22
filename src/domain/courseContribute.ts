import { haversineYards } from './haversine';
import { courseCardSpanIsAbsurd, courseCardSpanIsSamePoint } from './holeCamera';
import { isCourseCardLatLng, type LatLng } from './latLng';
import { classifyNineByTwo } from './nineByTwo';
import { isClubhousePin } from '../course/hydrate';
import { SHOTTRAXX_CONTACT_EMAIL, SHOTTRAXX_X_HANDLE } from './courseRequest';

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
};

export type ContributeIssueCode =
  | 'email'
  | 'grant'
  | 'hole_count'
  | 'sheet'
  | 'wgs84'
  | 'clubhouse'
  | 'centroid'
  | 'satellite'
  | 'yards';

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
    },
  };
}

export function contributionBody(contribution: CourseContribution): string {
  const lines = [
    `Course: ${contribution.courseName || '—'}`,
    `City: ${contribution.city || '—'}`,
    `Holes: ${contribution.claimedHoleCount}${contribution.nineByTwo ? ' (exact 9×2 mirror)' : ''}`,
    `Contributor: ${contribution.email}`,
    `Grant: commercial use / ODbL-safe`,
    `Submitted: ${contribution.submittedAt}`,
    `To: ${contribution.to}`,
    `X: ${contribution.handle}`,
    CONTRIBUTE_THANKS,
    'Reward is manual. This message does not paint the course.',
    '',
    'hole,tee_lat,tee_lon,green_lat,green_lon,par,yards',
  ];
  for (const row of contribution.rows) {
    lines.push(
      [
        row.hole,
        row.tee.lat,
        row.tee.lng,
        row.green.lat,
        row.green.lng,
        row.par ?? '',
        row.yards ?? '',
      ].join(','),
    );
  }
  if (contribution.notes) {
    lines.push('', `Notes: ${contribution.notes}`);
  }
  return lines.join('\n');
}

export function contributionMailto(contribution: CourseContribution): string {
  const subject = encodeURIComponent(
    `Course contribution: ${contribution.courseName || 'untitled'}${contribution.city ? ` — ${contribution.city}` : ''}`,
  );
  const body = encodeURIComponent(contributionBody(contribution));
  return `mailto:${contribution.to}?subject=${subject}&body=${body}`;
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
