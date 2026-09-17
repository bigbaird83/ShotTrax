import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getHole, listClubAverages, listClubs, listShotsForHole } from '@/src/db/repo';
import { COPY, formatPickerLeftYards, formatSuggestedClubChip } from '@/src/domain/playerCopy';
import { clubPickLeaveHref, clubPickLeaveRunsAcceptFix, planClubPickLeave } from '@/src/domain/clubPickNav';
import { putterOpensPuttSheet } from '@/src/domain/putts';
import { clubToRankInput, lastClosedShotYards, rankDistanceYards, rankTopClubs, resolveDistanceTarget } from '@/src/domain/rankClubs';
import { parseTypedYards } from '@/src/domain/shotSource';
import { selectClubForMark } from '@/src/domain/stickyClub';
import { matchSpokenClub, speechContextualStrings } from '@/src/domain/voiceClub';
import { emptyWalkAway, stepWalkAway, walkAwayEligible } from '@/src/domain/walkAway';
import type { Club, GpsFix } from '@/src/domain/types';
import { yardsToGreen } from '@/src/sensing/api';
import { startClubSpeech, type ClubSpeechSession } from '@/src/services/speechClub';
import { addNoGpsShot, changeShotClub, markShotWithClub, promptForPlan } from '@/src/services/shotActions';
import { useLiveFix } from '@/src/services/useLiveFix';
import { useWatchClubList } from '@/src/services/useWatchClubList';
import { BigButton } from '@/src/ui/BigButton';
import { ClubButton } from '@/src/ui/ClubButton';
import { hapticMark, hapticSelect, hapticWarn } from '@/src/ui/haptics';
import { Screen } from '@/src/ui/Screen';
import { colors, tapTarget, type } from '@/src/ui/theme';

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
  const shots = useMemo(
    () => (holeRow ? listShotsForHole(db, holeRow.id) : []),
    [db, holeRow, revision],
  );
  const averages = useMemo(() => listClubAverages(db).filter((row) => row.club.enabled), [db, revision]);

  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Club | null>(null);
  const [typedYards, setTypedYards] = useState('');
  const sessionRef = useRef<ClubSpeechSession | null>(null);
  const voiceCommitted = useRef(false);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      leavingRef.current = true;
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    navigation.setOptions({
      title: withoutGps ? COPY.forgotShot : relabelId ? COPY.changeClub : COPY.pickClub,
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

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  const green =
    holeRow?.greenLat != null && holeRow.greenLng != null
      ? { lat: holeRow.greenLat, lng: holeRow.greenLng }
      : null;
  const fix = useLiveFix(!withoutGps);

  const toGreen = yardsToGreen(withoutGps ? null : fix, green);
  const target = resolveDistanceTarget({
    toGreen,
    lastClosedYards: lastClosedShotYards(shots),
  });
  const ranked = rankTopClubs(
    averages.map((row) => clubToRankInput(row.club, row)),
    target,
  );
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
      bump,
      onMarked: () => {
        if (!withoutGps) router.back();
      },
      onPutter: () => {
        router.replace(`/round/${id}/hole/${holeNumber}?putts=1`);
      },
      onLeave: (action) => leavePicker(action),
      labelForClub: (clubId) => clubs.find((club) => club.id === clubId)?.shortName ?? null,
    },
    {
      top3: ranked.map((club) => ({
        id: club.id,
        shortName: formatSuggestedClubChip(club.shortName, rankDistanceYards(club)),
      })),
      bag: clubs.map((club) => {
        const row = averages.find((item) => item.club.id === club.id);
        const carry = row ? rankDistanceYards(clubToRankInput(row.club, row)) : null;
        return { id: club.id, shortName: formatSuggestedClubChip(club.shortName, carry) };
      }),
      holeNumber,
      yardsToGreen: toGreen.yards,
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

  const applyTranscript = (text: string, isFinal: boolean) => {
    setHeard(text);
    const matched = matchSpokenClub(text, clubs);
    if (matched) {
      setVoiceError(null);
      if (withoutGps) {
        setSelected(matched);
        if (isFinal) {
          sessionRef.current?.stop();
          sessionRef.current = null;
          setListening(false);
        }
        return;
      }
      if (voiceCommitted.current) return;
      voiceCommitted.current = true;
      sessionRef.current?.stop();
      sessionRef.current = null;
      setListening(false);
      void markClub(matched);
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
    voiceCommitted.current = false;
    setVoiceError(null);
    setHeard(null);
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

  return (
    <Screen>
      <Text style={styles.title}>
        {withoutGps ? COPY.forgotShot : relabelId ? COPY.changeClub : COPY.pickClub}
      </Text>
      <Text style={styles.lede}>
        {withoutGps
          ? 'Pick a club, then log it. This doesn’t mark a distance.'
          : relabelId
            ? 'Where you hit from stays. Only the club changes.'
            : COPY.pickClubLede}
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

      <BigButton
        label={listening ? COPY.listening : COPY.sayClub}
        variant="secondary"
        disabled={busy}
        onPress={() => void onListen()}
      />
      {heard ? <Text style={styles.heard}>“{heard}”</Text> : null}
      {voiceError ? <Text style={styles.warn}>{voiceError}</Text> : null}

      {ranked.length > 0 ? (
        <View style={styles.top3}>
          {ranked.map((club, index) => (
            <Pressable
              key={club.id}
              disabled={busy}
              onPress={() => {
                const full = clubs.find((row) => row.id === club.id);
                if (full) void markClub(full);
              }}
              style={[
                styles.chip,
                index === 0 && styles.chipPrimary,
                selected?.id === club.id && styles.chipOn,
              ]}>
              <Text style={[styles.chipText, index === 0 && styles.chipPrimaryText]}>
                {formatSuggestedClubChip(club.shortName, rankDistanceYards(club))}
              </Text>
              {index === 0 ? <Text style={styles.suggest}>{COPY.suggested}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.unlock}>{COPY.top3Unlock}</Text>
      )}

      <View style={styles.grid}>
        {clubs.map((club) => (
          <ClubButton
            key={club.id}
            selected={selected?.id === club.id}
            disabled={busy}
            shortName={club.shortName}
            name={club.name}
            onPress={() => void markClub(club)}
          />
        ))}
      </View>

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
  top3: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  chipOn: { borderColor: colors.lime, backgroundColor: '#1C3A24' },
  chipPrimary: {
    flex: 2.2,
    minHeight: tapTarget,
    borderColor: colors.lime,
    borderWidth: 2,
    backgroundColor: '#1C3A24',
  },
  chipPrimaryText: { fontSize: type.button, color: colors.lime, fontWeight: '900' },
  suggest: { color: colors.lime, fontSize: type.tiny, fontWeight: '800' },
  chipText: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
