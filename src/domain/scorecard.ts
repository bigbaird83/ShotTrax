export type ScorecardMark = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | null;

export type ScorecardHole = {
  number: number;
  par: number | null;
  score: number | null;
  putts: number;
  mark: ScorecardMark;
};

/**
 * Marks only when both score and par exist. Missing par stays blank — never invented.
 * eagle ≤ −2, birdie −1, par 0, bogey +1, double +2 or worse.
 */
export function scorecardMark(score: number | null, par: number | null): ScorecardMark {
  if (score == null || par == null || !Number.isFinite(score) || !Number.isFinite(par)) {
    return null;
  }
  const diff = score - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  return 'double';
}

/** In-round card: stored holes, par, score, putts. Missing par stays blank. No GIR / SG. */
export function planScorecard(holes: {
  number: number;
  par: number | null;
  score: number | null;
  putts: number;
}[]): ScorecardHole[] {
  return [...holes]
    .sort((a, b) => a.number - b.number)
    .map((hole) => ({
      number: hole.number,
      par: hole.par,
      score: hole.score,
      putts: hole.putts,
      mark: scorecardMark(hole.score, hole.par),
    }));
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

export function scorecardShowsGir(): false {
  return false;
}

export function scorecardShowsStrokesGained(): false {
  return false;
}

export function scorecardMarkGlyph(mark: ScorecardMark): string {
  if (mark === 'eagle') return '●';
  if (mark === 'birdie') return '○';
  if (mark === 'bogey') return '□';
  if (mark === 'double') return '□□';
  return '';
}
