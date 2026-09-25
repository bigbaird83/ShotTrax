import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { listHandicapRounds } from '@/src/db/repo';
import {
  formatDifferential,
  formatHandicapIndex,
  handicapSummaryLine,
  planHandicap,
} from '@/src/domain/handicap';
import { COPY } from '@/src/domain/playerCopy';
import { formatHistoryDate } from '@/src/domain/roundHistory';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

/** Handicap index from saved rounds, and the scores behind it. Newest first. */
export default function HandicapScreen() {
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const plan = useMemo(() => planHandicap(listHandicapRounds(db)), [db, revision]);

  return (
    <Screen>
      <View style={styles.block} testID="handicap-index">
        <Text style={styles.label}>{COPY.hcpIndex}</Text>
        <Text style={styles.index}>{formatHandicapIndex(plan.index)}</Text>
        <Text style={styles.muted}>{handicapSummaryLine(plan)}</Text>
        {plan.pendingNine ? <Text style={styles.hint}>{COPY.handicapPendingNine}</Text> : null}
      </View>

      <Text style={styles.hint}>{COPY.handicapLede}</Text>
      <Text style={styles.hint}>{COPY.handicapLimits}</Text>

      <View style={styles.block}>
        <Text style={styles.section}>{COPY.handicapScores}</Text>
        {plan.entries.length === 0 ? (
          <Text style={styles.muted}>{COPY.handicapEmpty}</Text>
        ) : (
          plan.entries.map((row) => (
            <Pressable
              key={row.roundIds.join('+')}
              accessibilityRole="button"
              accessibilityLabel={`${row.courseName}, differential ${formatDifferential(row.differential)}${row.used ? ', counts' : ''}`}
              onPress={() => router.push(`/review/${row.roundIds[row.roundIds.length - 1]}/stats`)}
              style={[styles.row, row.used && styles.rowUsed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.course} numberOfLines={1}>
                  {row.courseName}
                </Text>
                <Text style={styles.muted}>
                  {formatHistoryDate(row.playedAt)} · {row.adjustedScore} · {row.rating.toFixed(1)}/{row.slope}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={[styles.diff, row.used && styles.diffUsed]}>{formatDifferential(row.differential)}</Text>
                {row.used ? <Text style={styles.used}>{COPY.handicapUsed}</Text> : null}
              </View>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    block: { gap: 8, backgroundColor: colors.bgElevated, padding: 14, borderRadius: 16 },
    label: { color: colors.muted, fontSize: 14, fontWeight: '800' },
    index: { color: colors.cream, fontSize: 56, fontWeight: '900' },
    section: { color: colors.cream, fontSize: 18, fontWeight: '800' },
    muted: { color: colors.muted, fontSize: 15 },
    hint: { color: colors.muted, fontSize: 14 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 56,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: colors.bg,
    },
    rowUsed: { borderColor: colors.good },
    course: { color: colors.cream, fontSize: 16, fontWeight: '800' },
    right: { alignItems: 'flex-end' },
    diff: { color: colors.cream, fontSize: 20, fontWeight: '900' },
    diffUsed: { color: colors.good },
    used: { color: colors.good, fontSize: 12, fontWeight: '800' },
  });
}
