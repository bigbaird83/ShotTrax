import { StyleSheet, Text, View } from 'react-native';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import { yardsToGreenLabel } from '@/src/domain/yardsToGreen';
import { QualityBadge } from './Badge';
import { colors } from './theme';

export function YardsToGreenBadge({
  result,
  hasFix,
  hasGreen,
  compact = false,
}: {
  result: YardsToGreenResult;
  hasFix?: boolean;
  hasGreen?: boolean;
  compact?: boolean;
}) {
  const copy = yardsToGreenLabel(result, { hasFix, hasGreen });
  return (
    <View style={[styles.wrap, compact && styles.compact]} accessibilityLabel={`${copy.heading} ${copy.value}`}>
      <Text style={styles.heading}>{copy.heading}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{copy.value}</Text>
        {result.quality === 'soft' ? <QualityBadge quality="soft" /> : null}
      </View>
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
    gap: 4,
  },
  compact: {
    backgroundColor: 'rgba(11,26,18,0.86)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  heading: {
    color: colors.lime,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { color: colors.cream, fontSize: 22, fontWeight: '900' },
  detail: { color: colors.muted, fontSize: 12, fontWeight: '600' },
});
