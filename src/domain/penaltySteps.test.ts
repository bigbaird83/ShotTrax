import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  formatHoleCountLine,
  formatPenaltyCount,
  formatShotStepChip,
  orderHoleSteps,
  penaltiesMissingFromSteps,
  type HoleStepPenalty,
  type HoleStepShot,
} from './penaltySteps';

const eightIron: HoleStepShot = {
  id: 's1',
  seq: 1,
  startedAt: '2026-09-20T15:00:00.000Z',
  endedAt: '2026-09-20T15:01:00.000Z',
};
const wedge: HoleStepShot = {
  id: 's2',
  seq: 2,
  startedAt: '2026-09-20T15:03:00.000Z',
  endedAt: '2026-09-20T15:04:00.000Z',
};

function obAfterEightIron(): HoleStepPenalty {
  return {
    id: 'p-ob',
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'penalty',
    createdAt: '2026-09-20T15:02:00.000Z',
  };
}

function labels(shots: HoleStepShot[], penalties: HoleStepPenalty[], clubs: Record<string, string>, yards: Record<string, number>) {
  return orderHoleSteps(shots, penalties).map((step) => {
    if (step.kind === 'penalty') return step.label;
    const shot = shots[step.sourceIndex];
    return formatShotStepChip({
      seq: shot.seq ?? 0,
      clubShortName: clubs[shot.id ?? ''],
      source: 'gps',
      fixQuality: 'good',
      endedAt: shot.endedAt,
      distanceYards: yards[shot.id ?? ''],
    });
  });
}

test('one OB after the 8i is its own chip between the shots, and the count adds up', () => {
  const shots = [eightIron, wedge];
  const penalties = [obAfterEightIron()];
  assert.deepEqual(
    labels(shots, penalties, { s1: '8i', s2: '56°' }, { s1: 170, s2: 97 }),
    ['1 8i · 170 yd', '+1 OB', '2 56° · 97 yd'],
  );
  const steps = orderHoleSteps(shots, penalties);
  const penalty = steps.find((step) => step.kind === 'penalty');
  assert.ok(penalty && penalty.kind === 'penalty');
  assert.equal(penalty.label, '+1 OB');
  assert.doesNotMatch(penalty.label, /\d+ (8i|56°)|yd/);
  assert.equal(formatHoleCountLine({ shotCount: 2, penaltyStrokes: 1, puttCount: 2 }), '2 shots · 1 penalty · 2 putts');
  assert.equal(formatPenaltyCount(1), '1 penalty');
  assert.deepEqual(penaltiesMissingFromSteps(penalties, steps), []);
});

test('multiple penalties keep timestamp order and use the stored type label', () => {
  const water: HoleStepPenalty = {
    id: 'p-water',
    strokes: 1,
    reason: 'water',
    note: null,
    kind: 'penalty',
    createdAt: '2026-09-20T15:02:30.000Z',
  };
  const drop: HoleStepPenalty = {
    id: 'p-drop',
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'drop',
    createdAt: '2026-09-20T15:04:30.000Z',
  };
  const unplayable: HoleStepPenalty = {
    id: 'p-unp',
    strokes: 2,
    reason: 'unplayable',
    note: null,
    kind: 'penalty',
    createdAt: '2026-09-20T15:02:10.000Z',
  };
  const steps = orderHoleSteps([eightIron, wedge], [water, drop, unplayable]);
  assert.deepEqual(
    steps.map((step) => (step.kind === 'penalty' ? step.label : step.id)),
    ['s1', '+2 Unplayable', '+1 Water', 's2', 'Drop +1 · OB'],
  );
  assert.equal(formatPenaltyCount(1 + 1 + 2), '4 penalties');
  assert.equal(
    formatHoleCountLine({ shotCount: 2, penaltyStrokes: 4, puttCount: 2 }),
    '2 shots · 4 penalties · 2 putts',
  );
  assert.equal(formatShotStepChip({
    seq: 1,
    clubShortName: '8i',
    source: 'gps',
    fixQuality: 'good',
    endedAt: eightIron.endedAt,
    distanceYards: 170,
  }), '1 8i · 170 yd');
});

test('no penalties leaves the count line without a penalty piece', () => {
  const steps = orderHoleSteps([eightIron, wedge], []);
  assert.deepEqual(
    steps.map((step) => step.kind),
    ['shot', 'shot'],
  );
  assert.equal(formatPenaltyCount(0), null);
  assert.equal(formatPenaltyCount(null), null);
  assert.equal(formatHoleCountLine({ shotCount: 2, penaltyStrokes: 0, puttCount: 2 }), '2 shots · 2 putts');
  assert.equal(
    formatHoleCountLine({ shotCount: 2, penaltyStrokes: 0, puttCount: 0, omitZeroPutts: true }),
    '2 shots',
  );
  assert.equal(formatHoleCountLine({ shotCount: 1, penaltyStrokes: 0, puttCount: 0 }), '1 shot · 0 putts');
});

test('a legacy penalty with no ordering info is placed at the end and still renders', () => {
  const shots: HoleStepShot[] = [
    { id: 's1', seq: 1 },
    { id: 's2', seq: 2, startedAt: 'not-a-time' },
  ];
  const legacy: HoleStepPenalty = {
    id: 'old',
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'penalty',
  };
  const garbage: HoleStepPenalty = {
    strokes: 1,
    reason: 'water',
    note: null,
    createdAt: 'yesterday',
  };
  assert.doesNotThrow(() => orderHoleSteps(shots, [legacy, garbage]));
  const steps = orderHoleSteps(shots, [legacy, garbage]);
  assert.deepEqual(
    steps.map((step) => (step.kind === 'penalty' ? step.label : step.id)),
    ['s1', 's2', '+1 OB', '+1 Water'],
  );
  assert.deepEqual(penaltiesMissingFromSteps([legacy, garbage], steps), []);

  assert.deepEqual(
    orderHoleSteps(null, [{ id: 'only', strokes: 1, reason: 'ob', note: null }]).map((step) =>
      step.kind === 'penalty' ? step.label : step.id,
    ),
    ['+1 OB'],
  );
  assert.doesNotThrow(() =>
    orderHoleSteps(
      [{ id: null, seq: null, startedAt: null, endedAt: null }],
      [{ id: null, strokes: null, reason: null, note: null, kind: null, createdAt: null }],
    ),
  );
});

test('an explicit after-shot index beats a later timestamp', () => {
  const attached: HoleStepPenalty = {
    id: 'late-but-attached',
    strokes: 1,
    reason: 'ob',
    note: null,
    kind: 'penalty',
    createdAt: '2026-09-20T15:09:00.000Z',
    afterShotSeq: 1,
  };
  const steps = orderHoleSteps([eightIron, wedge], [attached]);
  assert.deepEqual(
    steps.map((step) => (step.kind === 'penalty' ? step.label : step.id)),
    ['s1', '+1 OB', 's2'],
  );

  const byId: HoleStepPenalty = { ...attached, afterShotSeq: null, afterShotId: 's2' };
  assert.deepEqual(
    orderHoleSteps([eightIron, wedge], [byId]).map((step) => (step.kind === 'penalty' ? step.id : step.id)),
    ['s1', 's2', 'late-but-attached'],
  );
});

test('a penalty timestamp before every shot leads the row', () => {
  const early: HoleStepPenalty = {
    id: 'early',
    strokes: 1,
    reason: 'water',
    note: 'creek',
    kind: 'penalty',
    createdAt: '2026-09-20T14:00:00.000Z',
  };
  assert.deepEqual(
    orderHoleSteps([eightIron, wedge], [early]).map((step) => (step.kind === 'penalty' ? step.label : step.id)),
    ['+1 Water · creek', 's1', 's2'],
  );
});

test('round screen and summary render ordered penalty steps and keep insert on shots', () => {
  const hole = readFileSync(new URL('../../app/round/[id]/hole/[number].tsx', import.meta.url), 'utf8');
  const summary = readFileSync(new URL('../../app/round/[id]/summary.tsx', import.meta.url), 'utf8');
  const overlay = hole.slice(hole.indexOf('playLayout.shotLine'), hole.indexOf('!hideHoleButtons'));
  assert.match(overlay, /holeSteps\.map/);
  assert.match(overlay, /step\.kind === 'penalty'/);
  assert.match(overlay, /formatShotStepChip/);
  assert.match(overlay, /styles\.shotLinePlus/);
  assert.match(overlay, /isHoleOutShot\(shot\)/);
  const penaltyChip = overlay.slice(overlay.indexOf("step.kind === 'penalty'"), overlay.indexOf('const shot = shots.find'));
  assert.match(penaltyChip, /step\.label/);
  assert.doesNotMatch(penaltyChip, /onPress|openEdit|shotLinePlus|distanceYards/);
  assert.match(hole, /finishedMini\.penaltyLabel/);
  assert.match(summary, /orderHoleSteps\(shots, penalties\)/);
  assert.match(summary, /formatHoleCountLine\(/);
  assert.match(summary, /penaltiesMissingFromSteps/);
  assert.match(summary, /formatShotStepChip/);
});
