import pinBookJson from '../course/hydrates/thunderbird-pin-sheets.json';
import { isValidLatLng, type LatLng } from './latLng';

export const THUNDERBIRD_PIN_SHEETS = ['A', 'B', 'C', 'D'] as const;
export type ThunderbirdPinSheetId = (typeof THUNDERBIRD_PIN_SHEETS)[number];

export const THUNDERBIRD_PIN_SHEET_SETTING_KEY = 'thunderbird_pin_sheet';

export type ThunderbirdPinHole = {
  hole: number;
  par: number | null;
  whiteYards: number | null;
  greenCenter: LatLng | null;
  greenFront: LatLng | null;
  greenBack: LatLng | null;
  greenDepthYards: number | null;
  greenWidthYards: number | null;
  pins: Record<ThunderbirdPinSheetId, LatLng | null>;
};

export type ThunderbirdPinSheetMeta = {
  id: ThunderbirdPinSheetId;
  days: string;
  weekdays: number[];
};

export type ThunderbirdPinBook = {
  source: 'doc-pin-sheet';
  courseKey: string;
  sheets: Record<ThunderbirdPinSheetId, ThunderbirdPinSheetMeta>;
  holes: ThunderbirdPinHole[];
};

const WEEKDAY_TOKEN: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function asFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function point(lat: unknown, lng: unknown): LatLng | null {
  const next = { lat: asFinite(lat) ?? Number.NaN, lng: asFinite(lng) ?? Number.NaN };
  return isValidLatLng(next) ? next : null;
}

function pointFrom(raw: unknown): LatLng | null {
  const record = asRecord(raw);
  if (!record) return null;
  return point(record.lat, record.lng);
}

/** Plays as 18. CSV 10–18 already mirror 1–9 — never invent a new hole. */
export function thunderbirdMirrorHole(hole: number): number {
  if (!Number.isInteger(hole) || hole < 1) return hole;
  if (hole >= 10 && hole <= 18) return hole - 9;
  return hole;
}

export function thunderbirdInventTees(): false {
  return false;
}

export function thunderbirdTeesStayHardMiss(): true {
  return true;
}

/** Pin-sheet green centers are not a green. Greens stay HARD-MISS until OSM or Doc. */
export function thunderbirdPinSheetsInventGreens(): false {
  return false;
}

/**
 * Daily A–D cup folds onto a green that already exists.
 * A pin coordinate never becomes the green by itself.
 */
export function thunderbirdCupOnGreen(
  green: LatLng | null | undefined,
  dailyPin: LatLng | null | undefined,
): LatLng | null {
  if (thunderbirdPinSheetsInventGreens()) return null;
  if (!isValidLatLng(green)) return null;
  return isValidLatLng(dailyPin) ? dailyPin : green;
}

export function isThunderbirdPinSheetId(value: string | null | undefined): value is ThunderbirdPinSheetId {
  return THUNDERBIRD_PIN_SHEETS.includes(value as ThunderbirdPinSheetId);
}

/** Weekdays from the CSV `days` column only — never a guessed 7→4 map. */
export function thunderbirdWeekdaysFromDays(days: string | null | undefined): number[] {
  const out: number[] = [];
  for (const token of String(days ?? '').split(/[^A-Za-z]+/)) {
    const key = token.trim().toLowerCase();
    const weekday = WEEKDAY_TOKEN[key];
    if (weekday == null || out.includes(weekday)) continue;
    out.push(weekday);
  }
  return out;
}

function sheetMeta(id: ThunderbirdPinSheetId, days: string | null | undefined): ThunderbirdPinSheetMeta {
  return {
    id,
    days: asString(days) ?? '',
    weekdays: thunderbirdWeekdaysFromDays(days),
  };
}

function emptyHole(hole: number): ThunderbirdPinHole {
  return {
    hole,
    par: null,
    whiteYards: null,
    greenCenter: null,
    greenFront: null,
    greenBack: null,
    greenDepthYards: null,
    greenWidthYards: null,
    pins: { A: null, B: null, C: null, D: null },
  };
}

function takeGreenFields(target: ThunderbirdPinHole, next: ThunderbirdPinHole): void {
  if (target.par == null) target.par = next.par;
  if (target.whiteYards == null) target.whiteYards = next.whiteYards;
  if (!target.greenCenter) target.greenCenter = next.greenCenter;
  if (!target.greenFront) target.greenFront = next.greenFront;
  if (!target.greenBack) target.greenBack = next.greenBack;
  if (target.greenDepthYards == null) target.greenDepthYards = next.greenDepthYards;
  if (target.greenWidthYards == null) target.greenWidthYards = next.greenWidthYards;
}

/**
 * Parse one Doc pin-sheet row. Missing / invalid coords stay null.
 * Never averages, never invents a tee.
 */
export function parseThunderbirdPinRow(row: {
  hole?: unknown;
  par?: unknown;
  white_yds?: unknown;
  green_center_lat?: unknown;
  green_center_lon?: unknown;
  green_front_lat?: unknown;
  green_front_lon?: unknown;
  green_back_lat?: unknown;
  green_back_lon?: unknown;
  green_depth_yd?: unknown;
  green_width_yd?: unknown;
  pin_a_lat?: unknown;
  pin_a_lon?: unknown;
  pin_b_lat?: unknown;
  pin_b_lon?: unknown;
  pin_c_lat?: unknown;
  pin_c_lon?: unknown;
  pin_d_lat?: unknown;
  pin_d_lon?: unknown;
}): ThunderbirdPinHole | null {
  const hole = asFinite(row.hole);
  if (hole == null || hole < 1 || hole > 18) return null;
  return {
    hole: Math.round(hole),
    par: asFinite(row.par),
    whiteYards: asFinite(row.white_yds),
    greenCenter: point(row.green_center_lat, row.green_center_lon),
    greenFront: point(row.green_front_lat, row.green_front_lon),
    greenBack: point(row.green_back_lat, row.green_back_lon),
    greenDepthYards: asFinite(row.green_depth_yd),
    greenWidthYards: asFinite(row.green_width_yd),
    pins: {
      A: point(row.pin_a_lat, row.pin_a_lon),
      B: point(row.pin_b_lat, row.pin_b_lon),
      C: point(row.pin_c_lat, row.pin_c_lon),
      D: point(row.pin_d_lat, row.pin_d_lon),
    },
  };
}

function parseCsvLine(line: string): string[] {
  return line.split(',').map((cell) => cell.trim());
}

/** Long-form Doc CSV: one row per sheet × hole. Coords stay as written. */
export function parseThunderbirdPinCsv(text: string): ThunderbirdPinBook {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = parseCsvLine(lines[0] ?? '');
  const index = (name: string) => header.indexOf(name);
  const sheets = {} as Record<ThunderbirdPinSheetId, ThunderbirdPinSheetMeta>;
  const byHole = new Map<number, ThunderbirdPinHole>();

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const cell = (name: string) => {
      const i = index(name);
      return i >= 0 ? cols[i] : undefined;
    };
    const sheetRaw = asString(cell('sheet'))?.toUpperCase();
    if (!isThunderbirdPinSheetId(sheetRaw)) continue;
    const hole = asFinite(cell('hole'));
    if (hole == null || hole < 1 || hole > 18) continue;
    const n = Math.round(hole);
    if (!sheets[sheetRaw]) {
      sheets[sheetRaw] = sheetMeta(sheetRaw, cell('days'));
    }
    const next = parseThunderbirdPinRow({
      hole: n,
      par: cell('par'),
      white_yds: cell('white_yds'),
      green_center_lat: cell('green_center_lat'),
      green_center_lon: cell('green_center_lon'),
      green_front_lat: cell('green_front_lat'),
      green_front_lon: cell('green_front_lon'),
      green_back_lat: cell('green_back_lat'),
      green_back_lon: cell('green_back_lon'),
      green_depth_yd: cell('green_depth_yd'),
      green_width_yd: cell('green_width_yd'),
    });
    if (!next) continue;
    const current = byHole.get(n) ?? emptyHole(n);
    takeGreenFields(current, next);
    current.pins[sheetRaw] = point(cell('pin_lat'), cell('pin_lon'));
    byHole.set(n, current);
  }

  return {
    source: 'doc-pin-sheet',
    courseKey: 'thunderbird-heber-springs-ar',
    sheets: {
      A: sheets.A ?? sheetMeta('A', null),
      B: sheets.B ?? sheetMeta('B', null),
      C: sheets.C ?? sheetMeta('C', null),
      D: sheets.D ?? sheetMeta('D', null),
    },
    holes: [...byHole.values()].sort((a, b) => a.hole - b.hole),
  };
}

function parsePinBook(raw: unknown): ThunderbirdPinBook | null {
  const record = asRecord(raw);
  if (!record || record.source !== 'doc-pin-sheet') return null;
  const courseKey = asString(record.courseKey);
  if (!courseKey) return null;
  const sheetsRaw = asRecord(record.sheets);
  if (!sheetsRaw) return null;
  const sheets = {} as Record<ThunderbirdPinSheetId, ThunderbirdPinSheetMeta>;
  for (const id of THUNDERBIRD_PIN_SHEETS) {
    const meta = asRecord(sheetsRaw[id]);
    sheets[id] = sheetMeta(id, asString(meta?.days) ?? asString(meta?.id));
  }
  if (!Array.isArray(record.holes)) return null;
  const holes: ThunderbirdPinHole[] = [];
  const seen = new Set<number>();
  for (const item of record.holes) {
    const row = asRecord(item);
    if (!row) continue;
    const hole = asFinite(row.hole);
    if (hole == null || hole < 1 || hole > 18 || seen.has(Math.round(hole))) continue;
    const n = Math.round(hole);
    const pinsRaw = asRecord(row.pins);
    holes.push({
      hole: n,
      par: asFinite(row.par),
      whiteYards: asFinite(row.whiteYards),
      greenCenter: pointFrom(row.greenCenter),
      greenFront: pointFrom(row.greenFront),
      greenBack: pointFrom(row.greenBack),
      greenDepthYards: asFinite(row.greenDepthYards),
      greenWidthYards: asFinite(row.greenWidthYards),
      pins: {
        A: pointFrom(pinsRaw?.A),
        B: pointFrom(pinsRaw?.B),
        C: pointFrom(pinsRaw?.C),
        D: pointFrom(pinsRaw?.D),
      },
    });
    seen.add(n);
  }
  holes.sort((a, b) => a.hole - b.hole);
  if (holes.length === 0) return null;
  return { source: 'doc-pin-sheet', courseKey, sheets, holes };
}

let cachedBook: ThunderbirdPinBook | null = null;

export function loadThunderbirdPinBook(): ThunderbirdPinBook {
  if (cachedBook) return cachedBook;
  const parsed = parsePinBook(pinBookJson);
  if (!parsed) {
    throw new Error('Thunderbird pin book failed to parse');
  }
  cachedBook = parsed;
  return parsed;
}

export function resetThunderbirdPinBookForTests(): void {
  cachedBook = null;
}

/** Sheet from the CSV days column. Unknown weekday stays null. */
export function thunderbirdPinSheetFromWeekday(weekday: number): ThunderbirdPinSheetId | null {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
  const book = loadThunderbirdPinBook();
  for (const id of THUNDERBIRD_PIN_SHEETS) {
    if (book.sheets[id].weekdays.includes(weekday)) return id;
  }
  return null;
}

export function resolveThunderbirdPinSheet(
  stored: string | null | undefined,
  weekday: number = new Date().getDay(),
): ThunderbirdPinSheetId {
  if (isThunderbirdPinSheetId(stored)) return stored;
  return thunderbirdPinSheetFromWeekday(weekday) ?? 'A';
}

export function thunderbirdPinHoleFor(
  holeNumber: number,
  book: ThunderbirdPinBook = loadThunderbirdPinBook(),
): ThunderbirdPinHole | null {
  const hole = thunderbirdMirrorHole(holeNumber);
  return book.holes.find((row) => row.hole === hole) ?? null;
}

export function thunderbirdDailyPin(
  holeNumber: number,
  sheet: ThunderbirdPinSheetId | null | undefined,
  book: ThunderbirdPinBook = loadThunderbirdPinBook(),
): LatLng | null {
  if (!isThunderbirdPinSheetId(sheet)) return null;
  return thunderbirdPinHoleFor(holeNumber, book)?.pins[sheet] ?? null;
}

export function thunderbirdSheetLabel(id: ThunderbirdPinSheetId): string {
  const days = loadThunderbirdPinBook().sheets[id].days;
  return days ? `${id} · ${days}` : id;
}
