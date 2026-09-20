import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  canMakeCurrentPutt,
  emptyPuttSheetPick,
  watchPuttSheetLengthLabel,
  watchPuttSheetMadeItAlwaysEnabled,
  watchPuttSheetMadeItIsFullWidthRow,
  watchPuttSheetMadeItIsHighContrastPill,
  watchPuttSheetMadeItLabel,
  watchPuttSheetMadeItUsesSystemProminent,
  watchPuttSheetPinsMadeIt,
  watchPuttSheetShowsInside3,
  WATCH_PUTT_LENGTHS,
} from './putts';
import {
  watchPlayHasDedicatedPuttControl,
  watchPuttControlAttachWatchFix,
  watchPuttControlInventGps,
  watchPuttControlInventYards,
  watchPuttControlOpensPuttSheet,
  watchPuttControlSitsAboveClubStrip,
  watchPuttControlSitsBesideBackHome,
} from './watchClubPick';

const WATCH_MADE = /Text\("Made(?: it)?"\)/;

test('TF 57: Watch Made is a large high-contrast pill — not borderedProminent dark-on-dark', () => {
  assert.equal(watchPuttSheetMadeItAlwaysEnabled(), true);
  assert.equal(watchPuttSheetPinsMadeIt(), true);
  assert.equal(watchPuttSheetMadeItIsFullWidthRow(), true);
  assert.equal(watchPuttSheetMadeItIsHighContrastPill(), true);
  assert.equal(watchPuttSheetMadeItUsesSystemProminent(), false);
  assert.equal(watchPuttSheetMadeItLabel(), 'Made');
  assert.equal(canMakeCurrentPutt(emptyPuttSheetPick()), true);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  assert.match(watchSheet, WATCH_MADE);
  assert.match(watchSheet, /Text\("Made"\)/);
  assert.ok(watchSheet.indexOf('Text("Add putt")') < watchSheet.indexOf('Text("Made")'));
  assert.ok(watchSheet.indexOf('Text("Undo")') < watchSheet.indexOf('Text("Made")'));

  const madeBtn = watchSheet.slice(watchSheet.indexOf('session.madeIt()'), watchSheet.indexOf('if !session.putt.lengths'));
  assert.doesNotMatch(madeBtn, /\.disabled/);
  assert.doesNotMatch(madeBtn, /borderedProminent/);
  assert.doesNotMatch(madeBtn, /Color\.black/);
  assert.match(madeBtn, /maxWidth: \.infinity/);
  assert.match(madeBtn, /minHeight: 48/);
  assert.match(madeBtn, /Color\.accentColor/);
  assert.match(madeBtn, /Color\("cream"\)/);
  assert.match(madeBtn, /Color\("bg"\)/);
  assert.match(madeBtn, /\.buttonStyle\(\.plain\)/);
  assert.match(madeBtn, /RoundedRectangle/);
  assert.match(watchSheet, /layoutPriority\(1\)/);

  const colors = readFileSync(new URL('../../targets/watch/expo-target.config.js', import.meta.url), 'utf8');
  assert.match(colors, /accent: '#C8F542'/);
  assert.match(colors, /cream: '#F4F1E8'/);
});

test('TF 57: 0–3 is always the top-left 2×2 cell — literal label, never a blank disabled pill', () => {
  assert.equal(watchPuttSheetShowsInside3(), true);
  assert.equal(watchPuttSheetLengthLabel('inside_3'), '0–3');
  assert.deepEqual(
    WATCH_PUTT_LENGTHS.map((row) => [row.id, row.label]),
    [
      ['inside_3', '0–3'],
      ['3_to_10', '3–10'],
      ['10_to_20', '10–20'],
      ['over_20', '20+'],
    ],
  );

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const watchSheet = watch.slice(watch.indexOf('private var puttSheet'), watch.indexOf('private var clubPick'));
  const lengthBtn = watch.slice(watch.indexOf('private func puttLengthButton'), watch.indexOf('private var clubPick'));

  assert.doesNotMatch(watchSheet, /LazyVGrid\(/);
  assert.match(watchSheet, /puttLengthButton\(id: "inside_3", label: "0–3"\)/);
  assert.match(watchSheet, /"0–3"/);
  assert.match(watchSheet, /"3–10"/);
  assert.match(watchSheet, /"10–20"/);
  assert.match(watchSheet, /"20\+"/);
  assert.ok(watchSheet.indexOf('"0–3"') < watchSheet.indexOf('"3–10"'));
  assert.ok(watchSheet.indexOf('"3–10"') < watchSheet.indexOf('"10–20"'));
  assert.ok(watchSheet.indexOf('"0–3"') < watchSheet.indexOf('Text("Made")'));
  const grid = watchSheet.slice(0, watchSheet.indexOf('Text("Add putt")'));
  assert.doesNotMatch(grid, /Under 3 ft/);
  assert.doesNotMatch(grid, /session\.putt\.label\(for:/);
  assert.doesNotMatch(lengthBtn, /\.disabled\(/);
  assert.match(lengthBtn, /Color\("cream"\)/);
  assert.match(lengthBtn, /\.buttonStyle\(\.plain\)/);

  const applySheet = session.slice(session.indexOf('private func applyPuttSheet'), session.indexOf('private func persist'));
  assert.match(applySheet, /labels\["inside_3"\] = "0–3"/);
  assert.match(session, /"inside_3": "0–3"/);
  assert.doesNotMatch(session, /"inside_3": "Under 3 ft"/);
});

test('TF 57: dedicated Putt sits next to Back/Home above the club strip — sheet only, no GPS', () => {
  assert.equal(watchPlayHasDedicatedPuttControl(), true);
  assert.equal(watchPuttControlSitsAboveClubStrip(), true);
  assert.equal(watchPuttControlSitsBesideBackHome(), true);
  assert.equal(watchPuttControlOpensPuttSheet(), true);
  assert.equal(watchPuttControlAttachWatchFix(), false);
  assert.equal(watchPuttControlInventGps(), false);
  assert.equal(watchPuttControlInventYards(), false);

  const watch = readFileSync(new URL('../../targets/watch/content.swift', import.meta.url), 'utf8');
  const clubPick = watch.slice(watch.indexOf('private var clubPick'), watch.indexOf('private var moreClubs'));
  const backAt = clubPick.indexOf('session.leave("back")');
  const homeAt = clubPick.indexOf('Text("Home")');
  const puttAt = clubPick.indexOf('session.openPuttSheet()');
  const puttLabelAt = clubPick.indexOf('Text("Putt")');
  const stripAt = clubPick.indexOf('ScrollView(.horizontal');
  const holeOutAt = clubPick.indexOf('Text("Hole Out")');
  assert.ok(backAt >= 0 && homeAt > backAt);
  assert.ok(puttAt > homeAt && puttAt < stripAt);
  assert.ok(puttLabelAt > homeAt && puttLabelAt < stripAt);
  assert.ok(holeOutAt > stripAt);
  assert.match(clubPick, /session\.openPuttSheet\(\)/);
  assert.doesNotMatch(clubPick, WATCH_MADE);

  const session = readFileSync(new URL('../../targets/watch/WatchClubSession.swift', import.meta.url), 'utf8');
  const openFn = session.slice(session.indexOf('func openPuttSheet'), session.indexOf('func pickPuttLength'));
  assert.match(openFn, /sheet\.open = true/);
  assert.doesNotMatch(openFn, /attachWatchFix/);
  assert.doesNotMatch(openFn, /lat|lng|accuracyM|yards/);
  assert.doesNotMatch(openFn, /selectedClubId/);
});
