import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { listClubAverages } from '@/src/db/repo';
import { AverageBadges } from '@/src/ui/Badge';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

export default function AveragesScreen() {
  const { db, revision } = useDb();
  const rows = useMemo(() => listClubAverages(db), [db, revision]);

  return (
    <Screen>
      <Text style={styles.lede}>
        Averages include every closed GPS shot with yards — GOOD, SOFT (15–25 m GPS), and FORCED
        (weak GPS or 400+ yd jump). Badges mean those qualities are in the mix, not excluded.
        No-GPS (`none`) shots, typed yards, and hole penalties never enter distance averages or top-3 ranking.
      </Text>
      {rows.map((row) => (
        <View key={row.club.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{row.club.name}</Text>
            <Text style={styles.meta}>
              {row.count === 0 ? 'No closed shots' : `${row.count} shot${row.count === 1 ? '' : 's'}`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <Text style={styles.yards}>{row.count ? `${Math.round(row.avgYards)} yd` : '—'}</Text>
            <AverageBadges includesSoft={row.includesSoft} includesForced={row.includesForced} />
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { color: colors.muted, fontSize: 16, lineHeight: 22, marginBottom: 4 },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  name: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 14, marginTop: 2 },
  yards: { color: colors.lime, fontSize: 22, fontWeight: '900' },
});
