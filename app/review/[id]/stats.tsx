import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getClubMap, getRound, listHoles, listPenaltiesForHole, listShotsForHole } from '@/src/db/repo';
import { totalPenaltyStrokes } from '@/src/domain/penalty';
import { COPY } from '@/src/domain/playerCopy';
import { planRoundStats, type ReviewShotPick } from '@/src/domain/roundReview';
import { scorecardDiffLabel } from '@/src/domain/scorecard';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

function formatPick(pick: ReviewShotPick | null): string | null {
  if (!pick) return null;
  return pick.clubName ? `${pick.yards} yd · ${pick.clubName}` : `${pick.yards} yd`;
}

/** One saved round's stats. Only what the app stores — nothing untracked is shown. */
export default function ReviewStatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const stats = useMemo(() => {
    if (!round) return null;
    return planRoundStats({
      holes: listHoles(db, round.id).map((hole) => ({
        number: hole.number,
        par: hole.par,
        score: hole.score,
        putts: hole.putts,
        startedAt: hole.startedAt,
        completedAt: hole.completedAt,
        shots: listShotsForHole(db, hole.id),
        penaltyStrokes: totalPenaltyStrokes(listPenaltiesForHole(db, hole.id)),
      })),
      clubs: getClubMap(db),
    });
  }, [db, round, revision]);

  if (!round || !stats) {
    return (
      <Screen>
        <Text style={styles.muted}>Round not found.</Text>
      </Screen>
    );
  }

  const longest = formatPick(stats.longest);
  const shortest = formatPick(stats.shortestFullSwing);

  return (
    <Screen>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>

      <View style={styles.block}>
        <Row styles={styles} label={COPY.score} value={stats.score ?? '—'} />
        <Row styles={styles} label={COPY.nerdOutVsPar} value={scorecardDiffLabel(stats.toPar) ?? '—'} />
        <Row styles={styles} label={COPY.statsHolesPlayed} value={stats.holesPlayed} />
        <Text style={styles.muted}>
          {stats.marks.eagle} eagle · {stats.marks.birdie} birdie · {stats.marks.par} par · {stats.marks.bogey} bogey · {stats.marks.double} double+
        </Text>
      </View>

      <View style={styles.block}>
        <Row styles={styles} label={COPY.putts} value={stats.putts} />
        <Row styles={styles} label={COPY.nerdOutPuttsPerHole} value={stats.puttsPerHole ?? '—'} />
        <Row styles={styles} label={COPY.statsPenaltyStrokes} value={stats.penaltyStrokes} />
      </View>

      {stats.parAverages.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.section}>{COPY.statsParAverages}</Text>
          {stats.parAverages.map((row) => (
            <Row key={row.par} styles={styles} label={`Par ${row.par} (${row.holes})`} value={row.avg.toFixed(2)} />
          ))}
        </View>
      ) : null}

      <View style={styles.block}>
        {longest ? <Row styles={styles} label={COPY.statsLongestShot} value={longest} /> : null}
        {shortest ? <Row styles={styles} label={COPY.statsShortestShot} value={shortest} /> : null}
        {stats.clubAverages.length > 0 ? (
          <>
            <Text style={styles.section}>{COPY.statsClubAverages}</Text>
            {stats.clubAverages.map((row) => (
              <Row
                key={row.id}
                styles={styles}
                label={`${row.name} (${row.count})`}
                value={`${row.avgYards} yd`}
              />
            ))}
          </>
        ) : (
          <Text style={styles.muted}>{COPY.statsNoShots}</Text>
        )}
      </View>

      {stats.holeTimes.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.section}>{COPY.statsHoleTimes}</Text>
          {stats.holeTimes.map((row) => (
            <Row key={row.number} styles={styles} label={`Hole ${row.number}`} value={row.span} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function Row({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: 24, fontWeight: '900' },
    section: { color: colors.cream, fontSize: 18, fontWeight: '800' },
    muted: { color: colors.muted, fontSize: 16 },
    block: { gap: 8, backgroundColor: colors.bgElevated, padding: 14, borderRadius: 16 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    label: { color: colors.muted, fontSize: 16, fontWeight: '800', flexShrink: 1 },
    value: { color: colors.cream, fontSize: 18, fontWeight: '900' },
  });
}
