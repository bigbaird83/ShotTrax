import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  finishedHoleCloserFlag,
  finishedHoleDisplayScore,
  finishedHoleMiniSummaryInventPuttGps,
  finishedHoleMiniSummaryInventPuttYards,
  finishedHoleMiniSummaryIsChip,
  finishedHoleMiniSummaryIsModal,
  finishedHoleMiniSummaryOpensScorecard,
  finishedHoleMiniSummaryShowsOnRevisit,
  finishedHoleMiniSummaryWritesScore,
  formatFinishedHoleLine,
  formatPuttCount,
  formatShotCount,
  planFinishedHoleMiniSummary,
} from './finishedHoleSummary';
import { COPY, holeOutClosedOnShot } from './playerCopy';
import {
  playFinishedHoleMiniSummaryIsChip,
  playFinishedHoleMiniSummaryIsModal,
} from './playLayout';
import {
  AUTO_PUTTS_FROM_GPS,
  AUTO_PUTTS_FROM_LEAVE_GREEN,
  MIC_SHOT_ASSIST,
  PUTT_ASSIST,
} from '../sensing/assists';

test('Signal Lab: TF 48 finished-hole revisit is a thin chip — score vs par, shots, putts, Hole Out/Made', () => {
  assert.equal(finishedHoleMiniSummaryIsChip(), true);
  assert.equal(finishedHoleMiniSummaryIsModal(), false);
  assert.equal(playFinishedHoleMiniSummaryIsChip(), true);
  assert.equal(playFinishedHoleMiniSummaryIsModal(), false);
  assert.equal(finishedHoleMiniSummaryShowsOnRevisit(), true);
  assert.equal(finishedHoleMiniSummaryOpensScorecard(), true);
  assert.equal(finishedHoleMiniSummaryWritesScore(), false);
  assert.equal(finishedHoleMiniSummaryInventPuttGps(), false);
  assert.equal(finishedHoleMiniSummaryInventPuttYards(), false);
  assert.equal(PUTT_ASSIST, false);
  assert.equal(AUTO_PUTTS_FROM_GPS, false);
  assert.equal(AUTO_PUTTS_FROM_LEAVE_GREEN, false);
  assert.equal(MIC_SHOT_ASSIST, false);

  const hidden = planFinishedHoleMiniSummary({
    puttsDone: false,
    score: 4,
    par: 4,
    shotCount: 3,
    putts: 1,
    shots: [{ seq: 1, holeOut: false }],
  });
  assert.equal(hidden.visible, false);
  assert.equal(hidden.kind, 'chip');
  assert.equal(hidden.modal, false);
  assert.equal(hidden.line, '');

  const placing = planFinishedHoleMiniSummary({
    puttsDone: true,
    placing: true,
    score: 4,
    par: 4,
    shotCount: 3,
    putts: 1,
    shots: [],
  });
  assert.equal(placing.visible, false);

  const catchUp = planFinishedHoleMiniSummary({
    puttsDone: true,
    catchUpFullScreen: true,
    score: 4,
    par: 4,
    shotCount: 3,
    putts: 1,
    shots: [],
  });
  assert.equal(catchUp.visible, false);

  const holeOut = planFinishedHoleMiniSummary({
    puttsDone: true,
    score: 4,
    par: 5,
    shotCount: 4,
    putts: 0,
    shots: [
      { seq: 1, holeOut: false },
      { seq: 2, holeOut: true },
    ],
  });
  assert.equal(holeOut.visible, true);
  assert.equal(holeOut.kind, 'chip');
  assert.equal(holeOut.modal, false);
  assert.equal(holeOut.score, 4);
  assert.equal(holeOut.par, 5);
  assert.equal(holeOut.vsPar, '-1');
  assert.equal(holeOut.vsParTone, 'good');
  assert.equal(holeOut.shotCount, 4);
  assert.equal(holeOut.putts, 0);
  assert.equal(holeOut.shotsLabel, '4 shots');
  assert.equal(holeOut.puttsLabel, '0 putts');
  assert.equal(holeOut.flag, holeOutClosedOnShot(2));
  assert.equal(holeOut.line, '4 · -1 · 4 shots · 0 putts · Hole Out · shot 2');
  assert.match(holeOut.accessibilityLabel, /Finished hole/);
  assert.match(holeOut.accessibilityLabel, /Hole Out · shot 2/);

  const made = planFinishedHoleMiniSummary({
    puttsDone: true,
    score: 5,
    par: 4,
    shotCount: 3,
    putts: 2,
    shots: [{ seq: 1, holeOut: false }],
  });
  assert.equal(made.visible, true);
  assert.equal(made.vsPar, '+1');
  assert.equal(made.vsParTone, 'bad');
  assert.equal(made.shotsLabel, '3 shots');
  assert.equal(made.puttsLabel, '2 putts');
  assert.equal(made.flag, COPY.madeIt);
  assert.equal(made.line, '5 · +1 · 3 shots · 2 putts · Made it');

  const even = planFinishedHoleMiniSummary({
    puttsDone: true,
    score: 4,
    par: 4,
    shotCount: 2,
    putts: 2,
    shots: [],
  });
  assert.equal(even.vsPar, 'E');
  assert.equal(even.vsParTone, 'even');
  assert.equal(even.flag, COPY.madeIt);

  const logged = planFinishedHoleMiniSummary({
    puttsDone: true,
    score: null,
    par: 4,
    shotCount: 3,
    putts: 1,
    shots: [{ seq: 3, holeOut: true }],
  });
  assert.equal(logged.score, 4);
  assert.equal(logged.vsPar, 'E');
  assert.equal(logged.flag, 'Hole Out · shot 3');
  assert.equal(finishedHoleDisplayScore({ score: null, shotCount: 3, putts: 1, penaltyStrokes: 1 }), 5);
  assert.equal(finishedHoleDisplayScore({ score: 6, shotCount: 3, putts: 1 }), 6);

  const noPar = planFinishedHoleMiniSummary({
    puttsDone: true,
    score: 4,
    par: null,
    shotCount: 4,
    putts: 0,
    shots: [{ seq: 1, holeOut: true }],
  });
  assert.equal(noPar.vsPar, null);
  assert.equal(noPar.line, '4 · 4 shots · 0 putts · Hole Out · shot 1');

  assert.equal(formatShotCount(1), '1 shot');
  assert.equal(formatPuttCount(1), '1 putt');
  assert.equal(finishedHoleCloserFlag({ shots: [{ seq: 2, holeOut: true }], putts: 2 }), 'Hole Out · shot 2');
  assert.equal(finishedHoleCloserFlag({ shots: [{ seq: 1, holeOut: false }], putts: 2 }), 'Made it');
  assert.equal(finishedHoleCloserFlag({ shots: [], putts: 0 }), null);
  assert.equal(
    formatFinishedHoleLine({
      score: 3,
      vsPar: '-1',
      shotsLabel: '2 shots',
      puttsLabel: '1 putt',
      flag: 'Made it',
    }),
    '3 · -1 · 2 shots · 1 putt · Made it',
  );
});

test('Signal Lab: TF 48 chip sits in play header chrome; putt sheet / dock / Add shot / pan-pinch stay', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const play = hole.slice(0, hole.indexOf('<FullSheet'));
  assert.match(play, /planFinishedHoleMiniSummary/);
  assert.match(play, /puttsDone: hole\.puttsDone/);
  const header = play.slice(play.indexOf('styles.stickyInner'), play.indexOf('!hideHoleButtons'));
  assert.match(header, /testID="finished-hole-chip"/);
  assert.match(header, /testID="finished-hole-flag"/);
  assert.match(header, /styles\.finishedHoleChip/);
  assert.match(header, /styles\.scorecardChip/);
  assert.match(header, /setScorecardOpen\(true\)/);
  assert.match(header, /finishedMini\.vsPar/);
  assert.match(header, /finishedMini\.shotsLabel/);
  assert.match(header, /finishedMini\.puttsLabel/);
  assert.match(header, /finishedMini\.flag/);
  assert.doesNotMatch(header, /Modal|confetti|Alert\.alert\(/i);
  assert.doesNotMatch(header, /puttGps|inventPutt|greenEdge|centroid/i);

  const dock = hole.slice(hole.indexOf('style={[styles.dock'), hole.indexOf('<FullSheet'));
  assert.match(dock, /testID="play-dock-hole-out"/);
  assert.match(dock, /COPY\.holeOut/);
  assert.match(dock, /onFinishHole/);
  assert.doesNotMatch(dock, /finished-hole-chip|planFinishedHoleMiniSummary/);

  const sheet = readFileSync(new URL('../ui/PuttSheetBody.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(sheet, /planFinishedHoleMiniSummary|finished-hole-chip/);
  assert.match(sheet, /pickPuttLength/);
  assert.match(sheet, /COPY\.addPutt/);
  assert.match(sheet, /COPY\.madeIt/);
  assert.doesNotMatch(sheet, /COPY\.holeOut/);

  const puttDock = readFileSync(new URL('../ui/PuttDock.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(puttDock, /planFinishedHoleMiniSummary|finished-hole-chip/);

  const map = readFileSync(new URL('../ui/HoleMap.tsx', import.meta.url), 'utf8');
  assert.match(map, /scrollEnabled=\{framedForGestures\}/);
  assert.match(map, /zoomEnabled=\{framedForGestures\}/);
  assert.doesNotMatch(map, /planFinishedHoleMiniSummary/);

  const place = readFileSync(new URL('./placeToDrag.ts', import.meta.url), 'utf8');
  assert.match(place, /resolveAddShotFromPin/);
  assert.doesNotMatch(place, /planFinishedHoleMiniSummary/);

  const assists = readFileSync(new URL('../sensing/assists.ts', import.meta.url), 'utf8');
  assert.match(assists, /MIC_SHOT_ASSIST = false/);
  assert.match(assists, /PUTT_ASSIST = false/);
  assert.doesNotMatch(assists, /CoreMotion/);
});
