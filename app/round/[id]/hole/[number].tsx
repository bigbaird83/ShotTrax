import * as Device from 'expo-device';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getCourseDataClient } from '@/src/course/client';
import { formatParLabel, formatSiLabel, formatTeeMeta } from '@/src/course/layout';
import type { OsmOverlay } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import {
  finishRound,
  getClubMap,
  getHole,
  getOpenShotForHole,
  getRound,
  insertPenalty,
  listPenaltiesForHole,
  listShotsForHole,
  setHoleGreen,
  updateHolePar,
  updateHoleScore,
} from '@/src/db/repo';
import type { GpsFix, PenaltyReason } from '@/src/domain/types';
import { classifyAccuracyM } from '@/src/domain/fixQuality';
import {
  formatPenaltyRow,
  PENALTY_REASONS,
  totalPenaltyStrokes,
} from '@/src/domain/penalty';
import { reconcileHoleScore, scoreMismatchMessage } from '@/src/domain/scoreReconcile';
import { MIC_SHOT_ASSIST, WATCH_ASSIST } from '@/src/sensing/assists';
import { yardsToGreen } from '@/src/sensing/api';
import { getCurrentFix } from '@/src/services/location';
import { endOpenShot, promptForPlan } from '@/src/services/shotActions';
import { QualityBadge } from '@/src/ui/Badge';
import { BigButton } from '@/src/ui/BigButton';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { HoleMap } from '@/src/ui/HoleMap';
import { Screen } from '@/src/ui/Screen';
import { YardsToGreenBadge } from '@/src/ui/YardsToGreenBadge';
import { colors } from '@/src/ui/theme';

export default function HoleScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const holeNumber = Number(number);
  const navigation = useNavigation();
  const { db, revision, bump } = useDb();
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [penaltyStrokes, setPenaltyStrokes] = useState(1);
  const [penaltyReason, setPenaltyReason] = useState<PenaltyReason>('water');
  const [penaltyNote, setPenaltyNote] = useState('');
  const [osmOverlay, setOsmOverlay] = useState<OsmOverlay | null>(null);

  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const hole = useMemo(() => getHole(db, id, holeNumber), [db, id, holeNumber, revision]);
  const shots = useMemo(() => (hole ? listShotsForHole(db, hole.id) : []), [db, hole, revision]);
  const penalties = useMemo(
    () => (hole ? listPenaltiesForHole(db, hole.id) : []),
    [db, hole, revision],
  );
  const clubs = useMemo(() => getClubMap(db), [db, revision]);
  const open = useMemo(
    () => (hole ? getOpenShotForHole(db, hole.id) : null),
    [db, hole, revision],
  );
  const readOnly = Boolean(round?.finishedAt);
  const penaltyTotal = totalPenaltyStrokes(penalties);
  const reconcile = reconcileHoleScore({
    score: hole?.score ?? null,
    shotCount: shots.length,
    penaltyStrokes: penaltyTotal,
  });

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

  useEffect(() => {
    const location =
      hole?.greenLat != null && hole.greenLng != null
        ? { lat: hole.greenLat, lng: hole.greenLng }
        : round?.courseLat != null && round.courseLng != null
          ? { lat: round.courseLat, lng: round.courseLng }
          : null;
    if (!location) {
      setOsmOverlay(null);
      return;
    }
    let live = true;
    void getCourseDataClient()
      .fetchOsmOverlay({
        courseId: round?.courseApiId,
        location,
        holeNumber,
      })
      .then((overlay) => {
        if (live) setOsmOverlay(overlay);
      })
      .catch(() => {
        if (live) setOsmOverlay(null);
      });
    return () => {
      live = false;
    };
  }, [
    round?.courseApiId,
    round?.courseLat,
    round?.courseLng,
    hole?.greenLat,
    hole?.greenLng,
    holeNumber,
  ]);

  if (!round || !hole) {
    return (
      <Screen>
        <Text style={styles.lede}>Round or hole not found.</Text>
      </Screen>
    );
  }

  const onEndShot = async (force = false) => {
    if (readOnly || !open) return;
    setBusy(true);
    try {
      const { plan } = await endOpenShot(db, { roundId: id, holeNumber, force });
      const waiting = promptForPlan(plan, () => {
        void onEndShot(true);
      });
      if (!waiting) bump();
    } catch (err) {
      Alert.alert('Could not end shot', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const onAddPenalty = () => {
    if (readOnly) return;
    insertPenalty(db, {
      holeId: hole.id,
      par: hole.par,
      currentScore: hole.score,
      strokes: penaltyStrokes,
      reason: penaltyReason,
      note: penaltyReason === 'other' || penaltyNote.trim() ? penaltyNote : null,
    });
    setPenaltyOpen(false);
    setPenaltyStrokes(1);
    setPenaltyReason('water');
    setPenaltyNote('');
    bump();
  };

  const accClass = fix ? classifyAccuracyM(fix.accuracyM) : null;
  const simBanner = Device.isDevice === false
    ? 'SIMULATOR GPS — using the location the simulator reports. ShotTraxx does not invent coordinates. Move the GPS pin between marks to log yards.'
    : fix?.mocked
      ? 'MOCK GPS — the OS flagged this fix as mocked. ShotTraxx is not synthesizing a location.'
      : null;

  const green =
    hole.greenLat != null && hole.greenLng != null
      ? { lat: hole.greenLat, lng: hole.greenLng }
      : null;
  const yardsToGreenResult = yardsToGreen(fix, green);

  const onMarkGreen = async () => {
    if (readOnly) return;
    setBusy(true);
    try {
      const next = await getCurrentFix();
      setHoleGreen(db, hole.id, { lat: next.lat, lng: next.lng, source: 'user_estimate' });
      bump();
    } catch (err) {
      Alert.alert('Could not mark green', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll={false}>
      {simBanner ? <GpsBanner message={simBanner} /> : null}

      <View style={styles.headerRow}>
        <Text style={styles.holeTitle}>Hole {hole.number}</Text>
        <Text style={styles.muted}>
          {round.courseName ?? 'Round'}
          {round.teeName ? ` · ${round.teeName}` : ''} · {round.holeCount} holes
        </Text>
      </View>

      <HoleMap
        holeNumber={hole.number}
        shots={shots}
        userFix={fix}
        green={green}
        yardsToGreen={yardsToGreenResult}
        osmOverlay={osmOverlay}
        onDropGreenEstimate={
          readOnly
            ? undefined
            : (coord) => {
                setHoleGreen(db, hole.id, { ...coord, source: 'user_estimate' });
                bump();
              }
        }
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
      <YardsToGreenBadge
        result={yardsToGreenResult}
        hasFix={Boolean(fix)}
        hasGreen={Boolean(green)}
      />
      {green ? (
        <Text style={styles.tiny}>
          Green pin: {hole.greenSource === 'course_centroid' ? 'course centroid' : 'user estimate'} — not
          invented. Soft GPS (15–25 m) shows a SOFT badge on yards to green.
        </Text>
      ) : (
        <Text style={styles.tiny}>
          No course or green pin yet. Long-press the map or Mark green (GPS). ShotTraxx will not invent
          coordinates.
        </Text>
      )}
      <Text style={styles.label}>
        {formatParLabel(hole.par)} · {formatSiLabel(hole.handicap)}
        {hole.yards != null ? ` · ${hole.yards} yd` : ''}
      </Text>
      {round.teeName ? (
        <Text style={styles.tiny}>
          {formatTeeMeta({
            name: round.teeName,
            rating: round.teeRating,
            slope: round.teeSlope,
            totalYards: round.teeTotalYards,
          })}
        </Text>
      ) : null}
      {hole.par == null ? (
        <Text style={styles.tiny}>
          No course par for this hole. Pick 3–6 or leave blank — ShotTraxx will not invent par.
        </Text>
      ) : hole.parSource === 'course' ? (
        <Text style={styles.tiny}>Par from course data (not invented). Tap to override.</Text>
      ) : (
        <Text style={styles.tiny}>Par set on the scorecard.</Text>
      )}
      {hole.handicap == null ? (
        <Text style={styles.tiny}>No stroke index from the selected tee — SI ?</Text>
      ) : null}
      <View style={styles.row}>
        {[3, 4, 5, 6].map((par) => (
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
            const next = Math.max(1, (hole.score ?? hole.par ?? 1) - 1);
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
            const next = (hole.score ?? hole.par ?? 0) + 1;
            updateHoleScore(db, hole.id, next);
            bump();
          }}
          style={styles.step}>
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
      {reconcile.mismatch ? (
        <Text style={styles.warn}>{scoreMismatchMessage(reconcile)}</Text>
      ) : null}

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
          Start = GPS when you confirm a club. End = GPS on the next mark (or End last shot). No-GPS
          shots never invent coordinates.
        </Text>
      </View>

      <Text style={styles.label}>Shots</Text>
      {shots.length === 0 ? (
        <Text style={styles.muted}>No shots on this hole yet.</Text>
      ) : (
        shots.map((shot) => {
          const club = shot.clubId ? clubs[shot.clubId] : null;
          const openShot = shot.endedAt == null;
          const noGps = shot.source === 'no_gps' || shot.fixQuality === 'none';
          return (
            <View key={shot.id} style={styles.shot}>
              <Text style={styles.shotSeq}>{shot.seq}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.shotClub}>{club?.name ?? 'Club'}</Text>
                <Text style={styles.meta}>
                  {noGps
                    ? shot.typedYards != null
                      ? `${shot.typedYards} yd typed · not in averages`
                      : 'No GPS — counts as a stroke, not in averages'
                    : openShot
                      ? 'Waiting for next mark to log yards'
                      : `${shot.distanceYards ?? '—'} yd${shot.impossibleJump ? ' · jump' : ''}`}
                </Text>
              </View>
              <QualityBadge quality={shot.fixQuality} open={openShot && !noGps} source={shot.source} />
            </View>
          );
        })
      )}

      <Text style={styles.label}>Penalties</Text>
      {penalties.length === 0 ? (
        <Text style={styles.muted}>No penalties on this hole.</Text>
      ) : (
        penalties.map((penalty) => (
          <View key={penalty.id} style={styles.shot}>
            <Text style={styles.shotSeq}>+</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.shotClub}>{formatPenaltyRow(penalty)}</Text>
              <Text style={styles.meta}>Scorecard only — not a map trail, not in averages</Text>
            </View>
          </View>
        ))
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
            label="Add shot without GPS"
            variant="secondary"
            disabled={busy}
            onPress={() =>
              router.push(`/round/${id}/club-pick?hole=${holeNumber}&noGps=1`)
            }
          />
          <BigButton
            label={penaltyOpen ? 'Cancel penalty' : '+ Penalty'}
            variant="secondary"
            disabled={busy}
            onPress={() => setPenaltyOpen((openPanel) => !openPanel)}
          />
          {penaltyOpen ? (
            <View style={styles.penaltyBox}>
              <Text style={styles.label}>Penalty strokes</Text>
              <View style={styles.row}>
                <Pressable
                  onPress={() => setPenaltyStrokes((n) => Math.max(1, n - 1))}
                  style={styles.step}>
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.score}>{penaltyStrokes}</Text>
                <Pressable
                  onPress={() => setPenaltyStrokes((n) => Math.min(5, n + 1))}
                  style={styles.step}>
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.label}>Reason</Text>
              <View style={styles.reasonRow}>
                {PENALTY_REASONS.map((item) => (
                  <Pressable
                    key={item.reason}
                    onPress={() => setPenaltyReason(item.reason)}
                    style={[styles.reasonChip, penaltyReason === item.reason && styles.chipOn]}>
                    <Text style={styles.reasonText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                placeholder={penaltyReason === 'other' ? 'Describe (optional)' : 'Note (optional)'}
                placeholderTextColor={colors.muted}
                value={penaltyNote}
                onChangeText={setPenaltyNote}
                style={styles.note}
              />
              <BigButton label={`Add +${penaltyStrokes} penalty`} onPress={onAddPenalty} />
            </View>
          ) : null}
          <BigButton
            label="End last shot"
            variant="secondary"
            disabled={busy || !open}
            onPress={() => void onEndShot()}
          />
          <BigButton
            label={green ? 'Reset green from GPS' : 'Mark green (GPS)'}
            variant="ghost"
            disabled={busy}
            onPress={() => void onMarkGreen()}
          />
          {green ? (
            <BigButton
              label="Clear green estimate"
              variant="ghost"
              disabled={busy}
              onPress={() => {
                setHoleGreen(db, hole.id, null);
                bump();
              }}
            />
          ) : null}
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

        <Text style={styles.tiny}>
          Watch assist: {WATCH_ASSIST ? 'on' : 'off'} · Mic shot-detect: {MIC_SHOT_ASSIST ? 'on' : 'off'}{' '}
          (stubs — out of scope).
        </Text>
      </ScrollView>
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
  penaltyBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  reasonText: { color: colors.cream, fontSize: 16, fontWeight: '800' },
  note: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.cream,
    fontSize: 16,
    backgroundColor: colors.bg,
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
  scrollBody: { gap: 12, paddingBottom: 24 },
});
