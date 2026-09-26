import type { ReviewRoundStats } from './roundReview';
import { formatHistoryDate } from './roundHistory';
import { SG_TRENDS_MIN_HOLES } from './strokesGained';

/**
 * Trends across finished rounds. One value per round, oldest → newest.
 * The window is the last N finished rounds (a short round keeps its slot).
 * Vs par, putts, and penalty strokes skip a round with fewer than
 * `SG_TRENDS_MIN_HOLES` scored holes — the same cutoff as the strokes-gained
 * average. Holes played is the scored-hole count, never the course layout.
 * A 9- to 17-hole round that is included is scaled to per 18. Fairways,
 * greens, and carry are not scaled and still include a shorter round.
 * A round with nothing stored for a metric is a gap (null), never a zero.
 */

export { SG_TRENDS_MIN_HOLES };

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
  /** True when this value was scaled from 9–17 scored holes up to per 18. */
  scaled: boolean;
  /** Holes with a stored score. The scaling marker uses this number. */
  holesPlayed: number;
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

const PER_18_METRICS: ReadonlySet<TrendMetricId> = new Set(['toPar', 'putts', 'penalties']);

/** Scored holes on this round. Not the course hole count and not the tee layout. */
export function trendHolesPlayed(round: TrendRoundIn): number {
  const n = round.stats.holesPlayed;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function per18Metric(metric: TrendMetricId): boolean {
  return PER_18_METRICS.has(metric);
}

/**
 * Whether this round can sit on the chart. Per-18 metrics need at least
 * `SG_TRENDS_MIN_HOLES` scored holes. Fairways, greens, and carry do not.
 */
export function trendRoundCounts(round: TrendRoundIn, metric: TrendMetricId): boolean {
  if (!per18Metric(metric)) return true;
  return trendHolesPlayed(round) >= SG_TRENDS_MIN_HOLES;
}

/** The raw per-round value for a metric, or null when that round has nothing for it. */
export function trendValue(
  round: TrendRoundIn,
  metric: TrendMetricId,
  clubId?: string | null,
): { value: number | null; scaled: boolean } {
  const { stats } = round;
  const holes = trendHolesPlayed(round);
  const counts = trendRoundCounts(round, metric);
  const scaled = counts && per18Metric(metric) && holes < 18;
  switch (metric) {
    case 'toPar':
      if (!counts || holes === 0 || stats.toPar == null) return { value: null, scaled: false };
      return { value: scaled ? per18(stats.toPar, holes) : stats.toPar, scaled };
    case 'putts':
      if (!counts || holes === 0 || stats.putts <= 0) return { value: null, scaled: false };
      return { value: scaled ? per18(stats.putts, holes) : stats.putts, scaled };
    case 'penalties':
      if (!counts || holes === 0) return { value: null, scaled: false };
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

/** List-row marker, e.g. ` · 12`. Blank unless this round was actually scaled. */
export function trendScaledRowSuffix(point: Pick<TrendPoint, 'scaled' | 'holesPlayed'>): string {
  if (!scaledMarkerHoles(point)) return '';
  return ` · ${point.holesPlayed}`;
}

/** Readout marker, e.g. ` (12 holes, per 18)`. Blank unless this round was actually scaled. */
export function trendScaledReadoutSuffix(point: Pick<TrendPoint, 'scaled' | 'holesPlayed'>): string {
  if (!scaledMarkerHoles(point)) return '';
  return ` (${point.holesPlayed} holes, per 18)`;
}

function scaledMarkerHoles(point: Pick<TrendPoint, 'scaled' | 'holesPlayed'>): boolean {
  const holes = point.holesPlayed;
  return point.scaled && Number.isFinite(holes) && holes >= SG_TRENDS_MIN_HOLES && holes < 18;
}

function playedKey(round: TrendRoundIn): number {
  const ms = Date.parse(round.playedAt);
  return Number.isFinite(ms) ? ms : 0;
}

/** Finished rounds, oldest → newest, by the time Trends stores as `playedAt`. */
export function trendRoundsChronological(rounds: readonly TrendRoundIn[]): TrendRoundIn[] {
  return [...rounds].sort((a, b) => playedKey(a) - playedKey(b) || a.id.localeCompare(b.id));
}

/**
 * Last N finished rounds, oldest → newest. A short round keeps its slot:
 * the window does not reach further back to fill up with longer rounds.
 * Strokes gained and every metric chart use this same slice.
 */
export function trendWindowRounds(rounds: readonly TrendRoundIn[], window: TrendWindow): TrendRoundIn[] {
  return trendRoundsChronological(rounds).slice(-window);
}

/** A bar chart needs two rounds that actually have a value. One point is not a trend. */
export function trendChartReady(series: Pick<TrendSeries, 'points'>): boolean {
  let counted = 0;
  for (const point of series.points) {
    if (point.value == null) continue;
    counted += 1;
    if (counted >= 2) return true;
  }
  return false;
}

export function planTrend(args: {
  rounds: readonly TrendRoundIn[];
  metric: TrendMetricId;
  window: TrendWindow;
  clubId?: string | null;
}): TrendSeries {
  const sorted = trendRoundsChronological(args.rounds);
  const inWindow = sorted.slice(-args.window);
  const before = sorted.slice(Math.max(0, sorted.length - args.window * 2), sorted.length - inWindow.length);
  const points = inWindow.filter((round) => trendRoundCounts(round, args.metric)).map((round) => {
    const { value, scaled } = trendValue(round, args.metric, args.clubId);
    return {
      roundId: round.id,
      label: formatHistoryDate(round.playedAt),
      courseName: round.courseName?.trim() || 'Round',
      value,
      scaled,
      holesPlayed: trendHolesPlayed(round),
    };
  });
  const average = mean(points.map((point) => point.value));
  const previousAverage = mean(
    before
      .filter((round) => trendRoundCounts(round, args.metric))
      .map((round) => trendValue(round, args.metric, args.clubId).value),
  );
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
  const sorted = trendWindowRounds(rounds, window);
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
