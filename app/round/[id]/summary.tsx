import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getRound, listHoles, listShotsForHole } from '@/src/db/repo';
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
  const total = scored.reduce((sum, h) => sum + (h.score ?? 0), 0);
  const toPar = scored.reduce((sum, h) => sum + ((h.score ?? 0) - h.par), 0);
  const toParLabel = scored.length === 0 ? '—' : toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;

  return (
    <Screen>
      <Text style={styles.kicker}>{round.finishedAt ? 'Finished' : 'In progress'}</Text>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
      <Text style={styles.total}>
        {scored.length ? total : '—'}{' '}
        <Text style={styles.toPar}>{toParLabel}</Text>
      </Text>
      <Text style={styles.muted}>
        {scored.length} of {round.holeCount} holes scored
      </Text>

      {holes.map((hole) => {
        const shots = listShotsForHole(db, hole.id);
        const closed = shots.filter((s) => s.distanceYards != null);
        const yards = closed.reduce((sum, s) => sum + (s.distanceYards ?? 0), 0);
        return (
          <Pressable
            key={hole.id}
            onPress={() => router.push(`/round/${id}/hole/${hole.number}`)}
            style={styles.row}>
            <Text style={styles.holeNum}>{hole.number}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.holeTitle}>Par {hole.par}</Text>
              <Text style={styles.muted}>
                {shots.length} shot{shots.length === 1 ? '' : 's'}
                {closed.length ? ` · ${yards} yd` : ''}
              </Text>
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
