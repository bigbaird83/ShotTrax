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
  formatHoleClock,
  formatLivePaceLine,
  formatToPar,
  planLivePace,
  planLiveScoreTotals,
} from '@/src/domain/livePace';
import {
  decodeSpectatorPayload,
  type SpectatorPayload,
} from '@/src/domain/spectator';
import { COPY } from '@/src/domain/playerCopy';
import { getShareSyncUrl, loadSharedPayload } from '@/src/services/shareSync';
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
      par: null,
      putts: null,
      startedAt: null,
      completedAt: null,
    })),
    updatedAt: null,
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
  // `?h=` / `?p=` is first paint only; the share host (or this phone's own row) replaces it.
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasHost = getShareSyncUrl() != null;

  useEffect(() => {
    setPayload(fromUrl ?? fromSnapshot);
  }, [fromUrl, fromSnapshot]);

  // Same phone reads the local share_boards row; other phones GET the share host
  // with the same normalized code the player PUT.
  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    let loaded = false;
    setLoading(true);
    setLoadFailed(false);
    const refresh = () => {
      setNowMs(Date.now());
      const local = getShareBoard(db, code);
      if (local) {
        loaded = true;
        setPayload(local);
        setLoadFailed(false);
      }
      void loadSharedPayload(code).then((result) => {
        if (!live) return;
        if (result.status === 'ok') {
          loaded = true;
          setPayload(result.payload);
          setLoadFailed(false);
        } else if (!loaded) {
          setLoadFailed(true);
        }
        setLoading(false);
      });
    };
    refresh();
    const id = setInterval(refresh, LIVE_BOARD_POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [code, db]);

  if (!payload) {
    return (
      <Screen>
        <Text style={styles.kicker}>{COPY.spectatorTitle}</Text>
        {loading ? (
          <Text style={styles.muted}>{COPY.spectatorLoading}</Text>
        ) : (
          <Text style={styles.warn}>{COPY.spectatorLoadFail}</Text>
        )}
        {code ? <Text style={styles.hint}>{`${COPY.liveBoardCode} ${code}`}</Text> : null}
        <Text style={styles.hint}>{COPY.spectatorNeedsNoLocation}</Text>
        <Text style={styles.hint}>{hasHost ? COPY.liveFollowRefresh : COPY.liveBoardNeedsHost}</Text>
      </Screen>
    );
  }

  const live = !payload.finished && payload.live;
  const rows = payload.holes;
  const pace = planLivePace({ holes: rows, nowMs, finished: payload.finished });
  const totals = planLiveScoreTotals(rows);
  const toPar = formatToPar(totals.toPar);
  const showPutts = rows.some((row) => row.putts != null);

  return (
    <Screen>
      <Text style={styles.kicker}>{live || !payload.finished ? COPY.spectatorLive : COPY.spectatorFinished}</Text>
      <Text style={styles.title}>{payload.courseName ?? 'Round'}</Text>
      {loadFailed ? <Text style={styles.warn}>{COPY.spectatorLoadFail}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.total}>
          {totals.total == null ? '—' : String(totals.total)}
          {toPar ? <Text style={styles.toPar}>{`  ${toPar}`}</Text> : null}
        </Text>
        <Text style={styles.pace}>{formatLivePaceLine(pace, payload.finished)}</Text>
        {live ? <Text style={styles.muted}>On hole {live.hole}</Text> : null}
        {live && live.lastClubYards ? <Text style={styles.hint}>Last: {live.lastClubYards}</Text> : null}
      </View>
      <View style={styles.headRow}>
        <Text style={[styles.headCell, styles.colHole]}>Hole</Text>
        <Text style={[styles.headCell, styles.colNum]}>Par</Text>
        <Text style={[styles.headCell, styles.colNum]}>Score</Text>
        {showPutts ? <Text style={[styles.headCell, styles.colNum]}>Putts</Text> : null}
        <Text style={[styles.headCell, styles.colTime]}>Start</Text>
        <Text style={[styles.headCell, styles.colTime]}>Finish</Text>
      </View>
      {rows.map((row) => {
        const current = live ? live.hole === row.hole && row.completedAt == null : false;
        return (
          <View key={row.hole} style={[styles.row, current ? styles.rowCurrent : null]}>
            <Text style={[styles.rowHole, styles.colHole]}>{row.hole}</Text>
            <Text style={[styles.cell, styles.colNum]}>{row.par == null ? '—' : String(row.par)}</Text>
            <Text style={[styles.rowScore, styles.colNum]}>{row.score == null ? '—' : String(row.score)}</Text>
            {showPutts ? (
              <Text style={[styles.cell, styles.colNum]}>{row.putts == null ? '—' : String(row.putts)}</Text>
            ) : null}
            <Text style={[styles.cell, styles.colTime]}>{formatHoleClock(row.startedAt)}</Text>
            <Text style={[styles.cell, styles.colTime]}>{formatHoleClock(row.completedAt)}</Text>
          </View>
        );
      })}
      {payload.updatedAt ? (
        <Text style={styles.hint}>Updated {formatHoleClock(payload.updatedAt)}</Text>
      ) : null}
      <Text style={styles.hint}>{hasHost ? COPY.liveFollowRefresh : COPY.liveFollowSameDevice}</Text>
      <Text style={styles.hint}>{COPY.spectatorNeedsNoLocation}</Text>
      <Text style={styles.hint}>{COPY.liveBoardPrivacy}</Text>
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    kicker: { color: colors.muted, fontSize: type.kicker, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: colors.cream, fontSize: type.title, fontWeight: '900', marginTop: 6 },
    hint: { color: colors.muted, fontSize: type.tiny, marginTop: 8 },
    muted: { color: colors.muted, fontSize: type.body, marginTop: 6 },
    warn: { color: colors.orange, fontSize: type.body, fontWeight: '700', marginTop: 6 },
    card: {
      marginTop: 16,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.line,
    },
    total: { color: colors.lime, fontSize: type.title, fontWeight: '900' },
    toPar: { color: colors.cream, fontSize: type.hole, fontWeight: '800' },
    pace: { color: colors.cream, fontSize: type.body, fontWeight: '700', marginTop: 6 },
    headRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
    headCell: { color: colors.muted, fontSize: type.tiny, fontWeight: '800', textTransform: 'uppercase' },
    row: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bgElevated,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    rowCurrent: { borderWidth: 1, borderColor: colors.lime },
    colHole: { width: 40 },
    colNum: { width: 44, textAlign: 'center' },
    colTime: { flex: 1, textAlign: 'right' },
    cell: { color: colors.cream, fontSize: type.meta, fontWeight: '700' },
    rowHole: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
    rowScore: { color: colors.lime, fontSize: type.button, fontWeight: '900' },
  });
}
