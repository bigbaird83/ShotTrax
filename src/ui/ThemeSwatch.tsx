import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COLOR_THEME_LABELS, type ColorThemeId } from '@/src/domain/colorTheme';
import { useColors } from './ColorThemeProvider';
import { Icon } from './Icon';
import { accentFill, gradientFill } from './surface';
import { COLOR_THEMES, type ColorPalette } from './theme';

/** Live mini-preview of a color theme for the Menu picker. */
export function ThemeSwatch({
  id,
  selected,
  onPress,
}: {
  id: ColorThemeId;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const p = COLOR_THEMES[id];
  const edge = p.flat ? { borderWidth: 1.5, borderColor: p.line } : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={COLOR_THEME_LABELS[id]}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.cardOn, pressed && styles.pressed]}>
      {selected ? (
        <View style={styles.check}>
          <Icon name="checkmark" color={colors.onAccent} size={12} glyph="✓" />
        </View>
      ) : null}
      <View style={[styles.mini, { backgroundColor: p.bg }, edge]}>
        <View style={[styles.miniHero, p.flat ? { backgroundColor: p.bg } : gradientFill(p.hero1, p.hero2, 150), edge]} />
        <View style={styles.miniRow}>
          <View style={[styles.miniPrimary, accentFill(p)]} />
          <View style={[styles.miniSecondary, { backgroundColor: p.bgElevated }, edge]} />
        </View>
        <View style={[styles.miniLine, { backgroundColor: p.cream }]} />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {COLOR_THEME_LABELS[id]}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    card: {
      width: '31%',
      borderRadius: 18,
      padding: 7,
      paddingBottom: 9,
      backgroundColor: colors.bgElevated,
      borderWidth: colors.flat ? 2 : 1.5,
      borderColor: colors.line,
    },
    cardOn: { borderWidth: 2.5, borderColor: colors.lime },
    pressed: { transform: [{ scale: 0.97 }] },
    check: {
      position: 'absolute',
      top: -7,
      right: -7,
      zIndex: 2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.lime,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mini: { height: 64, borderRadius: 12, padding: 7, gap: 5, overflow: 'hidden' },
    miniHero: { height: 18, borderRadius: 6 },
    miniRow: { flexDirection: 'row', gap: 4 },
    miniPrimary: { flex: 1.3, height: 16, borderRadius: 5 },
    miniSecondary: { flex: 1, height: 16, borderRadius: 5 },
    miniLine: { height: 5, width: '60%', borderRadius: 3, opacity: 0.5 },
    name: { color: colors.cream, fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 7 },
  });
}
