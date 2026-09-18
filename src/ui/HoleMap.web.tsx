import { StyleSheet, Text, View } from 'react-native';
import type { GpsFix, Shot } from '@/src/domain/types';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import type { OsmOverlay } from '@/src/course/types';
import { COPY, showWaitingOnLocationLine, yardsAreOnTheCard } from '@/src/domain/playerCopy';
import { YardsToGreenBadge } from './YardsToGreenBadge';
import { colors, type } from './theme';

type Props = {
  holeNumber: number;
  shots: Shot[];
  userFix: GpsFix | null;
  green: { lat: number; lng: number } | null;
  yardsToGreen: YardsToGreenResult;
  fmb?: { f: string; m: string; b: string } | null;
  osmOverlay?: OsmOverlay | null;
  onDropGreenEstimate?: (coord: { lat: number; lng: number }) => void;
  onPlacePoint?: (coord: { lat: number; lng: number }) => void;
  onShotPress?: (shotId: string) => void;
  placedFrom?: { lat: number; lng: number } | null;
  placedTo?: { lat: number; lng: number } | null;
  onPlaceToDrag?: (coord: { lat: number; lng: number }) => void;
  freezePan?: boolean;
  placeHint?: string | null;
  fullBleed?: boolean;
  framePoints?: { latitude: number; longitude: number }[] | null;
  lockFrame?: boolean;
  heading?: number | null;
  frameEpoch?: string;
  hideYardsOverlay?: boolean;
  onFrameReady?: (ready: boolean) => void;
  style?: object;
};

export function HoleMap({ holeNumber, userFix, green, yardsToGreen, placeHint }: Props) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.title}>Hole {holeNumber}</Text>
      <YardsToGreenBadge
        result={yardsToGreen}
        hasFix={Boolean(userFix)}
        hasGreen={Boolean(green)}
      />
      {!placeHint && !yardsAreOnTheCard(yardsToGreen) ? (
        <Text style={styles.msg}>
          {showWaitingOnLocationLine({
            yards: yardsToGreen.yards,
            quality: yardsToGreen.quality,
            hasFix: Boolean(userFix),
            hasGreen: Boolean(green),
          })
            ? COPY.waitingOnLocation
            : green
              ? COPY.waitingOnGreen
              : COPY.longPressGreen}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    minHeight: 160,
    backgroundColor: colors.bgElevated,
    padding: 12,
    gap: 6,
    justifyContent: 'center',
  },
  title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
  msg: { color: colors.muted, fontSize: type.meta, lineHeight: 20 },
});
