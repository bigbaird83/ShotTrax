import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useColors } from './ColorThemeProvider';
import { tapTarget, type ColorPalette } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function BigButton({ label, onPress, variant = 'primary', disabled, style }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        variant === 'ghost' && styles.ghost,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}>
      <Text
        style={[
          styles.label,
          (variant === 'secondary' || variant === 'ghost') && styles.labelOnDark,
          variant === 'danger' && styles.labelOnDark,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    base: {
      minHeight: tapTarget,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    primary: {
      backgroundColor: colors.lime,
    },
    secondary: {
      backgroundColor: colors.bgElevated,
      borderWidth: 2,
      borderColor: colors.line,
    },
    danger: {
      backgroundColor: colors.orange,
    },
    ghost: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.line,
    },
    disabled: {
      opacity: 0.45,
    },
    pressed: {
      opacity: 0.8,
    },
    label: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.onAccent,
    },
    labelOnDark: {
      color: colors.cream,
    },
  });
}
