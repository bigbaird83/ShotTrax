import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { loadGroup } from '@/src/db/groupRepo';
import { getRound } from '@/src/db/repo';
import { planGroupGames } from '@/src/domain/groupGames';
import { planGroupScorecard, type GroupCardRow, type GroupCardTotal } from '@/src/domain/groupScorecard';
import { COPY } from '@/src/domain/playerCopy';
import { Screen } from '@/src/ui/Screen';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { type ColorPalette } from '@/src/ui/theme';

/**
 * Hole-by-hole group scorecard: everyone's score, net-stroke dots (off the
 * group's lowest handicap, when net is on), and the skins won on each hole.
 */
export default function RoundGroupCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, revision } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const round = useMemo(() => getRound(db, id), [db, id, revision]);
  const card = useMemo(() => {
    if (!round) return null;
    const group = loadGroup(db, round.id);
    const result = planGroupGames({ holes: group.holes, players: group.players, settings: group.settings });
    return planGroupScorecard({ holes: group.holes, players: group.players, result });
  }, [db, round, revision]);

  if (!round || !card) {
    return (
      <Screen>
        <Text style={styles.muted}>Round not found.</Text>
      </Screen>
    );
  }

  const holeRow = (row: GroupCardRow) => (
    <View key={row.number} style={styles.row} testID={`group-card-hole-${row.number}`}>
      <Text style={[styles.cell, styles.num, styles.dim]}>{row.number}</Text>
      <View style={[styles.cellBox, styles.parCol]}>
        <Text style={styles.dim}>{row.par ?? '—'}</Text>
        <Text style={styles.small}>{row.strokeIndex ?? ''}</Text>
      </View>
      {row.cells.map((cell) => (
        <View
          key={cell.playerId}
          style={[styles.cellBox, styles.playerCol, cell.skinValue != null && styles.skinCell]}
          accessibilityLabel={[
            cell.score != null ? `${cell.score}` : 'no score',
            cell.strokes > 0 ? `${cell.strokes} net stroke${cell.strokes > 1 ? 's' : ''}` : null,
            cell.skinValue != null ? `won ${cell.skinValue} skin${cell.skinValue > 1 ? 's' : ''}` : null,
          ]
            .filter(Boolean)
            .join(', ')}>
          <Text style={[styles.score, cell.toPar != null && cell.toPar < 0 && styles.under]}>{cell.score ?? ''}</Text>
          {cell.strokes > 0 ? <Text style={styles.dots}>{'•'.repeat(cell.strokes)}</Text> : null}
          {cell.skinValue != null ? <Text style={styles.skinBadge}>{cell.skinValue}</Text> : null}
        </View>
      ))}
    </View>
  );

  const totalRow = (t: GroupCardTotal) => (
    <View key={t.label} style={[styles.row, styles.totalRow]} testID={`group-card-${t.label.toLowerCase()}`}>
      <Text style={[styles.cell, styles.num, styles.bold]}>{t.label}</Text>
      <Text style={[styles.cell, styles.parCol, styles.bold]}>{t.par ?? '—'}</Text>
      {t.cells.map((c) => (
        <Text key={c.playerId} style={[styles.cell, styles.playerCol, styles.bold]}>
          {c.strokes ?? ''}
        </Text>
      ))}
    </View>
  );

  const [out, inn, grand] = card.totals.length === 3 ? card.totals : [null, null, card.totals[0]];

  return (
    <Screen>
      <Text style={styles.title}>{round.courseName ?? 'Round'}</Text>
      <View style={styles.block}>
        <View style={styles.head}>
          <Text style={[styles.headCell, styles.num]}>#</Text>
          <View style={styles.parCol}>
            <Text style={styles.headCell}>{COPY.groupCardPar}</Text>
            <Text style={styles.small}>{COPY.groupCardSi}</Text>
          </View>
          {card.players.map((p) => (
            <View key={p.id} style={styles.playerCol}>
              <Text style={styles.headCell} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.small}>{p.handicap ?? ''}</Text>
            </View>
          ))}
        </View>
        {card.front.map(holeRow)}
        {out ? totalRow(out) : null}
        {card.back.map(holeRow)}
        {inn ? totalRow(inn) : null}
        {totalRow(grand)}
        <Text style={styles.note}>
          {card.net ? `${COPY.groupCardDots} · ` : ''}
          {COPY.groupCardSkins} · {COPY.groupCardUnder}
        </Text>
      </View>
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: 24, fontWeight: '900' },
    muted: { color: colors.muted, fontSize: 15 },
    note: { color: colors.muted, fontSize: 13, paddingHorizontal: 4, paddingTop: 4 },
    block: { gap: 4, backgroundColor: colors.bgElevated, padding: 8, borderRadius: 16 },
    head: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 4 },
    headCell: { color: colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'center' },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: colors.bg,
      borderRadius: 8,
      minHeight: 44,
    },
    totalRow: { backgroundColor: colors.accentWash, minHeight: 36, alignItems: 'center' },
    cell: { color: colors.cream, fontSize: 15, fontWeight: '800', textAlign: 'center' },
    cellBox: { alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
    num: { flex: 0.7, alignSelf: 'center' },
    parCol: { flex: 0.8 },
    playerCol: { flex: 1 },
    dim: { color: colors.muted, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    small: { color: colors.muted, fontSize: 10, fontWeight: '700', textAlign: 'center' },
    bold: { fontWeight: '900' },
    score: { color: colors.cream, fontSize: 16, fontWeight: '800' },
    under: { color: colors.good },
    skinCell: { borderWidth: 2, borderColor: colors.lime },
    dots: { position: 'absolute', top: 1, right: 4, color: colors.amber, fontSize: 10, letterSpacing: -1 },
    skinBadge: {
      position: 'absolute',
      bottom: 2,
      right: 3,
      color: colors.bg,
      backgroundColor: colors.lime,
      borderRadius: 6,
      overflow: 'hidden',
      paddingHorizontal: 3,
      fontSize: 9,
      fontWeight: '900',
    },
  });
}
