import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { COPY } from '../domain/playerCopy';
import { useColors } from './ColorThemeProvider';
import { type ColorPalette } from './theme';

/** Dock Putt control. Opens the putt sheet. Sits left of a shrunken Hole Out — not its own dock row. */
export function PuttDock({
  disabled,
  onPress,
  style,
}: {
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      testID="play-dock-putts"
      accessibilityRole="button"
      accessibilityLabel={COPY.putt}
      disabled={disabled}
      onPress={onPress}
      style={style}>
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {COPY.putt}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    label: { color: colors.cream, fontWeight: '800', fontSize: 11, textAlign: 'center' },
  });
}
