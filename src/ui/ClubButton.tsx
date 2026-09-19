import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useColors } from './ColorThemeProvider';
import { tapTarget, type, type ColorPalette } from './theme';

type Props = {
  shortName: string;
  name: string;
  meta?: string;
  featured?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ClubButton({ shortName, name, meta, featured, selected, disabled, onPress }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.club,
        featured && styles.featured,
        selected && styles.selected,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.5 },
      ]}>
      <Text style={[styles.short, selected && styles.shortPick]}>{shortName}</Text>
      <Text style={styles.name}>{name}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </Pressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    club: {
      width: '47%',
      minHeight: tapTarget + 8,
      backgroundColor: colors.bgElevated,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 12,
      justifyContent: 'center',
    },
    featured: {
      width: '100%',
      borderColor: colors.line,
      borderWidth: 2,
      minHeight: 80,
    },
    selected: { borderColor: colors.lime, borderWidth: 3, backgroundColor: colors.accentWash },
    short: { color: colors.cream, fontSize: type.button, fontWeight: '900' },
    shortPick: { color: colors.lime },
    name: { color: colors.cream, fontSize: type.meta, marginTop: 2 },
    meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
  });
}
