import { StyleSheet, View } from 'react-native';

const RINGS = [60, 110, 160, 210, 260, 310];
const SMALL_RINGS = [50, 95, 140];

/** Faint contour lines behind hero cards. Decorative only. */
export function TopoRings({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {RINGS.map((d) => (
        <View
          key={`a${d}`}
          style={[styles.ring, { width: d * 1.5, height: d, borderRadius: d, borderColor: color, right: -d * 0.55, top: -d * 0.45 }]}
        />
      ))}
      {SMALL_RINGS.map((d) => (
        <View
          key={`b${d}`}
          style={[styles.ring, { width: d * 1.6, height: d, borderRadius: d, borderColor: color, left: -d * 0.6, bottom: -d * 0.5 }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 1, opacity: 0.16 },
});
