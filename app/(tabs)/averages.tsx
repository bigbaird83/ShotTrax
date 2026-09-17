import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { listClubAverages } from '@/src/db/repo';
import { clubBookCarry } from '@/src/domain/nerdOut';
import { COPY } from '@/src/domain/playerCopy';
import { Screen } from '@/src/ui/Screen';
import { colors, tapTarget, type } from '@/src/ui/theme';

export default function AveragesScreen() {
  const { db, revision } = useDb();
  const rows = useMemo(() => listClubAverages(db), [db, revision]);

  return (
    <Screen>
      <Text style={styles.lede}>{COPY.averagesLede}</Text>
      {rows.map((row) => {
        const book = clubBookCarry({
          count: row.count,
          avgYards: row.avgYards,
          typicalCarryYards: row.typicalCarryYards,
          carrySource: row.carrySource,
        });
        return (
          <View key={row.club.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{row.club.name}</Text>
              <Text style={styles.meta}>
                {book.kind === 'live'
                  ? `${book.count} shot${book.count === 1 ? '' : 's'}`
                  : book.kind === 'estimated'
                    ? COPY.estimated
                    : book.kind === 'typed'
                      ? COPY.typicalCarry
                      : COPY.noClosedShots}
              </Text>
            </View>
            <Text style={styles.yards}>{book.yards != null ? `${book.yards} yd` : '—'}</Text>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lede: { color: colors.muted, fontSize: type.body, lineHeight: 22, marginBottom: 4 },
  row: {
    minHeight: tapTarget + 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  name: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: type.meta, marginTop: 2 },
  yards: { color: colors.lime, fontSize: 22, fontWeight: '900' },
});
