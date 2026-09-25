import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { listHoles, listStatRounds } from '@/src/db/repo';
import { COPY } from '@/src/domain/playerCopy';
import { planReviewRounds, type ReviewRoundRow } from '@/src/domain/roundReview';
import { scorecardDiffLabel } from '@/src/domain/scorecard';
import { BigButton } from '@/src/ui/BigButton';
import { EmptyPanel } from '@/src/ui/EmptyPanel';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { tapTarget, type ColorPalette } from '@/src/ui/theme';

/** Finished saved rounds, newest first. Review → Scorecard / Shot review / Stats. */
export default function ReviewRoundsScreen() {
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [picked, setPicked] = useState<ReviewRoundRow | null>(null);
  const rows = useMemo(
    () =>
      planReviewRounds(
        listStatRounds(db).map((round) => ({
          id: round.id,
          courseName: round.courseName,
          startedAt: round.startedAt,
          finishedAt: round.finishedAt,
          holes: listHoles(db, round.id).map((hole) => ({ score: hole.score, par: hole.par })),
        })),
      ),
    [db, revision],
  );

  const open = (screen: 'scorecard' | 'shots' | 'stats') => {
    if (!picked) return;
    const id = picked.id;
    setPicked(null);
    router.push(`/review/${id}/${screen}`);
  };

  return (
    <Screen>
      {rows.length === 0 ? <EmptyPanel title={COPY.reviewRoundsEmpty} hint={COPY.firstRoundHint} /> : null}
      {rows.map((row) => (
        <View key={row.id} style={styles.row} testID={`review-round-${row.id}`}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.course}>{row.courseName}</Text>
            <Text style={styles.muted}>{row.date}</Text>
          </View>
          <View style={styles.scoreCol}>
            <Text style={styles.score}>{row.score ?? '—'}</Text>
            <Text style={styles.muted}>{scorecardDiffLabel(row.toPar) ?? '—'}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${COPY.review} ${row.courseName} ${row.date}`}
            onPress={() => setPicked(row)}
            style={({ pressed }) => [styles.reviewBtn, pressed && styles.pressed]}>
            <Text style={styles.reviewLabel}>{COPY.review}</Text>
          </Pressable>
        </View>
      ))}

      <Modal visible={picked != null} transparent animationType="fade" onRequestClose={() => setPicked(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicked(null)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            <Text style={styles.course}>{picked?.courseName}</Text>
            <Text style={styles.muted}>{picked?.date}</Text>
            <BigButton label={COPY.scorecard} variant="secondary" onPress={() => open('scorecard')} />
            <BigButton label={COPY.shotReview} variant="secondary" onPress={() => open('shots')} />
            <BigButton label={COPY.stats} variant="secondary" onPress={() => open('stats')} />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.bgElevated,
      padding: 12,
      borderRadius: 14,
      minHeight: 64,
    },
    course: { color: colors.cream, fontSize: 18, fontWeight: '700' },
    muted: { color: colors.muted, fontSize: 14 },
    scoreCol: { alignItems: 'flex-end' },
    score: { color: colors.cream, fontSize: 24, fontWeight: '900' },
    reviewBtn: {
      minHeight: tapTarget,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
    },
    reviewLabel: { color: colors.cream, fontSize: 16, fontWeight: '800' },
    pressed: { opacity: 0.7 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      padding: 24,
    },
    menu: { gap: 10, backgroundColor: colors.bgElevated, borderRadius: 18, padding: 16 },
  });
}
