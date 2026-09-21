import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCourseDataClient } from '@/src/course/client';
import { formatParLabel } from '@/src/course/layout';
import { teePointForHole, teePointFromHoleFeature } from '@/src/course/osmOverlay';
import type { OsmOverlay } from '@/src/course/types';
import { useDb } from '@/src/db/DbProvider';
import { getRound, listClubAverages, listHoles, listRounds, listShotsForHole } from '@/src/db/repo';
import { lockHoleCamera, resolveHoleTee, shotPinsForHoleCamera } from '@/src/domain/holeCamera';
import { planNerdOut, planNerdOutLifetime } from '@/src/domain/nerdOut';
import { COPY } from '@/src/domain/playerCopy';
import { scorecardDiffLabel } from '@/src/domain/scorecard';
import { useLiveFix } from '@/src/services/useLiveFix';
import { HoleMap } from '@/src/ui/HoleMap';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

const NERD_TRAIL_TO_GREEN = { yards: null, quality: 'none' as const };

function formatToPar(toPar: number | null): string {
  return scorecardDiffLabel(toPar) ?? '—';
}

export default function NerdOutScreen() {
  const { roundId } = useLocalSearchParams<{ roundId?: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [osmOverlay, setOsmOverlay] = useState<OsmOverlay | null>(null);
  const round = useMemo(
    () => (roundId ? getRound(db, roundId) : null),
    [db, roundId, revision],
  );
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);
  const averages = useMemo(() => listClubAverages(db), [db, revision]);
  const rounds = useMemo(() => listRounds(db), [db, revision]);
  const fix = useLiveFix(true);
  const clubRows = useMemo(
    () =>
      averages.map((row) => ({
        id: row.club.id,
        name: row.club.name,
        shortName: row.club.shortName,
        count: row.count,
        avgYards: row.avgYards,
        typicalCarryYards: row.typicalCarryYards,
        carrySource: row.carrySource,
      })),
    [averages],
  );
  const nerd = useMemo(
    () =>
      planNerdOut({
        holeScores: holes.map((hole) => hole.score),
        holePutts: holes.map((hole) => hole.putts),
        holePars: holes.map((hole) => hole.par),
        clubs: clubRows,
      }),
    [holes, clubRows],
  );
  const lifetime = useMemo(
    () =>
      planNerdOutLifetime(
        rounds.map((row) => {
          const roundHoles = listHoles(db, row.id);
          return {
            finished: row.finishedAt != null,
            holePutts: roundHoles.map((hole) => hole.putts),
            holeScores: roundHoles.map((hole) => hole.score),
          };
        }),
      ),
    [db, rounds],
  );

  useEffect(() => {
    if (!round) {
      setOsmOverlay(null);
      return;
    }
    const location =
      round.courseLat != null && round.courseLng != null
        ? { lat: round.courseLat, lng: round.courseLng }
        : null;
    if (!location) {
      setOsmOverlay(null);
      return;
    }
    let live = true;
    void getCourseDataClient()
      .fetchOsmOverlay({
        courseId: round.courseApiId,
        location,
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
  }, [round]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text style={styles.kicker}>{COPY.nerdOut}</Text>
        <Text style={styles.muted}>{COPY.nerdOutLede}</Text>
        <Text style={styles.hint}>{COPY.nerdOutLimits}</Text>

        {round ? (
          <View style={styles.block}>
            <Text style={styles.section}>{COPY.nerdOutThisRound}</Text>
            <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
            <Text style={styles.label}>{COPY.score}</Text>
            <Text style={styles.value}>{nerd.score ?? '—'}</Text>
            <Text style={styles.label}>{COPY.nerdOutVsPar}</Text>
            <Text style={styles.value}>{formatToPar(nerd.toPar)}</Text>
            <Text style={styles.label}>{COPY.putts}</Text>
            <Text style={styles.value}>{nerd.putts}</Text>
            <Text style={styles.label}>{COPY.nerdOutPuttsPerHole}</Text>
            <Text style={styles.value}>{nerd.puttsPerHole ?? '—'}</Text>
            <Text style={styles.muted}>
              {nerd.marks.eagle} eagle · {nerd.marks.birdie} birdie · {nerd.marks.par} par · {nerd.marks.bogey} bogey · {nerd.marks.double} double+
            </Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.section}>{COPY.nerdOutLifetime}</Text>
          <Text style={styles.label}>{COPY.nerdOutFinishedRounds}</Text>
          <Text style={styles.value}>{lifetime.finishedRounds}</Text>
          <Text style={styles.label}>{COPY.nerdOutPuttsPerRound}</Text>
          <Text style={styles.value}>{lifetime.puttsPerRound ?? '—'}</Text>
          <Text style={styles.muted}>{lifetime.scoredHoles} holes scored.</Text>
        </View>

        {round
          ? holes.map((hole) => {
              const shots = listShotsForHole(db, hole.id);
              const green =
                hole.greenLat != null && hole.greenLng != null
                  ? { lat: hole.greenLat, lng: hole.greenLng }
                  : null;
              const camera = lockHoleCamera({
                tee: resolveHoleTee({
                  holeTee: teePointFromHoleFeature(osmOverlay, hole.number, green),
                  osmTee: teePointForHole(osmOverlay, hole.number),
                  green,
                }),
                green,
                shotPins: shotPinsForHoleCamera(shots),
                phone: fix ? { lat: fix.lat, lng: fix.lng } : null,
              });
              if (!camera) return null;
              return (
                <View key={`trail-${hole.id}`} style={styles.trail}>
                  <Text style={styles.label}>
                    {formatParLabel(hole.par)} · Hole {hole.number}
                  </Text>
                  <HoleMap
                    holeNumber={hole.number}
                    shots={shots}
                    userFix={fix}
                    green={green}
                    yardsToGreen={NERD_TRAIL_TO_GREEN}
                    osmOverlay={osmOverlay}
                    lockFrame
                    hideYardsOverlay
                    frameEpoch={`nerd-${hole.number}`}
                    heading={camera.heading}
                    framePoints={camera.points.map((point) => ({
                      latitude: point.lat,
                      longitude: point.lng,
                    }))}
                  />
                </View>
              );
            })
          : null}

        {nerd.clubs.map((row) => (
          <View key={row.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.holeTitle}>{row.name}</Text>
              <Text style={styles.muted}>
                {row.kind === 'live'
                  ? `${row.count} shot${row.count === 1 ? '' : 's'}`
                  : row.kind === 'estimated'
                    ? COPY.estimated
                    : row.kind === 'typed'
                      ? COPY.typicalCarry
                      : COPY.noClosedShots}
              </Text>
            </View>
            <Text style={styles.score}>{row.yards != null ? `${row.yards}` : '—'}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    pad: { paddingBottom: 40, gap: 10 },
    kicker: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
    title: { color: colors.cream, fontSize: 28, fontWeight: '900' },
    section: { color: colors.cream, fontSize: 18, fontWeight: '800' },
    label: { color: colors.muted, fontSize: 14, fontWeight: '800' },
    value: { color: colors.cream, fontSize: 36, fontWeight: '900' },
    muted: { color: colors.muted, fontSize: 16 },
    hint: { color: colors.muted, fontSize: 14 },
    block: { gap: 6, backgroundColor: colors.bgElevated, padding: 14, borderRadius: 16 },
    trail: { gap: 8 },
    holeTitle: { color: colors.cream, fontSize: 18, fontWeight: '700' },
    score: { color: colors.cream, fontSize: 24, fontWeight: '900' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.bgElevated,
      padding: 12,
      borderRadius: 14,
      minHeight: 64,
    },
  });
}
