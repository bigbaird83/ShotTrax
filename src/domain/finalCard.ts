import { formatHistoryDate } from './roundHistory';
import { scorecardDiff, scorecardDiffLabel, type ScorecardHole } from './scorecard';
import { planScorecardImage, type ScorecardImagePlan } from './scorecardImage';
import { SHOTTRAXX_BRAND } from './playerCopy';

export type FinalCardHoleInput = {
  number: number;
  par: number | null;
  /** Posted hole score already stored on the round. Null when the hole was not scored. */
  score: number | null;
};

export type FinalCardHoleLine = {
  number: number;
  score: number | null;
};

export type FinalCard = {
  /** Stored course name. Null when the round has none — never a guessed name. */
  courseName: string | null;
  /** Calendar date from a stored timestamp. Null when that timestamp is missing or unreadable. */
  date: string | null;
  /** Sum of posted scores. Null when no hole has a score. */
  total: number | null;
  /**
   * Score minus par across scored holes.
   * Null unless every scored hole has a known, valid par. A missing par is omitted, not guessed.
   */
  scoreVsPar: number | null;
  scoreVsParLabel: string | null;
  holes: FinalCardHoleLine[];
};

/**
 * The summary after the last hole is the round-complete screen, even when
 * Finish has not stamped `finishedAt` yet. An earlier summary stays quiet.
 */
export function roundCompleteForFinalCard(args: {
  finishedAt: string | null;
  holeCount: number;
  holes: { number: number; puttsDone: boolean }[];
}): boolean {
  if (args.finishedAt?.trim()) return true;
  if (!Number.isFinite(args.holeCount) || args.holeCount < 1) return false;
  const last = args.holes.find((hole) => hole.number === args.holeCount);
  return last?.puttsDone === true;
}

/** Stored finish time, else the last hole's close time, else the round start. Never a new clock. */
export function finalCardPlayedAt(args: {
  finishedAt: string | null;
  startedAt: string | null;
  holes: { number: number; completedAt: string | null }[];
}): string | null {
  if (args.finishedAt?.trim()) return args.finishedAt;
  const last = [...args.holes].sort((a, b) => b.number - a.number)[0];
  if (last?.completedAt?.trim()) return last.completedAt;
  return args.startedAt?.trim() ? args.startedAt : null;
}

/** Integer strokes already on the card. Anything else stays blank. */
function postedScore(score: number | null | undefined): number | null {
  if (score == null || !Number.isFinite(score) || !Number.isInteger(score) || score < 1) return null;
  return score;
}

function storedCourseName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function storedDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const label = formatHistoryDate(iso);
  return label === '—' ? null : label;
}

/**
 * Final-card numbers from holes the round already has.
 * No yardages, no course lookup, no filled-in pars or scores.
 */
export function planFinalCard(args: {
  courseName?: string | null;
  /** ISO time already stored on the round (finish, else start). */
  playedAt?: string | null;
  holes: FinalCardHoleInput[];
}): FinalCard {
  const holes = [...args.holes]
    .sort((a, b) => a.number - b.number)
    .map((hole) => ({
      number: hole.number,
      par: hole.par,
      score: postedScore(hole.score),
    }));
  const scored = holes.filter((hole) => hole.score != null);
  const total = scored.length === 0 ? null : scored.reduce((sum, hole) => sum + (hole.score as number), 0);

  let scoreVsPar: number | null = null;
  if (scored.length > 0) {
    let sum = 0;
    let complete = true;
    for (const hole of scored) {
      const diff = scorecardDiff(hole.score, hole.par);
      if (diff == null) {
        complete = false;
        break;
      }
      sum += diff;
    }
    if (complete) scoreVsPar = sum;
  }

  return {
    courseName: storedCourseName(args.courseName),
    date: storedDate(args.playedAt),
    total,
    scoreVsPar,
    scoreVsParLabel: scorecardDiffLabel(scoreVsPar),
    holes: holes.map((hole) => ({ number: hole.number, score: hole.score })),
  };
}

/**
 * Plain-text card: course, date, total, score vs par, then each hole score.
 * Score vs par is left out when any scored hole has no known par.
 * Unscored holes stay as an em dash. No link, no yardages.
 */
export function formatFinalCardSummary(card: FinalCard): string {
  const lines: string[] = [SHOTTRAXX_BRAND];
  if (card.courseName) lines.push(card.courseName);
  if (card.date) lines.push(card.date);
  if (card.total != null) lines.push(String(card.total));
  if (card.scoreVsParLabel) lines.push(card.scoreVsParLabel);
  lines.push('');
  for (const hole of card.holes) {
    lines.push(`${hole.number}  ${hole.score == null ? '—' : String(hole.score)}`);
  }
  return lines.join('\n');
}

/** Drop a partial "· +N" when this card is not allowed to show score vs par. */
export function finalCardImageStatus(status: string, scoreVsPar: number | null): string {
  if (scoreVsPar != null) return status;
  const cut = status.indexOf(' · ');
  return cut === -1 ? status : status.slice(0, cut);
}

/**
 * Same table PNG as the in-app scorecard, with score vs par removed
 * when any scored hole is missing a known par. Unnamed courses stay blank.
 */
export function planFinalCardImage(args: {
  courseName?: string | null;
  holes: ScorecardHole[];
  scoreVsPar: number | null;
}): ScorecardImagePlan {
  const plan = planScorecardImage({
    courseName: args.courseName,
    holes: args.holes,
    finished: true,
  });
  return {
    ...plan,
    courseName: storedCourseName(args.courseName) ?? '',
    status: finalCardImageStatus(plan.status, args.scoreVsPar),
  };
}
