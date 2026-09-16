import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, tapTarget } from './theme';

type Props = {
  shortName: string;
  name: string;
  meta?: string;
  featured?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ClubButton({ shortName, name, meta, featured, disabled, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.club,
        featured && styles.featured,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.5 },
      ]}>
      <Text style={styles.short}>{shortName}</Text>
      <Text style={styles.name}>{name}</Text>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
    borderColor: colors.lime,
    borderWidth: 2,
    minHeight: 80,
  },
  short: { color: colors.lime, fontSize: 20, fontWeight: '900' },
  name: { color: colors.cream, fontSize: 14, marginTop: 2 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 4 },
});
