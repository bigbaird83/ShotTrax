import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from './ColorThemeProvider';
import { Icon } from './Icon';
import { accentFill, cardBorder, glow, tint } from './surface';
import { type ColorPalette } from './theme';

type IconName = ComponentProps<typeof Icon>['name'];

/** Home Start 18 / Start 9 tile. Primary tile gets the accent gradient + glow. */
export function StartTile({
  holes,
  primary,
  caption,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  holes: 9 | 18;
  primary?: boolean;
  caption?: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ink = primary ? colors.onAccent : colors.cream;
  const sub = primary ? colors.onAccent : colors.muted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        primary ? styles.primary : styles.secondary,
        primary && !disabled && !pressed && styles.primaryGlow,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <View style={styles.tileTop}>
        <Text style={[styles.tileLabel, { color: sub }]}>START</Text>
        <View style={[styles.go, primary ? styles.goPrimary : styles.goSecondary]}>
          <Icon name="play.fill" color={ink} size={14} glyph="▶" />
        </View>
      </View>
      <View>
        <Text style={[styles.num, { color: ink }]}>{holes}</Text>
        <Text style={[styles.tileLabel, { color: sub }]} numberOfLines={1}>
          {caption ? `HOLES · ${caption.toUpperCase()}` : 'HOLES'}
        </Text>
      </View>
    </Pressable>
  );
}

/** Small icon tile for secondary Home actions. */
export function QuickTile({
  icon,
  glyph,
  color,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  glyph: string;
  color: string;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
      <View style={[styles.quickIcon, { backgroundColor: tint(color, colors.flat ? 0.3 : 0.2) }]}>
        <Icon name={icon} color={color} size={20} glyph={glyph} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    tile: {
      flex: 1,
      minHeight: 118,
      borderRadius: 24,
      padding: 14,
      justifyContent: 'space-between',
      overflow: 'visible',
    },
    primary: { ...accentFill(colors), flex: 1.35 },
    primaryGlow: glow(colors),
    secondary: {
      backgroundColor: colors.bgElevated,
      ...cardBorder(colors),
      borderWidth: colors.flat ? 2 : 1.5,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
    tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    tileLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
    go: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    goPrimary: { backgroundColor: 'rgba(0,0,0,0.14)' },
    goSecondary: { backgroundColor: colors.accentWash },
    num: { fontSize: 48, fontWeight: '900', letterSpacing: -2, lineHeight: 50 },
    quick: {
      flex: 1,
      minHeight: 88,
      borderRadius: 20,
      padding: 12,
      gap: 10,
      backgroundColor: colors.bgElevated,
      ...cardBorder(colors),
    },
    quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    quickLabel: { color: colors.cream, fontSize: 14, fontWeight: '800' },
  });
}
