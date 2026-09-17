import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getHole, listClubAverages, listClubs, listShotsForHole, setRoundLastClub } from '@/src/db/repo';
import { COPY } from '@/src/domain/playerCopy';
import { clubToRankInput, lastClosedShotYards, rankTopClubs, resolveDistanceTarget } from '@/src/domain/rankClubs';
import { parseTypedYards } from '@/src/domain/shotSource';
import { selectClubForMark } from '@/src/domain/stickyClub';
import { matchSpokenClub, speechContextualStrings } from '@/src/domain/voiceClub';
import type { Club } from '@/src/domain/types';
import { yardsToGreen } from '@/src/sensing/api';
import { speechRecognitionAvailable, startClubSpeech, type ClubSpeechSession } from '@/src/services/speechClub';
import { getCurrentFix } from '@/src/services/location';
import { addNoGpsShot } from '@/src/services/shotActions';
import { BigButton } from '@/src/ui/BigButton';
import { ClubButton } from '@/src/ui/ClubButton';
import { hapticSelect } from '@/src/ui/haptics';
import { Screen } from '@/src/ui/Screen';
import { colors, type } from '@/src/ui/theme';

export default function ClubPickScreen() {
  const { id, hole, noGps, mode } = useLocalSearchParams<{
    id: string;
    hole: string;
    noGps?: string;
    mode?: string;
  }>();
  const holeNumber = Number(hole);
  const withoutGps = noGps === '1';
  const selectOnly = mode === 'select' || !withoutGps;
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
  const voiceReady = speechRecognitionAvailable();

  useEffect(() => {
    navigation.setOptions({ title: withoutGps ? COPY.forgotShot : COPY.bag });
  }, [navigation, withoutGps]);

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

  const choose = (club: Club) => {
    const next = selectClubForMark(club, clubs);
    if (!next || !id) return;
    hapticSelect();
    setSelected(next);
    setRoundLastClub(db, id, next.id);
    bump();
    if (selectOnly && !withoutGps) {
      router.back();
    }
  };

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
      if (isFinal) {
        sessionRef.current?.stop();
        sessionRef.current = null;
        setListening(false);
        choose(matched);
      } else {
        setSelected(matched);
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
      <Text style={styles.title}>{withoutGps ? COPY.forgotShot : COPY.fullBag}</Text>
      <Text style={styles.lede}>
        {withoutGps
          ? 'Pick a club, then log it. This doesn’t mark a distance.'
          : 'Tap a club to use it. Mark still happens on the hole.'}
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
        label={listening ? COPY.listening : voiceReady ? COPY.sayClub : COPY.sayClub}
        variant="secondary"
        disabled={busy}
        onPress={() => void onListen()}
      />
      {heard ? <Text style={styles.heard}>“{heard}”</Text> : null}
      {voiceError ? <Text style={styles.warn}>{voiceError}</Text> : null}

      {ranked.length > 0 ? (
        <>
          <Text style={styles.label}>{COPY.top3}</Text>
          {ranked.map((club) => (
            <ClubButton
              key={club.id}
              featured
              selected={selected?.id === club.id}
              disabled={busy}
              shortName={club.shortName}
              name={club.name}
              meta={`${Math.round(club.avgYards)} yd`}
              onPress={() => {
                const full = clubs.find((row) => row.id === club.id);
                if (full) choose(full);
              }}
            />
          ))}
        </>
      ) : null}

      <Text style={styles.label}>{COPY.fullBag}</Text>
      <View style={styles.grid}>
        {clubs.map((club) => (
          <ClubButton
            key={club.id}
            selected={selected?.id === club.id}
            disabled={busy}
            shortName={club.shortName}
            name={club.name}
            onPress={() => choose(club)}
          />
        ))}
      </View>

      {withoutGps ? (
        <BigButton
          label="Log shot"
          disabled={busy || !selected}
          onPress={onLogMissed}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
  lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
  label: { color: colors.cream, fontSize: type.meta, fontWeight: '800', marginTop: 4 },
  warn: { color: colors.orange, fontSize: type.meta, fontWeight: '700' },
  heard: { color: colors.cream, fontSize: type.body, fontWeight: '700' },
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
});
