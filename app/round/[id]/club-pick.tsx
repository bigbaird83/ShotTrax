import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { listClubs } from '@/src/db/repo';
import { markShotWithClub, promptForPlan } from '@/src/services/shotActions';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

/**
 * P1 stub: tap a club to confirm. Voice (“seven iron”) and top-3 ranking UI are later PRs.
 */
export default function ClubPickScreen() {
  const { id, hole } = useLocalSearchParams<{ id: string; hole: string }>();
  const holeNumber = Number(hole);
  const { db, bump } = useDb();
  const clubs = useMemo(() => listClubs(db, true), [db]);
  const [busy, setBusy] = useState(false);

  const onPick = async (clubId: string, force = false) => {
    if (!id || Number.isNaN(holeNumber)) return;
    setBusy(true);
    try {
      const { plan } = await markShotWithClub(db, {
        roundId: id,
        holeNumber,
        clubId,
        force,
      });
      const waiting = promptForPlan(plan, () => {
        void onPick(clubId, true);
      });
      if (!waiting && plan.status === 'commit') {
        bump();
        router.back();
      }
    } catch (err) {
      Alert.alert('Could not mark shot', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={styles.kicker}>P1 stub</Text>
      <Text style={styles.title}>Tap a club to mark</Text>
      <Text style={styles.lede}>
        Confirming a club captures GPS now as the shot start. That same fix closes the previous
        open shot on this hole (end = next mark). Voice club pick and top-3 suggestions ship later.
      </Text>
      <View style={styles.grid}>
        {clubs.map((club) => (
          <Pressable
            key={club.id}
            disabled={busy}
            onPress={() => void onPick(club.id)}
            style={({ pressed }) => [styles.club, pressed && { opacity: 0.8 }, busy && { opacity: 0.5 }]}>
            <Text style={styles.short}>{club.shortName}</Text>
            <Text style={styles.name}>{club.name}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { color: colors.amber, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.cream, fontSize: 28, fontWeight: '900' },
  lede: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  club: {
    width: '47%',
    minHeight: 72,
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    justifyContent: 'center',
  },
  short: { color: colors.lime, fontSize: 20, fontWeight: '900' },
  name: { color: colors.cream, fontSize: 14, marginTop: 2 },
});
