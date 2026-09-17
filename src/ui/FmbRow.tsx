import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from './theme';

export function FmbRow({ f, m, b }: { f: string; m: string; b: string }) {
  return (
    <View style={styles.row} accessibilityLabel={`Front ${f} Middle ${m} Back ${b}`}>
      <View style={styles.cell}>
        <Text style={styles.kicker}>F</Text>
        <Text style={styles.value}>{f}</Text>
      </View>
      <View style={styles.cell}>
        <Text style={styles.kicker}>M</Text>
        <Text style={styles.value}>{m}</Text>
      </View>
      <View style={styles.cell}>
        <Text style={styles.kicker}>B</Text>
        <Text style={styles.value}>{b}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  cell: {
    flex: 1,
    backgroundColor: 'rgba(11,26,18,0.82)',
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  kicker: { color: colors.lime, fontSize: type.tiny, fontWeight: '800' },
  value: { color: colors.cream, fontSize: type.body, fontWeight: '900' },
});
