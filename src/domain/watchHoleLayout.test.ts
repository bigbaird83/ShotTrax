import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { WATCH_HOLE_BOTTOM_BAND, watchHoleFrames } from './watchLayout';

// Safe-area sizes, points. Ultra 49mm screen is 205×251; the clock inset takes
// the top, so the usable height is lower. Sweep a band that covers 41mm → Ultra.
const FACES = [
  { name: '41mm', width: 176, heights: [170, 185, 200] },
  { name: '45mm', width: 198, heights: [190, 205, 215] },
  { name: 'Ultra 49mm', width: 205, heights: [200, 210, 220, 251] },
];

test('Watch hole: Penalty is a Hole Out-sized pill above Hole Out; Hole Out + pills stay on screen', () => {
  assert.equal(WATCH_HOLE_BOTTOM_BAND, 102);
  for (const face of FACES) {
    for (const height of face.heights) {
      const f = watchHoleFrames(face.width, height);
      const label = `${face.name} @ ${height}`;
      // Not a full-width primary: same width as Hole Out, well under the row.
      assert.equal(f.penalty.maxX - f.penalty.minX, f.holeOut.maxX - f.holeOut.minX, label);
      assert.ok(f.penalty.maxX - f.penalty.minX < (face.width - 8) / 2, label);
      assert.equal(f.penalty.maxY - f.penalty.minY, f.holeOut.maxY - f.holeOut.minY, label);
      // Left, directly above Hole Out.
      assert.equal(f.penalty.minX, f.holeOut.minX, label);
      assert.ok(f.penalty.maxY <= f.holeOut.minY, label);
      assert.ok(f.penalty.minY >= 0, label);
      // Hole Out row fully inside the bottom safe area; club pills too.
      assert.ok(f.holeOut.minY < height && f.holeOut.maxY <= height, label);
      assert.ok(f.putt.maxX <= face.width - 4 + 1e-9, label);
      assert.ok(f.clubPills.maxY <= height, label);
    }
  }
});

test('Watch hole source matches the layout model; Penalty is not a full-width row', () => {
  const watchUi = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const pick = watchUi.slice(watchUi.indexOf('private var clubPick'), watchUi.indexOf('private var moreClubs'));
  assert.match(pick, /let mapHeight = max\(0, min\(geo\.size\.height \* 0\.6, geo\.size\.height - 102\)\)/);
  assert.equal((pick.match(/actionPill\("Penalty"\)/g) ?? []).length, 1);

  const topArea = pick.slice(0, pick.indexOf('.frame(height: mapHeight'));
  const penaltyAt = topArea.indexOf('actionPill("Penalty")');
  assert.ok(penaltyAt > topArea.lastIndexOf('Spacer(minLength: 0)'));
  // Penalty shares an HStack(spacing: 8) with two empty Hole Out-sized slots.
  const row = topArea.slice(topArea.lastIndexOf('HStack(spacing: 8)', penaltyAt));
  assert.equal((row.match(/Color\.clear\.frame\(maxWidth: \.infinity, minHeight: 44\)/g) ?? []).length, 2);
  // Hole Out / Home / Putt stay one row after Penalty, with the club pills under it.
  const holeOutAt = pick.indexOf('actionPill("Hole Out")');
  assert.ok(penaltyAt < holeOutAt);
  const bottom = pick.slice(pick.indexOf('HStack(spacing: 8)', topArea.length));
  assert.ok(bottom.indexOf('actionPill("Hole Out")') < bottom.indexOf('actionPill("Home")'));
  assert.ok(bottom.indexOf('actionPill("Home")') < bottom.indexOf('actionPill("Putt")'));
  assert.ok(bottom.indexOf('actionPill("Putt")') < bottom.indexOf('ScrollView(.horizontal'));
  // Penalty uses the shared outlined pill — no prominent / filled restyle.
  assert.doesNotMatch(row.slice(0, row.indexOf('.padding(.bottom, 6)')), /borderedProminent|\.background\(/);
});
