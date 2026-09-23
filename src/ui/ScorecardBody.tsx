import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COPY } from '@/src/domain/playerCopy';
import {
  planScorecard,
  scorecardDiff,
  scorecardDiffLabel,
  scorecardDiffTone,
  scorecardIncompleteMark,
  scorecardMarkGlyph,
  type ScorecardHole,
} from '@/src/domain/scorecard';
import type { ShareKind } from '@/src/domain/shareChoice';
import { BigButton } from './BigButton';
import { ShareChoice } from './ShareChoice';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

type HoleIn = {
  number: number;
  par: number | null;
  score: number | null;
  putts: number;
  puttsDone?: boolean;
  shotCount?: number;
  penaltyStrokes?: number;
};

export function ScorecardBody({
  holes,
  currentHoleNumber,
  onBack,
  onShare,
  onNerdOut,
  onSelectHole,
}: {
  holes: HoleIn[];
  currentHoleNumber?: number;
  onBack: () => void;
  onShare?: (kind: ShareKind) => void;
  onNerdOut?: () => void;
  onSelectHole?: (holeNumber: number) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rows: ScorecardHole[] = planScorecard(holes, { currentHoleNumber });
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={[styles.cell, styles.num]}>#</Text>
          <Text style={styles.cell}>{COPY.scorecardPar}</Text>
          <Text style={styles.cell}>{COPY.score}</Text>
          <Text style={styles.cell}>{COPY.putts}</Text>
          <Text style={[styles.cell, styles.mark]} />
        </View>
        {rows.map((row) => {
          const diff = scorecardDiff(row.score, row.par);
          const tone = scorecardDiffTone(diff);
          const plus = scorecardDiffLabel(diff);
          const mark = row.incomplete ? scorecardIncompleteMark() : (row.score ?? '');
          return (
            <Pressable
              key={row.number}
              testID={`scorecard-hole-${row.number}`}
              accessibilityRole="button"
              accessibilityLabel={
                row.incomplete
                  ? `Hole ${row.number} incomplete`
                  : `Hole ${row.number}`
              }
              disabled={!onSelectHole}
              onPress={() => onSelectHole?.(row.number)}
              style={[styles.row, row.incomplete && styles.rowIncomplete]}>
              <Text style={[styles.val, styles.num]}>{row.number}</Text>
              <Text style={[styles.val, styles.par]}>{row.par ?? ''}</Text>
              <Text
                testID={row.incomplete ? `scorecard-incomplete-${row.number}` : undefined}
                style={[styles.val, styles.score, row.incomplete && styles.incompleteScore]}>
                {mark}
              </Text>
              <Text style={styles.val}>{row.putts}</Text>
              <Text
                style={[
                  styles.val,
                  styles.mark,
                  tone === 'good' && styles.diffGood,
                  tone === 'bad' && styles.diffBad,
                ]}>
                {row.incomplete ? '' : plus ?? scorecardMarkGlyph(row.mark)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {onShare ? <ShareChoice variant="secondary" onPick={onShare} /> : null}
      {onNerdOut ? <BigButton label={COPY.nerdOut} variant="ghost" onPress={onNerdOut} /> : null}
      <BigButton label={COPY.back} variant="secondary" onPress={onBack} />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    card: {
      gap: 8,
      backgroundColor: colors.bgElevated,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
    },
    head: { flexDirection: 'row', paddingHorizontal: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg,
      borderRadius: 12,
      minHeight: 48,
      paddingHorizontal: 8,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    rowIncomplete: {
      borderColor: colors.red,
    },
    cell: { flex: 1, color: colors.muted, fontSize: type.tiny, fontWeight: '800' },
    val: { flex: 1, color: colors.cream, fontSize: type.body, fontWeight: '800' },
    par: { color: colors.muted, fontWeight: '700' },
    score: { color: colors.cream, fontWeight: '900', fontSize: type.button },
    incompleteScore: { color: colors.red, fontWeight: '900' },
    num: { flex: 0.6 },
    mark: { flex: 0.7, textAlign: 'right', color: colors.cream },
    diffGood: { color: colors.good, fontWeight: '900' },
    diffBad: { color: colors.red, fontWeight: '900' },
  });
}
