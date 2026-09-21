import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COPY } from '@/src/domain/playerCopy';
import {
  THUNDERBIRD_PIN_SHEETS,
  thunderbirdSheetLabel,
  type ThunderbirdPinSheetId,
} from '@/src/domain/thunderbirdPins';
import { useColors } from './ColorThemeProvider';
import { tapTarget, type, type ColorPalette } from './theme';

type Props = {
  selected: ThunderbirdPinSheetId;
  onSelect: (sheet: ThunderbirdPinSheetId) => void;
};

export function ThunderbirdPinSheetPicker({ selected, onSelect }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{COPY.pinSheet}</Text>
      <View style={styles.row}>
        {THUNDERBIRD_PIN_SHEETS.map((id) => {
          const on = selected === id;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(id)}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{id}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.meta}>{thunderbirdSheetLabel(selected)}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    box: { gap: 6 },
    label: { color: colors.muted, fontSize: type.meta, fontWeight: '700' },
    row: { flexDirection: 'row', gap: 8 },
    chip: {
      flex: 1,
      minHeight: tapTarget,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
    },
    chipOn: { borderColor: colors.cream, backgroundColor: colors.accentWash },
    chipText: { color: colors.cream, fontSize: type.button, fontWeight: '800' },
    chipTextOn: { color: colors.cream },
    meta: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
  });
}
