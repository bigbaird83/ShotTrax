import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatPuttN } from '../domain/playerCopy';
import { PUTT_LENGTHS, type FinishedPuttRow, type PuttLengthId } from '../domain/putts';
import { useColors } from './ColorThemeProvider';
import { tapTarget, type, type ColorPalette } from './theme';

export function FinishedPuttRows({
  rows,
  selectedIndex,
  disabled,
  onSelect,
  onAttach,
}: {
  rows: FinishedPuttRow[];
  selectedIndex: number | null;
  disabled?: boolean;
  onSelect: (index: number) => void;
  onAttach: (index: number, id: PuttLengthId) => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (rows.length === 0) return null;

  return (
    <View testID="finished-putt-rows" style={styles.wrap}>
      {rows.map((row) => {
        const canAttach = row.missingLength && !disabled;
        const selected = selectedIndex === row.index && canAttach;
        return (
          <View key={row.n} style={styles.block}>
            <Pressable
              testID={`finished-putt-row-${row.n}`}
              accessibilityRole="button"
              accessibilityLabel={`${formatPuttN(row.n)} ${row.label}`}
              disabled={!canAttach}
              onPress={() => onSelect(row.index)}
              style={[styles.row, selected && styles.rowOn]}>
              <Text style={styles.puttN}>{formatPuttN(row.n)}</Text>
              <Text style={row.missingLength ? styles.muted : styles.puttLen}>{row.label}</Text>
            </Pressable>
            {selected ? (
              <View testID={`finished-putt-attach-${row.n}`} style={styles.buckets}>
                {PUTT_LENGTHS.map((bucket) => (
                  <Pressable
                    key={bucket.id}
                    testID={`finished-putt-length-${bucket.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={bucket.label}
                    onPress={() => onAttach(row.index, bucket.id)}
                    style={styles.bucket}>
                    <Text style={styles.bucketText}>{bucket.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { marginTop: 6, gap: 6, width: '100%' },
    block: { gap: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 36,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.overlay,
    },
    rowOn: { borderColor: colors.lime },
    puttN: { color: colors.cream, fontSize: type.tiny, fontWeight: '800' },
    puttLen: { color: colors.cream, fontSize: type.tiny, fontWeight: '900' },
    muted: { color: colors.muted, fontSize: type.tiny, fontWeight: '700' },
    buckets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    bucket: {
      flexGrow: 1,
      minHeight: tapTarget,
      minWidth: 72,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    bucketText: { color: colors.cream, fontSize: type.meta, fontWeight: '800', textAlign: 'center' },
  });
}
