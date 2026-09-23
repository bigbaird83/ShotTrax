import { StyleSheet, Text, View } from 'react-native';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import { COPY, yardsToGreenPlayerLabel } from '@/src/domain/playerCopy';
import { colors, type } from './theme';

export function YardsToGreenBadge({
  result,
  hasFix,
  hasGreen,
  compact = false,
  approximateOnSoft = false,
  unavailable = false,
}: {
  result: YardsToGreenResult;
  hasFix?: boolean;
  hasGreen?: boolean;
  compact?: boolean;
  /** Soft GPS (15–25 m) adds the Approximate note under the number. */
  approximateOnSoft?: boolean;
  /** No number to show for a known reason (e.g. past the live cap): — / Unavailable. */
  unavailable?: boolean;
}) {
  const label = yardsToGreenPlayerLabel(result, { hasFix, hasGreen });
  const copy =
    unavailable && label.value === '—'
      ? { ...label, detail: COPY.unavailable }
      : approximateOnSoft && result.quality === 'soft' && label.value !== '—'
        ? { ...label, detail: `${label.detail} · ${COPY.approximate}` }
        : label;
  return (
    <View style={[styles.wrap, compact && styles.compact]} accessibilityLabel={`${copy.heading} ${copy.value}`}>
      <Text style={styles.heading}>{copy.heading}</Text>
      <Text style={[styles.value, compact && styles.valueCompact]}>{copy.value}</Text>
      <Text style={styles.detail}>{copy.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 2,
  },
  compact: {
    backgroundColor: 'rgba(11,26,18,0.86)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'flex-end',
  },
  heading: {
    color: colors.muted,
    fontSize: type.tiny,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: { color: colors.cream, fontSize: type.yards, fontWeight: '900', lineHeight: 36 },
  valueCompact: { fontSize: 28, lineHeight: 32 },
  detail: { color: colors.muted, fontSize: type.tiny, fontWeight: '600' },
});
