import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatParLabel, formatSiLabel, formatTeeMeta } from '@/src/course/layout';
import { useDb } from '@/src/db/DbProvider';
import { getRound, listClubAverages, listClubs, listHoles, listPenaltiesForHole, listShotsForHole } from '@/src/db/repo';
import { planNerdOut } from '@/src/domain/nerdOut';
import { formatPenaltyRow, totalPenaltyStrokes } from '@/src/domain/penalty';
import { COPY } from '@/src/domain/playerCopy';
import { reconcileHoleScore } from '@/src/domain/scoreReconcile';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { FullSheet } from '@/src/ui/Sheet';
import { colors } from '@/src/ui/theme';

export default function RoundSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, revision } = useDb();
  const [nerdOpen, setNerdOpen] = useState(false);
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);
  const clubs = useMemo(() => listClubs(db), [db, revision]);
  const averages = useMemo(() => listClubAverages(db), [db, revision]);
  const nerd = useMemo(
    () =>
      planNerdOut({
        holeScores: holes.map((hole) => hole.score),
        holePutts: holes.map((hole) => hole.putts),
        clubs,
        averages: averages.map((row) => ({
          clubId: row.club.id,
          count: row.count,
          avgYards: row.avgYards,
        })),
      }),
    [holes, clubs, averages],
  );

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
        {scored.length} of {round.holeCount} holes scored.
      </Text>

      {holes.map((hole) => {
        const shots = listShotsForHole(db, hole.id);
        const penalties = listPenaltiesForHole(db, hole.id);
        const closedGps = shots.filter(
          (s) => (s.source === 'gps' || s.source === 'placed') && s.distanceYards != null,
        );
        const yards = closedGps.reduce((sum, h) => sum + (h.distanceYards ?? 0), 0);
        const penStrokes = totalPenaltyStrokes(penalties);
        const mismatch = reconcileHoleScore({
          score: hole.score,
          shotCount: shots.length,
          puttCount: hole.putts,
          penaltyStrokes: penStrokes,
        }).mismatch;
        const shotBits = [
          `${shots.length} shot${shots.length === 1 ? '' : 's'}`,
          hole.putts ? `${hole.putts} putt${hole.putts === 1 ? '' : 's'}` : null,
          closedGps.length ? `${yards} yd` : null,
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
                  Score {hole.score} doesn’t match {shots.length} shots + {penStrokes} penalties.
                </Text>
              ) : null}
            </View>
            <Text style={styles.score}>{hole.score ?? '—'}</Text>
          </Pressable>
        );
      })}

      <BigButton label={COPY.nerdOut} variant="secondary" onPress={() => setNerdOpen(true)} />
      <BigButton label={COPY.home} variant="ghost" onPress={() => router.replace('/')} />

      <FullSheet visible={nerdOpen} title={COPY.nerdOut} onClose={() => setNerdOpen(false)}>
        <ScrollView contentContainerStyle={styles.nerdPad}>
          <Text style={styles.muted}>{COPY.nerdOutLede}</Text>
          <Text style={styles.nerdLabel}>{COPY.score}</Text>
          <Text style={styles.nerdValue}>{nerd.score ?? '—'}</Text>
          <Text style={styles.nerdLabel}>{COPY.putts}</Text>
          <Text style={styles.nerdValue}>{nerd.putts}</Text>
          {nerd.clubs.map((row) => (
            <View key={row.id} style={styles.nerdRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.holeTitle}>{row.name}</Text>
                <Text style={styles.muted}>
                  {row.kind === 'live'
                    ? `${row.count} shot${row.count === 1 ? '' : 's'}`
                    : row.kind === 'estimated'
                      ? COPY.estimated
                      : row.kind === 'typed'
                        ? COPY.typicalCarry
                        : COPY.noClosedShots}
                </Text>
              </View>
              <Text style={styles.score}>{row.yards != null ? `${row.yards}` : '—'}</Text>
            </View>
          ))}
        </ScrollView>
      </FullSheet>
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
  nerdPad: { padding: 16, gap: 10, paddingBottom: 40 },
  nerdLabel: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  nerdValue: { color: colors.cream, fontSize: 36, fontWeight: '900' },
  nerdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgElevated,
    padding: 12,
    borderRadius: 14,
    minHeight: 64,
  },
});
