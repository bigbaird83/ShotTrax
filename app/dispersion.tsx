import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getClubMap, listDispersionShots } from '@/src/db/repo';
import { dispersionClubs, formatLateral, formatMissShares, planDispersion } from '@/src/domain/dispersion';
import { COPY } from '@/src/domain/playerCopy';
import { DispersionPlot } from '@/src/ui/DispersionPlot';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

/** Club dispersion from saved shots: distance toward the green and left / right of the line. */
export default function DispersionScreen() {
  const { clubId: initialClub } = useLocalSearchParams<{ clubId?: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [clubId, setClubId] = useState<string | null>(initialClub ?? null);
  const shots = useMemo(() => listDispersionShots(db), [db, revision]);
  const clubs = useMemo(() => dispersionClubs(shots, getClubMap(db)), [db, shots]);
  const active = clubs.find((club) => club.id === clubId) ?? clubs[0] ?? null;
  const plan = useMemo(() => (active ? planDispersion(shots, active.id) : null), [shots, active]);

  if (!active || !plan) {
    return (
      <Screen>
        <Text style={styles.muted}>{COPY.dispersionLede}</Text>
        <Text style={styles.muted}>{COPY.dispersionEmpty}</Text>
      </Screen>
    );
  }

  const shares = formatMissShares(plan);

  return (
    <Screen>
      <Text style={styles.muted}>{COPY.dispersionLede}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubRow}>
        {clubs.map((club) => {
          const on = club.id === active.id;
          return (
            <Pressable
              key={club.id}
              testID={`dispersion-club-${club.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setClubId(club.id)}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{club.name}</Text>
              <Text style={styles.chipCount}>{club.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.card} testID="dispersion-summary">
        <Text style={styles.section}>{active.name}</Text>
        <View style={styles.grid}>
          <Stat styles={styles} label={COPY.dispersionAvg} value={`${plan.avgAlong ?? '—'} yd`} />
          <Stat styles={styles} label={COPY.dispersionOffLine} value={formatLateral(plan.avgLateral)} />
          <Stat
            styles={styles}
            label={COPY.dispersionDistance}
            value={plan.alongRange ? `${plan.alongRange.low}–${plan.alongRange.high}` : '—'}
          />
          <Stat
            styles={styles}
            label={COPY.dispersionWidth}
            value={
              plan.lateralRange
                ? `${formatLateral(plan.lateralRange.low)} – ${formatLateral(plan.lateralRange.high)}`
                : '—'
            }
          />
        </View>
        {shares ? <Text style={styles.muted}>{shares}</Text> : null}
        <Text style={styles.hint}>
          {plan.count} shot{plan.count === 1 ? '' : 's'}
        </Text>
      </View>

      <View style={styles.card} testID="dispersion-plot">
        <DispersionPlot key={active.id} plan={plan} />
      </View>

      <Text style={styles.hint}>{COPY.dispersionLimits}</Text>
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
  value: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    section: { color: colors.cream, fontSize: 18, fontWeight: '800' },
    muted: { color: colors.muted, fontSize: 15 },
    hint: { color: colors.muted, fontSize: 13 },
    clubRow: { gap: 8, paddingVertical: 2 },
    chip: {
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bgElevated,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    chipOn: { borderColor: colors.cream, borderWidth: 2, backgroundColor: colors.accentWash },
    chipText: { color: colors.cream, fontWeight: '800', fontSize: 15 },
    chipTextOn: { fontWeight: '900' },
    chipCount: { color: colors.muted, fontWeight: '700', fontSize: 13 },
    card: { gap: 8, backgroundColor: colors.bgElevated, padding: 14, borderRadius: 16 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
    stat: { width: '50%', gap: 2, paddingRight: 8 },
    label: { color: colors.muted, fontSize: 13, fontWeight: '800' },
    value: { color: colors.cream, fontSize: 22, fontWeight: '900' },
  });
}
