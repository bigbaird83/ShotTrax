import * as Device from 'expo-device';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  listHoles,
  listPenaltiesForHole,
  listShotsForHole,
  setHoleGreen,
  updateHolePar,
  updateHolePutts,
  finishHolePutts,
  updateHoleScore,
} from '@/src/db/repo';
import { pinOrNull, formatFmbRow, hasApiFmb, yardsToGreenDepth } from '@/src/domain/greenDepth';
import { clubPickLeaveHref, clubPickLeaveRunsAcceptFix, planClubPickLeave } from '@/src/domain/clubPickNav';
import { COPY, finishPuttsChip, finishShotChip, formatHoleHeader, markedSuggestedMessage, voiceFailRecovery } from '@/src/domain/playerCopy';
import { canAdvanceHole, holesNeedingOpenShots } from '@/src/domain/holeAdvance';
import { isPutterClubId } from '@/src/domain/defaultBag';
import { planPlacedShot } from '@/src/domain/shotSource';
import type { LatLng } from '@/src/domain/latLng';
import { formatPenaltyRow, PENALTY_REASONS, totalPenaltyStrokes } from '@/src/domain/penalty';
import {
  addPuttLength,
  emptyPuttDraft,
  holeAfterDone,
  holesNeedingPutts,
  isPuttLengthId,
  madeItAdvancesHole,
  planMadeIt,
  putterOpensPuttSheet,
  shouldAutoOpenClubPick,
  undoLastPutt,
  type PuttDraft,
  type PuttLengthId,
} from '@/src/domain/putts';
import { canMoveFromPin, canMoveToPin, type ShotEditSnapshot } from '@/src/domain/shotEdit';
import { clubToRankInput, lastClosedShotYards, rankTopClubs, resolveDistanceTarget, shotYardsDistanceTarget } from '@/src/domain/rankClubs';
import { reconcileHoleScore, scoreMismatchMessage } from '@/src/domain/scoreReconcile';
import { resolveStickyClub, selectClubForMark } from '@/src/domain/stickyClub';
import type { Club, PenaltyReason } from '@/src/domain/types';
import { matchSpokenClub, speechContextualStrings } from '@/src/domain/voiceClub';
import { yardsToGreen } from '@/src/sensing/api';
import { describeGpsSource } from '@/src/services/location';
import { endOpenShot, markShotWithClub, promptForPlan, takeDrop, undoLastShot, closeApproachBeforePutts, addPlacedShot, changeShotClub, moveShotPin, undoShotEdit } from '@/src/services/shotActions';
import { startClubSpeech, type ClubSpeechSession } from '@/src/services/speechClub';
import { useLiveFix } from '@/src/services/useLiveFix';
import { useWatchClubList } from '@/src/services/useWatchClubList';
import { pushWatchPuttSheet } from '@/src/services/watchClub';
import { MADE_IT_FEEDBACK, PHONE_UNAVAILABLE } from '@/src/domain/watchMessages';
import { QualityBadge } from '@/src/ui/Badge';
import { BigButton } from '@/src/ui/BigButton';
import { ClubButton } from '@/src/ui/ClubButton';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { hapticMark, hapticSelect, hapticTap, hapticWarn } from '@/src/ui/haptics';
import { HoleMap } from '@/src/ui/HoleMap';
import { MarkCheck } from '@/src/ui/MarkCheck';
import { FullSheet } from '@/src/ui/Sheet';
import { PuttSheetBody } from '@/src/ui/PuttSheetBody';
import { ThumbZone } from '@/src/ui/ThumbZone';
import { colors, tapTarget, type } from '@/src/ui/theme';

export default function HoleScreen() {
  const { id, number, putts: puttsParam } = useLocalSearchParams<{ id: string; number: string; putts?: string }>();
  const holeNumber = Number(number);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { db, revision, bump } = useDb();
  const fix = useLiveFix(true);
  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [placeFrom, setPlaceFrom] = useState<LatLng | null>(null);
  const [placeTo, setPlaceTo] = useState<LatLng | null>(null);
  const [placeClubOpen, setPlaceClubOpen] = useState(false);
  const [placeMode, setPlaceMode] = useState<'off' | 'from' | 'to' | 'edit-from' | 'edit-to'>('off');
  const [editShotId, setEditShotId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editClubOpen, setEditClubOpen] = useState(false);
  const [showAllClubs, setShowAllClubs] = useState(false);
  const [editUndo, setEditUndo] = useState<ShotEditSnapshot | null>(null);
  const placing = placeMode !== 'off' || placeClubOpen || editClubOpen;
  const [puttOpen, setPuttOpen] = useState(false);
  const [puttSheetHole, setPuttSheetHole] = useState(holeNumber);
  const [puttDraft, setPuttDraft] = useState<PuttDraft>(emptyPuttDraft());
  const [penaltyStrokes, setPenaltyStrokes] = useState(1);
  const [penaltyReason, setPenaltyReason] = useState<PenaltyReason>('water');
  const [penaltyNote, setPenaltyNote] = useState('');
  const [osmOverlay, setOsmOverlay] = useState<OsmOverlay | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sessionRef = useRef<ClubSpeechSession | null>(null);
  const voiceCommitted = useRef(false);
  const autoOpened = useRef<number | null>(null);

  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const hole = useMemo(() => getHole(db, id, holeNumber), [db, id, holeNumber, revision]);
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);
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
    puttCount: hole?.putts ?? 0,
    penaltyStrokes: penaltyTotal,
  });
  const pendingPutts = useMemo(
    () =>
      holesNeedingPutts(
        holes.map((row) => ({
          number: row.number,
          puttsDone: row.puttsDone,
          shotCount: listShotsForHole(db, row.id).length,
          puttCount: row.putts,
        })),
        holeNumber,
      ),
    [db, holes, holeNumber, revision],
  );
  const pendingShots = useMemo(
    () =>
      holesNeedingOpenShots(
        holes.map((row) => ({
          number: row.number,
          hasOpenShot: listShotsForHole(db, row.id).some((shot) => shot.endedAt == null),
        })),
        holeNumber,
      ),
    [db, holes, holeNumber, revision],
  );
  const placedPlan = placeFrom && placeTo ? planPlacedShot(placeFrom, placeTo) : null;
  const placedYards = placedPlan && placedPlan.ok ? placedPlan.distanceYards : null;
  const editingShot = editShotId ? shots.find((shot) => shot.id === editShotId) ?? null : null;
  const pickerYards = editClubOpen ? (editingShot?.distanceYards ?? null) : placedYards;
  const placedRanked = rankTopClubs(
    averages.map((row) => clubToRankInput(row.club, row)),
    shotYardsDistanceTarget(pickerYards),
  );
  const placeBag = clubs.filter((club) => !isPutterClubId(club.id));
  const placeRest = placeBag.filter((club) => !placedRanked.some((row) => row.id === club.id));

  const resetPlace = () => {
    setPlaceFrom(null);
    setPlaceTo(null);
    setPlaceClubOpen(false);
    setPlaceMode('off');
    setEditClubOpen(false);
    setShowAllClubs(false);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditClubOpen(false);
    setEditShotId(null);
    setShowAllClubs(false);
    if (placeMode === 'edit-from' || placeMode === 'edit-to') setPlaceMode('off');
  };

  const openEdit = (shotId: string) => {
    if (readOnly || placing) return;
    resetPlace();
    setScoreOpen(false);
    setEditShotId(shotId);
    setEditOpen(true);
  };

  const goToHole = (nextNumber: number) => {
    resetPlace();
    closeEdit();
    setEditUndo(null);
    router.replace(`/round/${id}/hole/${nextNumber}`);
  };

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
  const puttDraftRef = useRef(puttDraft);
  puttDraftRef.current = puttDraft;
  const puttSheetHoleRef = useRef(puttSheetHole);
  puttSheetHoleRef.current = puttSheetHole;
  const puttOpenRef = useRef(puttOpen);
  puttOpenRef.current = puttOpen;

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
    if (!round || !hole || Number.isNaN(holeNumber)) return;
    if (
      !shouldAutoOpenClubPick({
        readOnly,
        shotCount: shots.length,
        openingPutts: puttsParam === '1',
      })
    ) {
      return;
    }
    if (autoOpened.current === holeNumber) return;
    autoOpened.current = holeNumber;
    router.push(`/round/${id}/club-pick?hole=${holeNumber}`);
  }, [round, hole, readOnly, shots.length, holeNumber, id, puttsParam]);

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

  const openPuttSheet = useCallback(
    async (targetHole: number) => {
      if (readOnly) return;
      const row = getHole(db, id, targetHole);
      if (!row) return;
      const lengths = row.puttLengths.filter(isPuttLengthId);
      const draft: PuttDraft = { putts: lengths.length, lengths };
      setPuttSheetHole(targetHole);
      setPuttDraft(draft);
      setPuttOpen(true);
      await closeApproachBeforePutts(db, { roundId: id, holeNumber: targetHole });
      bump();
      void pushWatchPuttSheet({ open: true, holeNumber: targetHole, lengths: draft.lengths });
    },
    [readOnly, db, id, bump],
  );

  const saveDraft = useCallback(
    (targetHole: number, draft: PuttDraft, done: boolean) => {
      const row = getHole(db, id, targetHole);
      if (!row) return;
      if (done) finishHolePutts(db, row.id, draft.putts, draft.lengths);
      else updateHolePutts(db, row.id, draft.putts, draft.lengths, false);
      bump();
    },
    [db, id, bump],
  );

  const applyMadeIt = useCallback(
    (targetHole: number, draft: PuttDraft) => {
      const planned = planMadeIt(draft);
      if (readOnly || !planned.ok || !round) return false;
      saveDraft(targetHole, planned, true);
      setPuttOpen(false);
      void pushWatchPuttSheet({ open: false, holeNumber: targetHole, lengths: planned.lengths });
      if (!madeItAdvancesHole({ sheetHoleNumber: targetHole, currentHoleNumber: holeNumber })) {
        return true;
      }
      const dest = holeAfterDone(targetHole, round.holeCount);
      if (dest.kind === 'summary') {
        router.replace(`/round/${id}/summary`);
        return true;
      }
      router.replace(`/round/${id}/hole/${dest.holeNumber}`);
      return true;
    },
    [readOnly, round, saveDraft, holeNumber, id],
  );

  useEffect(() => {
    if (puttsParam !== '1' || readOnly) return;
    void openPuttSheet(holeNumber);
    router.setParams({ putts: undefined });
  }, [puttsParam, holeNumber, readOnly, openPuttSheet]);

  useEffect(() => {
    if (!puttOpen) return;
    void pushWatchPuttSheet({ open: true, holeNumber: puttSheetHole, lengths: puttDraft.lengths });
  }, [puttOpen, puttSheetHole, puttDraft]);

  const onWatchPuttPick = useCallback(
    async (msg: { action: 'add' | 'undo' | 'made'; lengthId?: PuttLengthId }) => {
      if (readOnly) return { ok: false, feedback: PHONE_UNAVAILABLE };
      if (!puttOpenRef.current) {
        await openPuttSheet(holeNumber);
      }
      const target = puttSheetHoleRef.current || holeNumber;
      if (msg.action === 'add' && msg.lengthId) {
        const next = addPuttLength(puttDraftRef.current, msg.lengthId);
        setPuttDraft(next);
        saveDraft(target, next, false);
        return { ok: true, feedback: COPY.putts };
      }
      if (msg.action === 'undo') {
        const next = undoLastPutt(puttDraftRef.current);
        setPuttDraft(next);
        saveDraft(target, next, false);
        return { ok: true, feedback: COPY.undoPutt };
      }
      if (msg.action === 'made') {
        const ok = applyMadeIt(target, puttDraftRef.current);
        return ok ? { ok: true, feedback: MADE_IT_FEEDBACK } : { ok: false, feedback: COPY.puttSheetLede };
      }
      return { ok: false, feedback: PHONE_UNAVAILABLE };
    },
    [readOnly, openPuttSheet, holeNumber, saveDraft, applyMadeIt],
  );

  useWatchClubList(
    {
      db,
      roundId: id,
      holeNumber,
      readOnly,
      bump,
      onMarked: () => setCheckNonce((n) => n + 1),
      onPutter: () => {
        void openPuttSheet(holeNumber);
      },
      onLeave: (action) => {
        const plan = planClubPickLeave(action);
        if (
          clubPickLeaveRunsAcceptFix(action) ||
          plan.mark ||
          plan.selectClub ||
          plan.savesGps ||
          plan.closesPendingShot
        ) {
          return;
        }
        if (plan.dest === 'rounds') router.replace(clubPickLeaveHref({ action, roundId: id, holeNumber }));
      },
      onPuttPick: onWatchPuttPick,
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

  const markClub = async (club: Club | null, force = false) => {
    const next = club ? selectClubForMark(club, clubs) : null;
    if (readOnly || placing) return;
    if (club && !next) return;
    if (next && putterOpensPuttSheet({ clubId: next.id })) {
      hapticSelect();
      void openPuttSheet(holeNumber);
      return;
    }
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
    setEditUndo(null);
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
    if (readOnly || placing) return;
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

  const onAddPutt = (bucket: PuttLengthId) => {
    if (readOnly) return;
    const next = addPuttLength(puttDraft, bucket);
    setPuttDraft(next);
    saveDraft(puttSheetHole, next, false);
    hapticTap();
  };

  const onUndoPutt = () => {
    if (readOnly) return;
    const next = undoLastPutt(puttDraft);
    setPuttDraft(next);
    saveDraft(puttSheetHole, next, false);
    hapticTap();
  };

  const onMadeIt = () => {
    if (readOnly) return;
    hapticSelect();
    applyMadeIt(puttSheetHole, puttDraft);
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
      if (voiceCommitted.current) return;
      voiceCommitted.current = true;
      setVoiceError(null);
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      void markClub(matched);
      return;
    }
    if (isFinal) {
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      setVoiceError(COPY.didntCatchClub);
    }
  };

  const stopListening = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setListening(false);
  };

  const startListening = async () => {
    voiceCommitted.current = false;
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

  const onListen = () => {
    if (placing) return;
    if (listening) {
      stopListening();
      return;
    }
    void startListening();
  };

  const openBag = () => {
    if (placing) return;
    stopListening();
    setVoiceError(null);
    router.push(`/round/${id}/club-pick?hole=${holeNumber}`);
  };

  const commitPlaced = (clubId: string, force = false) => {
    if (!placeFrom || !placeTo) return;
    const result = addPlacedShot(db, {
      roundId: round.id,
      holeNumber,
      clubId,
      from: placeFrom,
      to: placeTo,
      force,
    });
    if (result.status === 'needs_confirm') {
      Alert.alert(COPY.tooFar, '', [
        { text: COPY.cancel, style: 'cancel' },
        { text: COPY.markAnyway, onPress: () => commitPlaced(clubId, true) },
      ]);
      return;
    }
    if (result.status !== 'commit') {
      hapticWarn();
      return;
    }
    hapticMark();
    resetPlace();
    bump();
  };

  const rememberUndo = (snapshot: ShotEditSnapshot) => {
    setEditUndo(snapshot);
  };

  const commitEditClub = (clubId: string) => {
    if (!editShotId) return;
    const result = changeShotClub(db, { roundId: round.id, shotId: editShotId, clubId });
    if (result.status !== 'commit') {
      hapticWarn();
      return;
    }
    hapticSelect();
    rememberUndo(result.snapshot);
    setEditClubOpen(false);
    setShowAllClubs(false);
    setEditOpen(true);
    bump();
  };

  const commitMovePin = (point: LatLng, which: 'from' | 'to', force = false) => {
    if (!editShotId) return;
    const result = moveShotPin(db, { shotId: editShotId, which, point, force });
    if (result.status === 'needs_confirm') {
      Alert.alert(COPY.tooFar, '', [
        { text: COPY.cancel, style: 'cancel' },
        { text: COPY.markAnyway, onPress: () => commitMovePin(point, which, true) },
      ]);
      return;
    }
    if (result.status !== 'commit') {
      hapticWarn();
      return;
    }
    hapticMark();
    rememberUndo(result.snapshot);
    setPlaceMode('off');
    setEditOpen(true);
    bump();
  };

  const onUndoEdit = () => {
    if (readOnly || !editUndo) return;
    const ok = undoShotEdit(db, editUndo);
    if (!ok) return;
    hapticTap();
    setEditUndo(null);
    bump();
  };

  const retryVoice = () => {
    stopListening();
    void startListening();
  };

  const voiceFail = voiceFailRecovery();

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
          placedFrom={placeFrom}
          placedTo={placeTo}
          placeHint={
            placeMode === 'edit-from'
              ? COPY.editFromHint
              : placeMode === 'edit-to'
                ? COPY.editToHint
                : placing
                  ? placeTo
                    ? `${placedYards ?? '—'} yd · ${COPY.pickClub}`
                    : placeFrom
                      ? COPY.placeToHint
                      : COPY.placeFromHint
                  : null
          }
          onShotPress={readOnly || placing ? undefined : openEdit}
          onPlacePoint={
            readOnly || placeMode === 'off' || placeClubOpen || editClubOpen
              ? undefined
              : (coord) => {
                  if (placeMode === 'from') {
                    setPlaceFrom(coord);
                    setPlaceMode('to');
                    return;
                  }
                  if (placeMode === 'to') {
                    setPlaceTo(coord);
                    setPlaceClubOpen(true);
                    return;
                  }
                  if (placeMode === 'edit-from') {
                    commitMovePin(coord, 'from');
                    return;
                  }
                  if (placeMode === 'edit-to') {
                    commitMovePin(coord, 'to');
                  }
                }
          }
          onDropGreenEstimate={
            readOnly || placing
              ? undefined
              : (coord) => {
                  setHoleGreen(db, hole.id, { ...coord, source: 'user_estimate' });
                  bump();
                }
          }
        />
        <View pointerEvents="box-none" style={[styles.sticky, { paddingTop: insets.top + 6 }]}>
          <View style={styles.stickyInner}>
            <Pressable onPress={() => setMenuOpen(true)} style={styles.back} accessibilityRole="button">
              <Text style={styles.backLabel}>{COPY.menu}</Text>
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

      {voiceError ? (
        <View style={styles.voiceFail}>
          <Text style={styles.warn}>{voiceError}</Text>
          <View style={styles.row}>
            <BigButton
              label={voiceFail.primaryLabel}
              style={{ flex: 1 }}
              onPress={openBag}
            />
            <BigButton
              label={voiceFail.secondaryLabel}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={retryVoice}
            />
          </View>
        </View>
      ) : null}
      {toast ? <Text style={styles.toast}>{toast}</Text> : null}

      {placing ? (
        <View style={styles.pendingWrap}>
          <BigButton
            label={COPY.cancelPlace}
            variant="ghost"
            onPress={() => {
              const editing = placeMode === 'edit-from' || placeMode === 'edit-to' || editClubOpen;
              resetPlace();
              if (editing && editShotId) setEditOpen(true);
            }}
          />
        </View>
      ) : null}

      {!readOnly && editUndo && !placing ? (
        <View style={styles.pendingWrap}>
          <BigButton label={COPY.undoEdit} variant="ghost" onPress={onUndoEdit} />
        </View>
      ) : null}

      {pendingPutts.length > 0 || pendingShots.length > 0 ? (
        <View style={styles.pendingWrap}>
          {pendingShots.map((row) => (
            <Pressable
              key={`shot-${row.number}`}
              accessibilityRole="button"
              disabled={readOnly}
              onPress={() => goToHole(row.number)}
              style={styles.pendingChip}>
              <Text style={styles.pendingText}>{finishShotChip(row.number)}</Text>
            </Pressable>
          ))}
          {pendingPutts.map((row) => (
            <Pressable
              key={row.number}
              accessibilityRole="button"
              disabled={readOnly}
              onPress={() => void openPuttSheet(row.number)}
              style={styles.pendingChip}>
              <Text style={styles.pendingText}>{finishPuttsChip(row.number)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!readOnly && ranked.length > 0 ? (
        <View style={styles.top3}>
          {ranked.map((club, index) => (
            <Pressable
              key={club.id}
              onPress={() => {
                if (placing) return;
                const full = clubs.find((row) => row.id === club.id);
                if (full) void markClub(full);
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
            accessibilityRole="button"
            accessibilityLabel={sticky ? `${sticky.shortName}. ${COPY.allClubs}` : COPY.allClubs}
            disabled={readOnly || placing}
            onPress={openBag}
            style={styles.clubChip}>
            <Text style={styles.clubShort}>{sticky?.shortName ?? 'Club'}</Text>
            <Text style={styles.clubName}>{COPY.allClubs}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={placing}
            onPress={() => void onListen()}
            style={styles.sideBtn}>
            <Text style={styles.sideLabel}>{listening ? COPY.listening : COPY.sayClub}</Text>
          </Pressable>
        </View>

        <BigButton
          label={COPY.allClubs}
          variant="secondary"
          disabled={readOnly || placing}
          onPress={openBag}
        />

        <View style={styles.markWrap}>
          <BigButton
            label={sticky ? `${COPY.stickyClub} · ${sticky.shortName}` : COPY.stickyClub}
            disabled={busy || readOnly || !sticky || placing}
            onPress={() => void onMark()}
          />
          <MarkCheck nonce={checkNonce} />
        </View>

        {!readOnly ? (
          <View style={styles.row}>
            <BigButton
              label={COPY.prevHole}
              variant="ghost"
              style={{ flex: 1 }}
              disabled={holeNumber <= 1}
              onPress={() => goToHole(holeNumber - 1)}
            />
            <BigButton
              label={COPY.nextHole}
              variant="secondary"
              style={{ flex: 1 }}
              disabled={!canAdvanceHole({ holeNumber, holeCount: round.holeCount })}
              onPress={() => goToHole(holeNumber + 1)}
            />
          </View>
        ) : null}

        {!readOnly ? (
          <View style={styles.row}>
            <BigButton
              label={COPY.undoLast}
              variant="ghost"
              style={{ flex: 1 }}
              disabled={busy || shots.length === 0}
              onPress={onUndo}
            />
            <BigButton
              label={COPY.drop}
              variant="secondary"
              style={{ flex: 1 }}
              disabled={placing}
              onPress={() => setDropOpen(true)}
            />
          </View>
        ) : null}

        {!readOnly ? (
          <View style={styles.row}>
            <BigButton
              label={COPY.addShot}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                closeEdit();
                resetPlace();
                setPlaceMode('from');
              }}
            />
            <BigButton
              label={COPY.penalty}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => setPenaltyOpen(true)}
            />
          </View>
        ) : null}
      </ThumbZone>

      <FullSheet
        visible={menuOpen}
        title={COPY.menu}
        onClose={() => setMenuOpen(false)}>
        <View style={styles.sheetPad}>
          <BigButton
            label={COPY.home}
            variant="secondary"
            onPress={() => {
              setMenuOpen(false);
              router.replace('/');
            }}
          />
          <BigButton
            label={COPY.previousHole}
            variant="ghost"
            disabled={holeNumber <= 1}
            onPress={() => {
              setMenuOpen(false);
              goToHole(holeNumber - 1);
            }}
          />
          <BigButton
            label={COPY.nextHole}
            variant="ghost"
            disabled={!canAdvanceHole({ holeNumber, holeCount: round.holeCount })}
            onPress={() => {
              setMenuOpen(false);
              goToHole(holeNumber + 1);
            }}
          />
          <BigButton
            label={COPY.settings}
            variant="ghost"
            onPress={() => {
              setMenuOpen(false);
              router.push('/settings');
            }}
          />
        </View>
      </FullSheet>

      <FullSheet
        visible={puttOpen}
        title={`${COPY.putts} · Hole ${puttSheetHole}`}
        onClose={() => {
          setPuttOpen(false);
          void pushWatchPuttSheet({ open: false, holeNumber: puttSheetHole, lengths: puttDraft.lengths });
        }}>
        <PuttSheetBody
          holeNumber={puttSheetHole}
          draft={puttDraft}
          disabled={readOnly}
          onAdd={onAddPutt}
          onUndo={onUndoPutt}
          onMadeIt={onMadeIt}
        />
      </FullSheet>

      <FullSheet
        visible={placeClubOpen || editClubOpen}
        title={pickerYards != null ? `${pickerYards} yd · ${COPY.pickClub}` : COPY.pickClub}
        onClose={() => {
          if (editClubOpen) {
            setEditClubOpen(false);
            setShowAllClubs(false);
            setEditOpen(true);
            return;
          }
          resetPlace();
        }}>
        <ScrollView contentContainerStyle={styles.sheetPad}>
          <Text style={styles.muted}>
            {pickerYards != null ? `${pickerYards} yd` : COPY.placeToHint}
          </Text>
          {placedRanked.length > 0 ? (
            <View style={styles.placeTop3}>
              {placedRanked.map((club, index) => (
                <Pressable
                  key={club.id}
                  onPress={() => {
                    const full = clubs.find((row) => row.id === club.id);
                    if (!full) return;
                    if (editClubOpen) commitEditClub(full.id);
                    else commitPlaced(full.id);
                  }}
                  style={[styles.top3Chip, index === 0 && styles.top3Primary]}>
                  <Text style={[styles.top3Text, index === 0 && styles.top3PrimaryText]}>
                    {club.shortName}
                  </Text>
                  {index === 0 ? <Text style={styles.suggest}>{COPY.suggested}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <BigButton
            label={COPY.allClubs}
            variant="secondary"
            onPress={() => setShowAllClubs((open) => !open)}
          />
          {showAllClubs || placedRanked.length === 0 ? (
            <View style={styles.placeGrid}>
              {(placedRanked.length === 0 ? placeBag : placeRest).map((club) => (
                <ClubButton
                  key={club.id}
                  shortName={club.shortName}
                  name={club.name}
                  onPress={() => {
                    if (editClubOpen) commitEditClub(club.id);
                    else commitPlaced(club.id);
                  }}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </FullSheet>

      <FullSheet
        visible={editOpen && !editClubOpen}
        title={
          editingShot
            ? `${COPY.editShot} · ${
                editingShot.clubId ? clubMap[editingShot.clubId]?.shortName ?? COPY.editShot : COPY.editShot
              }${editingShot.distanceYards != null ? ` · ${editingShot.distanceYards} yd` : ''}`
            : COPY.editShot
        }
        onClose={closeEdit}>
        <ScrollView contentContainerStyle={styles.sheetPad}>
          {editingShot ? (
            <>
              <QualityBadge
                quality={editingShot.fixQuality}
                open={editingShot.endedAt == null && editingShot.source !== 'no_gps'}
                source={editingShot.source}
              />
              <BigButton
                label={COPY.moveFrom}
                variant="secondary"
                disabled={!canMoveFromPin(editingShot)}
                onPress={() => {
                  setEditOpen(false);
                  setPlaceMode('edit-from');
                }}
              />
              <BigButton
                label={COPY.moveTo}
                variant="secondary"
                disabled={!canMoveToPin(editingShot)}
                onPress={() => {
                  setEditOpen(false);
                  setPlaceMode('edit-to');
                }}
              />
              <BigButton
                label={COPY.changeClub}
                onPress={() => {
                  setShowAllClubs(false);
                  setEditClubOpen(true);
                }}
              />
              {editUndo?.id === editingShot.id ? (
                <BigButton label={COPY.undoEdit} variant="ghost" onPress={onUndoEdit} />
              ) : null}
            </>
          ) : (
            <Text style={styles.muted}>{COPY.noShots}</Text>
          )}
        </ScrollView>
      </FullSheet>

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
                  onPress={() => openEdit(shot.id)}
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
                label={COPY.addShot}
                variant="secondary"
                onPress={() => {
                  setScoreOpen(false);
                  closeEdit();
                  resetPlace();
                  setPlaceMode('from');
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
  top3Primary: {
    flex: 2.2,
    minHeight: tapTarget,
    borderColor: colors.lime,
    borderWidth: 2,
    backgroundColor: '#1C3A24',
  },
  top3Text: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
  top3PrimaryText: { color: colors.lime, fontSize: type.button, fontWeight: '900' },
  suggest: { color: colors.lime, fontSize: type.tiny, fontWeight: '800' },
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
  pendingWrap: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  pendingChip: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.lime,
    backgroundColor: '#1C3A24',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pendingText: { color: colors.lime, fontSize: type.body, fontWeight: '900' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
  voiceFail: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  toast: { color: colors.lime, fontSize: type.meta, fontWeight: '800', paddingHorizontal: 16, paddingTop: 6 },
  muted: { color: colors.muted, fontSize: type.body },
  meta: { color: colors.muted, fontSize: type.meta },
  label: { color: colors.cream, fontSize: type.meta, fontWeight: '800', letterSpacing: 0.6 },
  sheetPad: { padding: 16, gap: 12, paddingBottom: 40 },
  placeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  placeTop3: { flexDirection: 'row', gap: 8 },
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
