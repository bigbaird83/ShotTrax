import { SHOTTRAXX_BRAND } from './playerCopy';
import {
  scorecardDiff,
  scorecardDiffLabel,
  scorecardIncompleteMark,
  type ScorecardHole,
  type ScorecardMark,
} from './scorecard';

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
/** Messages-friendly width; 18 holes still fit one image. */
const WIDTH = 1080;
const PAD = 56;
const CONTENT_W = WIDTH - PAD * 2;

export type Rgb = { r: number; g: number; b: number };

/** Same night-green palette as the in-app scorecard (dark-lime theme). */
export const SCORECARD_IMAGE_COLORS = {
  bgTop: { r: 20, g: 46, b: 31 },
  bg: { r: 11, g: 26, b: 18 },
  card: { r: 19, g: 38, b: 27 },
  subtotal: { r: 23, g: 46, b: 33 },
  wash: { r: 28, g: 58, b: 36 },
  line: { r: 30, g: 58, b: 40 },
  border: { r: 42, g: 74, b: 53 },
  cream: { r: 244, g: 241, b: 232 },
  soft: { r: 203, g: 211, b: 201 },
  lime: { r: 200, g: 245, b: 66 },
  muted: { r: 138, g: 154, b: 142 },
  red: { r: 232, g: 93, b: 76 },
  good: { r: 125, g: 207, b: 122 },
} as const satisfies Record<string, Rgb>;

const C = SCORECARD_IMAGE_COLORS;

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
  /** "Final" / "Thru 7". */
  progress: string;
  /** "-2" / "E" / "+3", null when no scored hole has a known par. */
  toPar: string | null;
  toParValue: number | null;
  stats: { putts: string; underPar: number; pars: number; overPar: number };
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
  const toParValue = diffs.length === 0 ? null : diffs.reduce((a, b) => a + b, 0);
  const toPar = scorecardDiffLabel(toParValue);
  const allScored = rows.length > 0 && scored.length === rows.length;
  const progress = args.finished || allScored ? 'Final' : `Thru ${scored.length}`;
  const imageRows: ScorecardImageRow[] = rows.map((row) => {
    const played = row.score != null || row.putts > 0;
    return {
      hole: row.number,
      par: row.par == null ? '' : String(row.par),
      score: row.incomplete ? scorecardIncompleteMark() : row.score == null ? '' : String(row.score),
      putts: played && !row.incomplete ? String(row.putts) : '',
      mark: row.incomplete ? null : row.mark,
      incomplete: row.incomplete,
    };
  });
  const puttRows = imageRows.filter((row) => row.putts !== '');
  const markCount = (...marks: ScorecardMark[]) => imageRows.filter((row) => marks.includes(row.mark)).length;
  return {
    brand: SHOTTRAXX_BRAND,
    courseName: args.courseName?.trim() ? args.courseName.trim() : 'Round',
    total: scored.length ? String(total) : '—',
    status: toPar ? `${progress} · ${toPar}` : progress,
    progress,
    toPar,
    toParValue,
    stats: {
      putts: puttRows.length ? String(puttRows.reduce((sum, row) => sum + Number(row.putts), 0)) : '—',
      underPar: markCount('eagle', 'birdie'),
      pars: markCount('par'),
      overPar: markCount('bogey', 'double'),
    },
    rows: imageRows,
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type ScorecardImageCell = { x: number; y: number; w: number; h: number };

export type ScorecardImageBlock = {
  top: number;
  /** OUT / IN for an 18-hole card, TOT otherwise. */
  label: string;
  /** Indices into plan.rows. */
  rows: number[];
  /** Left x of each hole column (always nine slots). */
  holeX: number[];
  subtotalX: number;
  /** Top y of the HOLE / PAR / SCORE / PUTTS bands. */
  bands: { hole: number; par: number; score: number; putts: number };
};

export type ScorecardImageLayout = {
  width: number;
  height: number;
  header: { brand: number; course: number; score: number };
  statsTop: number;
  blocks: ScorecardImageBlock[];
  /** Score cell for each hole, same order as plan.rows. */
  scoreCells: ScorecardImageCell[];
  legendTop: number;
};

const BRAND_CAP = 22;
const COURSE_CAP = 46;
const SCORE_CAP = 124;
const STATS_H = 104;
const LABEL_W = 131;
const HOLE_W = 81;
const SUBTOTAL_W = CONTENT_W - LABEL_W - HOLE_W * 9;
const BAND = { hole: 52, par: 52, score: 84, putts: 52 };
const BLOCK_H = BAND.hole + BAND.par + BAND.score + BAND.putts;
const BLOCK_GAP = 24;
const LEGEND_CAP = 14;

export function layoutScorecardImage(plan: ScorecardImagePlan): ScorecardImageLayout {
  const brand = PAD;
  const course = brand + BRAND_CAP + 28;
  const score = course + COURSE_CAP + 40;
  const statsTop = score + SCORE_CAP + 44;
  const gridTop = statsTop + STATS_H + 28;

  const chunks: number[][] = [];
  plan.rows.forEach((_, index) => {
    if (index % 9 === 0) chunks.push([]);
    chunks[chunks.length - 1].push(index);
  });
  const scoreCells: ScorecardImageCell[] = [];
  const blocks = chunks.map((rows, blockIndex): ScorecardImageBlock => {
    const top = gridTop + blockIndex * (BLOCK_H + BLOCK_GAP);
    const holeX = Array.from({ length: 9 }, (_, i) => PAD + LABEL_W + i * HOLE_W);
    const bands = {
      hole: top,
      par: top + BAND.hole,
      score: top + BAND.hole + BAND.par,
      putts: top + BAND.hole + BAND.par + BAND.score,
    };
    rows.forEach((_, i) => {
      scoreCells.push({ x: holeX[i], y: bands.score, w: HOLE_W, h: BAND.score });
    });
    const label = chunks.length === 2 ? (blockIndex === 0 ? 'OUT' : 'IN') : 'TOT';
    return { top, label, rows, holeX, subtotalX: PAD + LABEL_W + HOLE_W * 9, bands };
  });
  const gridBottom = blocks.length ? blocks[blocks.length - 1].top + BLOCK_H : gridTop - 28;
  const legendTop = gridBottom + 34;
  return {
    width: WIDTH,
    height: legendTop + LEGEND_CAP + PAD,
    header: { brand, course, score },
    statsTop,
    blocks,
    scoreCells,
    legendTop,
  };
}

// ---------------------------------------------------------------------------
// Monoline stroke font. Cap height is 10 units, y grows down.
// ---------------------------------------------------------------------------

type Pt = [number, number];

/** Points along an ellipse arc, degrees, 0 = right, 90 = down. */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Pt[] {
  const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 10));
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

const dot = (x: number, y: number): Pt[] => [[x, y], [x, y]];

const STROKES: Record<string, Pt[][]> = {
  '0': [[[0, 3.2], [0, 6.8], ...arc(3, 6.8, 3, 3.2, 180, 0), [6, 3.2], ...arc(3, 3.2, 3, 3.2, 0, -180)]],
  '1': [[[1, 2.2], [3.6, 0], [3.6, 10]]],
  '2': [[...arc(3, 3, 3, 3, 195, 380), [0, 10], [6.2, 10]]],
  '3': [arc(3, 2.5, 2.7, 2.5, 200, 450), arc(3, 7.5, 2.9, 2.5, 270, 520)],
  '4': [[[4.6, 10], [4.6, 0], [0, 7], [6.4, 7]]],
  '5': [[[5.6, 0], [0.9, 0], [0.5, 4.6], ...arc(3, 6.9, 3, 3.1, 240, 510)]],
  '6': [[[4.6, 0], [0.54, 5.28]], arc(3, 7, 3, 3, 0, 360)],
  '7': [[[0, 0], [6.2, 0], [2.2, 10]]],
  '8': [arc(3, 2.4, 2.6, 2.4, 0, 360), arc(3, 7.3, 3, 2.7, 0, 360)],
  '9': [arc(3, 3, 3, 3, 0, 360), [[5.46, 4.72], [1.4, 10]]],
  A: [[[0, 10], [3.6, 0], [7.2, 10]], [[1.3, 6.6], [5.9, 6.6]]],
  B: [
    [[0, 5], [0, 0], [3.2, 0], ...arc(3.2, 2.5, 2.5, 2.5, -90, 90), [0, 5]],
    [[3.2, 5], ...arc(3.4, 7.5, 2.7, 2.5, -90, 90), [0, 10], [0, 5]],
  ],
  C: [arc(3.9, 5, 3.9, 5, 42, 318)],
  D: [[[0, 0], [0, 10], ...arc(2.2, 5, 4.8, 5, 90, -90), [0, 0]]],
  E: [[[5.6, 0], [0, 0], [0, 10], [5.6, 10]], [[0, 5], [4.8, 5]]],
  F: [[[5.6, 0], [0, 0], [0, 10]], [[0, 5], [4.8, 5]]],
  G: [[...arc(4, 5, 4, 5, -42, -360), [4.6, 5]]],
  H: [[[0, 0], [0, 10]], [[6.4, 0], [6.4, 10]], [[0, 5], [6.4, 5]]],
  I: [[[0, 0], [0, 10]]],
  J: [[[5, 0], [5, 7.4], ...arc(2.5, 7.5, 2.5, 2.5, 0, 165)]],
  K: [[[0, 0], [0, 10]], [[6, 0], [0, 6.2]], [[2.3, 3.9], [6.3, 10]]],
  L: [[[0, 0], [0, 10], [5.2, 10]]],
  M: [[[0, 10], [0, 0], [4, 7.2], [8, 0], [8, 10]]],
  N: [[[0, 10], [0, 0], [6.6, 10], [6.6, 0]]],
  O: [arc(4.2, 5, 4.2, 5, 0, 360)],
  P: [[[0, 10], [0, 0], [3.3, 0], ...arc(3.3, 2.8, 2.7, 2.8, -90, 90), [0, 5.6]]],
  Q: [arc(4.2, 5, 4.2, 5, 0, 360), [[5, 7], [8.4, 10.4]]],
  R: [[[0, 10], [0, 0], [3.3, 0], ...arc(3.3, 2.75, 2.7, 2.75, -90, 90), [0, 5.5]], [[3.2, 5.5], [6.2, 10]]],
  S: [[...arc(3, 2.5, 2.7, 2.5, -28, -270), ...arc(3, 7.5, 3, 2.5, -90, 152)]],
  T: [[[0, 0], [7, 0]], [[3.5, 0], [3.5, 10]]],
  U: [[[0, 0], [0, 6.8], ...arc(3.25, 6.75, 3.25, 3.25, 180, 0), [6.5, 0]]],
  V: [[[0, 0], [3.6, 10], [7.2, 0]]],
  W: [[[0, 0], [2.5, 10], [5, 2.4], [7.5, 10], [10, 0]]],
  X: [[[0, 0], [6.6, 10]], [[6.6, 0], [0, 10]]],
  Y: [[[0, 0], [3.5, 5.2], [7, 0]], [[3.5, 5.2], [3.5, 10]]],
  Z: [[[0, 0], [6.4, 0], [0, 10], [6.6, 10]]],
  '-': [[[0, 5.4], [3.6, 5.4]]],
  '+': [[[0, 5.2], [5.4, 5.2]], [[2.7, 2.5], [2.7, 7.9]]],
  '.': [dot(0, 10)],
  ',': [[[0.4, 9.6], [-0.4, 11.6]]],
  ':': [dot(0, 4), dot(0, 10)],
  '·': [dot(0, 5.4)],
  '—': [[[0, 5.4], [7, 5.4]]],
  "'": [[[0, 0], [0, 2.8]]],
  '!': [[[0, 0], [0, 6.6]], dot(0, 10)],
  '#': [[[2.6, 0], [1.4, 10]], [[5.8, 0], [4.6, 10]], [[0.2, 3.4], [7.2, 3.4]], [[-0.2, 6.6], [6.8, 6.6]]],
  '/': [[[5, 0], [0, 10]]],
  '(': [arc(4, 5, 4, 6.1, 125, 235)],
  ')': [arc(0, 5, 4, 6.1, 55, -55)],
  '&': [[[6.6, 10], [1.2, 3.8], ...arc(2.7, 2.2, 1.9, 2.2, 135, -60), [0.6, 6.6], ...arc(2.8, 7.6, 2.4, 2.4, 190, 60), [6.4, 5.2]]],
  '°': [arc(1.4, 1.4, 1.4, 1.4, 0, 360)],
};

type Glyph = { segs: Float64Array; width: number };

const GLYPHS = new Map<string, Glyph>();

function glyph(ch: string): Glyph | null {
  const key =
    ch === '–' || ch === '−' ? '-' : ch === '•' ? '·' : ch === '’' || ch === '‘' ? "'" : ch.toUpperCase();
  const cached = GLYPHS.get(key);
  if (cached) return cached;
  const lines = STROKES[key];
  if (!lines) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const line of lines) {
    for (const [x] of line) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  const segs: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i += 1) {
      segs.push(line[i - 1][0] - minX, line[i - 1][1], line[i][0] - minX, line[i][1]);
    }
  }
  const out = { segs: Float64Array.from(segs), width: maxX - minX };
  GLYPHS.set(key, out);
  return out;
}

type TextStyle = { cap: number; weight: number; color: Rgb; tracking?: number };

function cleanText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function advance(ch: string, style: TextStyle): number {
  const g = glyph(ch);
  if (!g) return style.cap * 0.42 + (style.tracking ?? 0);
  return g.width * (style.cap / 10) + style.weight + style.cap * 0.24 + (style.tracking ?? 0);
}

function measureText(text: string, style: TextStyle): number {
  const chars = [...cleanText(text)];
  if (!chars.length) return 0;
  const total = chars.reduce((sum, ch) => sum + advance(ch, style), 0);
  const last = chars[chars.length - 1];
  return total - (glyph(last) ? style.cap * 0.24 + (style.tracking ?? 0) : 0);
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  const ex = px - (x1 + t * dx);
  const ey = py - (y1 + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

/** Anti-aliased round-capped strokes; `top` is the cap line. */
function drawText(c: Canvas, x0: number, top: number, text: string, style: TextStyle): void {
  const s = style.cap / 10;
  const hw = style.weight / 2;
  let x = x0 + hw;
  for (const ch of cleanText(text)) {
    const g = glyph(ch);
    if (g) {
      const left = Math.floor(x - hw - 1);
      const right = Math.ceil(x + g.width * s + hw + 1);
      const up = Math.floor(top - hw - 1);
      const down = Math.ceil(top + style.cap * 1.2 + hw + 1);
      const w = right - left;
      const cover = new Float32Array(w * (down - up));
      for (let i = 0; i < g.segs.length; i += 4) {
        const ax = x + g.segs[i] * s;
        const ay = top + g.segs[i + 1] * s;
        const bx = x + g.segs[i + 2] * s;
        const by = top + g.segs[i + 3] * s;
        const sx0 = Math.max(left, Math.floor(Math.min(ax, bx) - hw - 1));
        const sx1 = Math.min(right, Math.ceil(Math.max(ax, bx) + hw + 1));
        const sy0 = Math.max(up, Math.floor(Math.min(ay, by) - hw - 1));
        const sy1 = Math.min(down, Math.ceil(Math.max(ay, by) + hw + 1));
        for (let py = sy0; py < sy1; py += 1) {
          for (let px = sx0; px < sx1; px += 1) {
            const cov = hw + 0.5 - distToSegment(px + 0.5, py + 0.5, ax, ay, bx, by);
            if (cov <= 0) continue;
            const k = (py - up) * w + (px - left);
            if (cov > cover[k]) cover[k] = cov > 1 ? 1 : cov;
          }
        }
      }
      for (let py = up; py < down; py += 1) {
        for (let px = left; px < right; px += 1) {
          const cov = cover[(py - up) * w + (px - left)];
          if (cov > 0) blend(c, px, py, style.color, cov);
        }
      }
    }
    x += advance(ch, style);
  }
}

/** Largest cap (down to `minCap`) that fits; trims with "..." at `minCap`. */
function fitText(text: string, style: TextStyle, maxWidth: number, minCap: number): { text: string; style: TextStyle } {
  for (let cap = style.cap; cap >= minCap; cap -= 2) {
    const sized = { ...style, cap, weight: style.weight * (cap / style.cap) };
    if (measureText(text, sized) <= maxWidth) return { text, style: sized };
  }
  const sized = { ...style, cap: minCap, weight: style.weight * (minCap / style.cap) };
  let out = text;
  while (out.length > 1 && measureText(`${out.trimEnd()}...`, sized) > maxWidth) out = out.slice(0, -1);
  return { text: `${out.trimEnd()}...`, style: sized };
}

// ---------------------------------------------------------------------------
// Canvas: 8-bit RGB with signed-distance shapes.
// ---------------------------------------------------------------------------

type Canvas = { rgb: Uint8Array; width: number; height: number };

function blend(c: Canvas, x: number, y: number, color: Rgb, cov: number): void {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (y * c.width + x) * 3;
  if (cov >= 1) {
    c.rgb[i] = color.r;
    c.rgb[i + 1] = color.g;
    c.rgb[i + 2] = color.b;
    return;
  }
  c.rgb[i] = Math.round(c.rgb[i] + (color.r - c.rgb[i]) * cov);
  c.rgb[i + 1] = Math.round(c.rgb[i + 1] + (color.g - c.rgb[i + 1]) * cov);
  c.rgb[i + 2] = Math.round(c.rgb[i + 2] + (color.b - c.rgb[i + 2]) * cov);
}

type Sdf = (x: number, y: number) => number;
type Box = { x: number; y: number; w: number; h: number };

/** Fill where `sdf` < 0, anti-aliased over one pixel. */
function fillSdf(c: Canvas, box: Box, sdf: Sdf, color: Rgb): void {
  const x0 = Math.max(0, Math.floor(box.x) - 1);
  const y0 = Math.max(0, Math.floor(box.y) - 1);
  const x1 = Math.min(c.width, Math.ceil(box.x + box.w) + 1);
  const y1 = Math.min(c.height, Math.ceil(box.y + box.h) + 1);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const cov = 0.5 - sdf(x + 0.5, y + 0.5);
      if (cov > 0) blend(c, x, y, color, cov > 1 ? 1 : cov);
    }
  }
}

function roundRectSdf(box: Box, r: number): Sdf {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const hx = box.w / 2 - r;
  const hy = box.h / 2 - r;
  return (x, y) => {
    const qx = Math.abs(x - cx) - hx;
    const qy = Math.abs(y - cy) - hy;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    return outside + Math.min(Math.max(qx, qy), 0) - r;
  };
}

function circleSdf(cx: number, cy: number, r: number): Sdf {
  return (x, y) => Math.hypot(x - cx, y - cy) - r;
}

/** Stroke of width `t` just inside the shape edge. */
function inner(sdf: Sdf, t: number): Sdf {
  return (x, y) => Math.abs(sdf(x, y) + t / 2) - t / 2;
}

function both(a: Sdf, b: Sdf): Sdf {
  return (x, y) => Math.max(a(x, y), b(x, y));
}

function fillRoundRect(c: Canvas, box: Box, r: number, color: Rgb): void {
  fillSdf(c, box, roundRectSdf(box, r), color);
}

function strokeRoundRect(c: Canvas, box: Box, r: number, t: number, color: Rgb): void {
  fillSdf(c, box, inner(roundRectSdf(box, r), t), color);
}

function fillRect(c: Canvas, box: Box, color: Rgb): void {
  fillRoundRect(c, box, 0, color);
}

export function scorecardMarkColor(mark: ScorecardMark): Rgb | null {
  if (mark === 'eagle' || mark === 'birdie') return C.good;
  if (mark === 'bogey' || mark === 'double') return C.red;
  return null;
}

/** Classic card marks: ● eagle, ○ birdie, blank par, □ bogey, nested □ double+. */
function drawMark(c: Canvas, cx: number, cy: number, r: number, mark: ScorecardMark): void {
  const color = scorecardMarkColor(mark);
  if (!color) return;
  const t = Math.max(2, r * 0.12);
  const box = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
  if (mark === 'eagle') {
    fillSdf(c, box, circleSdf(cx, cy, r), color);
    return;
  }
  if (mark === 'birdie') {
    fillSdf(c, box, inner(circleSdf(cx, cy, r), t), color);
    return;
  }
  const side = r * 0.92;
  const square = { x: cx - side, y: cy - side, w: side * 2, h: side * 2 };
  if (mark === 'bogey') {
    strokeRoundRect(c, square, r * 0.16, t, color);
    return;
  }
  const outer = r * 1.2;
  strokeRoundRect(c, { x: cx - outer, y: cy - outer, w: outer * 2, h: outer * 2 }, r * 0.2, t, color);
  const inside = r * 0.86;
  strokeRoundRect(c, { x: cx - inside, y: cy - inside, w: inside * 2, h: inside * 2 }, r * 0.1, t, color);
}

function drawCentered(c: Canvas, cx: number, cy: number, text: string, style: TextStyle): void {
  if (!text) return;
  drawText(c, Math.round(cx - measureText(text, style) / 2), Math.round(cy - style.cap / 2), text, style);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const LABEL: Omit<TextStyle, 'color'> = { cap: 15, weight: 2.4, tracking: 2.5 };

function sumOf(values: string[], requireAll: boolean): string {
  const nums = values.filter((v) => v !== '' && Number.isFinite(Number(v))).map(Number);
  if (!nums.length || (requireAll && nums.length !== values.length)) return '';
  return String(nums.reduce((a, b) => a + b, 0));
}

function drawHeader(c: Canvas, plan: ScorecardImagePlan, layout: ScorecardImageLayout): void {
  const { header } = layout;
  const brandStyle: TextStyle = { cap: BRAND_CAP, weight: 3.4, tracking: 5, color: C.lime };
  const trademark = plan.brand.includes('™');
  const brandName = plan.brand.replace('™', '').toUpperCase();
  drawText(c, PAD, header.brand, brandName, brandStyle);
  if (trademark) {
    // Superscript TM: the stroke font has no ™ glyph.
    const tmStyle: TextStyle = { cap: 9, weight: 1.6, tracking: 1.5, color: C.lime };
    drawText(c, PAD + measureText(brandName, brandStyle) + 5, header.brand, 'TM', tmStyle);
  }

  const course = fitText(plan.courseName.toUpperCase(), { cap: COURSE_CAP, weight: 5.2, tracking: 1, color: C.cream }, CONTENT_W, 32);
  drawText(c, PAD, header.course + (COURSE_CAP - course.style.cap), course.text, course.style);

  const scoreStyle: TextStyle = { cap: SCORE_CAP, weight: 13, color: C.cream, tracking: 2 };
  drawText(c, PAD, header.score, plan.total, scoreStyle);
  const sideX = PAD + measureText(plan.total, scoreStyle) + 36;

  const progressStyle: TextStyle = { cap: 22, weight: 3.2, tracking: 4, color: C.muted };
  const progressTop = header.score + SCORE_CAP - progressStyle.cap;
  drawText(c, sideX, progressTop, plan.progress.toUpperCase(), progressStyle);

  if (plan.toPar) {
    const v = plan.toParValue ?? 0;
    const fill = v < 0 ? C.good : v > 0 ? C.red : C.cream;
    const pillText: TextStyle = { cap: 34, weight: 5.6, color: C.bg };
    const pillH = 64;
    const pillW = Math.max(pillH + 12, Math.round(measureText(plan.toPar, pillText) + 52));
    const pill = { x: sideX, y: header.score + 4, w: pillW, h: pillH };
    fillRoundRect(c, pill, pillH / 2, fill);
    drawCentered(c, pill.x + pill.w / 2, pill.y + pill.h / 2, plan.toPar, pillText);
  }
}

function drawStats(c: Canvas, plan: ScorecardImagePlan, layout: ScorecardImageLayout): void {
  const tiles: { label: string; value: string; color: Rgb }[] = [
    { label: 'PUTTS', value: plan.stats.putts, color: C.cream },
    { label: 'UNDER PAR', value: String(plan.stats.underPar), color: plan.stats.underPar ? C.good : C.cream },
    { label: 'PARS', value: String(plan.stats.pars), color: C.cream },
    { label: 'OVER PAR', value: String(plan.stats.overPar), color: plan.stats.overPar ? C.red : C.cream },
  ];
  const gap = 16;
  const w = (CONTENT_W - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((tile, i) => {
    const box = { x: Math.round(PAD + i * (w + gap)), y: layout.statsTop, w: Math.round(w), h: STATS_H };
    fillRoundRect(c, box, 20, C.card);
    strokeRoundRect(c, box, 20, 1.5, C.border);
    drawText(c, box.x + 24, box.y + 22, tile.label, { ...LABEL, cap: 14, color: C.muted });
    drawText(c, box.x + 24, box.y + 50, tile.value, { cap: 32, weight: 4.6, tracking: 1, color: tile.color });
  });
}

function drawBlock(c: Canvas, plan: ScorecardImagePlan, block: ScorecardImageBlock): void {
  const card = { x: PAD, y: block.top, w: CONTENT_W, h: BLOCK_H };
  const cardSdf = roundRectSdf(card, 22);
  const { bands } = block;
  fillSdf(c, card, cardSdf, C.card);
  const subtotalBox = { x: block.subtotalX, y: card.y, w: SUBTOTAL_W, h: card.h };
  fillSdf(c, subtotalBox, both(cardSdf, roundRectSdf(subtotalBox, 0)), C.subtotal);
  const headBox = { x: card.x, y: card.y, w: card.w, h: BAND.hole };
  fillSdf(c, headBox, both(cardSdf, roundRectSdf(headBox, 0)), C.wash);

  // Grid rules.
  for (const y of [bands.par, bands.score, bands.putts]) fillRect(c, { x: card.x, y: y - 1, w: card.w, h: 2 }, C.line);
  for (let i = 0; i <= 9; i += 1) {
    const x = i === 9 ? block.subtotalX : block.holeX[i];
    const strong = i === 0 || i === 9;
    fillRect(c, { x: x - 1, y: strong ? card.y : bands.par, w: 2, h: strong ? card.h : card.h - BAND.hole }, C.line);
  }
  strokeRoundRect(c, card, 22, 2, C.border);

  const labelX = PAD + 24;
  const labels: [string, number, number][] = [
    ['HOLE', bands.hole, BAND.hole],
    ['PAR', bands.par, BAND.par],
    ['SCORE', bands.score, BAND.score],
    ['PUTTS', bands.putts, BAND.putts],
  ];
  for (const [label, y, h] of labels) {
    drawText(c, labelX, Math.round(y + (h - LABEL.cap) / 2), label, { ...LABEL, color: label === 'HOLE' ? C.soft : C.muted });
  }

  const holeStyle: TextStyle = { cap: 19, weight: 3, color: C.cream };
  const parStyle: TextStyle = { cap: 20, weight: 3, color: C.muted };
  const scoreStyle: TextStyle = { cap: 32, weight: 4.6, color: C.cream };
  const puttStyle: TextStyle = { cap: 20, weight: 3, color: C.soft };
  const mid = (y: number, h: number) => y + h / 2;

  block.rows.forEach((rowIndex, i) => {
    const row = plan.rows[rowIndex];
    const cx = block.holeX[i] + HOLE_W / 2;
    drawCentered(c, cx, mid(bands.hole, BAND.hole), String(row.hole), holeStyle);
    drawCentered(c, cx, mid(bands.par, BAND.par), row.par, parStyle);
    const scoreCy = mid(bands.score, BAND.score);
    if (row.incomplete) {
      strokeRoundRect(c, { x: block.holeX[i] + 6, y: bands.score + 6, w: HOLE_W - 12, h: BAND.score - 12 }, 12, 3, C.red);
      drawCentered(c, cx, scoreCy, row.score, { ...scoreStyle, color: C.red });
    } else {
      drawMark(c, cx, scoreCy, 27, row.mark);
      drawCentered(c, cx, scoreCy, row.score, row.mark === 'eagle' ? { ...scoreStyle, color: C.bg } : scoreStyle);
    }
    drawCentered(c, cx, mid(bands.putts, BAND.putts), row.putts, puttStyle);
  });

  const rows = block.rows.map((index) => plan.rows[index]);
  const sx = block.subtotalX + SUBTOTAL_W / 2;
  drawCentered(c, sx, mid(bands.hole, BAND.hole), block.label, { ...holeStyle, tracking: 2, color: C.lime });
  drawCentered(c, sx, mid(bands.par, BAND.par), sumOf(rows.map((r) => r.par), true), parStyle);
  drawCentered(
    c,
    sx,
    mid(bands.score, BAND.score),
    sumOf(rows.filter((r) => !r.incomplete).map((r) => r.score), false),
    { ...scoreStyle, color: C.lime },
  );
  drawCentered(c, sx, mid(bands.putts, BAND.putts), sumOf(rows.map((r) => r.putts), false), puttStyle);
}

function drawLegend(c: Canvas, layout: ScorecardImageLayout): void {
  const items: [ScorecardMark, string][] = [
    ['eagle', 'EAGLE'],
    ['birdie', 'BIRDIE'],
    ['bogey', 'BOGEY'],
    ['double', 'DOUBLE+'],
  ];
  const style: TextStyle = { ...LABEL, cap: LEGEND_CAP, color: C.muted };
  const cy = layout.legendTop + LEGEND_CAP / 2;
  let x = PAD + 12;
  for (const [mark, label] of items) {
    drawMark(c, x, cy, 11, mark);
    drawText(c, x + 22, layout.legendTop, label, style);
    x += 22 + measureText(label, style) + 44;
  }
}

/**
 * Scorecard PNG laid out like a paper card: Hole · Par · Score · Putts in
 * nine-hole blocks with OUT / IN subtotals, marks drawn around the score.
 * No GPS, no map, no spectator URL.
 */
export function renderScorecardPng(plan: ScorecardImagePlan): Uint8Array {
  const layout = layoutScorecardImage(plan);
  const c: Canvas = {
    rgb: new Uint8Array(layout.width * layout.height * 3),
    width: layout.width,
    height: layout.height,
  };
  // Soft top-to-bottom wash into the app background.
  const fade = Math.min(layout.height, 700);
  for (let y = 0; y < c.height; y += 1) {
    const t = Math.min(1, y / fade);
    const e = t * t * (3 - 2 * t);
    const color = {
      r: Math.round(C.bgTop.r + (C.bg.r - C.bgTop.r) * e),
      g: Math.round(C.bgTop.g + (C.bg.g - C.bgTop.g) * e),
      b: Math.round(C.bgTop.b + (C.bg.b - C.bgTop.b) * e),
    };
    for (let x = 0; x < c.width; x += 1) blend(c, x, y, color, 1);
  }

  drawHeader(c, plan, layout);
  drawStats(c, plan, layout);
  for (const block of layout.blocks) drawBlock(c, plan, block);
  drawLegend(c, layout);
  return encodePng(c);
}

export function scorecardPngHasSignature(bytes: Uint8Array): boolean {
  return PNG_SIG.every((value, i) => bytes[i] === value);
}

// ---------------------------------------------------------------------------
// PNG + deflate (fixed Huffman, greedy LZ77). No native deps.
// ---------------------------------------------------------------------------

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

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function codeFor(value: number, bases: number[]): number {
  let code = 0;
  while (code + 1 < bases.length && bases[code + 1] <= value) code += 1;
  return code;
}

const LEN_CODE = Uint8Array.from({ length: 259 }, (_, len) => (len < 3 ? 0 : codeFor(len, LEN_BASE)));

function deflate(data: Uint8Array): Uint8Array {
  let out = new Uint8Array(Math.max(1024, data.length >> 3));
  let pos = 0;
  let bits = 0;
  let count = 0;
  const put = (value: number, n: number) => {
    bits |= value << count;
    count += n;
    while (count >= 8) {
      if (pos >= out.length) {
        const grown = new Uint8Array(out.length * 2);
        grown.set(out);
        out = grown;
      }
      out[pos++] = bits & 0xff;
      bits >>>= 8;
      count -= 8;
    }
  };
  /** Huffman codes go MSB first. */
  const huff = (code: number, n: number) => {
    let rev = 0;
    for (let i = 0; i < n; i += 1) rev |= ((code >> i) & 1) << (n - 1 - i);
    put(rev, n);
  };
  const symbol = (sym: number) => {
    if (sym < 144) huff(0x30 + sym, 8);
    else if (sym < 256) huff(0x190 + sym - 144, 9);
    else if (sym < 280) huff(sym - 256, 7);
    else huff(0xc0 + sym - 280, 8);
  };

  put(0x78, 8);
  put(0x01, 8);
  put(1, 1); // BFINAL
  put(1, 2); // fixed Huffman

  const head = new Int32Array(1 << 16).fill(-1);
  const hash = (i: number) => (Math.imul((data[i] << 16) | (data[i + 1] << 8) | data[i + 2], 0x9e3779b1) >>> 16) & 0xffff;
  const n = data.length;
  let i = 0;
  while (i < n) {
    if (i + 2 < n) {
      const h = hash(i);
      const cand = head[h];
      head[h] = i;
      if (
        cand >= 0 &&
        i - cand <= 32768 &&
        data[cand] === data[i] &&
        data[cand + 1] === data[i + 1] &&
        data[cand + 2] === data[i + 2]
      ) {
        const max = Math.min(258, n - i);
        let len = 3;
        while (len < max && data[cand + len] === data[i + len]) len += 1;
        const lc = LEN_CODE[len];
        symbol(257 + lc);
        if (LEN_EXTRA[lc]) put(len - LEN_BASE[lc], LEN_EXTRA[lc]);
        const dist = i - cand;
        const dc = codeFor(dist, DIST_BASE);
        huff(dc, 5);
        if (DIST_EXTRA[dc]) put(dist - DIST_BASE[dc], DIST_EXTRA[dc]);
        for (let k = 1; k < len && i + k + 2 < n; k += 1) head[hash(i + k)] = i + k;
        i += len;
        continue;
      }
    }
    symbol(data[i]);
    i += 1;
  }
  symbol(256);
  if (count > 0) put(0, 8 - count);
  return concat([out.subarray(0, pos), u32(adler32(data))]);
}

function encodePng(c: Canvas): Uint8Array {
  const stride = c.width * 3;
  const raw = new Uint8Array((stride + 1) * c.height);
  for (let y = 0; y < c.height; y += 1) {
    const dest = y * (stride + 1);
    const row = y * stride;
    raw[dest] = 2; // Up filter: flat fills become runs of zero.
    for (let x = 0; x < stride; x += 1) {
      const above = y > 0 ? c.rgb[row - stride + x] : 0;
      raw[dest + 1 + x] = (c.rgb[row + x] - above) & 0xff;
    }
  }
  const ihdr = concat([u32(c.width), u32(c.height), Uint8Array.from([8, 2, 0, 0, 0])]);
  return concat([
    Uint8Array.from(PNG_SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
}
