import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export function GpsBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>SIMULATOR / MOCK GPS</Text>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.amber,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.bg,
    marginBottom: 4,
    letterSpacing: 0.4,
  },
  body: {
    fontSize: 14,
    color: colors.bg,
    lineHeight: 20,
    fontWeight: '600',
  },
});
