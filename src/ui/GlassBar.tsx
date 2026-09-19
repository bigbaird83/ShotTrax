import { type ReactNode, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from './ColorThemeProvider';
import { type ColorPalette } from './theme';

/** Frosted bar over the map. Map stays visible behind. No extra native blur module. */
export function GlassBar({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View pointerEvents="box-none" style={[styles.bar, style]}>
      <View pointerEvents="none" style={styles.frost} />
      {children}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    bar: {
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    frost: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.glass,
    },
  });
}
