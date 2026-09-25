import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { listClubAverages } from '@/src/db/repo';
import { planClubData } from '@/src/domain/nerdOut';
import { COPY } from '@/src/domain/playerCopy';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

/** Club data — the club-book carry table that used to sit under Nerd out. */
export default function ClubDataScreen() {
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const clubs = useMemo(
    () =>
      planClubData(
        listClubAverages(db).map((row) => ({
          id: row.club.id,
          name: row.club.name,
          shortName: row.club.shortName,
          count: row.count,
          avgYards: row.avgYards,
          typicalCarryYards: row.typicalCarryYards,
          carrySource: row.carrySource,
        })),
      ),
    [db, revision],
  );

  return (
    <Screen>
      {clubs.map((row) => (
        <View key={row.id} style={styles.row}>
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
      <BigButton label={COPY.dispersion} variant="secondary" onPress={() => router.push('/dispersion')} />
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    muted: { color: colors.muted, fontSize: 16 },
    holeTitle: { color: colors.cream, fontSize: 18, fontWeight: '700' },
    score: { color: colors.cream, fontSize: 24, fontWeight: '900' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.bgElevated,
      padding: 12,
      borderRadius: 14,
      minHeight: 64,
    },
  });
}
