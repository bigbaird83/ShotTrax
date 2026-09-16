import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getHole, listClubAverages, listClubs, listShotsForHole } from '@/src/db/repo';
import { clubToRankInput, lastClosedShotYards, rankTopClubs, resolveDistanceTarget } from '@/src/domain/rankClubs';
import { matchSpokenClub, speechContextualStrings } from '@/src/domain/voiceClub';
import type { Club } from '@/src/domain/types';
import { speechRecognitionAvailable, startClubSpeech, type ClubSpeechSession } from '@/src/services/speechClub';
import { getCurrentFix } from '@/src/services/location';
import { markShotWithClub, promptForPlan } from '@/src/services/shotActions';
import { BigButton } from '@/src/ui/BigButton';
import { ClubButton } from '@/src/ui/ClubButton';
import { Screen } from '@/src/ui/Screen';
import { colors } from '@/src/ui/theme';

export default function ClubPickScreen() {
  const { id, hole } = useLocalSearchParams<{ id: string; hole: string }>();
  const holeNumber = Number(hole);
  const { db, revision, bump } = useDb();
  const clubs = useMemo(() => listClubs(db, true), [db, revision]);
  const holeRow = useMemo(() => getHole(db, id, holeNumber), [db, id, holeNumber, revision]);
  const shots = useMemo(
    () => (holeRow ? listShotsForHole(db, holeRow.id) : []),
    [db, holeRow, revision],
  );
  const averages = useMemo(() => listClubAverages(db).filter((row) => row.club.enabled), [db, revision]);

  const [busy, setBusy] = useState(false);
  const [fix, setFix] = useState<{ lat: number; lng: number } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [proposed, setProposed] = useState<Club | null>(null);
  const sessionRef = useRef<ClubSpeechSession | null>(null);
  const voiceReady = speechRecognitionAvailable();

  useEffect(() => {
    let live = true;
    getCurrentFix()
      .then((next) => {
        if (live) setFix({ lat: next.lat, lng: next.lng });
      })
      .catch(() => {
        if (live) setFix(null);
      });
    return () => {
      live = false;
    };
  }, [revision]);

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
      Alert.alert('Could not mark shot', err instanceof Error ? err.message : 'Unknown error');
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
      ? `${target.dYards} yd to green`
      : `Last closed shot ${target.dYards} yd`;

  return (
    <Screen>
      <Text style={styles.kicker}>Mark shot</Text>
      <Text style={styles.title}>Pick a club</Text>
      <Text style={styles.lede}>
        Tap a club to confirm GPS now as the start (and the previous shot’s end). Voice names a club
        but still needs Confirm. Watch / mic shot-detect assists are not in this build.
      </Text>

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
              label={`Confirm ${proposed.shortName}`}
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
          Ranking needs a distance D and ≥5 closed shots with yards on a club. Soft and forced shots
          count. Full bag is one tap away.
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
