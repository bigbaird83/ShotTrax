import { StyleSheet, Text, View } from 'react-native';
import type { GpsConfidence } from '../domain/gpsConfidence';
import { COPY } from '../domain/playerCopy';
import { colors, type } from './theme';

/**
 * How far the chip sits above the club-mark pin tip.
 * The marker anchor stays on the stored start coordinate, so the pin does not move.
 */
export const CLUB_MARK_CONFIDENCE_LIFT_PX = 36;

const LABEL: Record<GpsConfidence, string> = {
  good: COPY.gpsConfidenceGood,
  ok: COPY.gpsConfidenceOk,
  weak: COPY.gpsConfidenceWeak,
};

/** Tiny good / ok / weak cue. No meters on screen. */
export function GpsConfidenceChip({ confidence }: { confidence: GpsConfidence }) {
  const label = LABEL[confidence];
  return (
    <View
      testID={`gps-confidence-${confidence}`}
      accessibilityLabel={`GPS ${label}`}
      style={[styles.chip, styles[confidence]]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
  },
  text: {
    color: colors.onAccent,
    fontSize: type.tiny,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  good: { backgroundColor: colors.good },
  ok: { backgroundColor: colors.amber },
  weak: { backgroundColor: colors.orange },
});
