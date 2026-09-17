import { StyleSheet, Text, View } from 'react-native';
import type { GpsFix, Shot } from '@/src/domain/types';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import type { OsmOverlay } from '@/src/course/types';
import { hasClosedGpsTrail } from '@/src/domain/shotSource';
import { YardsToGreenBadge } from './YardsToGreenBadge';
import { colors } from './theme';

type Props = {
  holeNumber: number;
  shots: Shot[];
  userFix: GpsFix | null;
  green: { lat: number; lng: number } | null;
  yardsToGreen: YardsToGreenResult;
  osmOverlay?: OsmOverlay | null;
  onDropGreenEstimate?: (coord: { lat: number; lng: number }) => void;
};

/** Web has no Apple Maps / react-native-maps. List closed-shot GPS instead of inventing a map. */
export function HoleMap({ holeNumber, shots, userFix, green, yardsToGreen }: Props) {
  const closed = shots.filter(hasClosedGpsTrail);
  return (
    <View style={styles.fallback}>
      <Text style={styles.kicker}>SCORECARD</Text>
      <Text style={styles.title}>HOLE {holeNumber}</Text>
      <YardsToGreenBadge
        result={yardsToGreen}
        hasFix={Boolean(userFix)}
        hasGreen={Boolean(green)}
      />
      <Text style={styles.msg}>
        Satellite map is iOS/Android (react-native-maps, Apple Maps). Trails still list closed shots.
        OSM overlay is not loaded in this build.
      </Text>
      {closed.length === 0 ? (
        <Text style={styles.meta}>No closed-shot trails yet.</Text>
      ) : (
        closed.map((shot) => (
          <Text key={shot.id} style={styles.meta}>
            {shot.seq}: {shot.startLat.toFixed(5)}, {shot.startLng.toFixed(5)} → {shot.endLat.toFixed(5)},{' '}
            {shot.endLng.toFixed(5)}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    minHeight: 160,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
    padding: 12,
    gap: 6,
  },
  kicker: { color: colors.lime, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: colors.cream, fontSize: 18, fontWeight: '900' },
  msg: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.cream, fontSize: 13 },
});
