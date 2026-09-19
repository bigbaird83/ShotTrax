import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  decodeSpectatorPayload,
  formatSpectatorHoleLine,
  type SpectatorPayload,
} from '@/src/domain/spectator';
import { COPY } from '@/src/domain/playerCopy';
import { getSharedPayload } from '@/src/services/shareSync';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type, type ColorPalette } from '@/src/ui/theme';

export default function SpectatorScreen() {
  const { token, p } = useLocalSearchParams<{ token: string; p?: string | string[] }>();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const encoded = Array.isArray(p) ? p[0] : p;
  const fromUrl = useMemo(() => decodeSpectatorPayload(encoded), [encoded]);
  const [payload, setPayload] = useState<SpectatorPayload | null>(fromUrl);

  useEffect(() => {
    setPayload(fromUrl);
  }, [fromUrl]);

  useEffect(() => {
    if (!token || fromUrl) return undefined;
    let live = true;
    void getSharedPayload(token).then((next) => {
      if (live && next) setPayload(next);
    });
    const id = setInterval(() => {
      void getSharedPayload(token).then((next) => {
        if (live && next) setPayload(next);
      });
    }, 8000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [token, fromUrl]);

  if (!payload) {
    return (
      <Screen>
        <Text style={styles.kicker}>{COPY.spectatorTitle}</Text>
        <Text style={styles.muted}>{COPY.spectatorEmpty}</Text>
        <Text style={styles.hint}>{COPY.spectatorNeedsNoLocation}</Text>
      </Screen>
    );
  }

  const live = !payload.finished && payload.live;

  return (
    <Screen>
      <Text style={styles.kicker}>{live ? COPY.spectatorLive : COPY.spectatorFinished}</Text>
      <Text style={styles.title}>{payload.courseName ?? 'Round'}</Text>
      <Text style={styles.hint}>{COPY.spectatorNeedsNoLocation}</Text>
      {live ? (
        <View style={styles.card}>
          <Text style={styles.liveHole}>Hole {live.hole}</Text>
          <Text style={styles.liveScore}>{live.score ?? '—'}</Text>
          <Text style={styles.muted}>Last: {live.lastClubYards ?? '—'}</Text>
        </View>
      ) : null}
      {payload.finished
        ? payload.holes.map((row) => (
            <Text key={row.hole} style={styles.row}>
              {formatSpectatorHoleLine(row)}
            </Text>
          ))
        : null}
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    kicker: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
    title: { ...type.title, color: colors.cream, marginTop: 6 },
    hint: { ...type.caption, color: colors.muted, marginTop: 8 },
    muted: { ...type.body, color: colors.muted, marginTop: 6 },
    card: {
      marginTop: 20,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.line,
    },
    liveHole: { ...type.subtitle, color: colors.cream },
    liveScore: { ...type.title, color: colors.lime, marginTop: 4 },
    row: { ...type.body, color: colors.cream, marginTop: 10 },
  });
}
