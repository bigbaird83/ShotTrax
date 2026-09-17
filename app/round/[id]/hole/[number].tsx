import * as Device from 'expo-device';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  listClubAverages,
  listClubs,
  listPenaltiesForHole,
  listShotsForHole,
  setHoleGreen,
  setRoundLastClub,
  updateHolePar,
  updateHoleScore,
} from '@/src/db/repo';
import { pinOrNull, formatFmbRow, hasApiFmb, yardsToGreenDepth } from '@/src/domain/greenDepth';
import { COPY, formatHoleHeader, markedSuggestedMessage } from '@/src/domain/playerCopy';
import { formatPenaltyRow, PENALTY_REASONS, totalPenaltyStrokes } from '@/src/domain/penalty';
import { clubToRankInput, lastClosedShotYards, rankTopClubs, resolveDistanceTarget } from '@/src/domain/rankClubs';
import { reconcileHoleScore, scoreMismatchMessage } from '@/src/domain/scoreReconcile';
import { resolveStickyClub, selectClubForMark } from '@/src/domain/stickyClub';
import type { Club, GpsFix, PenaltyReason } from '@/src/domain/types';
import { matchSpokenClub, speechContextualStrings } from '@/src/domain/voiceClub';
import { yardsToGreen } from '@/src/sensing/api';
import { describeGpsSource, getCurrentFix } from '@/src/services/location';
import { endOpenShot, markShotWithClub, promptForPlan, takeDrop, undoLastShot } from '@/src/services/shotActions';
import { speechRecognitionAvailable, startClubSpeech, type ClubSpeechSession } from '@/src/services/speechClub';
import { useWatchClubList } from '@/src/services/useWatchClubList';
import { QualityBadge } from '@/src/ui/Badge';
import { BigButton } from '@/src/ui/BigButton';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { hapticMark, hapticSelect, hapticTap, hapticWarn } from '@/src/ui/haptics';
import { HoleMap } from '@/src/ui/HoleMap';
import { MarkCheck } from '@/src/ui/MarkCheck';
import { FullSheet } from '@/src/ui/Sheet';
import { ThumbZone } from '@/src/ui/ThumbZone';
import { colors, tapTarget, type } from '@/src/ui/theme';

export default function HoleScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const holeNumber = Number(number);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { db, revision, bump } = useDb();
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [penaltyStrokes, setPenaltyStrokes] = useState(1);
  const [penaltyReason, setPenaltyReason] = useState<PenaltyReason>('water');
  const [penaltyNote, setPenaltyNote] = useState('');
  const [osmOverlay, setOsmOverlay] = useState<OsmOverlay | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sessionRef = useRef<ClubSpeechSession | null>(null);
  const autoOpened = useRef<number | null>(null);

  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const hole = useMemo(() => getHole(db, id, holeNumber), [db, id, holeNumber, revision]);
  const shots = useMemo(() => (hole ? listShotsForHole(db, hole.id) : []), [db, hole, revision]);
  const penalties = useMemo(
    () => (hole ? listPenaltiesForHole(db, hole.id) : []),
    [db, hole, revision],
  );
  const clubs = useMemo(() => listClubs(db, true), [db, revision]);
  const clubMap = useMemo(() => getClubMap(db), [db, revision]);
  const averages = useMemo(() => listClubAverages(db).filter((row) => row.club.enabled), [db, revision]);
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

  const lastShotClubId = [...shots].reverse().find((shot) => shot.clubId)?.clubId ?? null;
  const sticky = useMemo(
    () =>
      resolveStickyClub({
        enabledClubs: clubs,
        roundLastClubId: round?.lastClubId ?? null,
        lastShotClubId,
      }),
    [clubs, round?.lastClubId, lastShotClubId],
  );
  const toastedRef = useRef<string | null>(null);

  useEffect(() => {
    const last = shots[shots.length - 1];
    if (!last?.suggested || last.id === toastedRef.current) return;
    toastedRef.current = last.id;
    const name = last.clubId ? clubMap[last.clubId]?.shortName ?? 'club' : 'club';
    setToast(markedSuggestedMessage(name));
  }, [shots, clubMap]);

  useEffect(() => {
    navigation.setOptions({ headerShown: false, title: `Hole ${holeNumber}` });
  }, [navigation, holeNumber]);

  useEffect(() => {
    let live = true;
    getCurrentFix()
      .then((next) => {
        if (!live) return;
        setFix(next);
      })
      .catch(() => {
        if (!live) return;
        setFix(null);
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

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!round || !hole || readOnly || shots.length > 0 || Number.isNaN(holeNumber)) return;
    if (autoOpened.current === holeNumber) return;
    autoOpened.current = holeNumber;
    router.push(`/round/${id}/club-pick?hole=${holeNumber}`);
  }, [round, hole, readOnly, shots.length, holeNumber, id]);

  const green =
    hole?.greenLat != null && hole.greenLng != null
      ? { lat: hole.greenLat, lng: hole.greenLng }
      : null;
  const pins = {
    front: pinOrNull(
      hole?.greenFrontLat != null && hole.greenFrontLng != null
        ? { lat: hole.greenFrontLat, lng: hole.greenFrontLng }
        : null,
    ),
    middle: pinOrNull(green),
    back: pinOrNull(
      hole?.greenBackLat != null && hole.greenBackLng != null
        ? { lat: hole.greenBackLat, lng: hole.greenBackLng }
        : null,
    ),
    depthYards: hole?.greenDepthYards ?? null,
  };
  const yardsToGreenResult = yardsToGreen(fix, green);
  const fmb = hasApiFmb(pins) ? formatFmbRow(yardsToGreenDepth(fix, pins)) : null;
  const toGreen = yardsToGreen(fix, green);
  const target = resolveDistanceTarget({
    toGreen,
    lastClosedYards: lastClosedShotYards(shots),
  });
  const ranked = rankTopClubs(
    averages.map((row) => clubToRankInput(row.club, row)),
    target,
  );

  useWatchClubList(
    {
      db,
      roundId: id,
      holeNumber,
      readOnly,
      bump,
      onMarked: () => setCheckNonce((n) => n + 1),
      labelForClub: (clubId) => clubMap[clubId]?.shortName ?? clubs.find((club) => club.id === clubId)?.shortName ?? null,
    },
    {
      top3: ranked.map((club) => ({ id: club.id, shortName: club.shortName })),
      bag: clubs.map((club) => ({ id: club.id, shortName: club.shortName })),
      holeNumber,
      yardsToGreen: toGreen.yards,
      yardsQuality: toGreen.quality,
      lastClubId: sticky?.id ?? null,
    },
  );

  if (!round || !hole) {
    return (
      <View style={styles.fill}>
        <Text style={styles.muted}>Round or hole not found.</Text>
      </View>
    );
  }

  const simBanner =
    Device.isDevice === false || fix?.mocked ? COPY.simulator : describeGpsSource(fix ?? { mocked: false, isSimulator: false });
  const voiceReady = speechRecognitionAvailable();

  const selectClub = (club: Club) => {
    const next = selectClubForMark(club, clubs);
    if (!next || readOnly) return;
    hapticSelect();
    setRoundLastClub(db, id, next.id);
    bump();
  };

  const markClub = async (club: Club | null, force = false) => {
    const next = club ? selectClubForMark(club, clubs) : null;
    if (readOnly) return;
    if (club && !next) return;
    if (club) hapticSelect();
    setBusy(true);
    try {
      const { plan } = await markShotWithClub(db, {
        roundId: id,
        holeNumber,
        clubId: next?.id ?? null,
        force,
      });
      const waiting = promptForPlan(plan, () => {
        void markClub(club, true);
      });
      if (!waiting && plan.status === 'commit') {
        hapticMark();
        setCheckNonce((n) => n + 1);
        bump();
      }
    } catch (err) {
      hapticWarn();
      Alert.alert('Couldn’t mark', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onMark = (force = false) => {
    if (!sticky) return Promise.resolve();
    return markClub(sticky, force);
  };

  const onUndo = () => {
    if (readOnly) return;
    const ok = undoLastShot(db, { roundId: id, holeNumber });
    if (!ok) return;
    hapticTap();
    bump();
  };

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
      Alert.alert('Couldn’t end shot', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDrop = async (force = false) => {
    if (readOnly) return;
    setBusy(true);
    try {
      const { plan } = await takeDrop(db, {
        roundId: id,
        holeNumber,
        reason: penaltyReason,
        note: penaltyNote,
        force,
      });
      const waiting = promptForPlan(plan, () => {
        void onDrop(true);
      });
      if (!waiting) {
        hapticTap();
        setDropOpen(false);
        setPenaltyNote('');
        bump();
      }
    } catch (err) {
      Alert.alert('Couldn’t drop', err instanceof Error ? err.message : 'Try again.');
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
      kind: 'penalty',
    });
    hapticTap();
    setPenaltyOpen(false);
    setPenaltyStrokes(1);
    setPenaltyReason('water');
    setPenaltyNote('');
    bump();
  };

  const applyTranscript = (text: string, isFinal: boolean) => {
    const matched = matchSpokenClub(text, clubs);
    if (matched) {
      setVoiceError(null);
      selectClub(matched);
      if (isFinal) {
        sessionRef.current?.stop();
        sessionRef.current = null;
        setListening(false);
      }
      return;
    }
    if (isFinal) {
      setVoiceError(COPY.didntCatchClub);
    }
  };

  const onListen = async () => {
    if (listening) {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      return;
    }
    setVoiceError(null);
    setListening(true);
    const session = await startClubSpeech({
      contextualStrings: speechContextualStrings(clubs),
      onTranscript: applyTranscript,
      onError: (message) => {
        sessionRef.current?.stop();
        sessionRef.current = null;
        setVoiceError(message);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    sessionRef.current = session;
    if (!session) setListening(false);
  };

  const teeLine = round.teeName
    ? formatTeeMeta({
        name: round.teeName,
        rating: round.teeRating,
        slope: round.teeSlope,
        totalYards: round.teeTotalYards,
      })
    : null;

  return (
    <View style={styles.fill}>
      <View style={styles.mapWrap}>
        <HoleMap
          fullBleed
          holeNumber={hole.number}
          shots={shots}
          userFix={fix}
          green={green}
          yardsToGreen={yardsToGreenResult}
          fmb={fmb}
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
        <View pointerEvents="box-none" style={[styles.sticky, { paddingTop: insets.top + 6 }]}>
          <View style={styles.stickyInner}>
            <Pressable onPress={() => router.back()} style={styles.back} accessibilityRole="button">
              <Text style={styles.backLabel}>Back</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.holeTitle}>{formatHoleHeader(hole.number, hole.par)}</Text>
              <Text style={styles.stickyMeta}>
                {formatSiLabel(hole.handicap)}
                {hole.yards != null ? ` · ${hole.yards} yd` : ''}
              </Text>
              {teeLine ? <Text style={styles.stickyMeta}>{teeLine}</Text> : null}
            </View>
            <Pressable
              onPress={() => setScoreOpen(true)}
              style={styles.scoreChip}
              accessibilityRole="button">
              <Text style={styles.scoreChipLabel}>{hole.score ?? '—'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {simBanner ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <GpsBanner message={simBanner} />
        </View>
      ) : null}

      {voiceError ? <Text style={styles.warn}>{voiceError}</Text> : null}
      {toast ? <Text style={styles.toast}>{toast}</Text> : null}

      {!readOnly && ranked.length > 0 ? (
        <View style={styles.top3}>
          {ranked.map((club, index) => (
            <Pressable
              key={club.id}
              onPress={() => {
                const full = clubs.find((row) => row.id === club.id);
                if (full) selectClub(full);
              }}
              style={[
                styles.top3Chip,
                index === 0 && styles.top3Primary,
                sticky?.id === club.id && styles.chipOn,
              ]}>
              <Text style={[styles.top3Text, index === 0 && styles.top3PrimaryText]}>{club.shortName}</Text>
              {index === 0 ? <Text style={styles.suggest}>{COPY.suggested}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <ThumbZone>
        <View style={styles.clubRow}>
          <Pressable
            onPress={() => router.push(`/round/${id}/club-pick?hole=${holeNumber}`)}
            style={styles.clubChip}>
            <Text style={styles.clubShort}>{sticky?.shortName ?? 'Club'}</Text>
            <Text style={styles.clubName}>{sticky?.name ?? COPY.bag}</Text>
          </Pressable>
          <Pressable onPress={() => void onListen()} style={styles.sideBtn}>
            <Text style={styles.sideLabel}>
              {listening ? COPY.listening : voiceReady ? COPY.sayClub : COPY.sayClub}
            </Text>
          </Pressable>
        </View>

        <View style={styles.markWrap}>
          <BigButton
            label={sticky ? `${COPY.mark} · ${sticky.shortName}` : COPY.mark}
            disabled={busy || readOnly || !sticky}
            onPress={() => void onMark()}
          />
          <MarkCheck nonce={checkNonce} />
        </View>

        {!readOnly ? (
          <View style={styles.row}>
            <BigButton
              label={COPY.undoLast}
              variant="ghost"
              style={{ flex: 1 }}
              disabled={busy || shots.length === 0}
              onPress={onUndo}
            />
            <BigButton label={COPY.drop} variant="secondary" style={{ flex: 1 }} onPress={() => setDropOpen(true)} />
          </View>
        ) : null}

        {!readOnly ? (
          <View style={styles.row}>
            <BigButton
              label={COPY.penalty}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => setPenaltyOpen(true)}
            />
          </View>
        ) : null}

        <View style={styles.row}>
          <BigButton
            label={COPY.prevHole}
            variant="ghost"
            disabled={holeNumber <= 1}
            style={{ flex: 1 }}
            onPress={() => router.replace(`/round/${id}/hole/${holeNumber - 1}`)}
          />
          <BigButton
            label={COPY.nextHole}
            variant="ghost"
            disabled={holeNumber >= round.holeCount}
            style={{ flex: 1 }}
            onPress={() => router.replace(`/round/${id}/hole/${holeNumber + 1}`)}
          />
        </View>
      </ThumbZone>

      <FullSheet visible={scoreOpen} title={`Hole ${hole.number}`} onClose={() => setScoreOpen(false)}>
        <ScrollView contentContainerStyle={styles.sheetPad}>
          <Text style={styles.label}>{formatParLabel(hole.par)}</Text>
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
          <Text style={styles.label}>{COPY.score}</Text>
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
          {reconcile.mismatch ? <Text style={styles.warn}>{scoreMismatchMessage(reconcile)}</Text> : null}

          <Text style={styles.label}>{COPY.shots}</Text>
          {shots.length === 0 ? (
            <Text style={styles.muted}>{COPY.noShots}</Text>
          ) : (
            shots.map((shot) => {
              const club = shot.clubId ? clubMap[shot.clubId] : null;
              const openShot = shot.endedAt == null;
              const noGps = shot.source === 'no_gps' || shot.fixQuality === 'none';
              return (
                <Pressable
                  key={shot.id}
                  disabled={readOnly}
                  onPress={() => {
                    setScoreOpen(false);
                    router.push(`/round/${id}/club-pick?hole=${holeNumber}&shot=${shot.id}`);
                  }}
                  style={styles.shot}>
                  <Text style={styles.shotSeq}>{shot.seq}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shotClub}>{club?.name ?? 'Club'}</Text>
                    <Text style={styles.meta}>
                      {noGps
                        ? shot.typedYards != null
                          ? `${shot.typedYards} yd`
                          : COPY.logged
                        : openShot
                          ? COPY.inPlay
                          : `${shot.distanceYards ?? '—'} yd`}
                      {shot.suggested ? ` · ${COPY.suggested}` : ''}
                    </Text>
                    {!readOnly ? <Text style={styles.meta}>{COPY.changeClub}</Text> : null}
                  </View>
                  <QualityBadge quality={shot.fixQuality} open={openShot && !noGps} source={shot.source} />
                </Pressable>
              );
            })
          )}

          {penalties.map((penalty) => (
            <View key={penalty.id} style={styles.shot}>
              <Text style={styles.shotSeq}>+</Text>
              <Text style={styles.shotClub}>{formatPenaltyRow(penalty)}</Text>
            </View>
          ))}

          {!readOnly ? (
            <>
              <BigButton
                label={COPY.markWithoutClub}
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  setScoreOpen(false);
                  void markClub(null);
                }}
              />
              <BigButton
                label={COPY.forgotShot}
                variant="secondary"
                onPress={() => {
                  setScoreOpen(false);
                  router.push(`/round/${id}/club-pick?hole=${holeNumber}&noGps=1`);
                }}
              />
              <BigButton
                label={COPY.undoLast}
                variant="ghost"
                disabled={shots.length === 0}
                onPress={onUndo}
              />
              <BigButton
                label={COPY.endShot}
                variant="ghost"
                disabled={!open}
                onPress={() => void onEndShot()}
              />
              <BigButton
                label={COPY.finishRound}
                variant="danger"
                onPress={() => {
                  finishRound(db, id);
                  bump();
                  router.replace(`/round/${id}/summary`);
                }}
              />
            </>
          ) : (
            <BigButton label="Summary" variant="secondary" onPress={() => router.push(`/round/${id}/summary`)} />
          )}
        </ScrollView>
      </FullSheet>

      <FullSheet visible={dropOpen} title={COPY.drop} onClose={() => setDropOpen(false)}>
        <ScrollView contentContainerStyle={styles.sheetPad}>
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
            placeholder="Note (optional)"
            placeholderTextColor={colors.muted}
            value={penaltyNote}
            onChangeText={setPenaltyNote}
            style={styles.note}
          />
          <BigButton label={COPY.drop} disabled={busy} onPress={() => void onDrop()} />
        </ScrollView>
      </FullSheet>

      <FullSheet visible={penaltyOpen} title={COPY.penalty} onClose={() => setPenaltyOpen(false)}>
        <ScrollView contentContainerStyle={styles.sheetPad}>
          <View style={styles.row}>
            <Pressable onPress={() => setPenaltyStrokes((n) => Math.max(1, n - 1))} style={styles.step}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={styles.score}>{penaltyStrokes}</Text>
            <Pressable onPress={() => setPenaltyStrokes((n) => Math.min(5, n + 1))} style={styles.step}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
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
            placeholder="Note (optional)"
            placeholderTextColor={colors.muted}
            value={penaltyNote}
            onChangeText={setPenaltyNote}
            style={styles.note}
          />
          <BigButton label={`Add +${penaltyStrokes}`} onPress={onAddPenalty} />
        </ScrollView>
      </FullSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  mapWrap: { flex: 1 },
  sticky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  stickyInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(11,26,18,0.88)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  backLabel: { color: colors.lime, fontWeight: '800', fontSize: type.meta },
  holeTitle: { color: colors.cream, fontSize: type.body, fontWeight: '900' },
  stickyMeta: { color: colors.muted, fontSize: type.tiny },
  scoreChip: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  scoreChipLabel: { color: colors.lime, fontSize: 20, fontWeight: '900' },
  top3: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  top3Chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  top3Primary: { flex: 1.7, minHeight: 58, borderColor: colors.lime, borderWidth: 2 },
  top3Text: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
  top3PrimaryText: { color: colors.lime, fontSize: type.button },
  suggest: { color: colors.lime, fontSize: 10, fontWeight: '800' },
  clubRow: { flexDirection: 'row', gap: 8 },
  clubChip: {
    flex: 1,
    minHeight: tapTarget,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.lime,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  clubShort: { color: colors.lime, fontSize: type.button, fontWeight: '900' },
  clubName: { color: colors.cream, fontSize: type.tiny },
  sideBtn: {
    minHeight: tapTarget,
    minWidth: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sideLabel: { color: colors.cream, fontWeight: '800', fontSize: type.meta, textAlign: 'center' },
  markWrap: { position: 'relative' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700', paddingHorizontal: 16 },
  toast: { color: colors.lime, fontSize: type.meta, fontWeight: '800', paddingHorizontal: 16, paddingTop: 6 },
  muted: { color: colors.muted, fontSize: type.body },
  meta: { color: colors.muted, fontSize: type.meta },
  label: { color: colors.cream, fontSize: type.meta, fontWeight: '800', letterSpacing: 0.6 },
  sheetPad: { padding: 16, gap: 12, paddingBottom: 40 },
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
    backgroundColor: colors.bgElevated,
  },
});
