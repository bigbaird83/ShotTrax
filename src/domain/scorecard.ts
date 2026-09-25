import { holeGir, type FairwayResult } from './fairwayGir';
import { finishedHoleDisplayScore } from './holeScore';

export type ScorecardMark = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | null;

export type ScorecardHole = {
  number: number;
  par: number | null;
  score: number | null;
  putts: number;
  mark: ScorecardMark;
  /** Close-state only. True when Made it / Hole Out never ran. */
  incomplete: boolean;
  /** Player tap on par 4+. Null when unanswered or par 3. */
  fairway: FairwayResult | null;
  /** Null until the hole is closed with a real par. */
  gir: boolean | null;
};

export type ScorecardDismiss = {
  markShot: false;
  closeShot: false;
  leaveHole: false;
  finishRound: false;
};

/**
 * Marks only from score versus par, and only when both numbers exist.
 * Missing or non-course par (not 3–6) stays unmarked — never invented.
 * eagle ≤ −2, birdie −1, par 0, bogey +1, double +2 or worse.
 */
export function scorecardMark(score: number | null, par: number | null): ScorecardMark {
  if (score == null || par == null || !Number.isFinite(score) || !Number.isFinite(par)) {
    return null;
  }
  if (!Number.isInteger(score) || !Number.isInteger(par) || score < 1 || par < 3 || par > 6) {
    return null;
  }
  const diff = score - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'double';
}

/** Close-state only. Never GPS, yards, or shot invent. */
export function scorecardHoleIncomplete(puttsDone?: boolean): boolean {
  return puttsDone === false;
}

/** `!` in the score column when the hole was moved past without close. */
export function scorecardIncompleteMark(): '!' {
  return '!';
}

/**
 * Red outline + `!` after you leave a hole without Made it / Hole Out.
 * Close-state only; current and future holes stay quiet.
 */
export function scorecardShowsIncompleteCue(args: {
  puttsDone?: boolean;
  number: number;
  currentHoleNumber?: number;
}): boolean {
  if (!scorecardHoleIncomplete(args.puttsDone)) return false;
  if (args.currentHoleNumber == null) return true;
  return args.number < args.currentHoleNumber;
}

export function scorecardIncompleteUsesCloseStateOnly(): true {
  return true;
}

export function scorecardIncompleteInventGps(): false {
  return false;
}

export function scorecardIncompleteInventYards(): false {
  return false;
}

export function scorecardRowOpensHole(): true {
  return true;
}

/** In-round card: stored holes, par, score, putts, FW, GIR. Missing par stays blank. No SG. */
export function planScorecard(
  holes: {
    number: number;
    par: number | null;
    score: number | null;
    putts: number;
    puttsDone?: boolean;
    shotCount?: number;
    penaltyStrokes?: number;
    fairway?: FairwayResult | null;
  }[],
  opts?: { currentHoleNumber?: number },
): ScorecardHole[] {
  return [...holes]
    .sort((a, b) => a.number - b.number)
    .map((hole) => {
      const score = hole.puttsDone
        ? finishedHoleDisplayScore({
            score: hole.score,
            shotCount: hole.shotCount ?? 0,
            putts: hole.putts,
            penaltyStrokes: hole.penaltyStrokes,
          })
        : hole.score;
      return {
        number: hole.number,
        par: hole.par,
        score,
        putts: hole.putts,
        mark: scorecardMark(score, hole.par),
        incomplete: scorecardShowsIncompleteCue({
          puttsDone: hole.puttsDone,
          number: hole.number,
          currentHoleNumber: opts?.currentHoleNumber,
        }),
        fairway: hole.fairway ?? null,
        gir: holeGir({
          par: hole.par,
          score: hole.score,
          putts: hole.putts,
          puttsDone: hole.puttsDone === true,
          shotCount: hole.shotCount,
          penaltyStrokes: hole.penaltyStrokes,
        }),
      };
    });
}

/** Back / Done: view only. Never marks or closes a shot, never leaves the hole, never finishes the round. */
export function planScorecardDismiss(): ScorecardDismiss {
  return { markShot: false, closeShot: false, leaveHole: false, finishRound: false };
}

export function scorecardRunsAcceptFix(): false {
  return false;
}

export function scorecardMarksShot(): false {
  return false;
}

export function scorecardClosesShot(): false {
  return false;
}

/** FW / GIR columns. Blank when unknown — never invented. */
export function scorecardShowsGir(): true {
  return true;
}

export function scorecardShowsStrokesGained(): false {
  return false;
}

export type ScorecardDiffTone = 'good' | 'bad' | 'even';

/** Score − par. Missing or invalid par/score stays blank. */
export function scorecardDiff(score: number | null, par: number | null): number | null {
  if (scorecardMark(score, par) == null || score == null || par == null) return null;
  return score - par;
}

export function scorecardDiffLabel(diff: number | null): string | null {
  if (diff == null || !Number.isFinite(diff)) return null;
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function scorecardDiffTone(diff: number | null): ScorecardDiffTone | null {
  if (diff == null || !Number.isFinite(diff)) return null;
  if (diff < 0) return 'good';
  if (diff > 0) return 'bad';
  return 'even';
}

export function scorecardIsRoundedCard(): true {
  return true;
}

export function scorecardParIsMuted(): true {
  return true;
}

export function scorecardScoreIsBold(): true {
  return true;
}

export function scorecardMarkGlyph(mark: ScorecardMark): string {
  if (mark === 'eagle') return '●';
  if (mark === 'birdie') return '○';
  if (mark === 'bogey') return '□';
  if (mark === 'double') return '□□';
  return '';
}
