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
  return <View style={[styles.bar, style]}>{children}</View>;
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    bar: {
      backgroundColor: colors.glass,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
  });
}
