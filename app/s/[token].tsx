import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getShareBoard } from '@/src/db/repo';
import {
  decodeScoreSnapshot,
  LIVE_BOARD_POLL_MS,
  normalizeShareBoardCode,
} from '@/src/domain/liveBoard';
import {
  decodeSpectatorPayload,
  type SpectatorPayload,
} from '@/src/domain/spectator';
import { COPY } from '@/src/domain/playerCopy';
import { getSharedPayload } from '@/src/services/shareSync';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type, type ColorPalette } from '@/src/ui/theme';

function payloadFromSnapshot(token: string, raw: string | null | undefined): SpectatorPayload | null {
  const scores = decodeScoreSnapshot(Array.isArray(raw) ? raw[0] : raw);
  if (scores.length === 0) return null;
  return {
    v: 1,
    token,
    courseName: null,
    finished: false,
    live: null,
    holes: scores.map((score, index) => ({
      hole: index + 1,
      club: null,
      pinToPinYards: null,
      score,
      approximate: false,
    })),
  };
}

export default function SpectatorScreen() {
  const { token, p, h } = useLocalSearchParams<{ token: string; p?: string | string[]; h?: string | string[] }>();
  const { db } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const encoded = Array.isArray(p) ? p[0] : p;
  const snapshotRaw = Array.isArray(h) ? h[0] : h;
  const code = normalizeShareBoardCode(token) ?? token;
  const fromUrl = useMemo(() => decodeSpectatorPayload(encoded), [encoded]);
  const fromSnapshot = useMemo(
    () => (fromUrl ? null : payloadFromSnapshot(code, snapshotRaw)),
    [fromUrl, code, snapshotRaw],
  );
  const [payload, setPayload] = useState<SpectatorPayload | null>(fromUrl ?? fromSnapshot);

  useEffect(() => {
    setPayload(fromUrl ?? fromSnapshot);
  }, [fromUrl, fromSnapshot]);

  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    const apply = (next: SpectatorPayload | null) => {
      if (live && next) setPayload(next);
    };
    apply(getShareBoard(db, code));
    void getSharedPayload(code).then(apply);
    const id = setInterval(() => {
      apply(getShareBoard(db, code));
      void getSharedPayload(code).then(apply);
    }, LIVE_BOARD_POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [code, db]);

  if (!payload) {
    return (
      <Screen>
        <Text style={styles.kicker}>{COPY.spectatorTitle}</Text>
        <Text style={styles.muted}>{COPY.spectatorEmpty}</Text>
        <Text style={styles.hint}>{COPY.spectatorNeedsNoLocation}</Text>
        <Text style={styles.hint}>{COPY.liveBoardNeedsHost}</Text>
      </Screen>
    );
  }

  const live = !payload.finished && payload.live;
  const rows = payload.holes;

  return (
    <Screen>
      <Text style={styles.kicker}>{live || !payload.finished ? COPY.spectatorLive : COPY.spectatorFinished}</Text>
      <Text style={styles.title}>{payload.courseName ?? 'Round'}</Text>
      <Text style={styles.hint}>{COPY.spectatorNeedsNoLocation}</Text>
      <Text style={styles.hint}>{COPY.liveBoardPrivacy}</Text>
      {live ? (
        <View style={styles.card}>
          <Text style={styles.liveHole}>Hole {live.hole}</Text>
          <Text style={styles.liveScore}>{live.score ?? '—'}</Text>
          <Text style={styles.muted}>Last: {live.lastClubYards ?? '—'}</Text>
        </View>
      ) : null}
      {rows.map((row) => (
        <View key={row.hole} style={styles.row}>
          <Text style={styles.rowHole}>{row.hole}</Text>
          <Text style={styles.rowScore}>{row.score == null ? '—' : String(row.score)}</Text>
        </View>
      ))}
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    kicker: { color: colors.muted, fontSize: type.kicker, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: colors.cream, fontSize: type.title, fontWeight: '900', marginTop: 6 },
    hint: { color: colors.muted, fontSize: type.tiny, marginTop: 8 },
    muted: { color: colors.muted, fontSize: type.body, marginTop: 6 },
    card: {
      marginTop: 20,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.line,
    },
    liveHole: { color: colors.cream, fontSize: type.hole, fontWeight: '800' },
    liveScore: { color: colors.lime, fontSize: type.title, fontWeight: '900', marginTop: 4 },
    row: {
      marginTop: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: colors.bgElevated,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rowHole: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
    rowScore: { color: colors.lime, fontSize: type.button, fontWeight: '900' },
  });
}
