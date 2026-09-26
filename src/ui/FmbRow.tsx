import { StyleSheet, Text, View } from 'react-native';
import { mapInk, type } from './theme';

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

/** Sits on the satellite map: dark scrim, light ink in every theme. */
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  cell: {
    flex: 1,
    backgroundColor: mapInk.scrim,
    borderWidth: 1,
    borderColor: mapInk.edge,
    borderRadius: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  kicker: { color: mapInk.muted, fontSize: type.tiny, fontWeight: '800' },
  value: { color: mapInk.text, fontSize: type.body, fontWeight: '900', fontVariant: ['tabular-nums'] },
});
