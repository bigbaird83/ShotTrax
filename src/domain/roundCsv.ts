import { buildCsv, csvNumber, csvText } from './csv';
import { courseDataSourceLabel } from './courseDataSource';

export const ROUNDS_CSV_FILENAME = 'rounds.csv';
export const SHOTS_CSV_FILENAME = 'shots.csv';

const HOLE_COLUMNS = 18;

export const ROUNDS_CSV_HEADERS = [
  'round_id',
  'started_at',
  'course_id',
  'course_name',
  'city',
  'state',
  'holes_played',
  'total_score',
  'total_putts',
  'course_data_source',
  ...Array.from({ length: HOLE_COLUMNS }, (_, index) => {
    const n = index + 1;
    return [`hole_${n}_par`, `hole_${n}_score`];
  }).flat(),
] as const;

export const SHOTS_CSV_HEADERS = [
  'round_id',
  'hole_number',
  'shot_number',
  'club',
  'distance_yards',
  'start_lat',
  'start_lng',
  'end_lat',
  'end_lng',
  'fix_quality',
  'source',
  'typed_yards',
] as const;

export type CsvRoundHole = {
  number: number;
  par: number | null;
  score: number | null;
  /** Null when putts were never entered. A real 0 stays 0. */
  putts: number | null;
};

export type CsvRound = {
  id: string;
  startedAt: string | null;
  courseId: string | null;
  courseName: string | null;
  city: string | null;
  state: string | null;
  holesPlayed: number | null;
  /** Stored token (cache / osm / gca / golfapi). Blank in the file when unknown. */
  courseDataSource: string | null;
  holes: readonly CsvRoundHole[];
};

export type CsvShotSource = 'gps' | 'placed' | 'no_gps' | 'penalty';

export type CsvShot = {
  roundId: string;
  holeNumber: number;
  shotNumber: number | null;
  club: string | null;
  distanceYards: number | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  fixQuality: string | null;
  source: CsvShotSource;
  typedYards: number | null;
};

export function shotSourceLabel(source: CsvShotSource): 'GPS' | 'Placed' | 'No GPS' | 'Penalty' {
  if (source === 'gps') return 'GPS';
  if (source === 'placed') return 'Placed';
  if (source === 'no_gps') return 'No GPS';
  return 'Penalty';
}

/** ISO-8601 with the phone's local offset. Unparseable times stay blank. */
export function formatIsoLocalOffset(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return '';
  const pad = (value: number, width = 2) => String(Math.trunc(Math.abs(value))).padStart(width, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function sumEntered(values: readonly (number | null | undefined)[]): number | null {
  const nums = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0);
}

function holeAt(holes: readonly CsvRoundHole[], number: number): CsvRoundHole | null {
  return holes.find((hole) => hole.number === number) ?? null;
}

export function buildRoundsCsv(rounds: readonly CsvRound[]): string {
  const rows = rounds.map((round) => {
    const cells: string[] = [
      csvText(round.id),
      csvText(formatIsoLocalOffset(round.startedAt)),
      csvText(round.courseId),
      csvText(round.courseName),
      csvText(round.city),
      csvText(round.state),
      csvNumber(round.holesPlayed),
      csvNumber(sumEntered(round.holes.map((hole) => hole.score))),
      csvNumber(sumEntered(round.holes.map((hole) => hole.putts))),
      csvText(courseDataSourceLabel(round.courseDataSource)),
    ];
    for (let number = 1; number <= HOLE_COLUMNS; number += 1) {
      const hole = holeAt(round.holes, number);
      cells.push(csvNumber(hole?.par ?? null));
      cells.push(csvNumber(hole?.score ?? null));
    }
    return cells;
  });
  return buildCsv(ROUNDS_CSV_HEADERS, rows);
}

export function buildShotsCsv(shots: readonly CsvShot[]): string {
  const rows = shots.map((shot) => {
    const noGps = shot.source === 'no_gps';
    const penalty = shot.source === 'penalty';
    const distance = noGps || penalty ? null : shot.distanceYards;
    return [
      csvText(shot.roundId),
      csvNumber(shot.holeNumber),
      csvNumber(shot.shotNumber),
      csvText(shot.club),
      csvNumber(distance),
      csvNumber(noGps ? null : shot.startLat),
      csvNumber(noGps ? null : shot.startLng),
      csvNumber(noGps ? null : shot.endLat),
      csvNumber(noGps ? null : shot.endLng),
      csvText(shot.fixQuality),
      csvText(shotSourceLabel(shot.source)),
      csvNumber(shot.typedYards),
    ];
  });
  return buildCsv(SHOTS_CSV_HEADERS, rows);
}
