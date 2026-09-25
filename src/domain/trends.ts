import type { ReviewRoundStats } from './roundReview';
import { formatHistoryDate } from './roundHistory';

/**
 * Trends across finished rounds. One value per round, oldest → newest.
 * 9-hole rounds scale to per-18 so they sit on the same axis as full rounds.
 * A round with nothing stored for a metric is a gap (null), never a zero.
 */

export const TREND_WINDOWS = [5, 10, 20] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

export type TrendMetricId = 'toPar' | 'putts' | 'penalties' | 'fairways' | 'gir' | 'carry';

/** Which way is better — sets the tone of the change vs the previous window. */
export type TrendBetter = 'lower' | 'higher' | 'neutral';

export type TrendRoundIn = {
  id: string;
  courseName: string | null;
  playedAt: string;
  stats: Pick<
    ReviewRoundStats,
    'holesPlayed' | 'toPar' | 'putts' | 'penaltyStrokes' | 'fairwayGir' | 'clubAverages'
  >;
};

export type TrendPoint = {
  roundId: string;
  label: string;
  courseName: string;
  value: number | null;
  /** True when this round was 9 holes and the value is scaled to 18. */
  scaled: boolean;
};

export type TrendSeries = {
  id: TrendMetricId;
  points: TrendPoint[];
  /** Mean of the non-null points in the window. */
  average: number | null;
  /** Mean of the same number of rounds just before the window. Null when there are none. */
  previousAverage: number | null;
  change: number | null;
  tone: 'good' | 'bad' | 'even' | null;
  better: TrendBetter;
  unit: 'strokes' | 'percent' | 'yards';
};

const BETTER: Record<TrendMetricId, TrendBetter> = {
  toPar: 'lower',
  putts: 'lower',
  penalties: 'lower',
  fairways: 'higher',
  gir: 'higher',
  carry: 'neutral',
};

function oneDecimal(n: number): number {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

function mean(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (real.length === 0) return null;
  return oneDecimal(real.reduce((sum, v) => sum + v, 0) / real.length);
}

function per18(value: number, holes: number): number {
  return oneDecimal((value / holes) * 18);
}

/** The raw per-round value for a metric, or null when that round has nothing for it. */
export function trendValue(
  round: TrendRoundIn,
  metric: TrendMetricId,
  clubId?: string | null,
): { value: number | null; scaled: boolean } {
  const { stats } = round;
  const holes = stats.holesPlayed;
  const scaled = holes > 0 && holes < 18;
  switch (metric) {
    case 'toPar':
      if (holes === 0 || stats.toPar == null) return { value: null, scaled: false };
      return { value: scaled ? per18(stats.toPar, holes) : stats.toPar, scaled };
    case 'putts':
      if (holes === 0 || stats.putts <= 0) return { value: null, scaled: false };
      return { value: scaled ? per18(stats.putts, holes) : stats.putts, scaled };
    case 'penalties':
      if (holes === 0) return { value: null, scaled: false };
      return { value: scaled ? per18(stats.penaltyStrokes, holes) : stats.penaltyStrokes, scaled };
    case 'fairways': {
      const { fairwaysHit, fairwayHoles } = stats.fairwayGir;
      if (fairwayHoles === 0) return { value: null, scaled: false };
      return { value: Math.round((fairwaysHit / fairwayHoles) * 100), scaled: false };
    }
    case 'gir': {
      const { greensHit, greenHoles } = stats.fairwayGir;
      if (greenHoles === 0) return { value: null, scaled: false };
      return { value: Math.round((greensHit / greenHoles) * 100), scaled: false };
    }
    case 'carry': {
      const row = clubId ? stats.clubAverages.find((club) => club.id === clubId) : undefined;
      return { value: row ? row.avgYards : null, scaled: false };
    }
  }
}

function playedKey(round: TrendRoundIn): number {
  const ms = Date.parse(round.playedAt);
  return Number.isFinite(ms) ? ms : 0;
}

export function planTrend(args: {
  rounds: readonly TrendRoundIn[];
  metric: TrendMetricId;
  window: TrendWindow;
  clubId?: string | null;
}): TrendSeries {
  const sorted = [...args.rounds].sort((a, b) => playedKey(a) - playedKey(b));
  const inWindow = sorted.slice(-args.window);
  const before = sorted.slice(Math.max(0, sorted.length - args.window * 2), sorted.length - inWindow.length);
  const points = inWindow.map((round) => {
    const { value, scaled } = trendValue(round, args.metric, args.clubId);
    return {
      roundId: round.id,
      label: formatHistoryDate(round.playedAt),
      courseName: round.courseName?.trim() || 'Round',
      value,
      scaled,
    };
  });
  const average = mean(points.map((point) => point.value));
  const previousAverage = mean(before.map((round) => trendValue(round, args.metric, args.clubId).value));
  const change = average != null && previousAverage != null ? oneDecimal(average - previousAverage) : null;
  const better = BETTER[args.metric];
  let tone: TrendSeries['tone'] = null;
  if (change != null) {
    if (change === 0 || better === 'neutral') tone = 'even';
    else if ((change < 0) === (better === 'lower')) tone = 'good';
    else tone = 'bad';
  }
  return {
    id: args.metric,
    points,
    average,
    previousAverage,
    change,
    tone,
    better,
    unit: args.metric === 'fairways' || args.metric === 'gir' ? 'percent' : args.metric === 'carry' ? 'yards' : 'strokes',
  };
}

/** Clubs with a carry in any round of the window, most rounds first. Putter never appears (stats drop it). */
export function trendClubs(
  rounds: readonly TrendRoundIn[],
  window: TrendWindow,
): { id: string; name: string; rounds: number }[] {
  const sorted = [...rounds].sort((a, b) => playedKey(a) - playedKey(b)).slice(-window);
  const byId = new Map<string, { id: string; name: string; rounds: number; order: number }>();
  sorted.forEach((round) => {
    round.stats.clubAverages.forEach((club, order) => {
      const row = byId.get(club.id) ?? { id: club.id, name: club.name, rounds: 0, order };
      row.rounds += 1;
      byId.set(club.id, row);
    });
  });
  return [...byId.values()]
    .sort((a, b) => b.rounds - a.rounds || a.order - b.order)
    .map(({ id, name, rounds: count }) => ({ id, name, rounds: count }));
}

/** Plain number (`+3.4` when signed); percent and yards carry their unit. */
export function formatTrendValue(value: number | null, unit: TrendSeries['unit'], signed = false): string {
  if (value == null) return '—';
  const text = Number.isInteger(value) ? `${value}` : value.toFixed(1);
  const sign = signed && value > 0 ? '+' : '';
  if (unit === 'percent') return `${sign}${text}%`;
  if (unit === 'yards') return `${sign}${text} yd`;
  return `${sign}${text}`;
}

/** `↓ 2.1 vs previous 10` — arrow is direction, tone (good/bad) is separate. */
export function formatTrendChange(series: TrendSeries, window: TrendWindow): string | null {
  if (series.change == null) return null;
  if (series.change === 0) return `Same as previous ${window}`;
  const arrow = series.change < 0 ? '↓' : '↑';
  const size = formatTrendValue(Math.abs(series.change), series.unit);
  return `${arrow} ${size} vs previous ${window}`;
}

/** Bar geometry: every bar grows from the zero line; negative values hang below it. */
export function trendScale(values: (number | null)[]): { max: number; min: number } {
  const real = values.filter((v): v is number => v != null);
  const max = Math.max(0, ...real);
  const min = Math.min(0, ...real);
  if (max === 0 && min === 0) return { max: 1, min: 0 };
  return { max, min };
}
