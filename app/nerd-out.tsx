import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getRound, listHoles, listRounds } from '@/src/db/repo';
import { planNerdOut, planNerdOutLifetime } from '@/src/domain/nerdOut';
import { COPY } from '@/src/domain/playerCopy';
import { scorecardDiffLabel } from '@/src/domain/scorecard';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

function formatToPar(toPar: number | null): string {
  return scorecardDiffLabel(toPar) ?? '—';
}

/** Nerd out root: high-level numbers only. Hole maps and the club table live on their own screens. */
export default function NerdOutScreen() {
  const { roundId } = useLocalSearchParams<{ roundId?: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rounds = useMemo(() => listRounds(db), [db, revision]);
  // Current round when opened from play; otherwise the most recent finished round.
  const round = useMemo(() => {
    if (roundId) return getRound(db, roundId);
    return rounds.find((row) => row.finishedAt != null) ?? null;
  }, [db, roundId, rounds, revision]);
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);
  const nerd = useMemo(
    () =>
      planNerdOut({
        holeScores: holes.map((hole) => hole.score),
        holePutts: holes.map((hole) => hole.putts),
        holePars: holes.map((hole) => hole.par),
      }),
    [holes],
  );
  const lifetime = useMemo(
    () =>
      planNerdOutLifetime(
        rounds.map((row) => {
          const roundHoles = listHoles(db, row.id);
          return {
            finished: row.finishedAt != null,
            holePutts: roundHoles.map((hole) => hole.putts),
            holeScores: roundHoles.map((hole) => hole.score),
          };
        }),
      ),
    [db, rounds],
  );

  return (
    <Screen>
      <Text style={styles.kicker}>{COPY.nerdOut}</Text>
      <Text style={styles.muted}>{COPY.nerdOutLede}</Text>
      <Text style={styles.hint}>{COPY.nerdOutLimits}</Text>

      {round ? (
        <View style={styles.block} testID="nerd-out-this-round">
          <Text style={styles.section}>
            {roundId ? COPY.nerdOutThisRound : COPY.nerdOutLastRound}
          </Text>
          <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
          <View style={styles.grid}>
            <Stat styles={styles} label={COPY.score} value={nerd.score ?? '—'} />
            <Stat styles={styles} label={COPY.nerdOutVsPar} value={formatToPar(nerd.toPar)} />
            <Stat styles={styles} label={COPY.putts} value={nerd.putts} />
            <Stat styles={styles} label={COPY.nerdOutPuttsPerHole} value={nerd.puttsPerHole ?? '—'} />
          </View>
          <Text style={styles.muted}>
            {nerd.marks.eagle} eagle · {nerd.marks.birdie} birdie · {nerd.marks.par} par · {nerd.marks.bogey} bogey · {nerd.marks.double} double+
          </Text>
        </View>
      ) : null}

      <View style={styles.block} testID="nerd-out-lifetime">
        <Text style={styles.section}>{COPY.nerdOutLifetime}</Text>
        <View style={styles.grid}>
          <Stat styles={styles} label={COPY.nerdOutFinishedRounds} value={lifetime.finishedRounds} />
          <Stat styles={styles} label={COPY.nerdOutPuttsPerRound} value={lifetime.puttsPerRound ?? '—'} />
          <Stat styles={styles} label={COPY.nerdOutHolesScored} value={lifetime.scoredHoles} />
        </View>
      </View>

      <BigButton
        label={COPY.reviewRounds}
        variant="secondary"
        onPress={() => router.push('/review-rounds')}
      />
      <BigButton label={COPY.clubData} variant="secondary" onPress={() => router.push('/club-data')} />
    </Screen>
  );
}

function Stat({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string | number;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    kicker: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.cream, fontSize: 24, fontWeight: '900' },
    section: { color: colors.cream, fontSize: 18, fontWeight: '800' },
    label: { color: colors.muted, fontSize: 14, fontWeight: '800' },
    value: { color: colors.cream, fontSize: 32, fontWeight: '900' },
    muted: { color: colors.muted, fontSize: 16 },
    hint: { color: colors.muted, fontSize: 14 },
    block: { gap: 8, backgroundColor: colors.bgElevated, padding: 14, borderRadius: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
    stat: { width: '50%', gap: 2 },
  });
}
