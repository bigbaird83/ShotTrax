import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from './ColorThemeProvider';
import { tint } from './surface';
import { type, type ColorPalette } from './theme';

/** Amber notice card. Tinted, not a solid block, so it reads in light and dark presets. */
export function GpsBanner({ message }: { message: string | null }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!message) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.bar} />
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.flat ? colors.bg : tint(colors.amber, 0.14),
      borderWidth: colors.flat ? 2 : 1,
      borderColor: colors.flat ? colors.amber : tint(colors.amber, 0.45),
      padding: 12,
      borderRadius: 14,
    },
    bar: { width: 4, borderRadius: 2, backgroundColor: colors.amber },
    body: {
      flex: 1,
      fontSize: type.meta,
      color: colors.cream,
      lineHeight: 20,
      fontWeight: '700',
    },
  });
}
