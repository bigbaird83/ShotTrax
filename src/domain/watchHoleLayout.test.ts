import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PENALTY_REASONS } from './penalty';
import {
  WATCH_HOLE_BOTTOM_BAND,
  WATCH_PENALTY_BOTTOM_CLEARANCE,
  watchHoleFrames,
  watchPenaltyMenuFrames,
} from './watchLayout';

// Safe-area sizes, points. Ultra 49mm screen is 205×251; the clock inset takes
// the top, so the usable height is lower. Sweep a band that covers 41mm → Ultra.
const FACES = [
  { name: '41mm', width: 176, heights: [170, 185, 200] },
  { name: '45mm', width: 198, heights: [190, 205, 215] },
  { name: 'Ultra 49mm', width: 205, heights: [200, 210, 220, 251] },
];
const EPS = 1e-9;

const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
const pick = watchUi.slice(watchUi.indexOf('private var clubPick'), watchUi.indexOf('private var moreClubs'));
const menu = watchUi.slice(watchUi.indexOf('private var penaltyMenu'), watchUi.indexOf('private func penaltyTile'));

test('Watch hole: Penalty | Home | Putt are Hole Out-sized; Hole Out + pills stay on screen', () => {
  assert.equal(WATCH_HOLE_BOTTOM_BAND, 102);
  for (const face of FACES) {
    for (const height of face.heights) {
      const f = watchHoleFrames(face.width, height);
      const label = `${face.name} @ ${height}`;
      const w = (r: { minX: number; maxX: number }) => r.maxX - r.minX;
      const h = (r: { minY: number; maxY: number }) => r.maxY - r.minY;
      // Not a full-width primary: all four chrome buttons share one size.
      for (const other of [f.home, f.putt, f.holeOut]) {
        assert.ok(Math.abs(w(f.penalty) - w(other)) < EPS, label);
        assert.ok(Math.abs(h(f.penalty) - h(other)) < EPS, label);
      }
      assert.ok(w(f.penalty) < (face.width - 8) / 2, label);
      // Penalty left, directly above Hole Out; Home / Putt share its row.
      assert.equal(f.penalty.minX, f.holeOut.minX, label);
      assert.ok(f.penalty.maxY <= f.holeOut.minY, label);
      assert.ok(f.penalty.minY >= 0, label);
      assert.equal(f.home.minY, f.penalty.minY, label);
      assert.equal(f.putt.minY, f.penalty.minY, label);
      assert.ok(f.putt.maxX <= face.width - 4 + EPS, label);
      // Hole Out row fully inside the bottom safe area; club pills under it too.
      assert.ok(f.holeOut.minY < height && f.holeOut.maxY <= height, label);
      assert.ok(f.clubPills.minY >= f.holeOut.maxY && f.clubPills.maxY <= height + EPS, label);
    }
  }
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
  assert.match(pick, /let mapHeight = max\(0, min\(geo\.size\.height \* 0\.6, geo\.size\.height - 102\)\)/);
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
  assert.match(watchUi, /private var emptyPillSlot: some View \{\s*Color\.clear\.frame\(maxWidth: \.infinity, minHeight: 44\)/);
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
