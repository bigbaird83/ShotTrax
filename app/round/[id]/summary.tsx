import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { findNodeHandle, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatParLabel, formatSiLabel, formatTeeMeta } from '@/src/course/layout';
import { useDb } from '@/src/db/DbProvider';
import { listGroupPlayers } from '@/src/db/groupRepo';
import { getClubMap, getRound, listHoles, listPenaltiesForHole, listShotsForHole } from '@/src/db/repo';
import { finishedHoleDisplayScore } from '@/src/domain/holeScore';
import { formatPenaltyRow, totalPenaltyStrokes } from '@/src/domain/penalty';
import {
  formatHoleCountLine,
  formatShotStepChip,
  orderHoleSteps,
  penaltiesMissingFromSteps,
} from '@/src/domain/penaltySteps';
import { COPY, holeOutClosedOnShot } from '@/src/domain/playerCopy';
import { holeClosedByShot } from '@/src/domain/putts';
import { formatHoleTimeSpan, formatRoundPaceLine, planLivePace } from '@/src/domain/livePace';
import { planScorecardAudienceChoices } from '@/src/domain/shareChoice';
import { toastFromShareAttempt } from '@/src/domain/spectator';
import { shareRoundSnapshot } from '@/src/services/shareRound';
import { reconcileHoleScore } from '@/src/domain/scoreReconcile';
import { BigButton } from '@/src/ui/BigButton';
import { ScorecardImageShareButton } from '@/src/ui/ShareChoice';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

export default function RoundSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [toast, setToast] = useState<string | null>(null);
  const shareAnchorRef = useRef<View>(null);
  const partnerCount = useMemo(
    () => listGroupPlayers(db, id).filter((player) => !player.isMe).length,
    [db, id, revision],
  );
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const holes = useMemo(() => (round ? listHoles(db, round.id) : []), [db, round, revision]);
  const clubs = useMemo(() => getClubMap(db), [db, revision]);

  if (!round) {
    return (
      <Screen>
        <Text style={styles.muted}>Round not found.</Text>
      </Screen>
    );
  }

  const holeViews = holes.map((hole) => {
    const shots = listShotsForHole(db, hole.id);
    const penalties = listPenaltiesForHole(db, hole.id);
    const penStrokes = totalPenaltyStrokes(penalties);
    const displayScore = hole.puttsDone
      ? finishedHoleDisplayScore({
          score: hole.score,
          shotCount: shots.length,
          putts: hole.putts,
          penaltyStrokes: penStrokes,
        })
      : hole.score;
    return { hole, shots, penalties, penStrokes, displayScore };
  });
  const scored = holeViews.filter((row) => row.displayScore != null);
  const withPar = scored.filter((row) => row.hole.par != null);
  const total = scored.reduce((sum, row) => sum + (row.displayScore ?? 0), 0);
  const toPar = withPar.reduce((sum, row) => sum + ((row.displayScore ?? 0) - (row.hole.par ?? 0)), 0);
  const toParLabel =
    withPar.length === 0 ? '—' : toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;
  const pace = planLivePace({
    holes: holes.map((hole) => ({
      hole: hole.number,
      score: hole.score,
      par: hole.par,
      startedAt: hole.startedAt,
      completedAt: hole.completedAt,
    })),
    nowMs: Date.now(),
    finished: round.finishedAt != null,
  });
  const paceLine = formatRoundPaceLine(pace);

  return (
    <Screen>
      <Text style={styles.kicker}>{round.finishedAt ? 'Finished' : 'In progress'}</Text>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
      {round.teeName ? (
        <Text style={styles.muted}>
          {formatTeeMeta({
            name: round.teeName,
            rating: round.teeRating,
            slope: round.teeSlope,
            totalYards: round.teeTotalYards,
          })}
        </Text>
      ) : null}
      <Text style={styles.total}>
        {scored.length ? total : '—'}{' '}
        <Text style={styles.toPar}>{toParLabel}</Text>
      </Text>
      <Text style={styles.muted}>
        {scored.length} of {round.holeCount} holes scored.
      </Text>
      {paceLine ? (
        <Text style={styles.pace} testID="round-pace">
          {COPY.paceOfPlay}: {paceLine}
        </Text>
      ) : null}

      {holeViews.map(({ hole, shots, penalties, penStrokes, displayScore }) => {
        const closedGps = shots.filter(
          (s) => (s.source === 'gps' || s.source === 'placed') && s.distanceYards != null,
        );
        const yards = closedGps.reduce((sum, h) => sum + (h.distanceYards ?? 0), 0);
        const mismatch = reconcileHoleScore({
          score: displayScore,
          shotCount: shots.length,
          puttCount: hole.putts,
          penaltyStrokes: penStrokes,
        }).mismatch;
        const closer = holeClosedByShot(shots);
        const timeSpan = formatHoleTimeSpan(hole);
        const steps = orderHoleSteps(shots, penalties);
        const inlinePenalty = steps.some((step) => step.kind === 'penalty');
        const tagPenalties = penaltiesMissingFromSteps(penalties, steps);
        const shotBits = [
          formatHoleCountLine({
            shotCount: shots.length,
            penaltyStrokes: penStrokes,
            puttCount: hole.putts,
            omitZeroPutts: true,
          }),
          closedGps.length ? `${yards} yd` : null,
        ].filter(Boolean);
        return (
          <Pressable
            key={hole.id}
            onPress={() => router.push(`/round/${id}/hole/${hole.number}`)}
            style={styles.row}>
            <Text style={styles.holeNum}>{hole.number}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.holeTitle}>
                {formatParLabel(hole.par)} · {formatSiLabel(hole.handicap)}
                {hole.yards != null ? ` · ${hole.yards} yd` : ''}
              </Text>
              <Text style={styles.muted}>{shotBits.join(' · ')}</Text>
              {inlinePenalty ? (
                <View testID="summary-hole-steps">
                  {steps.map((step) => {
                    if (step.kind === 'penalty') {
                      return (
                        <Text key={`penalty-${step.sourceIndex}`} style={styles.penalty}>
                          {step.label}
                        </Text>
                      );
                    }
                    const shot = shots[step.sourceIndex];
                    if (!shot) return null;
                    return (
                      <Text key={shot.id} style={styles.muted}>
                        {formatShotStepChip({
                          seq: shot.seq,
                          clubShortName: shot.clubId ? clubs[shot.clubId]?.shortName : null,
                          source: shot.source,
                          fixQuality: shot.fixQuality,
                          endedAt: shot.endedAt,
                          distanceYards: shot.distanceYards,
                        })}
                      </Text>
                    );
                  })}
                </View>
              ) : null}
              {timeSpan ? <Text style={styles.time}>{timeSpan}</Text> : null}
              {closer ? (
                <Text style={styles.holeOutLine} testID="hole-out-summary">
                  {holeOutClosedOnShot(closer.seq)}
                </Text>
              ) : null}
              {tagPenalties.length > 0 ? (
                <Text style={styles.penalty}>
                  {tagPenalties.map((p) => formatPenaltyRow(p)).join(' · ')}
                </Text>
              ) : null}
              {mismatch ? (
                <Text style={styles.warn}>
                  Score {displayScore} doesn’t match {shots.length} shots + {penStrokes} penalties.
                </Text>
              ) : null}
            </View>
            <Text style={styles.score}>{displayScore ?? '—'}</Text>
          </Pressable>
        );
      })}

      <BigButton
        label={COPY.nerdOut}
        variant="secondary"
        onPress={() => router.push({ pathname: '/nerd-out', params: { roundId: id } })}
      />
      <BigButton
        label={COPY.group}
        variant="secondary"
        onPress={() => router.push(`/round/${id}/group`)}
      />
      <BigButton
        label={COPY.liveBoard}
        variant="secondary"
        onPress={() => router.push(`/round/${id}/board`)}
      />
      <View ref={shareAnchorRef} collapsable={false}>
        <ScorecardImageShareButton
          label={COPY.share}
          variant="secondary"
          choices={planScorecardAudienceChoices(partnerCount)}
          onShare={(audience) => {
            const anchor = findNodeHandle(shareAnchorRef.current);
            void toastFromShareAttempt(
              () => shareRoundSnapshot(db, id, { anchor, audience }),
              COPY.shareScorecardFail,
            ).then((fail) => {
              if (fail) setToast(fail);
            });
          }}
        />
      </View>
      {toast ? <Text style={styles.warn}>{toast}</Text> : null}
      <BigButton label={COPY.home} variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
  kicker: { color: colors.muted, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.cream, fontSize: 28, fontWeight: '900' },
  total: { color: colors.cream, fontSize: 48, fontWeight: '900' },
  toPar: { color: colors.cream, fontSize: 28, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 16 },
  pace: { color: colors.cream, fontSize: 16, fontWeight: '700' },
  time: { color: colors.muted, fontSize: 13 },
  holeOutLine: { color: colors.lime, fontSize: 13, fontWeight: '800' },
  penalty: { color: colors.amber, fontSize: 14, fontWeight: '700' },
  warn: { color: colors.orange, fontSize: 13, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgElevated,
    padding: 12,
    borderRadius: 14,
    minHeight: 64,
  },
  holeNum: { color: colors.cream, fontSize: 22, fontWeight: '900', width: 28 },
  holeTitle: { color: colors.cream, fontSize: 18, fontWeight: '700' },
  score: { color: colors.cream, fontSize: 24, fontWeight: '900' },
  });
}
