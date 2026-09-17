import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatParLabel, formatSiLabel, formatTeeMeta } from '@/src/course/layout';
import { useDb } from '@/src/db/DbProvider';
import { getRound, listHoles, listPenaltiesForHole, listShotsForHole } from '@/src/db/repo';
import { formatPenaltyRow, totalPenaltyStrokes } from '@/src/domain/penalty';
import { reconcileHoleScore } from '@/src/domain/scoreReconcile';
import { AverageBadges } from '@/src/ui/Badge';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

export default function RoundSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, revision } = useDb();
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);

  if (!round) {
    return (
      <Screen>
        <Text style={styles.muted}>Round not found.</Text>
      </Screen>
    );
  }

  const scored = holes.filter((h) => h.score != null);
  const withPar = scored.filter((h) => h.par != null);
  const total = scored.reduce((sum, h) => sum + (h.score ?? 0), 0);
  const toPar = withPar.reduce((sum, h) => sum + ((h.score ?? 0) - (h.par ?? 0)), 0);
  const toParLabel =
    withPar.length === 0 ? '—' : toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;

  return (
    <Screen>
      <Text style={styles.kicker}>{round.finishedAt ? 'Finished' : 'In progress'}</Text>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
      {round.teeName ? (
        <Text style={styles.muted}>
          {formatTeeMeta({
            name: round.teeName,
            rating: round.teeRating,
            slope: round.teeSlope,
            totalYards: round.teeTotalYards,
          })}
        </Text>
      ) : null}
      <Text style={styles.total}>
        {scored.length ? total : '—'}{' '}
        <Text style={styles.toPar}>{toParLabel}</Text>
      </Text>
      <Text style={styles.muted}>
        {scored.length} of {round.holeCount} holes scored. Scorecard score is the source of truth.
      </Text>

      {holes.map((hole) => {
        const shots = listShotsForHole(db, hole.id);
        const penalties = listPenaltiesForHole(db, hole.id);
        const closedGps = shots.filter((s) => s.source === 'gps' && s.distanceYards != null);
        const yards = closedGps.reduce((sum, s) => sum + (s.distanceYards ?? 0), 0);
        const includesSoft = closedGps.some((s) => s.fixQuality === 'soft');
        const includesForced = closedGps.some((s) => s.fixQuality === 'forced');
        const noGpsCount = shots.filter((s) => s.source === 'no_gps').length;
        const penStrokes = totalPenaltyStrokes(penalties);
        const mismatch = reconcileHoleScore({
          score: hole.score,
          shotCount: shots.length,
          penaltyStrokes: penStrokes,
        }).mismatch;
        const shotBits = [
          `${shots.length} shot${shots.length === 1 ? '' : 's'}`,
          closedGps.length ? `${yards} yd` : null,
          noGpsCount ? `${noGpsCount} no GPS` : null,
        ].filter(Boolean);
        return (
          <Pressable
            key={hole.id}
            onPress={() => router.push(`/round/${id}/hole/${hole.number}`)}
            style={styles.row}>
            <Text style={styles.holeNum}>{hole.number}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.holeTitle}>
                {formatParLabel(hole.par)} · {formatSiLabel(hole.handicap)}
                {hole.yards != null ? ` · ${hole.yards} yd` : ''}
              </Text>
              <Text style={styles.muted}>{shotBits.join(' · ')}</Text>
              {penalties.length > 0 ? (
                <Text style={styles.penalty}>
                  {penalties.map((p) => formatPenaltyRow(p)).join(' · ')}
                </Text>
              ) : null}
              {mismatch ? (
                <Text style={styles.warn}>
                  Score {hole.score} ≠ {shots.length} shots + {penStrokes} penalties
                </Text>
              ) : null}
              <AverageBadges includesSoft={includesSoft} includesForced={includesForced} />
            </View>
            <Text style={styles.score}>{hole.score ?? '—'}</Text>
          </Pressable>
        );
      })}

      <BigButton label="Home" variant="secondary" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { color: colors.lime, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.cream, fontSize: 28, fontWeight: '900' },
  total: { color: colors.cream, fontSize: 48, fontWeight: '900' },
  toPar: { color: colors.lime, fontSize: 28, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 16 },
  penalty: { color: colors.amber, fontSize: 14, fontWeight: '700' },
  warn: { color: colors.orange, fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgElevated,
    padding: 12,
    borderRadius: 14,
    minHeight: 64,
  },
  holeNum: { color: colors.lime, fontSize: 22, fontWeight: '900', width: 28 },
  holeTitle: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  score: { color: colors.cream, fontSize: 24, fontWeight: '900' },
});
