import * as Device from 'expo-device';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import {
  finishRound,
  getClubMap,
  getHole,
  getOpenShotForHole,
  getRound,
  listShotsForHole,
  updateHolePar,
  updateHoleScore,
} from '@/src/db/repo';
import type { GpsFix } from '@/src/domain/types';
import { classifyAccuracyM } from '@/src/domain/fixQuality';
import { getCurrentFix } from '@/src/services/location';
import { endOpenShot, promptForPlan, type ForceState } from '@/src/services/shotActions';
import { QualityBadge } from '@/src/ui/Badge';
import { BigButton } from '@/src/ui/BigButton';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

export default function HoleScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const holeNumber = Number(number);
  const navigation = useNavigation();
  const { db, revision, bump } = useDb();
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const hole = useMemo(() => getHole(db, id, holeNumber), [db, id, holeNumber, revision]);
  const shots = useMemo(() => (hole ? listShotsForHole(db, hole.id) : []), [db, hole, revision]);
  const clubs = useMemo(() => getClubMap(db), [db, revision]);
  const open = useMemo(
    () => (hole ? getOpenShotForHole(db, hole.id) : null),
    [db, hole, revision],
  );
  const readOnly = Boolean(round?.finishedAt);

  useEffect(() => {
    navigation.setOptions({ title: `Hole ${holeNumber}` });
  }, [navigation, holeNumber]);

  useEffect(() => {
    let live = true;
    getCurrentFix()
      .then((next) => {
        if (!live) return;
        setFix(next);
        setFixError(null);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setFix(null);
        setFixError(err instanceof Error ? err.message : 'GPS unavailable');
      });
    return () => {
      live = false;
    };
  }, [revision]);

  if (!round || !hole) {
    return (
      <Screen>
        <Text style={styles.lede}>Round or hole not found.</Text>
      </Screen>
    );
  }

  const onEndShot = async (flags: ForceState = {}) => {
    if (readOnly || !open) return;
    setBusy(true);
    try {
      const { plan } = await endOpenShot(db, { roundId: id, holeNumber, flags });
      const waiting = promptForPlan(plan, (more) => {
        void onEndShot({ ...flags, ...more });
      });
      if (!waiting) bump();
    } catch (err) {
      Alert.alert('Could not end shot', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const accClass = fix ? classifyAccuracyM(fix.accuracyM) : null;
  const simBanner = Device.isDevice === false
    ? 'SIMULATOR GPS — using the location the simulator reports. ShotTrax does not invent coordinates. Move the GPS pin between marks to log yards.'
    : fix?.mocked
      ? 'MOCK GPS — the OS flagged this fix as mocked. ShotTrax is not synthesizing a location.'
      : null;

  return (
    <Screen>
      {simBanner ? <GpsBanner message={simBanner} /> : null}

      <View style={styles.headerRow}>
        <Text style={styles.holeTitle}>Hole {hole.number}</Text>
        <Text style={styles.muted}>
          {round.courseName ?? 'Round'} · {round.holeCount} holes
        </Text>
      </View>

      <Text style={styles.label}>Par</Text>
      <View style={styles.row}>
        {[3, 4, 5].map((par) => (
          <Pressable
            key={par}
            disabled={readOnly}
            onPress={() => {
              updateHolePar(db, hole.id, par);
              bump();
            }}
            style={[styles.chip, hole.par === par && styles.chipOn]}>
            <Text style={styles.chipText}>{par}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Score</Text>
      <View style={styles.row}>
        <Pressable
          disabled={readOnly}
          onPress={() => {
            const next = Math.max(1, (hole.score ?? hole.par) - 1);
            updateHoleScore(db, hole.id, next);
            bump();
          }}
          style={styles.step}>
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.score}>{hole.score ?? '—'}</Text>
        <Pressable
          disabled={readOnly}
          onPress={() => {
            const next = (hole.score ?? hole.par) + 1;
            updateHoleScore(db, hole.id, next);
            bump();
          }}
          style={styles.step}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>

      <View style={styles.gpsBox}>
        <Text style={styles.label}>GPS at last read</Text>
        {fixError ? (
          <Text style={styles.warn}>{fixError}</Text>
        ) : fix ? (
          <Text style={styles.meta}>
            {fix.accuracyM == null ? 'accuracy unknown' : `${Math.round(fix.accuracyM)} m`}
            {accClass ? ` · ${accClass.toUpperCase()}` : ''}
            {' · '}
            {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.meta}>Reading GPS…</Text>
        )}
        <Text style={styles.tiny}>
          Start = GPS when you confirm a club. End = GPS on the next mark (or End last shot).
        </Text>
      </View>

      <Text style={styles.label}>Shots</Text>
      {shots.length === 0 ? (
        <Text style={styles.muted}>No shots on this hole yet.</Text>
      ) : (
        shots.map((shot) => {
          const club = shot.clubId ? clubs[shot.clubId] : null;
          const openShot = shot.endedAt == null;
          return (
            <View key={shot.id} style={styles.shot}>
              <Text style={styles.shotSeq}>{shot.seq}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.shotClub}>{club?.name ?? 'Club'}</Text>
                <Text style={styles.meta}>
                  {openShot
                    ? 'Waiting for next mark to log yards'
                    : `${shot.distanceYards ?? '—'} yd${shot.impossibleJump ? ' · jump' : ''}`}
                </Text>
              </View>
              <QualityBadge quality={shot.fixQuality} open={openShot} />
            </View>
          );
        })
      )}

      {readOnly ? (
        <Text style={styles.muted}>This round is finished.</Text>
      ) : (
        <View style={{ gap: 10, marginTop: 8 }}>
          <BigButton
            label="Mark shot"
            disabled={busy}
            onPress={() =>
              router.push(`/round/${id}/club-pick?hole=${holeNumber}`)
            }
          />
          <BigButton
            label="End last shot"
            variant="secondary"
            disabled={busy || !open}
            onPress={() => void onEndShot()}
          />
        </View>
      )}

      <View style={styles.navRow}>
        <BigButton
          label="Prev"
          variant="ghost"
          disabled={holeNumber <= 1}
          style={{ flex: 1 }}
          onPress={() => router.replace(`/round/${id}/hole/${holeNumber - 1}`)}
        />
        <BigButton
          label="Next"
          variant="ghost"
          disabled={holeNumber >= round.holeCount}
          style={{ flex: 1 }}
          onPress={() => router.replace(`/round/${id}/hole/${holeNumber + 1}`)}
        />
      </View>

      {!readOnly ? (
        <BigButton
          label="Finish round"
          variant="danger"
          onPress={() => {
            finishRound(db, id);
            bump();
            router.replace(`/round/${id}/summary`);
          }}
        />
      ) : (
        <BigButton label="Summary" variant="secondary" onPress={() => router.push(`/round/${id}/summary`)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { gap: 4 },
  holeTitle: { color: colors.cream, fontSize: 32, fontWeight: '900' },
  lede: { color: colors.muted, fontSize: 16 },
  label: { color: colors.cream, fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
  muted: { color: colors.muted, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 14 },
  tiny: { color: colors.muted, fontSize: 12, lineHeight: 16, marginTop: 6 },
  warn: { color: colors.orange, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  chip: {
    minHeight: 56,
    minWidth: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  chipOn: { borderColor: colors.lime, backgroundColor: '#1C3A24' },
  chipText: { color: colors.cream, fontSize: 22, fontWeight: '800' },
  step: {
    minHeight: 64,
    minWidth: 64,
    borderRadius: 16,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepText: { color: colors.lime, fontSize: 32, fontWeight: '800' },
  score: { color: colors.cream, fontSize: 36, fontWeight: '900', minWidth: 64, textAlign: 'center' },
  gpsBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  shot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgElevated,
    padding: 12,
    borderRadius: 14,
    minHeight: 64,
  },
  shotSeq: { color: colors.lime, fontWeight: '900', fontSize: 20, width: 24 },
  shotClub: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  navRow: { flexDirection: 'row', gap: 10 },
});
