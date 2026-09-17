import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from './theme';

export function GpsBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.amber,
    padding: 12,
    borderRadius: 12,
  },
  body: {
    fontSize: type.meta,
    color: colors.bg,
    lineHeight: 20,
    fontWeight: '700',
  },
});
