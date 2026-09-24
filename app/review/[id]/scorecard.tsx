import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { findNodeHandle, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getRound, listHoles, listPenaltiesForHole, listShotsForHole } from '@/src/db/repo';
import { totalPenaltyStrokes } from '@/src/domain/penalty';
import { COPY } from '@/src/domain/playerCopy';
import { toastFromShareAttempt } from '@/src/domain/spectator';
import { shareRoundSnapshot } from '@/src/services/shareRound';
import { ScorecardBody } from '@/src/ui/ScorecardBody';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

/** Saved-round scorecard — same ScorecardBody as in-round. Share is the scorecard image only. */
export default function ReviewScorecardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [toast, setToast] = useState<string | null>(null);
  const anchorRef = useRef<View>(null);
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const holes = useMemo(
    () =>
      round
        ? listHoles(db, round.id).map((row) => ({
            number: row.number,
            par: row.par,
            score: row.score,
            putts: row.putts,
            puttsDone: row.puttsDone,
            shotCount: listShotsForHole(db, row.id).length,
            penaltyStrokes: totalPenaltyStrokes(listPenaltiesForHole(db, row.id)),
          }))
        : [],
    [db, round, revision],
  );

  if (!round) {
    return (
      <Screen>
        <Text style={styles.muted}>Round not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
      <View ref={anchorRef} collapsable={false}>
        <ScorecardBody
          holes={holes}
          onBack={() => router.back()}
          onShareImage={() => {
            const anchor = findNodeHandle(anchorRef.current);
            void toastFromShareAttempt(
              () => shareRoundSnapshot(db, round.id, { anchor }),
              COPY.shareScorecardFail,
            ).then((fail) => {
              if (fail) setToast(fail);
            });
          }}
        />
      </View>
      {toast ? <Text style={styles.warn}>{toast}</Text> : null}
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: 24, fontWeight: '900' },
    muted: { color: colors.muted, fontSize: 16 },
    warn: { color: colors.orange, fontSize: 13, fontWeight: '700' },
  });
}
