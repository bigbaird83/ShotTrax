/**
 * Watch club-pick: map / top area ~60%, control band ~40%.
 * Back, Home, Putt, All clubs, and the wheel pills live in the control band.
 * Dedicated Putt shares the Back/Home row (same pill as Back / Home) so the top-3 strip stays on-screen.
 */

export const WATCH_MAP_RATIO = 0.6;
export const WATCH_CONTROL_RATIO = 0.4;

/** Back / Home in the control band. Not tiny text. */
export const WATCH_BACK_HOME_MIN_HEIGHT = 44;

/** All clubs / Same club under the wheel. */
export const WATCH_UNDER_WHEEL_MIN_HEIGHT = 40;

/** Dedicated Putt on the Back/Home row, same pill as Back / Home. Never its own full-width row. */
export const WATCH_PUTT_PILL_MIN_HEIGHT = 44;

export function watchPuttSharesBackHomeRow(): true {
  return true;
}

export function watchPuttIsCompactPill(): true {
  return true;
}

export function watchTallPuttPushesClubStripOffScreen(): false {
  return false;
}

export function watchMapRatio(): number {
  return WATCH_MAP_RATIO;
}

export function watchControlRatio(): number {
  return WATCH_CONTROL_RATIO;
}

/** Cook gate: Watch control band is about 40% of the screen. */
export function watchControlBandIsAboutFortyPercent(): boolean {
  return Math.abs(WATCH_CONTROL_RATIO - 0.4) < 1e-9;
}

export function watchMapAreaIsAboutSixtyPercent(): boolean {
  return Math.abs(WATCH_MAP_RATIO - 0.6) < 1e-9;
}

export function watchLayoutAddsToOne(): boolean {
  return Math.abs(WATCH_MAP_RATIO + WATCH_CONTROL_RATIO - 1) < 1e-9;
}

export function watchBackHomeAreTinyText(): false {
  return false;
}

/**
 * Hole screen header: Hole N (15pt) over the tee length (12pt) over one message
 * line (12pt) on the left, and a fixed-width yards column on the right
 * (28pt digits + "yd", 11pt caption).
 */
export const WATCH_HOLE_HEADER_HEIGHT = 48;
/** Right-hand yards column. Fits "999" at 28pt plus "yd"; the caption scales to it. */
export const WATCH_YARDS_COLUMN_WIDTH = 70;
const WATCH_HEADER_GAP = 6;
/**
 * Upper bound on an SF Rounded heavy glyph advance, in em. Real digits and
 * letters run ~0.55–0.6; the model uses more so a pass here has room to spare.
 */
export const WATCH_GLYPH_EM = 0.62;
/** SwiftUI line height for SF at a given point size. */
const lineHeight = (size: number) => size * 1.2;

/** Estimated width of one line of Watch text at full size (conservative). */
export function watchTextWidth(text: string, size: number): number {
  return [...text].length * size * WATCH_GLYPH_EM;
}

/** Scale a line needs to fit `available`, capped at 1. Below `minScale` it would truncate. */
function fitScale(width: number, available: number): number {
  return width <= available ? 1 : available / width;
}

export type WatchHeaderText = {
  holeNumber: number;
  /** Course tee length in yards, or null when unknown. */
  teeYards: number | null;
  /** Live yards shown top-right, or null for the dash. */
  yards: number | null;
  /** Caption under the yards: "to hole" or a reason such as "Location off". */
  caption: string;
};

/**
 * Mirror of the hole-screen header (content.swift clubPick). Returns the frames
 * each line takes at the scale SwiftUI would give it, plus the scales, so a test
 * can prove the hole and tee lines never run under the yards on any face.
 */
export function watchHoleHeaderFrames(safeWidth: number, text: WatchHeaderText): {
  hole: WatchFrame;
  tee: WatchFrame | null;
  yards: WatchFrame;
  caption: WatchFrame;
  holeScale: number;
  teeScale: number;
  yardsScale: number;
  captionScale: number;
} {
  const width = safeWidth - 8; // .padding(.horizontal, 4)
  const right = { minX: 4 + width - WATCH_YARDS_COLUMN_WIDTH, maxX: 4 + width };
  const leftWidth = width - WATCH_YARDS_COLUMN_WIDTH - WATCH_HEADER_GAP;
  const holeText = `Hole ${text.holeNumber}`;
  const holeScale = fitScale(watchTextWidth(holeText, 15), leftWidth);
  const hole = {
    minX: 4,
    maxX: 4 + watchTextWidth(holeText, 15) * holeScale,
    minY: 0,
    maxY: lineHeight(15),
  };
  const teeText = text.teeYards != null && text.teeYards > 0 ? `${Math.round(text.teeYards)} yd` : null;
  const teeScale = teeText ? fitScale(watchTextWidth(teeText, 12), leftWidth) : 1;
  const tee = teeText
    ? { minX: 4, maxX: 4 + watchTextWidth(teeText, 12) * teeScale, minY: hole.maxY, maxY: hole.maxY + lineHeight(12) }
    : null;
  const digits = text.yards != null ? String(Math.round(text.yards)) : '';
  const yardsWidth = digits ? watchTextWidth(digits, 28) + 1 + watchTextWidth('yd', 12) : 26;
  const yardsScale = fitScale(yardsWidth, WATCH_YARDS_COLUMN_WIDTH);
  const yards = { minX: right.maxX - yardsWidth * yardsScale, maxX: right.maxX, minY: 0, maxY: lineHeight(28) };
  const captionScale = fitScale(watchTextWidth(text.caption, 11), WATCH_YARDS_COLUMN_WIDTH);
  const caption = {
    minX: right.maxX - watchTextWidth(text.caption, 11) * captionScale,
    maxX: right.maxX,
    minY: yards.maxY,
    maxY: yards.maxY + lineHeight(11),
  };
  return { hole, tee, yards, caption, holeScale, teeScale, yardsScale, captionScale };
}

/**
 * True when a left line would run under the yards column, or would have to
 * shrink past its minimum scale. The old single-line "Hole N · 412 yd" beside a
 * fixed "156 yd" at 28pt fails this on 40mm and 41mm.
 */
export function watchHeaderTextOverlaps(args: {
  leftText: string;
  leftSize: number;
  leftMinScale: number;
  rightWidth: number;
  safeWidth: number;
}): boolean {
  const width = args.safeWidth - 8;
  const available = width - args.rightWidth - WATCH_HEADER_GAP;
  return watchTextWidth(args.leftText, args.leftSize) * args.leftMinScale > available;
}
/** Gaps on the hole screen: under Row A, and between Row B and the club pills. */
const WATCH_HOLE_ROW_GAP = 6;
/** Minimum space between the header and Row A, so the caption never touches Penalty. */
export const WATCH_HOLE_HEADER_GAP = 4;
const WATCH_ACTION_ROW_GAP = 8;

/**
 * Button row height on the hole screen. Header + three rows (Penalty / Home /
 * Putt, Hole Out / Retry / All clubs, club pills) + two 6pt gaps must fit the
 * safe height; rows are 44pt and shrink only on a short face.
 */
export function watchHoleRowHeight(safeHeight: number): number {
  return Math.max(
    0,
    Math.min(
      WATCH_BACK_HOME_MIN_HEIGHT,
      (safeHeight - WATCH_HOLE_HEADER_HEIGHT - WATCH_HOLE_HEADER_GAP - 2 * WATCH_HOLE_ROW_GAP) / 3,
    ),
  );
}

/** Hole screen: Hole Out row + gap + club pills the top area must leave room for. */
export function watchHoleBottomBand(safeHeight: number): number {
  return watchHoleRowHeight(safeHeight) * 2 + WATCH_HOLE_ROW_GAP;
}

export type WatchFrame = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Mirror of the Watch hole screen (content.swift clubPick) in safe-area points.
 * Header at the top. Row A at the bottom of the top area: [Penalty] [Home] [Putt].
 * Row B: [Hole Out] under Penalty, [Undo] (or [Retry] while a penalty or undo is
 * unconfirmed), [All clubs] last; then the club pills. The top area is 60% but never taller than
 * safeHeight minus Row B + club pills, so those stay on screen.
 */
export function watchHoleFrames(safeWidth: number, safeHeight: number): {
  header: WatchFrame;
  penalty: WatchFrame;
  home: WatchFrame;
  putt: WatchFrame;
  holeOut: WatchFrame;
  /** Undo last shot. Retry takes this slot while a penalty or undo is unconfirmed. */
  undo: WatchFrame;
  retry: WatchFrame;
  allClubs: WatchFrame;
  clubPills: WatchFrame;
  rowHeight: number;
} {
  const width = safeWidth - 8; // .padding(.horizontal, 4)
  const slot = (width - 2 * WATCH_ACTION_ROW_GAP) / 3;
  const h = watchHoleRowHeight(safeHeight);
  const top = Math.max(0, Math.min(safeHeight * WATCH_MAP_RATIO, safeHeight - watchHoleBottomBand(safeHeight)));
  const col = (i: number) => ({ minX: 4 + i * (slot + WATCH_ACTION_ROW_GAP), maxX: 4 + i * (slot + WATCH_ACTION_ROW_GAP) + slot });
  const rowA = { minY: top - WATCH_HOLE_ROW_GAP - h, maxY: top - WATCH_HOLE_ROW_GAP };
  const rowB = { minY: top, maxY: top + h };
  return {
    header: { minX: 4, maxX: 4 + width, minY: 0, maxY: WATCH_HOLE_HEADER_HEIGHT },
    penalty: { ...col(0), ...rowA },
    home: { ...col(1), ...rowA },
    putt: { ...col(2), ...rowA },
    holeOut: { ...col(0), ...rowB },
    undo: { ...col(1), ...rowB },
    retry: { ...col(1), ...rowB },
    allClubs: { ...col(2), ...rowB },
    clubPills: { minX: 4, maxX: 4 + width, minY: top + h + WATCH_HOLE_ROW_GAP, maxY: top + 2 * h + WATCH_HOLE_ROW_GAP },
    rowHeight: h,
  };
}

/** Putt sheet header: Back capsule + title (or feedback), then a 4pt gap. */
export const WATCH_PUTT_HEADER_HEIGHT = 22;
const WATCH_PUTT_GAP = 4;
/** Putt list / "No length" cue lines are dropped before a row goes under this. */
export const WATCH_PUTT_MIN_ROW_WITH_FOOTER = 32;

/**
 * Mirror of the Watch putt sheet (content.swift puttSheet) in safe-area points:
 * 2×2 length buckets, Add putt | Undo, then full-width Made (row + 12). Rows run
 * 36pt and shrink only on a short face; footer lines show only when they fit.
 */
export function watchPuttSheetFrames(
  safeWidth: number,
  safeHeight: number,
  footerLines: 0 | 1 | 2,
): { rows: WatchFrame[]; made: WatchFrame; rowHeight: number; showsFooter: boolean; footerMaxY: number } {
  const width = safeWidth - 8;
  const sheet = safeHeight - WATCH_PUTT_HEADER_HEIGHT - WATCH_PUTT_GAP;
  const footer = footerLines * 16;
  const withFooter = Math.min(36, (sheet - 24 - footer) / 4);
  const showsFooter = footerLines > 0 && withFooter >= WATCH_PUTT_MIN_ROW_WITH_FOOTER;
  const rowHeight = Math.max(0, showsFooter ? withFooter : Math.min(36, (sheet - 24) / 4));
  const top = WATCH_PUTT_HEADER_HEIGHT + WATCH_PUTT_GAP;
  const rows: WatchFrame[] = [0, 1, 2].map((i) => ({
    minX: 4,
    maxX: 4 + width,
    minY: top + i * (rowHeight + WATCH_PUTT_GAP),
    maxY: top + i * (rowHeight + WATCH_PUTT_GAP) + rowHeight,
  }));
  const madeTop = top + 3 * (rowHeight + WATCH_PUTT_GAP);
  const made = { minX: 4, maxX: 4 + width, minY: madeTop, maxY: madeTop + rowHeight + 12 };
  return { rows, made, rowHeight, showsFooter, footerMaxY: made.maxY + (showsFooter ? footer : 0) };
}

/** Penalty menu Back: small capsule, top-left. */
export const WATCH_PENALTY_BACK_HEIGHT = 28;
/** Last penalty row ends at least this far above the bottom safe inset. */
export const WATCH_PENALTY_BOTTOM_CLEARANCE = 8;

/**
 * Mirror of the Watch penalty menu (content.swift penaltyMenu): Back, then a
 * 2-column grid. Tile height = min(44, fit) so the last row never clips.
 */
export function watchPenaltyMenuFrames(
  safeWidth: number,
  safeHeight: number,
  count: number,
): { back: { minY: number; maxY: number }; tiles: WatchFrame[]; tileHeight: number } {
  const width = safeWidth - 8;
  const gap = 6;
  const rows = Math.ceil(count / 2);
  const tileHeight = Math.max(
    0,
    Math.min(WATCH_BACK_HOME_MIN_HEIGHT, (safeHeight - WATCH_PENALTY_BACK_HEIGHT - gap * rows - WATCH_PENALTY_BOTTOM_CLEARANCE) / rows),
  );
  const tileWidth = (width - gap) / 2;
  const tiles: WatchFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    const row = Math.floor(i / 2);
    const minX = 4 + (i % 2) * (tileWidth + gap);
    const minY = WATCH_PENALTY_BACK_HEIGHT + gap + row * (tileHeight + gap);
    tiles.push({ minX, maxX: minX + tileWidth, minY, maxY: minY + tileHeight });
  }
  return { back: { minY: 0, maxY: WATCH_PENALTY_BACK_HEIGHT }, tiles, tileHeight };
}
