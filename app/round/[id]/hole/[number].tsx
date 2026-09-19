import * as Device from 'expo-device';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourseDataClient } from '@/src/course/client';
import {
  cachedOsmOverlay,
  cachedResolvedTee,
  rememberOsmOverlay,
  rememberResolvedTee,
  resolveOverlayTee,
} from '@/src/course/osmOverlay';
import { formatParLabel } from '@/src/course/layout';
import type { OsmOverlay } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import {
  finishRound,
  getClubMap,
  getHole,
  getOpenShotForHole,
  getRound,
  hasSeenFirstLaunchTip,
  insertPenalty,
  listClubAverages,
  listClubs,
  listHoles,
  listPenaltiesForHole,
  listRounds,
  listShotsForHole,
  markFirstLaunchTipSeen,
  saveHoleTee,
  setHoleGreen,
  updateHolePar,
  updateHolePutts,
  finishHolePutts,
  updateHoleScore,
} from '@/src/db/repo';
import { pinOrNull, formatFmbRow, hasApiFmb, yardsToGreenDepth } from '@/src/domain/greenDepth';
import { clubPickLeaveRunsAcceptFix, planClubPickLeave } from '@/src/domain/clubPickNav';
import {
  COPY,
  finishPuttsChip,
  finishShotChip,
  formatPlayHeader,
  formatPlayHeaderPrimary,
  formatPlayHeaderSecondary,
  formatSuggestedClubChip,
  markedSuggestedMessage,
} from '@/src/domain/playerCopy';
import { allClubsHref, playHrefAfterHoleChange } from '@/src/domain/playNav';
import { canAdvanceHole, holesNeedingOpenShots } from '@/src/domain/holeAdvance';
import { isPutterClubId } from '@/src/domain/defaultBag';
import { catchUpPinFromTap, planCancelCatchUp, planCatchUpSheet } from '@/src/domain/catchUpMap';
import { courseTeeFromHole, planCourseCardCamera, playMapFrameEpoch, resolvePlayHoleTee } from '@/src/domain/holeCamera';
import { deleteShotPrompt } from '@/src/domain/deleteShot';
import { planInsertSlots } from '@/src/domain/insertShot';
import { confirmUndoIsLive, planConfirmUndo, type ConfirmUndoWindow } from '@/src/domain/confirmUndo';
import { confirmPlaceToDraft, courseGreenCenterForLine, resolveAddShotFromPin } from '@/src/domain/placeToDrag';
import { applyWheelSelection } from '@/src/domain/clubSelect';
import { PHONE_WHEEL_PILL_HEIGHT, PHONE_WHEEL_STRIP_HEIGHT, planClubStrip, toWheelFillClub } from '@/src/domain/clubStrip';
import { PLAY_DOCK_ACTION_MIN_HEIGHT, PLAY_GLASS_DOCK_LIFT, planPlayLayout } from '@/src/domain/playLayout';
import {
  firstLaunchTipHistoryRoundCount,
  firstLaunchTipSeenValue,
  shouldShowFirstLaunchTip,
} from '@/src/domain/firstLaunchTip';
import { planPlacedShot } from '@/src/domain/shotSource';
import { planUndoPlacePins } from '@/src/domain/undoLastShot';
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
  undoLastPutt,
  type PuttDraft,
  type PuttLengthId,
} from '@/src/domain/putts';
import { canMoveFromPin, canMoveToPin, type ShotEditSnapshot } from '@/src/domain/shotEdit';
import { clubToRankInput, lastClosedShotYards, rankDistanceYards, rankTopClubs, resolveNextShotDistanceTarget } from '@/src/domain/rankClubs';
import { planScorecardDismiss } from '@/src/domain/scorecard';
import { reconcileHoleScore, scoreMismatchMessage } from '@/src/domain/scoreReconcile';
import { resolveStickyClub, selectClubForMark } from '@/src/domain/stickyClub';
import type { Club, PenaltyReason } from '@/src/domain/types';
import { lastLandingMark, markToGreen, planPlayHeaderYards, toGreenDisplayFromHole } from '@/src/domain/yardsToGreen';
import { describeGpsSource } from '@/src/services/location';
import { endOpenShot, markShotWithClub, promptForPlan, takeDrop, undoLastShot, closeApproachBeforePutts, addPlacedShot, changeShotClub, moveShotPin, undoShotEdit, deleteHoleShot } from '@/src/services/shotActions';
import { useLiveFix } from '@/src/services/useLiveFix';
import { useWatchClubList } from '@/src/services/useWatchClubList';
import { pushWatchPuttSheet } from '@/src/services/watchClub';
import { MADE_IT_FEEDBACK, PHONE_UNAVAILABLE } from '@/src/domain/watchMessages';
import { QualityBadge } from '@/src/ui/Badge';
import { BigButton } from '@/src/ui/BigButton';
import { ClubButton } from '@/src/ui/ClubButton';
import { ClubStrip } from '@/src/ui/ClubStrip';
import { GpsBanner } from '@/src/ui/GpsBanner';
import { hapticLight, hapticMark, hapticSelect, hapticTap, hapticWarn } from '@/src/ui/haptics';
import { useColorTheme } from '@/src/ui/ColorThemeProvider';
import { useAmbientLight } from '@/src/ui/useAmbientLight';
import { playThemeId } from '@/src/domain/playTheme';
import { formatShotLockChip } from '@/src/domain/shotLock';
import { HoleMap } from '@/src/ui/HoleMap';
import { MarkCheck } from '@/src/ui/MarkCheck';
import { FullSheet } from '@/src/ui/Sheet';
import { PuttSheetBody } from '@/src/ui/PuttSheetBody';
import { ScorecardBody } from '@/src/ui/ScorecardBody';
import { COLOR_THEMES, tapTarget, type, type ColorPalette } from '@/src/ui/theme';

export default function HoleScreen() {
  const { id, number, putts: puttsParam, menu: menuParam } = useLocalSearchParams<{
    id: string;
    number: string;
    putts?: string;
    menu?: string;
  }>();
  const holeNumber = Number(number);
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { themeId: savedThemeId } = useColorTheme();
  const ambient = useAmbientLight();
  const colors = COLOR_THEMES[playThemeId({ saved: savedThemeId, ambient })];
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { db, revision, bump } = useDb();
  const fix = useLiveFix(true);
  const [busy, setBusy] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playFrameNonce, setPlayFrameNonce] = useState(0);
  const [mapFramed, setMapFramed] = useState(false);
  const [dockPassMap, setDockPassMap] = useState(false);
  const addShotFromRef = useRef<LatLng | null>(null);
  const [confirmUndo, setConfirmUndo] = useState<ConfirmUndoWindow | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [placeFrom, setPlaceFrom] = useState<LatLng | null>(null);
  const [placeTo, setPlaceTo] = useState<LatLng | null>(null);
  const [placeToDraft, setPlaceToDraft] = useState<LatLng | null>(null);
  const [placeClubOpen, setPlaceClubOpen] = useState(false);
  const [placeMode, setPlaceMode] = useState<'off' | 'from' | 'to' | 'edit-from' | 'edit-to'>('off');
  const [insertSeq, setInsertSeq] = useState<number | null>(null);
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
  const [toast, setToast] = useState<string | null>(null);
  const [firstLaunchTipDismissed, setFirstLaunchTipDismissed] = useState(false);

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
  const historyRoundCount = useMemo(
    () =>
      firstLaunchTipHistoryRoundCount({
        roundIds: listRounds(db).map((row) => row.id),
        currentRoundId: round?.id,
      }),
    [db, revision, round?.id],
  );

  useEffect(() => {
    if (hasSeenFirstLaunchTip(db)) return;
    if (historyRoundCount <= 0) return;
    markFirstLaunchTipSeen(db);
  }, [db, historyRoundCount]);
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
  const placeStripPlan = planClubStrip({
    clubs: clubs.map((club) => {
      const row = averages.find((item) => item.club.id === club.id);
      return toWheelFillClub(club, row);
    }),
    yardsLeft: pickerYards,
  });
  const placeStripItems = placeStripPlan.ids.map((id) => {
    const club = clubs.find((row) => row.id === id);
    return { id, label: formatSuggestedClubChip(club?.shortName ?? id, placeStripPlan.carries[id]) };
  });
  const placeBag = clubs.filter((club) => !isPutterClubId(club.id));

  const resetPlace = () => {
    const cancel = planCancelCatchUp();
    setPlaceFrom(cancel.from);
    setPlaceTo(cancel.to);
    setPlaceToDraft(null);
    setPlaceClubOpen(cancel.clubOpen);
    setPlaceMode(cancel.mode);
    setInsertSeq(cancel.insertSeq);
    setEditClubOpen(false);
    setShowAllClubs(false);
  };

  const startCatchUp = (seq: number | null) => {
    closeEdit();
    resetPlace();
    setInsertSeq(seq);
    const from = addShotFromRef.current;
    if (from) {
      setPlaceFrom(from);
      setPlaceMode('to');
      return;
    }
    setPlaceMode('from');
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditClubOpen(false);
    setEditShotId(null);
    setShowAllClubs(false);
    if (placeMode === 'edit-from' || placeMode === 'edit-to') setPlaceMode('off');
  };

  const openEdit = (shotId: string) => {
    if (placing) return;
    resetPlace();
    setScoreOpen(false);
    setEditShotId(shotId);
    setEditOpen(true);
  };

  const bumpPlayFrame = useCallback(() => {
    setMapFramed(false);
    setPlayFrameNonce((nonce) => nonce + 1);
  }, []);

  const goToHole = (nextNumber: number) => {
    resetPlace();
    closeEdit();
    setEditUndo(null);
    setConfirmUndo(null);
    setMapFramed(false);
    hapticLight();
    router.replace(playHrefAfterHoleChange(id, nextNumber));
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
    setMapFramed(false);
    setSelectedClubId(null);
  }, [holeNumber]);

  useEffect(() => {
    if (!confirmUndo) return undefined;
    const tick = () => {
      const now = Date.now();
      setNowMs(now);
      if (!confirmUndoIsLive(confirmUndo, now)) {
        setConfirmUndo(null);
        bump();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [confirmUndo, bump]);

  useEffect(() => {
    const location =
      hole?.greenLat != null && hole.greenLng != null
        ? { lat: hole.greenLat, lng: hole.greenLng }
        : null;
    if (!location) {
      return;
    }
    let live = true;
    void getCourseDataClient()
      .fetchOsmOverlay({
        courseId: round?.courseApiId,
        location,
        holeNumber,
        radiusM: 1000,
      })
      .then((overlay) => {
        if (!live || !overlay) return;
        rememberOsmOverlay(
          { courseId: round?.courseApiId, holeNumber, green: location },
          overlay,
        );
        const tee = resolveOverlayTee(overlay, holeNumber, location);
        if (tee) rememberResolvedTee({ courseId: round?.courseApiId, holeNumber, green: location }, tee);
        setOsmOverlay(overlay);
      })
      .catch(() => {
        // Keep the last overlay. Do not fall back to the clubhouse / phone.
      });
    return () => {
      live = false;
    };
  }, [round?.courseApiId, hole?.greenLat, hole?.greenLng, holeNumber]);

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
  const toGreenDisplay = toGreenDisplayFromHole({
    courseYards: hole?.yards ?? null,
    green,
    shots,
  });
  const yardsToGreenResult = {
    yards: toGreenDisplay.yards,
    quality: toGreenDisplay.quality,
  };
  const fmb = hasApiFmb(pins) ? formatFmbRow(yardsToGreenDepth(fix, pins)) : null;
  const toGreen = yardsToGreenResult;
  const target = resolveNextShotDistanceTarget({
    landingToGreen: markToGreen(lastLandingMark(shots), green),
    courseToGreen: toGreen,
    lastClosedYards: lastClosedShotYards(shots),
  });
  const ranked = rankTopClubs(
    averages.map((row) => clubToRankInput(row.club, row)),
    target,
  );
  const stripPlan = planClubStrip({
    clubs: clubs.map((club) => {
      const row = averages.find((item) => item.club.id === club.id);
      return toWheelFillClub(club, row);
    }),
    yardsLeft: target?.dYards ?? toGreen.yards,
  });
  const stripItems = stripPlan.ids.map((id) => {
    const club = clubs.find((row) => row.id === id);
    return { id, label: formatSuggestedClubChip(club?.shortName ?? id, stripPlan.carries[id]) };
  });
  const wheelSelectedId = selectedClubId ?? stripPlan.pickId;
  const overlay =
    osmOverlay ??
    cachedOsmOverlay({ courseId: round?.courseApiId, holeNumber, green });
  const courseTee = courseTeeFromHole(hole);
  const overlayTee = resolveOverlayTee(overlay, holeNumber, green);
  const cachedTee = cachedResolvedTee({ courseId: round?.courseApiId, holeNumber, green });
  const holeTee = resolvePlayHoleTee({
    courseTee,
    overlayTee,
    cachedTee,
    green,
  });
  if (holeTee) {
    rememberResolvedTee({ courseId: round?.courseApiId, holeNumber, green }, holeTee);
  }
  useEffect(() => {
    if (!hole?.id || !holeTee) return;
    saveHoleTee(db, hole.id, holeTee);
  }, [db, hole?.id, holeTee?.lat, holeTee?.lng]);
  const courseCamera = planCourseCardCamera({
    tee: holeTee,
    green,
    phone: null,
  });
  const addShotFrom = resolveAddShotFromPin({
    tee: holeTee,
    lastLanding: lastLandingMark(shots),
  });
  addShotFromRef.current = addShotFrom;
  const courseGreen = courseGreenCenterForLine({
    green,
    source: hole?.greenSource ?? null,
  });
  const insertSlots = planInsertSlots(shots);
  const playLayout = planPlayLayout();
  const playHeaderYards = planPlayHeaderYards({
    phone: fix ? { lat: fix.lat, lng: fix.lng } : null,
    green,
    tee: holeTee,
    courseYards: hole?.yards ?? null,
    shots,
  });

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
    if (menuParam !== '1' || readOnly) return;
    setMenuOpen(true);
    router.setParams({ menu: undefined });
  }, [menuParam, readOnly]);

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
      tee: holeTee,
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
        if (action === 'home') {
          setMenuOpen(true);
          return;
        }
      },
      onPuttPick: onWatchPuttPick,
      onSelectClub: (clubId) => {
        setSelectedClubId(applyWheelSelection(clubId));
      },
      labelForClub: (clubId) => clubMap[clubId]?.shortName ?? clubs.find((club) => club.id === clubId)?.shortName ?? null,
    },
    {
      top3: ranked.map((club) => ({
        id: club.id,
        shortName: formatSuggestedClubChip(club.shortName, rankDistanceYards(club)),
      })),
      bag: clubs.map((club) => ({
        id: club.id,
        shortName: formatSuggestedClubChip(club.shortName, stripPlan.carries[club.id] ?? null),
      })),
      holeNumber,
      yardsToGreen: playHeaderYards.yards,
      yardsQuality: playHeaderYards.quality,
      lastClubId: sticky?.id ?? null,
      selectedClubId: wheelSelectedId,
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
        tee: holeTee,
      });
      const waiting = promptForPlan(plan, () => {
        void markClub(club, true);
      });
      if (!waiting && plan.status === 'commit') {
        hapticMark();
        if (plan.closePrior) {
          hapticLight();
          const closed = shots.find((shot) => shot.id === plan.closePrior?.shotId);
          const closedName = closed?.clubId ? clubMap[closed.clubId]?.shortName ?? 'club' : 'club';
          const chip = formatShotLockChip({
            shortName: closedName,
            distanceYards: plan.closePrior.distanceYards,
          });
          if (chip) setToast(chip);
        }
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

  const dismissScorecard = () => {
    const action = planScorecardDismiss();
    if (action.markShot || action.closeShot || action.leaveHole || action.finishRound) {
      return;
    }
    setScorecardOpen(false);
    bumpPlayFrame();
  };

  const onUndo = () => {
    if (readOnly) return;
    if (placing && (placeFrom || placeTo || placeToDraft)) {
      const next = planUndoPlacePins({ from: placeFrom, to: placeTo ?? placeToDraft });
      if (!next) return;
      setPlaceFrom(next.from);
      setPlaceTo(next.to);
      setPlaceToDraft(next.to);
      setPlaceClubOpen(false);
      setPlaceMode(next.mode);
      hapticTap();
      return;
    }
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
      if (!waiting && plan.status === 'commit' && plan.closePrior) {
        hapticLight();
        const closed = shots.find((shot) => shot.id === plan.closePrior?.shotId);
        const closedName = closed?.clubId ? clubMap[closed.clubId]?.shortName ?? 'club' : 'club';
        const chip = formatShotLockChip({
          shortName: closedName,
          distanceYards: plan.closePrior.distanceYards,
        });
        if (chip) setToast(chip);
        bump();
      } else if (!waiting) {
        bump();
      }
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

  const openBag = () => {
    if (placing) return;
    router.push(allClubsHref(id, holeNumber));
  };

  const confirmToPin = () => {
    const result = confirmPlaceToDraft({ from: placeFrom, draft: placeToDraft });
    if (result.status === 'empty') return;
    hapticLight();
    setPlaceTo(result.to);
    setPlaceClubOpen(true);
  };

  const commitPlaced = (clubId: string) => {
    if (!placeFrom || !placeTo) return;
    const result = addPlacedShot(db, {
      roundId: round.id,
      holeNumber,
      clubId,
      from: placeFrom,
      to: placeTo,
      seq: insertSeq ?? undefined,
    });
    if (result.status !== 'commit') {
      hapticWarn();
      return;
    }
    hapticMark();
    hapticLight();
    const placed = planPlacedShot(placeFrom, placeTo);
    const club = clubs.find((row) => row.id === clubId);
    const chip = formatShotLockChip({
      shortName: club?.shortName ?? '',
      distanceYards: placed.ok ? placed.distanceYards : null,
    });
    if (chip) setToast(chip);
    setConfirmUndo(planConfirmUndo(result.id, Date.now()));
    resetPlace();
    bump();
  };

  const onConfirmUndo = () => {
    if (!confirmUndo || !confirmUndoIsLive(confirmUndo, Date.now())) {
      setConfirmUndo(null);
      return;
    }
    const result = deleteHoleShot(db, {
      roundId: id,
      holeNumber,
      shotId: confirmUndo.shotId,
      confirmed: true,
    });
    if (result.status !== 'commit') return;
    setConfirmUndo(null);
    hapticTap();
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

  const commitMovePin = (point: LatLng, which: 'from' | 'to') => {
    if (!editShotId) return;
    const result = moveShotPin(db, { shotId: editShotId, which, point });
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

  const commitDeleteShot = (shotId: string) => {
    const result = deleteHoleShot(db, {
      roundId: id,
      holeNumber,
      shotId,
      confirmed: true,
    });
    if (result.status !== 'commit') return;
    hapticTap();
    if (editUndo?.id === shotId) setEditUndo(null);
    closeEdit();
    bump();
  };

  const onDeleteShot = (shotId: string) => {
    const prompt = deleteShotPrompt();
    Alert.alert(prompt.title, '', [
      { text: prompt.cancel, style: 'cancel' },
      { text: prompt.confirm, style: 'destructive', onPress: () => commitDeleteShot(shotId) },
    ]);
  };

  const catchUpSheet = planCatchUpSheet(placing);
  const hideHoleButtons = catchUpSheet.holeButtons === 'hidden';
  const catchUpFullScreen = catchUpSheet.map === 'fullscreen';
  const showFirstLaunchTip =
    !readOnly &&
    !catchUpFullScreen &&
    !firstLaunchTipDismissed &&
    shouldShowFirstLaunchTip({
      seen: hasSeenFirstLaunchTip(db) ? firstLaunchTipSeenValue() : null,
      historyRoundCount,
    });
  const onDismissFirstLaunchTip = () => {
    markFirstLaunchTipSeen(db);
    setFirstLaunchTipDismissed(true);
  };
  const placeHint =
    placeMode === 'edit-from'
      ? COPY.editFromHint
      : placeMode === 'edit-to'
        ? COPY.editToHint
        : placing
          ? placeTo
            ? `${placedYards ?? '—'} yd · ${COPY.pickClub}`
            : placeFrom
              ? null
              : COPY.placeFromHint
          : null;

  const onCancelPlace = () => {
    const editing = placeMode === 'edit-from' || placeMode === 'edit-to' || editClubOpen;
    resetPlace();
    if (editing && editShotId) setEditOpen(true);
  };

  return (
    <View style={styles.fill}>
      <View collapsable={false} style={styles.mapFill}>
        <HoleMap
          fullBleed
          holeNumber={hole.number}
          shots={shots}
          userFix={catchUpFullScreen ? null : fix}
          green={green}
          yardsToGreen={{
            yards: playHeaderYards.yards,
            quality: playHeaderYards.quality,
          }}
          fmb={fmb}
          osmOverlay={overlay}
          placedFrom={placeMode === 'edit-from' || placeMode === 'edit-to' ? placeFrom : addShotFrom}
          placedTo={placeToDraft ?? placeTo}
          lineFrom={placeMode === 'edit-from' || placeMode === 'edit-to' ? placeFrom : addShotFrom}
          lineGreen={courseGreen}
          freezePan={placeMode === 'to' || placeMode === 'edit-to'}
          onPlaceToDrag={
            placeMode === 'to' || placeMode === 'edit-to'
              ? (point) => setPlaceToDraft(point)
              : undefined
          }
          lockFrame
          showPhonePin={!catchUpFullScreen}
          allowMapsChrome={!catchUpFullScreen}
          hideYardsOverlay
          frameEpoch={playMapFrameEpoch({ holeNumber: hole.number, nonce: playFrameNonce })}
          onFrameReady={setMapFramed}
          heading={courseCamera?.heading ?? null}
          framePoints={
            courseCamera?.points.map((point) => ({
              latitude: point.lat,
              longitude: point.lng,
            }))
          }
          placeHint={placeHint}
          onShotPress={placing ? undefined : openEdit}
          onPlacePoint={
            readOnly || placeMode === 'off' || placeClubOpen || editClubOpen
              ? undefined
              : (coord) => {
                  const tap = catchUpPinFromTap(coord, fix);
                  if (!tap) return;
                  if (placeMode === 'from') {
                    if (!addShotFrom) return;
                    setPlaceFrom(addShotFrom);
                    setPlaceMode('to');
                    return;
                  }
                  if (placeMode === 'to') {
                    setPlaceToDraft(tap);
                    return;
                  }
                  if (placeMode === 'edit-from') {
                    commitMovePin(tap, 'from');
                    return;
                  }
                  if (placeMode === 'edit-to') {
                    setPlaceToDraft(tap);
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
          {catchUpFullScreen ? (
            <View>
              <View style={styles.catchUpBar}>
                <Pressable onPress={onCancelPlace} style={styles.back} accessibilityRole="button">
                  <Text style={styles.backLabel}>{COPY.cancelPlace}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.holeTitle}
                    numberOfLines={1}
                    accessibilityLabel={formatPlayHeader(hole.number, hole.par, playHeaderYards.yards)}>
                    {formatPlayHeaderPrimary(hole.number)}
                    <Text style={styles.holeMeta}>
                      {` · ${formatPlayHeaderSecondary(hole.par, round.teeName)}`}
                    </Text>
                  </Text>
                </View>
              </View>
              {placeHint ? <Text style={styles.catchUpHint}>{placeHint}</Text> : null}
            </View>
          ) : (
            <View>
              <View style={styles.stickyInner}>
                <Pressable onPress={() => setMenuOpen(true)} style={styles.menuButton} accessibilityRole="button">
                  <Text style={styles.menuButtonText}>{COPY.menu}</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text
                    style={styles.holeTitle}
                    numberOfLines={1}
                    accessibilityLabel={formatPlayHeader(hole.number, hole.par, playHeaderYards.yards)}>
                    {formatPlayHeaderPrimary(hole.number)}
                    <Text style={styles.holeMeta}>
                      {` · ${formatPlayHeaderSecondary(hole.par, round.teeName)}`}
                    </Text>
                  </Text>
                </View>
              </View>
              {playLayout.shotLine === 'header' ? (
                <ScrollView
                  horizontal
                  style={styles.shotLine}
                  contentContainerStyle={styles.shotLineInner}
                  showsHorizontalScrollIndicator={false}>
                  {shots.length === 0 ? (
                    <Text style={styles.shotLineMuted}>{COPY.noShots}</Text>
                  ) : (
                    shots.map((shot) => {
                      const club = shot.clubId ? clubMap[shot.clubId] : null;
                      const slot = insertSlots.find((row) => row.afterShotId === shot.id);
                      const label =
                        shot.source === 'no_gps' || shot.fixQuality === 'none'
                          ? COPY.logged
                          : shot.endedAt == null
                            ? COPY.inPlay
                            : `${shot.distanceYards ?? '—'} yd`;
                      return (
                        <View key={shot.id} style={styles.shotLineItem}>
                          <Pressable
                            disabled={placing}
                            onPress={() => openEdit(shot.id)}
                            style={styles.shotLineShot}>
                            <Text style={styles.shotLineText}>
                              {shot.seq} {club?.shortName ?? 'Club'} · {label}
                            </Text>
                          </Pressable>
                          {!readOnly && slot && playLayout.insertPlus === 'header' ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={COPY.insertShot}
                              disabled={placing}
                              onPress={() => startCatchUp(slot.seq)}
                              style={styles.shotLinePlus}>
                              <Text style={styles.shotLinePlusText}>+</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      );
                    })
                  )}
                  {!readOnly && shots.length === 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={COPY.insertShot}
                      disabled={placing}
                      onPress={() => startCatchUp(1)}
                      style={styles.shotLinePlus}>
                      <Text style={styles.shotLinePlusText}>+</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
              ) : null}
              {simBanner ? <GpsBanner message={simBanner} /> : null}
              {showFirstLaunchTip ? (
                <View pointerEvents="box-none" style={styles.firstLaunchTipRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={COPY.firstLaunchTip}
                    onPress={onDismissFirstLaunchTip}
                    style={styles.firstLaunchTip}>
                    <Text style={styles.firstLaunchTipText}>{COPY.firstLaunchTip}</Text>
                    <Text style={styles.firstLaunchTipDismiss}>{COPY.dismissFirstLaunchTip}</Text>
                  </Pressable>
                </View>
              ) : null}
              {toast ? <Text style={styles.overlayToast}>{toast}</Text> : null}
              {!readOnly && confirmUndoIsLive(confirmUndo, nowMs) ? (
                <Pressable onPress={onConfirmUndo} style={styles.overlayLink}>
                  <Text style={styles.backLabel}>{COPY.undoLast}</Text>
                </Pressable>
              ) : null}
              {!readOnly && editUndo ? (
                <Pressable onPress={onUndoEdit} style={styles.overlayLink}>
                  <Text style={styles.backLabel}>{COPY.undoEdit}</Text>
                </Pressable>
              ) : null}
              {pendingShots.map((row) => (
                <Pressable
                  key={`shot-${row.number}`}
                  accessibilityRole="button"
                  disabled={readOnly}
                  onPress={() => goToHole(row.number)}
                  style={styles.overlayLink}>
                  <Text style={styles.backLabel}>{finishShotChip(row.number)}</Text>
                </Pressable>
              ))}
              {pendingPutts.map((row) => (
                <Pressable
                  key={row.number}
                  accessibilityRole="button"
                  disabled={readOnly}
                  onPress={() => void openPuttSheet(row.number)}
                  style={styles.overlayLink}>
                  <Text style={styles.backLabel}>{finishPuttsChip(row.number)}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        {catchUpFullScreen &&
        (placeMode === 'to' || placeMode === 'edit-to') &&
        placeToDraft &&
        !placeClubOpen ? (
          <View
            pointerEvents="box-none"
            style={[styles.confirmDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <BigButton
              label={COPY.confirmPlace}
              onPress={() => {
                if (placeMode === 'edit-to') {
                  commitMovePin(placeToDraft, 'to');
                  return;
                }
                confirmToPin();
              }}
            />
          </View>
        ) : null}
        {!catchUpFullScreen &&
        !hideHoleButtons &&
        (!courseCamera || mapFramed) ? (
          <View
            pointerEvents="box-none"
            style={[styles.allClubsFloat, { bottom: PLAY_GLASS_DOCK_LIFT + Math.max(insets.bottom, 8) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={COPY.allClubs}
              disabled={readOnly || placing}
              onPress={openBag}
              style={styles.allClubsPill}>
              <Text style={styles.allClubsPillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {COPY.allClubs}
              </Text>
            </Pressable>
          </View>
        ) : null}

      {!hideHoleButtons && (catchUpFullScreen || !courseCamera || mapFramed) ? (
        <View
          pointerEvents={dockPassMap ? 'none' : 'box-none'}
          onTouchStart={(event) => {
            if (event.nativeEvent.touches.length >= 2) setDockPassMap(true);
          }}
          onTouchEnd={(event) => {
            if (event.nativeEvent.touches.length === 0) setDockPassMap(false);
          }}
          onTouchCancel={() => setDockPassMap(false)}
          style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View pointerEvents="none" style={styles.dockGlass} />
          <View pointerEvents="box-none" style={styles.dockRow}>
            <View pointerEvents="box-none" style={styles.dockStrip}>
              <ClubStrip
                items={stripItems}
                pickId={wheelSelectedId}
                windowStart={stripPlan.windowStart}
                disabled={readOnly || placing}
                onPick={(id) => {
                  if (placing) return;
                  setSelectedClubId(applyWheelSelection(id));
                  const full = clubs.find((row) => row.id === id) ?? null;
                  void markClub(full);
                }}
              />
            </View>
          </View>
          <View pointerEvents="box-none" style={styles.dockRow}>
            {sticky ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy || readOnly || placing}
                onPress={() => void onMark()}
                style={styles.dockAction}>
                <Text style={styles.dockActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {`${COPY.stickyClub} · ${sticky.shortName}`}
                </Text>
                <MarkCheck nonce={checkNonce} />
              </Pressable>
            ) : null}
            {!readOnly ? (
              <Pressable
                accessibilityRole="button"
                disabled={placing}
                onPress={() => startCatchUp(null)}
                style={styles.dockAction}>
                <Text style={styles.dockActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {COPY.addShot}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setScorecardOpen(true)}
              style={[styles.dockAction, styles.dockScorecard]}>
              <Text style={styles.dockScorecardText} numberOfLines={1}>
                {COPY.scorecard}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={readOnly || holeNumber <= 1}
              onPress={() => goToHole(holeNumber - 1)}
              style={styles.dockAction}>
              <Text style={styles.dockActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {COPY.prevHole}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={readOnly || !canAdvanceHole({ holeNumber, holeCount: round.holeCount })}
              onPress={() => goToHole(holeNumber + 1)}
              style={styles.dockAction}>
              <Text style={styles.dockActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {COPY.nextHole}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      </View>

      <FullSheet
        visible={menuOpen}
        title={COPY.menu}
        onClose={() => {
          setMenuOpen(false);
          bumpPlayFrame();
        }}>
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
            label={COPY.scorecard}
            variant="ghost"
            onPress={() => {
              setMenuOpen(false);
              setScorecardOpen(true);
            }}
          />
          <BigButton
            label={COPY.undoLast}
            variant="ghost"
            disabled={busy || readOnly || shots.length === 0}
            onPress={() => {
              setMenuOpen(false);
              onUndo();
            }}
          />
          <BigButton
            label={COPY.drop}
            variant="ghost"
            disabled={readOnly || placing}
            onPress={() => {
              setMenuOpen(false);
              setDropOpen(true);
            }}
          />
          <BigButton
            label={COPY.penalty}
            variant="ghost"
            disabled={readOnly}
            onPress={() => {
              setMenuOpen(false);
              setPenaltyOpen(true);
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
        visible={scorecardOpen}
        title={COPY.scorecard}
        onClose={dismissScorecard}>
        <ScrollView contentContainerStyle={styles.sheetPad}>
          <ScorecardBody
            holes={holes.map((row) => ({
              number: row.number,
              par: row.par,
              score: row.score,
              putts: row.putts,
            }))}
            onBack={dismissScorecard}
          />
        </ScrollView>
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
          {placeStripItems.length > 0 ? (
            <ClubStrip
              items={placeStripItems}
              pickId={placeStripPlan.pickId}
              onPick={(id) => {
                const full = clubs.find((row) => row.id === id);
                if (!full) return;
                if (editClubOpen) commitEditClub(full.id);
                else commitPlaced(full.id);
              }}
            />
          ) : null}
          <BigButton
            label={COPY.allClubs}
            variant="secondary"
            onPress={() => setShowAllClubs((open) => !open)}
          />
          {showAllClubs || placeStripItems.length === 0 ? (
            <View style={styles.placeGrid}>
              {placeBag.map((club) => (
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
        <View style={styles.editSheetBody}>
          <HoleMap
            holeNumber={hole.number}
            shots={shots}
            userFix={fix}
            green={green}
            yardsToGreen={{
              yards: playHeaderYards.yards,
              quality: playHeaderYards.quality,
            }}
            osmOverlay={osmOverlay}
            lockFrame
            hideYardsOverlay
            showPhonePin={false}
            allowMapsChrome
            frameEpoch={`edit-${hole.number}-${editingShot?.id ?? 'none'}`}
            heading={courseCamera?.heading ?? null}
            framePoints={
              courseCamera?.points.map((point) => ({
                latitude: point.lat,
                longitude: point.lng,
              }))
            }
          />
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
                  disabled={readOnly || !canMoveFromPin(editingShot)}
                  onPress={() => {
                    setEditOpen(false);
                    setPlaceMode('edit-from');
                  }}
                />
                <BigButton
                  label={COPY.moveTo}
                  variant="secondary"
                  disabled={readOnly || !canMoveToPin(editingShot)}
                  onPress={() => {
                    if (!editingShot) return;
                    if (editingShot.startLat != null && editingShot.startLng != null) {
                      setPlaceFrom({ lat: editingShot.startLat, lng: editingShot.startLng });
                    }
                    if (editingShot.endLat != null && editingShot.endLng != null) {
                      setPlaceToDraft({ lat: editingShot.endLat, lng: editingShot.endLng });
                    }
                    setEditOpen(false);
                    setPlaceMode('edit-to');
                  }}
                />
                <BigButton
                  label={COPY.changeClub}
                  disabled={readOnly}
                  onPress={() => {
                    setShowAllClubs(false);
                    setEditClubOpen(true);
                  }}
                />
                {editUndo?.id === editingShot.id ? (
                  <BigButton label={COPY.undoEdit} variant="ghost" onPress={onUndoEdit} />
                ) : null}
                <BigButton
                  label={COPY.deleteShot}
                  variant="danger"
                  onPress={() => onDeleteShot(editingShot.id)}
                />
              </>
            ) : (
              <Text style={styles.muted}>{COPY.noShots}</Text>
            )}
          </ScrollView>
        </View>
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
              const slot = insertSlots.find((row) => row.afterShotId === shot.id);
              return (
                <View key={shot.id}>
                  <Pressable
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
                  {!readOnly && slot ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={COPY.insertShot}
                      onPress={() => {
                        setScoreOpen(false);
                        startCatchUp(slot.seq);
                      }}
                      style={styles.insertPlus}>
                      <Text style={styles.insertPlusText}>+</Text>
                    </Pressable>
                  ) : null}
                </View>
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
                  startCatchUp(null);
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

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  fill: { flex: 1, height: '100%', backgroundColor: colors.bg },
  mapFill: {
    ...StyleSheet.absoluteFill,
    flex: 1,
    minHeight: '60%',
    flexGrow: 1,
    flexBasis: '60%',
  },
  catchUpBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.overlay,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  catchUpHint: {
    marginTop: 8,
    backgroundColor: colors.overlay,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.cream,
    fontSize: type.body,
    fontWeight: '800',
  },
  confirmDock: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
  },
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
    backgroundColor: colors.overlay,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  menuButton: {
    minHeight: tapTarget,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: { color: colors.cream, fontWeight: '800', fontSize: type.button },
  back: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  backLabel: { color: colors.cream, fontWeight: '800', fontSize: type.meta },
  allClubsFloat: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: PLAY_GLASS_DOCK_LIFT,
    alignItems: 'center',
  },
  allClubsPill: {
    height: PHONE_WHEEL_PILL_HEIGHT,
    minWidth: 120,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allClubsPillText: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
  holeTitle: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
  holeMeta: { color: colors.muted, fontSize: type.kicker, fontWeight: '600' },
  shotLine: { marginTop: 6, maxHeight: 36, flexGrow: 0 },
  shotLineInner: { alignItems: 'center', gap: 6, paddingRight: 8 },
  shotLineItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shotLineShot: {
    minHeight: 32,
    borderRadius: 10,
    backgroundColor: colors.overlay,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  shotLineText: { color: colors.cream, fontSize: type.tiny, fontWeight: '800' },
  shotLineMuted: { color: colors.muted, fontSize: type.tiny, fontWeight: '700' },
  shotLinePlus: {
    minHeight: 32,
    minWidth: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay,
  },
  shotLinePlusText: { color: colors.cream, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  overlayBanner: {
    marginTop: 6,
    backgroundColor: colors.overlay,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  overlayLink: {
    marginTop: 6,
    minHeight: 32,
    justifyContent: 'center',
    backgroundColor: colors.overlay,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  overlayToast: {
    marginTop: 6,
    color: colors.cream,
    fontSize: type.tiny,
    fontWeight: '800',
    backgroundColor: colors.overlay,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  firstLaunchTipRow: {
    marginTop: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  firstLaunchTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.overlay,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
  },
  firstLaunchTipText: {
    flexShrink: 1,
    color: colors.cream,
    fontSize: type.tiny,
    fontWeight: '800',
  },
  firstLaunchTipDismiss: {
    color: colors.muted,
    fontSize: type.tiny,
    fontWeight: '800',
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 8,
  },
  dockGlass: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.glass,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  dockRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap', gap: 6 },
  dockStrip: { flex: 1, minWidth: 0, height: PHONE_WHEEL_STRIP_HEIGHT },
  dockChip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 4,
  },
  dockChipSide: {
    flexShrink: 0,
    minHeight: 36,
    minWidth: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 8,
  },
  dockChipPrimary: { borderColor: colors.cream, borderWidth: 2, backgroundColor: colors.accentWash },
  dockChipText: { color: colors.cream, fontWeight: '800', fontSize: type.tiny },
  dockChipPrimaryText: { color: colors.cream, fontWeight: '900' },
  dockAction: {
    flex: 1,
    minHeight: PLAY_DOCK_ACTION_MIN_HEIGHT,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 2,
  },
  dockActionText: { color: colors.cream, fontWeight: '800', fontSize: 11, textAlign: 'center' },
  dockScorecard: { flexGrow: 1.15, flexShrink: 0, minWidth: 72, paddingHorizontal: 4 },
  dockScorecardText: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 11,
    textAlign: 'center',
  },
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
    borderColor: colors.cream,
    borderWidth: 2,
    backgroundColor: colors.accentWash,
  },
  top3Text: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
  top3PrimaryText: { color: colors.cream, fontSize: type.button, fontWeight: '900' },
  suggest: { color: colors.muted, fontSize: type.tiny, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: type.body },
  meta: { color: colors.muted, fontSize: type.meta },
  label: { color: colors.cream, fontSize: type.meta, fontWeight: '800', letterSpacing: 0.6 },
  sheetPad: { padding: 16, gap: 12, paddingBottom: 40 },
  editSheetBody: { flex: 1 },
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
  chipOn: { borderColor: colors.cream, backgroundColor: colors.accentWash },
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
  stepText: { color: colors.cream, fontSize: 32, fontWeight: '800' },
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
  insertPlus: {
    alignSelf: 'center',
    minHeight: 36,
    minWidth: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  insertPlusText: { color: colors.cream, fontSize: 22, fontWeight: '900', lineHeight: 24 },
  shotSeq: { color: colors.cream, fontWeight: '900', fontSize: 20, width: 24 },
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
}
