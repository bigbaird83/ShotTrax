import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COPY } from '@/src/domain/playerCopy';
import { planScorecard, scorecardMarkGlyph, type ScorecardHole } from '@/src/domain/scorecard';
import { BigButton } from './BigButton';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

type HoleIn = {
  number: number;
  par: number | null;
  score: number | null;
  putts: number;
};

export function ScorecardBody({
  holes,
  onBack,
}: {
  holes: HoleIn[];
  onBack: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rows: ScorecardHole[] = planScorecard(holes);
  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.table}>
        <View style={styles.head}>
          <Text style={[styles.cell, styles.num]}>#</Text>
          <Text style={styles.cell}>{COPY.scorecardPar}</Text>
          <Text style={styles.cell}>{COPY.score}</Text>
          <Text style={styles.cell}>{COPY.putts}</Text>
          <Text style={[styles.cell, styles.mark]} />
        </View>
        {rows.map((row) => (
          <View key={row.number} style={styles.row}>
            <Text style={[styles.val, styles.num]}>{row.number}</Text>
            <Text style={styles.val}>{row.par ?? ''}</Text>
            <Text style={styles.val}>{row.score ?? ''}</Text>
            <Text style={styles.val}>{row.putts}</Text>
            <Text style={[styles.val, styles.mark]}>{scorecardMarkGlyph(row.mark)}</Text>
          </View>
        ))}
      </View>
      <BigButton label={COPY.back} variant="secondary" onPress={onBack} />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    table: { gap: 8 },
    head: { flexDirection: 'row', paddingHorizontal: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bgElevated,
      borderRadius: 12,
      minHeight: 48,
      paddingHorizontal: 8,
    },
    cell: { flex: 1, color: colors.muted, fontSize: type.tiny, fontWeight: '800' },
    val: { flex: 1, color: colors.cream, fontSize: type.body, fontWeight: '800' },
    num: { flex: 0.6 },
    mark: { flex: 0.7, textAlign: 'right', color: colors.cream },
  });
}
