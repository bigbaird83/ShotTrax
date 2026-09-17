import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getHole, listClubAverages, listClubs, listShotsForHole } from '@/src/db/repo';
import { COPY, markedSuggestedMessage } from '@/src/domain/playerCopy';
import { clubToRankInput, lastClosedShotYards, rankTopClubs, resolveDistanceTarget } from '@/src/domain/rankClubs';
import { parseTypedYards } from '@/src/domain/shotSource';
import { selectClubForMark } from '@/src/domain/stickyClub';
import { matchSpokenClub, speechContextualStrings } from '@/src/domain/voiceClub';
import { emptyWalkAway, stepWalkAway } from '@/src/domain/walkAway';
import type { Club, GpsFix } from '@/src/domain/types';
import { yardsToGreen } from '@/src/sensing/api';
import { startClubSpeech, type ClubSpeechSession } from '@/src/services/speechClub';
import { addNoGpsShot, changeShotClub, markShotWithClub, promptForPlan } from '@/src/services/shotActions';
import { getCurrentFix, watchFixes } from '@/src/services/location';
import { useWatchClubList } from '@/src/services/useWatchClubList';
import { BigButton } from '@/src/ui/BigButton';
import { ClubButton } from '@/src/ui/ClubButton';
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
    navigation.setOptions({
      title: withoutGps ? COPY.forgotShot : relabelId ? COPY.changeClub : COPY.pickClub,
    });
  }, [navigation, withoutGps, relabelId]);

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
  const [fix, setFix] = useState(null as Awaited<ReturnType<typeof getCurrentFix>> | null);
  useEffect(() => {
    if (withoutGps) return undefined;
    let live = true;
    getCurrentFix()
      .then((next) => {
        if (live) setFix(next);
      })
      .catch(() => {
        if (live) setFix(null);
      });
    return () => {
      live = false;
    };
  }, [withoutGps, revision]);

  const toGreen = yardsToGreen(withoutGps ? null : fix, green);
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
      readOnly: false,
      bump,
      onMarked: () => {
        if (!withoutGps) router.back();
      },
      labelForClub: (clubId) => clubs.find((club) => club.id === clubId)?.shortName ?? null,
    },
    {
      top3: ranked.map((club) => ({ id: club.id, shortName: club.shortName })),
      bag: clubs.map((club) => ({ id: club.id, shortName: club.shortName })),
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
    const next = selectClubForMark(club, clubs);
    if (!next || !id || Number.isNaN(holeNumber)) return;
    hapticSelect();
    setSelected(next);
    if (relabelId) {
      changeShotClub(db, { roundId: id, shotId: relabelId, clubId: next.id });
      bump();
      router.back();
      return;
    }
    if (withoutGps) return;
    setBusy(true);
    try {
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
        if (opts.suggested) {
          Alert.alert(COPY.suggested, markedSuggestedMessage(next.shortName));
        }
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

  useEffect(() => {
    if (withoutGps || relabelId) return undefined;
    let stop = false;
    let unsub: (() => void) | undefined;
    let state = emptyWalkAway();
    void watchFixes((sample) => {
      if (stop || busyRef.current) return;
      const top = rankedRef.current[0];
      if (!top) return;
      const stepped = stepWalkAway(state, sample);
      state = stepped.state;
      if (!stepped.firePin) return;
      const full = clubsRef.current.find((row) => row.id === top.id);
      if (!full) return;
      void markRef.current(full, false, { fixOverride: stepped.firePin, suggested: true });
    }).then((remove) => {
      if (stop) remove();
      else unsub = remove;
    });
    return () => {
      stop = true;
      unsub?.();
    };
  }, [withoutGps, relabelId]);

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
              <Text style={[styles.chipText, index === 0 && styles.chipPrimaryText]}>{club.shortName}</Text>
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
  chipPrimary: { flex: 1.6, minHeight: 64, borderColor: colors.lime, borderWidth: 2 },
  chipPrimaryText: { fontSize: type.button, color: colors.lime },
  suggest: { color: colors.lime, fontSize: type.tiny, fontWeight: '800' },
  chipText: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
