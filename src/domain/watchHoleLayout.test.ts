import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PENALTY_REASONS } from './penalty';
import {
  WATCH_HOLE_HEADER_GAP,
  WATCH_HOLE_HEADER_HEIGHT,
  WATCH_YARDS_COLUMN_WIDTH,
  watchHeaderTextOverlaps,
  watchHoleHeaderFrames,
  WATCH_PENALTY_BOTTOM_CLEARANCE,
  WATCH_PUTT_HEADER_HEIGHT,
  watchHoleFrames,
  watchPenaltyMenuFrames,
  watchPuttSheetFrames,
  type WatchFrame,
} from './watchLayout';

// Safe-area sizes, points. Ultra 49mm screen is 205×251; the clock inset takes
// the top, so the usable height is lower. Sweep a band that covers 40mm SE → Ultra.
const FACES = [
  { name: '40mm', width: 162, heights: [160, 170] },
  { name: '41mm', width: 176, heights: [170, 185, 200] },
  { name: '45mm', width: 198, heights: [190, 205, 215] },
  { name: 'Ultra 49mm', width: 205, heights: [200, 210, 220, 251] },
];
const EPS = 1e-9;

const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
const pick = watchUi.slice(watchUi.indexOf('private var clubPick'), watchUi.indexOf('private var moreClubs'));
const menu = watchUi.slice(watchUi.indexOf('private var penaltyMenu'), watchUi.indexOf('private func penaltyTile'));

function onScreen(r: WatchFrame, width: number, height: number, label: string) {
  assert.ok(r.minX >= 0 && r.maxX <= width + EPS, `${label}: x`);
  assert.ok(r.minY >= -EPS && r.maxY <= height + EPS, `${label}: y`);
}

test('Watch hole: every button is on screen from 40mm to Ultra; Penalty | Home | Putt are Hole Out-sized', () => {
  assert.equal(WATCH_HOLE_HEADER_HEIGHT, 48);
  for (const face of FACES) {
    for (const height of face.heights) {
      const f = watchHoleFrames(face.width, height);
      const label = `${face.name} @ ${height}`;
      const w = (r: { minX: number; maxX: number }) => r.maxX - r.minX;
      const h = (r: { minY: number; maxY: number }) => r.maxY - r.minY;
      // Not a full-width primary: every chrome button shares one size.
      for (const other of [f.home, f.putt, f.holeOut, f.undo, f.retry, f.allClubs]) {
        assert.ok(Math.abs(w(f.penalty) - w(other)) < EPS, label);
        assert.ok(Math.abs(h(f.penalty) - h(other)) < EPS, label);
      }
      assert.ok(w(f.penalty) < (face.width - 8) / 2, label);
      // Full 44pt rows from 196pt up; never under 32pt on the smallest face.
      if (height >= 196) assert.equal(f.rowHeight, 44, label);
      assert.ok(f.rowHeight >= 32, label);
      // Penalty left, directly above Hole Out; Home / Putt share its row.
      assert.equal(f.penalty.minX, f.holeOut.minX, label);
      assert.ok(f.header.maxY + WATCH_HOLE_HEADER_GAP <= f.penalty.minY + EPS, label);
      assert.ok(f.penalty.maxY <= f.holeOut.minY, label);
      assert.equal(f.home.minY, f.penalty.minY, label);
      assert.equal(f.putt.minY, f.penalty.minY, label);
      assert.equal(f.allClubs.minY, f.holeOut.minY, label);
      // Undo sits in Row B's middle slot, between Hole Out and All clubs.
      assert.equal(f.undo.minY, f.holeOut.minY, label);
      assert.ok(f.holeOut.maxX < f.undo.minX && f.undo.maxX < f.allClubs.minX, label);
      assert.deepEqual(f.retry, f.undo, label);
      assert.ok(f.putt.maxX <= face.width - 4 + EPS, label);
      assert.ok(f.allClubs.maxX <= face.width - 4 + EPS, label);
      assert.ok(f.clubPills.minY >= f.holeOut.maxY, label);
      for (const [name, r] of Object.entries(f)) {
        if (typeof r === 'number') continue;
        onScreen(r, face.width, height, `${label} ${name}`);
      }
    }
  }
});

test('Watch header: Hole N and the tee length never run under the yards, 40mm to Ultra', () => {
  assert.equal(WATCH_YARDS_COLUMN_WIDTH, 70);
  // Worst cases: two-digit hole, three-digit tee and yards, the longest caption.
  const cases = [
    { holeNumber: 18, teeYards: 612, yards: 999, caption: 'Location off' },
    { holeNumber: 7, teeYards: 412, yards: 156, caption: 'to hole' },
    { holeNumber: 1, teeYards: null, yards: null, caption: 'Finding GPS' },
    { holeNumber: 12, teeYards: 88, yards: 7, caption: 'Weak GPS' },
  ];
  for (const face of FACES) {
    for (const text of cases) {
      const f = watchHoleHeaderFrames(face.width, text);
      const label = `${face.name} · Hole ${text.holeNumber} · ${text.teeYards ?? '—'} yd · ${text.yards ?? '—'}`;
      const yardsLeft = Math.min(f.yards.minX, f.caption.minX);
      // The case that fails when header text overlaps the yardage.
      assert.ok(f.hole.maxX <= yardsLeft, `${label}: Hole N runs under the yards`);
      if (f.tee) assert.ok(f.tee.maxX <= yardsLeft, `${label}: tee length runs under the yards`);
      // Scaled, never dropped: both lines keep at least 75% size (the Swift minimumScaleFactor).
      assert.ok(f.holeScale >= 0.75, `${label}: Hole N would truncate`);
      assert.ok(f.teeScale >= 0.75, `${label}: tee length would truncate`);
      assert.ok(f.yardsScale >= 0.6 && f.captionScale >= 0.7, `${label}: yards column would truncate`);
      // Everything fits the header band.
      for (const r of [f.hole, f.tee, f.yards, f.caption]) {
        if (!r) continue;
        onScreen(r, face.width, WATCH_HOLE_HEADER_HEIGHT, label);
      }
      if (f.tee) assert.ok(f.tee.maxY + 12 * 1.2 <= WATCH_HOLE_HEADER_HEIGHT + EPS, `${label}: no room for the message line`);
    }
  }
  // The #179 header — "Hole 7 · 412 yd" on one line beside "156 yd" at 28pt — is
  // what this guards against: it overlaps on 40mm and 41mm even at 60% scale.
  const oldYards = 6 * 28 * 0.62;
  for (const width of [162, 176]) {
    assert.equal(
      watchHeaderTextOverlaps({ leftText: 'Hole 7 · 412 yd', leftSize: 16, leftMinScale: 0.6, rightWidth: oldYards, safeWidth: width }),
      true,
    );
  }
  assert.equal(
    watchHeaderTextOverlaps({ leftText: 'Hole 18', leftSize: 15, leftMinScale: 1, rightWidth: WATCH_YARDS_COLUMN_WIDTH, safeWidth: 162 }),
    false,
  );
});

test('Watch putt sheet: 2×2 lengths, Add | Undo and Made stay on screen from 40mm to Ultra', () => {
  assert.equal(WATCH_PUTT_HEADER_HEIGHT, 22);
  for (const face of FACES) {
    for (const height of face.heights) {
      for (const lines of [0, 1, 2] as const) {
        const f = watchPuttSheetFrames(face.width, height, lines);
        const label = `${face.name} @ ${height} × ${lines} lines`;
        for (const r of [...f.rows, f.made]) onScreen(r, face.width, height, label);
        assert.ok(f.footerMaxY <= height + EPS, label);
        assert.ok(f.rowHeight >= 26 && f.rowHeight <= 36, label);
        assert.ok(f.made.maxY - f.made.minY <= 48 + EPS, label);
      }
    }
  }
  // Ultra keeps the full 36pt rows and 48pt Made with the putt list showing.
  const ultra = watchPuttSheetFrames(205, 251, 1);
  assert.equal(ultra.rowHeight, 36);
  assert.equal(ultra.made.maxY - ultra.made.minY, 48);
  assert.equal(ultra.showsFooter, true);
});

test('Watch hole + putt sheet source use the same row math as the layout model', () => {
  assert.match(pick, /let headerHeight: CGFloat = 48/);
  assert.match(pick, /let yardsColumnWidth: CGFloat = 70/);
  assert.match(pick, /\.frame\(width: yardsColumnWidth, alignment: \.trailing\)/);
  // Hole N and the tee length are two lines that scale (never dropped), not one squeezed line.
  assert.match(pick, /Text\("Hole \\\(session\.list\.holeNumber\)"\)\s*\.font\(\.system\(size: 15, weight: \.heavy, design: \.rounded\)\)[\s\S]{0,120}\.minimumScaleFactor\(0\.75\)/);
  assert.match(pick, /if let tee = session\.list\.teeLengthLabel \{\s*Text\(tee\)\s*\.font\(\.system\(size: 12,[\s\S]{0,160}\.minimumScaleFactor\(0\.75\)/);
  assert.doesNotMatch(pick, /Text\(session\.list\.statusLine\)\s*\.font/);
  assert.match(pick, /let rowHeight = max\(0, min\(44, \(geo\.size\.height - headerHeight - 16\) \/ 3\)\)/);
  assert.equal(WATCH_HOLE_HEADER_GAP, 4);
  assert.match(pick, /let mapHeight = max\(0, min\(geo\.size\.height \* 0\.6, geo\.size\.height - \(rowHeight \* 2 \+ 6\)\)\)/);
  assert.match(pick, /\.frame\(width: pillWidth, height: rowHeight\)/);
  assert.match(pick, /Text\("All clubs"\)/);
  assert.match(pick, /\.frame\(width: slotWidth, height: rowHeight\)/);
  assert.doesNotMatch(pick, /if showAllClubs/);
  assert.match(watchUi, /\} else if showAllClubs \{\s*allClubsList/);
  const sheet = watchUi.slice(watchUi.indexOf('private var puttSheet'), watchUi.indexOf('private func puttLengthButton'));
  assert.match(sheet, /let rowWithFooter = min\(36, \(geo\.size\.height - 24 - footerHeight\) \/ 4\)/);
  assert.match(sheet, /let showsFooter = footerLines > 0 && rowWithFooter >= 32/);
  assert.match(sheet, /let madeHeight = rowHeight \+ 12/);
});

test('Watch penalty menu: every reason is an equal 2-column tile; last row clears the bottom inset', () => {
  assert.equal(PENALTY_REASONS.length, 4);
  for (const count of [PENALTY_REASONS.length, 6]) {
    for (const face of FACES) {
      for (const height of face.heights) {
        const m = watchPenaltyMenuFrames(face.width, height, count);
        const label = `${face.name} @ ${height} × ${count}`;
        assert.equal(m.tiles.length, count, label);
        assert.ok(m.tileHeight >= 30 && m.tileHeight <= 44, label);
        for (const t of m.tiles) {
          assert.ok(Math.abs(t.maxX - t.minX - (m.tiles[0].maxX - m.tiles[0].minX)) < EPS, label);
          assert.ok(t.minY >= m.back.maxY, label);
          assert.ok(t.maxX <= face.width - 4 + EPS, label);
        }
        const last = Math.max(...m.tiles.map((t) => t.maxY));
        assert.ok(last <= height - WATCH_PENALTY_BOTTOM_CLEARANCE + EPS, label);
      }
    }
  }
  // 49mm Ultra, four reasons: full 44pt tiles, nothing shrunk or clipped.
  const ultra = watchPenaltyMenuFrames(205, 210, 4);
  assert.equal(ultra.tileHeight, 44);
});

test('Watch hole + penalty menu source match the layout model', () => {
  assert.equal((pick.match(/actionPill\("Penalty"\)/g) ?? []).length, 1);

  // Row A in the top area's spare space: Penalty, Home, Putt in one HStack(spacing: 8).
  const topArea = pick.slice(0, pick.indexOf('.frame(height: mapHeight'));
  const rowA = topArea.slice(topArea.lastIndexOf('HStack(spacing: 8)'));
  assert.ok(topArea.lastIndexOf('Spacer(minLength: 0)') < topArea.lastIndexOf('HStack(spacing: 8)'));
  const pAt = rowA.indexOf('actionPill("Penalty")');
  const hAt = rowA.indexOf('actionPill("Home")');
  const tAt = rowA.indexOf('actionPill("Putt")');
  assert.ok(pAt >= 0 && pAt < hAt && hAt < tAt);
  assert.doesNotMatch(rowA, /borderedProminent|\.background\(/);

  // Row B: Hole Out first (same column as Penalty), then the club pills.
  const control = pick.slice(topArea.length);
  const rowB = control.slice(control.indexOf('HStack(spacing: 8)'), control.indexOf('GeometryReader { wheelGeo'));
  assert.ok(rowB.indexOf('actionPill("Hole Out")') >= 0);
  assert.ok(rowB.indexOf('actionPill("Hole Out")') < rowB.indexOf('emptyPillSlot'));
  assert.match(watchUi, /private var emptyPillSlot: some View \{\s*Color\.clear\.frame\(maxWidth: \.infinity, maxHeight: \.infinity\)/);
  assert.doesNotMatch(control, /actionPill\("Home"\)|actionPill\("Putt"\)|actionPill\("Penalty"\)/);
  // Retry is a slot on Row B, not its own full-width row; the choices live on penaltyMenu.
  assert.match(rowB, /actionPill\("Retry"\)/);
  assert.doesNotMatch(pick, /pickPenalty\(/);

  // Penalty menu: its own screen, small Back, 2 × 2 tiles sized to fit.
  assert.match(watchUi, /else if session\.penaltyChoicesOpen \{\s*penaltyMenu/);
  assert.match(menu, /let backHeight: CGFloat = 28/);
  assert.match(menu, /let tileHeight = max\(0, min\(44, \(geo\.size\.height - backHeight - 6 \* rows - 8\) \/ rows\)\)/);
  assert.match(menu, /session\.closePenaltyChoices\(\)/);
  const back = menu.slice(0, menu.indexOf('HStack(spacing: 6)'));
  assert.doesNotMatch(back, /maxWidth: \.infinity/);
  assert.equal((menu.match(/HStack\(spacing: 6\)/g) ?? []).length, 2);
  for (const row of PENALTY_REASONS) {
    assert.match(menu, new RegExp(`penaltyTile\\("${row.label}", height: tileHeight\\)`));
    assert.match(menu, new RegExp(`pickPenalty\\("${row.reason}"\\)`));
  }
  assert.doesNotMatch(menu, /ScrollView/);
  const tile = watchUi.slice(watchUi.indexOf('private func penaltyTile'), watchUi.indexOf('private var clubPick'));
  assert.match(tile, /lineLimit\(1\)/);
  assert.match(tile, /minimumScaleFactor\(0\.5\)/);
  assert.match(tile, /cornerRadius: 10/);
});
