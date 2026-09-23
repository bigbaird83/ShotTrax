import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { findNodeHandle, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { ensureRoundShareToken, getRound, listHoles } from '@/src/db/repo';
import { normalizeShareBoardCode } from '@/src/domain/liveBoard';
import { COPY } from '@/src/domain/playerCopy';
import { getShareSyncUrl } from '@/src/services/shareSync';
import { toastFromShareAttempt } from '@/src/domain/spectator';
import { publishRoundScoreboard, shareLiveBoard } from '@/src/services/shareRound';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

export default function RoundLiveBoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [toast, setToast] = useState<string | null>(null);
  const shareAnchorRef = useRef<View>(null);
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);
  const code = useMemo(() => {
    const token = ensureRoundShareToken(db, id);
    return normalizeShareBoardCode(token) ?? token;
  }, [db, id, revision]);

  useEffect(() => {
    publishRoundScoreboard(db, id);
  }, [db, id, revision]);

  if (!round) {
    return (
      <Screen>
        <Text style={styles.muted}>Round not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.kicker}>{COPY.liveBoard}</Text>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
      <Text style={styles.muted}>{COPY.liveBoardLede}</Text>
      {code ? (
        <View style={styles.codeCard}>
          <Text style={styles.label}>{COPY.liveBoardCode}</Text>
          <Text style={styles.code}>{code}</Text>
        </View>
      ) : null}
      {holes.map((hole) => (
        <View key={hole.id} style={styles.row}>
          <Text style={styles.hole}>{hole.number}</Text>
          <Text style={styles.score}>{hole.score ?? '—'}</Text>
        </View>
      ))}
      <View ref={shareAnchorRef} collapsable={false}>
        <BigButton
          label={COPY.shareLive}
          onPress={() => {
            const anchor = findNodeHandle(shareAnchorRef.current);
            void toastFromShareAttempt(() => shareLiveBoard(db, id, { anchor })).then((fail) => {
              if (fail) setToast(fail);
            });
          }}
        />
      </View>
      {code ? (
        <BigButton label={COPY.liveFollowOpen} variant="ghost" onPress={() => router.push(`/s/${code}`)} />
      ) : null}
      {toast ? <Text style={styles.warn}>{toast}</Text> : null}
      {getShareSyncUrl() ? null : <Text style={styles.hint}>{COPY.liveBoardNeedsHost}</Text>}
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    kicker: { color: colors.muted, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: colors.cream, fontSize: 28, fontWeight: '900' },
    muted: { color: colors.muted, fontSize: 16 },
    hint: { color: colors.muted, fontSize: 14, marginTop: 8 },
    warn: { color: colors.orange, fontSize: 13, fontWeight: '700' },
    label: { color: colors.muted, fontSize: 14, fontWeight: '800' },
    codeCard: {
      backgroundColor: colors.bgElevated,
      borderRadius: 16,
      padding: 16,
      gap: 6,
    },
    code: { color: colors.lime, fontSize: 36, fontWeight: '900', letterSpacing: 2 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: colors.bgElevated,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    hole: { color: colors.cream, fontSize: 20, fontWeight: '800' },
    score: { color: colors.lime, fontSize: 24, fontWeight: '900' },
  });
}
