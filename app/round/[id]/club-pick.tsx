import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getHole, listClubAverages, listClubs, listShotsForHole } from '@/src/db/repo';
import { clubToRankInput, lastClosedShotYards, rankTopClubs, resolveDistanceTarget } from '@/src/domain/rankClubs';
import { parseTypedYards } from '@/src/domain/shotSource';
import { matchSpokenClub, speechContextualStrings } from '@/src/domain/voiceClub';
import type { Club, GpsFix } from '@/src/domain/types';
import { measureYardsToGreen } from '@/src/domain/yardsToGreen';
import { speechRecognitionAvailable, startClubSpeech, type ClubSpeechSession } from '@/src/services/speechClub';
import { getCurrentFix } from '@/src/services/location';
import { addNoGpsShot, markShotWithClub, promptForPlan } from '@/src/services/shotActions';
import { BigButton } from '@/src/ui/BigButton';
import { ClubButton } from '@/src/ui/ClubButton';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

export default function ClubPickScreen() {
  const { id, hole, noGps } = useLocalSearchParams<{ id: string; hole: string; noGps?: string }>();
  const holeNumber = Number(hole);
  const withoutGps = noGps === '1';
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
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [proposed, setProposed] = useState<Club | null>(null);
  const [typedYards, setTypedYards] = useState('');
  const sessionRef = useRef<ClubSpeechSession | null>(null);
  const voiceReady = speechRecognitionAvailable();

  useEffect(() => {
    navigation.setOptions({ title: withoutGps ? 'No GPS shot' : 'Pick club' });
  }, [navigation, withoutGps]);

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
  }, [revision, withoutGps]);

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
  const toGreen = measureYardsToGreen({
    from: fix,
    green,
    accuracyM: fix?.accuracyM,
  });
  const target = resolveDistanceTarget({
    from: fix,
    green,
    lastClosedYards: lastClosedShotYards(shots),
  });
  const ranked = rankTopClubs(
    averages.map((row) => clubToRankInput(row.club, row)),
    target,
  );
  const showBag = bagOpen || ranked.length === 0;

  const onPick = async (clubId: string, force = false) => {
    if (!id || Number.isNaN(holeNumber)) return;
    setBusy(true);
    try {
      if (withoutGps) {
        const parsed = parseTypedYards(typedYards);
        if (!parsed.ok) {
          Alert.alert('Yards', 'Leave yards blank or type a whole number from 0–999. This is not GPS.');
          return;
        }
        addNoGpsShot(db, { roundId: id, holeNumber, clubId, typedYards: parsed.yards });
        bump();
        router.back();
        return;
      }
      const { plan } = await markShotWithClub(db, {
        roundId: id,
        holeNumber,
        clubId,
        force,
      });
      const waiting = promptForPlan(plan, () => {
        void onPick(clubId, true);
      });
      if (!waiting && plan.status === 'commit') {
        bump();
        router.back();
      }
    } catch (err) {
      Alert.alert(
        withoutGps ? 'Could not add shot' : 'Could not mark shot',
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  };

  const applyTranscript = (text: string, isFinal: boolean) => {
    setHeard(text);
    const matched = matchSpokenClub(text, clubs);
    if (matched) {
      setProposed(matched);
      setVoiceError(null);
      if (isFinal) {
        sessionRef.current?.stop();
        sessionRef.current = null;
        setListening(false);
      }
      return;
    }
    if (isFinal) {
      setProposed(null);
      setVoiceError('Didn’t catch a club. Try “seven iron” or tap below. Confirm is still required.');
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

  const targetLabel = !target
    ? 'No green pin and no closed shot on this hole yet — full bag.'
    : target.source === 'yards_to_green'
      ? `${target.dYards} yd to green${toGreen.available && toGreen.accuracyClass === 'soft' ? ' · SOFT GPS' : ''}`
      : `Last closed shot ${target.dYards} yd`;

  return (
    <Screen>
      <Text style={styles.kicker}>{withoutGps ? 'No GPS' : 'Mark shot'}</Text>
      <Text style={styles.title}>{withoutGps ? 'Forgotten swing' : 'Pick a club'}</Text>
      <Text style={styles.lede}>
        {withoutGps
          ? 'Logs a stroke with fixQuality none and no coordinates. Optional typed yards are a score/UI note only — they never enter club averages or top-3. ShotTrax will not invent a GPS fix or call acceptFix.'
          : 'Tap a club to confirm GPS now as the start (and the previous shot’s end). Voice names a club but still needs Confirm. Watch / mic shot-detect assists are not in this build.'}
      </Text>

      {withoutGps ? (
        <View style={styles.voiceBox}>
          <Text style={styles.label}>Optional yards (typed)</Text>
          <TextInput
            placeholder="Blank = no yards"
            placeholderTextColor={colors.muted}
            value={typedYards}
            onChangeText={setTypedYards}
            keyboardType="number-pad"
            inputMode="numeric"
            style={styles.yardsInput}
          />
          <Text style={styles.tiny}>
            Typed yards are score/UI only. They are not GPS distance and are excluded from averages
            and top-3. There is no toggle to include them.
          </Text>
        </View>
      ) : null}

      <View style={styles.voiceBox}>
        <BigButton
          label={listening ? 'Listening… tap to stop' : voiceReady ? 'Say a club' : 'Say a club (needs dev build)'}
          variant="secondary"
          disabled={busy}
          onPress={() => void onListen()}
        />
        {heard ? <Text style={styles.heard}>Heard: “{heard}”</Text> : null}
        {voiceError ? <Text style={styles.warn}>{voiceError}</Text> : null}
        {proposed ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.propose}>
              {proposed.shortName} · {proposed.name} — confirm to mark
            </Text>
            <BigButton
              label={`Confirm ${proposed.shortName}${withoutGps ? ' (no GPS)' : ''}`}
              disabled={busy}
              onPress={() => void onPick(proposed.id)}
            />
          </View>
        ) : (
          <Text style={styles.tiny}>
            Examples: “seven iron”, “driver”, “sand wedge”. Big tap targets stay below if speech misses.
          </Text>
        )}
      </View>

      <Text style={styles.label}>Top 3</Text>
      <Text style={styles.meta}>{targetLabel}</Text>
      {ranked.length === 0 ? (
        <Text style={styles.muted}>
          Ranking needs a distance D and ≥5 closed GPS shots with yards on a club. Soft and forced
          count; no-GPS shots and penalties do not. Full bag is one tap away.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {ranked.map((club) => (
            <ClubButton
              key={club.id}
              featured
              disabled={busy}
              shortName={club.shortName}
              name={club.name}
              meta={`${Math.round(club.avgYards)} yd avg · ${Math.round(club.deltaYards)} yd off`}
              onPress={() => void onPick(club.id)}
            />
          ))}
        </View>
      )}

      {ranked.length > 0 ? (
        <BigButton
          label={showBag ? 'Hide full bag' : 'Full bag'}
          variant="ghost"
          onPress={() => setBagOpen((open) => !open)}
        />
      ) : null}

      {showBag ? (
        <>
          <Text style={styles.label}>Full bag</Text>
          <View style={styles.grid}>
            {clubs.map((club) => (
              <ClubButton
                key={club.id}
                disabled={busy}
                shortName={club.shortName}
                name={club.name}
                onPress={() => void onPick(club.id)}
              />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { color: colors.amber, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.cream, fontSize: 28, fontWeight: '900' },
  lede: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  label: { color: colors.cream, fontSize: 14, fontWeight: '800', letterSpacing: 0.6, marginTop: 4 },
  meta: { color: colors.muted, fontSize: 14 },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 20 },
  tiny: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  warn: { color: colors.orange, fontSize: 15, fontWeight: '700' },
  heard: { color: colors.cream, fontSize: 16, fontWeight: '700' },
  propose: { color: colors.lime, fontSize: 18, fontWeight: '800' },
  voiceBox: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  yardsInput: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    color: colors.cream,
    fontSize: 18,
    backgroundColor: colors.bg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
