import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getCourseDataClient } from '@/src/course/client';
import { cachedResolvedTee, resolveOverlayTee } from '@/src/course/osmOverlay';
import type { OsmOverlay } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import { getHole, getRound, listClubAverages, listClubs, listShotsForHole } from '@/src/db/repo';
import { courseTeeFromHole, resolvePlayHoleTee } from '@/src/domain/holeCamera';
import { planClubStrip, toWheelFillClub } from '@/src/domain/clubStrip';
import { COPY, formatPickerLeftYards, formatSuggestedClubChip } from '@/src/domain/playerCopy';
import { clubPickLeaveHref, clubPickLeaveRunsAcceptFix, planClubPickLeave } from '@/src/domain/clubPickNav';
import { putterOpensPuttSheet } from '@/src/domain/putts';
import { clubToRankInput, lastClosedShotYards, rankDistanceYards, rankTopClubs, resolveNextShotDistanceTarget } from '@/src/domain/rankClubs';
import { parseTypedYards } from '@/src/domain/shotSource';
import { selectClubForMark } from '@/src/domain/stickyClub';
import { emptyWalkAway, stepWalkAway, walkAwayEligible } from '@/src/domain/walkAway';
import type { Club, GpsFix } from '@/src/domain/types';
import { lastLandingMark, markToGreen, toGreenDisplayFromHole } from '@/src/domain/yardsToGreen';
import { addNoGpsShot, changeShotClub, markShotWithClub, promptForPlan } from '@/src/services/shotActions';
import { useLiveFix } from '@/src/services/useLiveFix';
import { useWatchClubList } from '@/src/services/useWatchClubList';
import { BigButton } from '@/src/ui/BigButton';
import { hapticMark, hapticSelect, hapticWarn } from '@/src/ui/haptics';
import { Screen } from '@/src/ui/Screen';
import { colors, type } from '@/src/ui/theme';

export default function ClubPickScreen() {
  const { id, hole, noGps, shot: shotId } = useLocalSearchParams<{
    id: string;
    hole: string;
    noGps?: string;
    shot?: string;
  }>();
  const holeNumber = Number(hole);
  const withoutGps = noGps === '1';
  const relabelId = typeof shotId === 'string' && shotId.length > 0 ? shotId : null;
  const navigation = useNavigation();
  const { db, revision, bump } = useDb();

  const leavingRef = useRef(false);

  const leavePicker = (action: 'back' | 'home') => {
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
    leavingRef.current = true;
    if (plan.dest === 'rounds') {
      router.replace('/');
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (!id || Number.isNaN(holeNumber)) return;
    router.replace(clubPickLeaveHref({ action: 'back', roundId: id, holeNumber }));
  };
  const clubs = useMemo(() => listClubs(db, true), [db, revision]);
  const holeRow = useMemo(() => getHole(db, id, holeNumber), [db, id, holeNumber, revision]);
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const [osmOverlay, setOsmOverlay] = useState<OsmOverlay | null>(null);
  const shots = useMemo(
    () => (holeRow ? listShotsForHole(db, holeRow.id) : []),
    [db, holeRow, revision],
  );
  const averages = useMemo(() => listClubAverages(db).filter((row) => row.club.enabled), [db, revision]);

  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Club | null>(null);
  const [typedYards, setTypedYards] = useState('');

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      leavingRef.current = true;
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({
      title: withoutGps ? COPY.forgotShot : relabelId ? COPY.changeClub : COPY.allClubs,
      headerLeft: () => (
        <Pressable
          accessibilityRole="button"
          onPress={() => leavePicker('back')}
          style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>{COPY.back}</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable
          accessibilityRole="button"
          onPress={() => leavePicker('home')}
          style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>{COPY.home}</Text>
        </Pressable>
      ),
    });
  }, [navigation, withoutGps, relabelId, id, holeNumber]);

  const green =
    holeRow?.greenLat != null && holeRow.greenLng != null
      ? { lat: holeRow.greenLat, lng: holeRow.greenLng }
      : null;
  const overlayTee = resolveOverlayTee(osmOverlay, holeNumber, green);
  const cachedTee = cachedResolvedTee({ courseId: round?.courseApiId, holeNumber, green });
  const holeTee = resolvePlayHoleTee({
    courseTee: courseTeeFromHole(holeRow),
    overlayTee,
    cachedTee,
    green,
  });
  const fix = useLiveFix(!withoutGps);

  useEffect(() => {
    const location =
      green ??
      (round?.courseLat != null && round.courseLng != null
        ? { lat: round.courseLat, lng: round.courseLng }
        : null);
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
  }, [green, round?.courseApiId, round?.courseLat, round?.courseLng, holeNumber]);

  const toGreen = toGreenDisplayFromHole({
    courseYards: holeRow?.yards ?? null,
    green,
    shots,
  });
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
  const lastLie = useMemo(() => {
    const last = [...shots].reverse().find((shot) => shot.startLat != null && shot.startLng != null);
    return last?.startLat != null && last.startLng != null
      ? { lat: last.startLat, lng: last.startLng }
      : null;
  }, [shots]);

  useWatchClubList(
    {
      db,
      roundId: id,
      holeNumber,
      readOnly: false,
      tee: holeTee,
      bump,
      onMarked: () => {
        if (!withoutGps) router.back();
      },
      onPutter: () => {
        router.replace(`/round/${id}/hole/${holeNumber}?putts=1`);
      },
      onLeave: (action) => {
        if (action === 'home') {
          if (!id || Number.isNaN(holeNumber)) return;
          router.replace(`/round/${id}/hole/${holeNumber}?menu=1`);
          return;
        }
        leavePicker(action);
      },
      labelForClub: (clubId) => clubs.find((club) => club.id === clubId)?.shortName ?? null,
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
      yardsToGreen: target?.dYards ?? toGreen.yards,
      yardsQuality: toGreen.quality,
      lastClubId: selected?.id ?? null,
    },
  );

  const markClub = async (
    club: Club,
    force = false,
    opts: { fixOverride?: GpsFix; suggested?: boolean } = {},
  ) => {
    if (leavingRef.current) return;
    const next = selectClubForMark(club, clubs);
    if (!next || !id || Number.isNaN(holeNumber)) return;
    hapticSelect();
    setSelected(next);
    if (putterOpensPuttSheet({ clubId: next.id, relabel: Boolean(relabelId) })) {
      router.replace(`/round/${id}/hole/${holeNumber}?putts=1`);
      return;
    }
    if (relabelId) {
      changeShotClub(db, { roundId: id, shotId: relabelId, clubId: next.id });
      bump();
      router.back();
      return;
    }
    if (withoutGps) return;
    if (leavingRef.current) return;
    setBusy(true);
    try {
      if (leavingRef.current) return;
      const { plan } = await markShotWithClub(db, {
        roundId: id,
        holeNumber,
        clubId: next.id,
        force,
        fixOverride: opts.fixOverride,
        suggested: opts.suggested,
        tee: holeTee,
      });
      const waiting = promptForPlan(plan, () => {
        void markClub(next, true, opts);
      });
      if (!waiting && plan.status === 'commit') {
        hapticMark();
        bump();
        router.back();
      }
    } catch (err) {
      hapticWarn();
      Alert.alert('Couldn’t mark', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const rankedRef = useRef(ranked);
  rankedRef.current = ranked;
  const clubsRef = useRef(clubs);
  clubsRef.current = clubs;
  const markRef = useRef(markClub);
  markRef.current = markClub;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const walkStateRef = useRef(emptyWalkAway());

  useEffect(() => {
    walkStateRef.current = emptyWalkAway();
  }, [withoutGps, relabelId, holeNumber, lastLie]);

  useEffect(() => {
    if (
      !fix ||
      !walkAwayEligible({
        awaitingClub: !withoutGps && !relabelId,
        lastLie,
        fix,
      }) ||
      busyRef.current ||
      selectedRef.current ||
      leavingRef.current
    ) {
      return;
    }
    const top = rankedRef.current[0];
    if (!top) return;
    const stepped = stepWalkAway(walkStateRef.current, fix);
    walkStateRef.current = stepped.state;
    if (!stepped.firePin) return;
    const full = clubsRef.current.find((row) => row.id === top.id);
    if (!full) return;
    void markRef.current(full, false, { fixOverride: stepped.firePin, suggested: true });
  }, [fix, withoutGps, relabelId, lastLie]);

  const onLogMissed = () => {
    if (!selected || !id || Number.isNaN(holeNumber)) return;
    const parsed = parseTypedYards(typedYards);
    if (!parsed.ok) {
      Alert.alert('Yards', 'Leave blank or type a whole number.');
      return;
    }
    setBusy(true);
    try {
      addNoGpsShot(db, { roundId: id, holeNumber, clubId: selected.id, typedYards: parsed.yards });
      bump();
      router.back();
    } catch (err) {
      Alert.alert('Couldn’t log shot', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const bag = (
    <View style={styles.bag}>
      {clubs.map((club) => (
        <Pressable
          key={club.id}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void markClub(club)}
          style={[styles.bagCell, selected?.id === club.id && styles.bagCellOn]}>
          <Text numberOfLines={1} style={styles.bagShort}>
            {club.shortName}
          </Text>
          <Text numberOfLines={1} style={styles.bagName}>
            {club.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (!withoutGps && !relabelId) {
    return (
      <Screen scroll={false}>
        {bag}
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>
        {withoutGps ? COPY.forgotShot : COPY.changeClub}
      </Text>
      <Text style={styles.lede}>
        {withoutGps
          ? 'Pick a club, then log it. This doesn’t mark a distance.'
          : 'Where you hit from stays. Only the club changes.'}
      </Text>
      {withoutGps ? null : <Text style={styles.left}>{formatPickerLeftYards(toGreen)}</Text>}
      <View style={styles.navRow}>
        <BigButton
          label={COPY.back}
          variant="ghost"
          style={{ flex: 1 }}
          onPress={() => leavePicker('back')}
        />
        <BigButton
          label={COPY.home}
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => leavePicker('home')}
        />
      </View>

      {withoutGps ? (
        <TextInput
          placeholder="Yards (optional)"
          placeholderTextColor={colors.muted}
          value={typedYards}
          onChangeText={setTypedYards}
          keyboardType="number-pad"
          inputMode="numeric"
          style={styles.yardsInput}
        />
      ) : null}

      {bag}

      {withoutGps ? (
        <BigButton label="Log shot" disabled={busy || !selected} onPress={onLogMissed} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
  lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
  left: { color: colors.lime, fontSize: type.body, fontWeight: '800' },
  navRow: { flexDirection: 'row', gap: 10 },
  headerBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  headerBtnText: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
  warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
  heard: { color: colors.cream, fontSize: type.body, fontWeight: '700' },
  unlock: { color: colors.muted, fontSize: type.meta, fontWeight: '700' },
  yardsInput: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.cream,
    fontSize: 18,
    backgroundColor: colors.bgElevated,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bag: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'stretch' },
  bagCell: {
    width: '25%',
    flexGrow: 1,
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  bagCellOn: { borderColor: colors.lime, borderWidth: 2, backgroundColor: '#1C3A24' },
  bagShort: { color: colors.lime, fontWeight: '900', fontSize: type.chip },
  bagName: { color: colors.cream, fontSize: 10, fontWeight: '700' },
});
