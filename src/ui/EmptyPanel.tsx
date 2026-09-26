import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from './ColorThemeProvider';
import { cardBorder } from './surface';
import { type, type ColorPalette } from './theme';

/** Friendly empty / first-round panel. Not a blank block. */
export function EmptyPanel({ title, hint }: { title: string; hint?: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    panel: {
      backgroundColor: colors.bgElevated,
      borderRadius: 18,
      ...cardBorder(colors),
      padding: 16,
      gap: 8,
    },
    title: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
    hint: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
  });
}
