import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FAIRWAY_RESULTS, fairwayLabel, type FairwayResult } from '@/src/domain/fairwayGir';
import { COPY } from '@/src/domain/playerCopy';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

/**
 * One-tap fairway result: ← Left · Hit · Right → · Short.
 * `overlay` is the compact row on the play map; the hole sheet uses the full row.
 */
export function FairwayPicker({
  value,
  onPick,
  disabled,
  overlay,
}: {
  value: FairwayResult | null;
  onPick: (result: FairwayResult) => void;
  disabled?: boolean;
  overlay?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View testID="fairway-picker" style={[styles.wrap, overlay && styles.wrapOverlay]}>
      <Text style={styles.label}>{COPY.fairwayPrompt}</Text>
      <View style={styles.row}>
        {FAIRWAY_RESULTS.map((result) => {
          const on = value === result;
          return (
            <Pressable
              key={result}
              testID={`fairway-${result}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled }}
              accessibilityLabel={`Fairway ${fairwayLabel(result)}`}
              disabled={disabled}
              onPress={() => onPick(result)}
              style={[
                styles.chip,
                overlay && styles.chipOverlay,
                result === 'hit' && styles.chipHit,
                on && styles.chipOn,
              ]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {fairwayLabel(result)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: { gap: 6 },
    wrapOverlay: {
      marginTop: 6,
      alignSelf: 'flex-start',
      maxWidth: '100%',
      padding: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.overlay,
    },
    label: { color: colors.muted, fontSize: type.tiny, fontWeight: '800' },
    row: { flexDirection: 'row', gap: 6 },
    chip: {
      minHeight: 48,
      minWidth: 64,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOverlay: { minHeight: 44, minWidth: 56 },
    chipHit: { borderColor: colors.good },
    chipOn: { borderColor: colors.cream, borderWidth: 2, backgroundColor: colors.accentWash },
    chipText: { color: colors.cream, fontWeight: '800', fontSize: type.chip },
    chipTextOn: { fontWeight: '900' },
  });
}
