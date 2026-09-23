import { SHOTTRAXX_BRAND } from './playerCopy';
import {
  scorecardDiff,
  scorecardDiffLabel,
  scorecardIncompleteMark,
  type ScorecardHole,
  type ScorecardMark,
} from './scorecard';

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const WIDTH = 640;
const PAD = 28;
const SCALE = 3;
/** Same night-green palette as the in-app scorecard. */
const BG = { r: 11, g: 26, b: 18 };
const CARD = { r: 19, g: 38, b: 27 };
const LINE = { r: 30, g: 58, b: 40 };
const CREAM = { r: 244, g: 241, b: 232 };
const LIME = { r: 200, g: 245, b: 66 };
const MUTED = { r: 138, g: 154, b: 142 };
const RED = { r: 232, g: 93, b: 76 };
const GOOD = { r: 125, g: 207, b: 122 };

/** 4-bit palette PNG: the card uses only these inks, so the file stays small. */
const PALETTE: Rgb[] = [BG, CARD, LINE, CREAM, LIME, MUTED, RED, GOOD];

type Rgb = { r: number; g: number; b: number };

/** 5×7 columns, LSB at the top. Space and a few share glyphs only. */
const FONT: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0],
  '-': [0, 8, 8, 8, 0],
  '.': [0, 64, 0, 0, 0],
  ':': [0, 20, 0, 0, 0],
  '+': [8, 8, 62, 8, 8],
  '·': [0, 8, 0, 0, 0],
  '—': [8, 8, 8, 8, 8],
  '0': [62, 65, 65, 65, 62],
  '1': [0, 66, 127, 64, 0],
  '2': [98, 81, 73, 69, 66],
  '3': [34, 65, 73, 73, 54],
  '4': [24, 20, 18, 127, 16],
  '5': [47, 73, 73, 73, 49],
  '6': [62, 73, 73, 73, 48],
  '7': [1, 113, 9, 5, 3],
  '8': [54, 73, 73, 73, 54],
  '9': [6, 73, 73, 73, 62],
  A: [126, 17, 17, 17, 126],
  B: [127, 73, 73, 73, 54],
  C: [62, 65, 65, 65, 34],
  D: [127, 65, 65, 65, 62],
  E: [127, 73, 73, 73, 65],
  F: [127, 9, 9, 9, 1],
  G: [62, 65, 73, 73, 58],
  H: [127, 8, 8, 8, 127],
  I: [65, 65, 127, 65, 65],
  J: [32, 64, 64, 64, 63],
  K: [127, 8, 20, 34, 65],
  L: [127, 64, 64, 64, 64],
  M: [127, 2, 12, 2, 127],
  N: [127, 2, 4, 8, 127],
  O: [62, 65, 65, 65, 62],
  P: [127, 9, 9, 9, 6],
  Q: [62, 65, 81, 33, 94],
  R: [127, 9, 25, 41, 70],
  S: [38, 73, 73, 73, 50],
  T: [1, 1, 127, 1, 1],
  U: [63, 64, 64, 64, 63],
  V: [31, 32, 64, 32, 31],
  W: [127, 32, 24, 32, 127],
  X: [99, 20, 8, 20, 99],
  Y: [3, 4, 120, 4, 3],
  Z: [97, 81, 73, 69, 67],
  "'": [0, 1, 2, 0, 0],
  '!': [0, 0, 95, 0, 0],
  '#': [20, 127, 20, 127, 20],
  '/': [96, 16, 8, 4, 3],
  '°': [6, 9, 9, 6, 0],
};

export function scorecardImageIncludesGps(): false {
  return false;
}

export function scorecardImageIncludesSpectatorUrl(): false {
  return false;
}

export function scorecardImageIncludesMap(): false {
  return false;
}

export type ScorecardImageRow = {
  hole: number;
  /** Blank when course par is unknown — never invented. */
  par: string;
  /** Posted score, `!` when the hole was left without Made it / Hole Out, blank when unplayed. */
  score: string;
  putts: string;
  mark: ScorecardMark;
  incomplete: boolean;
};

export type ScorecardImagePlan = {
  brand: string;
  courseName: string;
  total: string;
  /** "Thru 7 · +3" / "Final · E". To-par drops when no scored hole has a known par. */
  status: string;
  rows: ScorecardImageRow[];
};

/**
 * Share image model from the in-app scorecard rows (planScorecard).
 * Hole, par, score, putts, mark. No GPS, no map, no spectator link.
 */
export function planScorecardImage(args: {
  courseName?: string | null;
  holes: ScorecardHole[];
  finished?: boolean;
}): ScorecardImagePlan {
  const rows = [...args.holes].sort((a, b) => a.number - b.number);
  const scored = rows.filter((row) => row.score != null && Number.isFinite(row.score));
  const total = scored.reduce((sum, row) => sum + (row.score as number), 0);
  const diffs = scored
    .map((row) => scorecardDiff(row.score, row.par))
    .filter((diff): diff is number => diff != null);
  const toPar = diffs.length === 0 ? null : scorecardDiffLabel(diffs.reduce((a, b) => a + b, 0));
  const allScored = rows.length > 0 && scored.length === rows.length;
  const thru = args.finished || allScored ? 'Final' : `Thru ${scored.length}`;
  return {
    brand: SHOTTRAXX_BRAND.replace(/[^A-Za-z0-9 ]/g, ''),
    courseName: args.courseName?.trim() ? args.courseName.trim() : 'Round',
    total: scored.length ? String(total) : '—',
    status: toPar ? `${thru} · ${toPar}` : thru,
    rows: rows.map((row) => {
      const played = row.score != null || row.putts > 0;
      return {
        hole: row.number,
        par: row.par == null ? '' : String(row.par),
        score: row.incomplete ? scorecardIncompleteMark() : row.score == null ? '' : String(row.score),
        putts: played && !row.incomplete ? String(row.putts) : '',
        mark: row.incomplete ? null : row.mark,
        incomplete: row.incomplete,
      };
    }),
  };
}

export type ScorecardImageLayout = {
  width: number;
  height: number;
  tableTop: number;
  rowHeight: number;
  rowGap: number;
  /** Left x of each column: hole, par, score, putts, mark. */
  columns: { hole: number; par: number; score: number; putts: number; mark: number };
  markWidth: number;
  /** Top y of each hole row, same order as plan.rows. */
  rowTops: number[];
};

const HEADER_H = 150;
const TABLE_HEAD_H = 32;
const ROW_H = 36;
const ROW_GAP = 4;
const CARD_PAD = 12;

export function layoutScorecardImage(plan: ScorecardImagePlan): ScorecardImageLayout {
  const tableTop = PAD + HEADER_H;
  const firstRow = tableTop + CARD_PAD + TABLE_HEAD_H;
  const rowTops = plan.rows.map((_, index) => firstRow + index * (ROW_H + ROW_GAP));
  const lastBottom = rowTops.length ? rowTops[rowTops.length - 1] + ROW_H : firstRow;
  const inner = PAD + CARD_PAD + 12;
  return {
    width: WIDTH,
    height: lastBottom + CARD_PAD + PAD,
    tableTop,
    rowHeight: ROW_H,
    rowGap: ROW_GAP,
    columns: { hole: inner, par: inner + 120, score: inner + 230, putts: inner + 350, mark: inner + 470 },
    markWidth: WIDTH - PAD - CARD_PAD - 12 - (inner + 470),
    rowTops,
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const tag = Uint8Array.from([...type].map((ch) => ch.charCodeAt(0)));
  const body = concat([tag, data]);
  return concat([u32(data.length), body, u32(crc32(body))]);
}

function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  let offset = 0;
  while (offset < data.length) {
    const size = Math.min(65535, data.length - offset);
    const last = offset + size >= data.length ? 1 : 0;
    const slice = data.subarray(offset, offset + size);
    blocks.push(
      Uint8Array.from([last, size & 0xff, (size >>> 8) & 0xff, ~size & 0xff, (~size >>> 8) & 0xff]),
      slice,
    );
    offset += size;
  }
  blocks.push(u32(adler32(data)));
  return concat(blocks);
}

function glyph(ch: string): number[] {
  if (FONT[ch]) return FONT[ch];
  const upper = ch.toUpperCase();
  if (FONT[upper]) return FONT[upper];
  if (ch === '–' || ch === '−') return FONT['—'];
  if (ch === '•') return FONT['·'];
  return FONT[' '] ?? [0, 0, 0, 0, 0];
}

/** One palette index per pixel. */
type Canvas = { pixels: Uint8Array; width: number; height: number };

function setPixel(c: Canvas, x: number, y: number, color: Rgb): void {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  c.pixels[y * c.width + x] = Math.max(0, PALETTE.indexOf(color));
}

function fillRect(c: Canvas, x: number, y: number, w: number, h: number, color: Rgb): void {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) setPixel(c, xx, yy, color);
  }
}

function strokeRect(c: Canvas, x: number, y: number, w: number, h: number, t: number, color: Rgb): void {
  fillRect(c, x, y, w, t, color);
  fillRect(c, x, y + h - t, w, t, color);
  fillRect(c, x, y, t, h, color);
  fillRect(c, x + w - t, y, t, h, color);
}

/** Filled disc, or a ring when `ring` > 0. */
function drawCircle(c: Canvas, cx: number, cy: number, r: number, color: Rgb, ring = 0): void {
  const inner = ring > 0 ? (r - ring) * (r - ring) : -1;
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      const d = x * x + y * y;
      if (d <= r * r && d > inner) setPixel(c, cx + x, cy + y, color);
    }
  }
}

function textWidth(text: string, scale: number): number {
  let w = 0;
  for (const ch of text) w += (glyph(ch).length + 1) * scale;
  return Math.max(0, w - scale);
}

function drawText(c: Canvas, x0: number, y0: number, text: string, color: Rgb, scale = SCALE): void {
  let x = x0;
  for (const ch of text) {
    const cols = glyph(ch);
    for (let cx = 0; cx < cols.length; cx += 1) {
      const col = cols[cx] ?? 0;
      for (let cy = 0; cy < 7; cy += 1) {
        if (((col >> cy) & 1) === 0) continue;
        fillRect(c, x + cx * scale, y0 + cy * scale, scale, scale, color);
      }
    }
    x += (cols.length + 1) * scale;
  }
}

/** Trim to fit `maxWidth`, ending in "..." when cut. */
function fitText(text: string, scale: number, maxWidth: number): string {
  if (textWidth(text, scale) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && textWidth(`${out}...`, scale) > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}...`;
}

export function scorecardMarkColor(mark: ScorecardMark): Rgb | null {
  if (mark === 'eagle' || mark === 'birdie') return GOOD;
  if (mark === 'bogey' || mark === 'double') return RED;
  return null;
}

/** ● eagle, ○ birdie, blank par, □ bogey, □□ double+. Drawn as shapes, centered in the mark cell. */
function drawMark(c: Canvas, x: number, y: number, w: number, h: number, mark: ScorecardMark): void {
  const color = scorecardMarkColor(mark);
  if (!color) return;
  const cy = y + Math.floor(h / 2);
  const size = 18;
  if (mark === 'eagle' || mark === 'birdie') {
    drawCircle(c, x + Math.floor(w / 2), cy, size / 2, color, mark === 'birdie' ? 3 : 0);
    return;
  }
  const top = cy - size / 2;
  if (mark === 'bogey') {
    strokeRect(c, x + Math.floor((w - size) / 2), top, size, size, 3, color);
    return;
  }
  const gap = 6;
  const left = x + Math.floor((w - (size * 2 + gap)) / 2);
  strokeRect(c, left, top, size, size, 3, color);
  strokeRect(c, left + size + gap, top, size, size, 3, color);
}

function encodePng(c: Canvas): Uint8Array {
  const stride = Math.ceil(c.width / 2);
  const raw = new Uint8Array((stride + 1) * c.height);
  for (let y = 0; y < c.height; y += 1) {
    const dest = y * (stride + 1);
    raw[dest] = 0;
    for (let x = 0; x < c.width; x += 1) {
      const index = c.pixels[y * c.width + x] & 0x0f;
      raw[dest + 1 + (x >> 1)] |= x & 1 ? index : index << 4;
    }
  }
  const ihdr = concat([u32(c.width), u32(c.height), Uint8Array.from([4, 3, 0, 0, 0])]);
  const plte = Uint8Array.from(PALETTE.flatMap((color) => [color.r, color.g, color.b]));
  return concat([
    Uint8Array.from(PNG_SIG),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', zlibStore(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}

/**
 * Scorecard table PNG, same columns as the in-app card:
 * Hole · Par · Score · Putts · mark. No GPS, no map, no spectator URL.
 */
export function renderScorecardPng(plan: ScorecardImagePlan): Uint8Array {
  const layout = layoutScorecardImage(plan);
  const c: Canvas = {
    pixels: new Uint8Array(layout.width * layout.height),
    width: layout.width,
    height: layout.height,
  };
  fillRect(c, 0, 0, c.width, c.height, BG);

  const textW = WIDTH - PAD * 2;
  drawText(c, PAD, PAD, plan.brand, LIME);
  drawText(c, PAD, PAD + 34, fitText(plan.courseName, 4, textW), CREAM, 4);
  drawText(c, PAD, PAD + 80, plan.total, CREAM, 6);
  const statusX = PAD + textWidth(plan.total, 6) + 24;
  drawText(c, statusX, PAD + 80 + 21 - 10, fitText(plan.status, SCALE, WIDTH - PAD - statusX), MUTED);

  const cardH = layout.height - PAD - layout.tableTop;
  fillRect(c, PAD, layout.tableTop, WIDTH - PAD * 2, cardH, CARD);
  strokeRect(c, PAD, layout.tableTop, WIDTH - PAD * 2, cardH, 1, LINE);

  const cols = layout.columns;
  const headY = layout.tableTop + CARD_PAD + 6;
  drawText(c, cols.hole, headY, 'HOLE', MUTED, 2);
  drawText(c, cols.par, headY, 'PAR', MUTED, 2);
  drawText(c, cols.score, headY, 'SCORE', MUTED, 2);
  drawText(c, cols.putts, headY, 'PUTTS', MUTED, 2);

  const rowX = PAD + CARD_PAD;
  const rowW = WIDTH - PAD * 2 - CARD_PAD * 2;
  const textY = Math.floor((ROW_H - 7 * SCALE) / 2);
  plan.rows.forEach((row, index) => {
    const top = layout.rowTops[index];
    fillRect(c, rowX, top, rowW, ROW_H, BG);
    if (row.incomplete) strokeRect(c, rowX, top, rowW, ROW_H, 2, RED);
    drawText(c, cols.hole, top + textY, String(row.hole), CREAM);
    drawText(c, cols.par, top + textY, row.par, MUTED);
    drawText(c, cols.score, top + textY, row.score, row.incomplete ? RED : CREAM);
    drawText(c, cols.putts, top + textY, row.putts, CREAM);
    drawMark(c, cols.mark, top, layout.markWidth, ROW_H, row.mark);
  });

  return encodePng(c);
}

export function scorecardPngHasSignature(bytes: Uint8Array): boolean {
  return PNG_SIG.every((value, i) => bytes[i] === value);
}
