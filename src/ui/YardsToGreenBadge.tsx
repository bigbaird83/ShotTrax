import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { YardsToGreenResult } from '@/src/sensing/yardsToGreen';
import { COPY, yardsToGreenPlayerLabel } from '@/src/domain/playerCopy';
import { useColors } from './ColorThemeProvider';
import { cardBorder } from './surface';
import { mapInk, type, type ColorPalette } from './theme';

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
  /** On-map chip: dark scrim + light ink in every theme. */
  compact?: boolean;
  /** Soft GPS (15–25 m) adds the Approximate note under the number. */
  approximateOnSoft?: boolean;
  /** No number to show for a known reason (e.g. past the live cap): — / Unavailable. */
  unavailable?: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const label = yardsToGreenPlayerLabel(result, { hasFix, hasGreen });
  const copy =
    unavailable && label.value === '—'
      ? { ...label, detail: COPY.unavailable }
      : approximateOnSoft && result.quality === 'soft' && label.value !== '—'
        ? { ...label, detail: `${label.detail} · ${COPY.approximate}` }
        : label;
  return (
    <View style={[styles.wrap, compact && styles.compact]} accessibilityLabel={`${copy.heading} ${copy.value}`}>
      <Text style={[styles.heading, compact && styles.onMapMuted]}>{copy.heading}</Text>
      <Text style={[styles.value, compact && styles.valueCompact]}>{copy.value}</Text>
      <Text style={[styles.detail, compact && styles.onMapMuted]}>{copy.detail}</Text>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: colors.bgElevated,
      borderRadius: 16,
      ...cardBorder(colors),
      padding: 12,
      gap: 2,
    },
    compact: {
      backgroundColor: mapInk.scrim,
      borderColor: mapInk.edge,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      alignItems: 'flex-end',
    },
    heading: {
      color: colors.muted,
      fontSize: type.tiny,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    onMapMuted: { color: mapInk.muted },
    value: {
      color: colors.cream,
      fontSize: type.yards,
      fontWeight: '900',
      lineHeight: 36,
      letterSpacing: -0.5,
      fontVariant: ['tabular-nums'],
    },
    valueCompact: { color: mapInk.text, fontSize: 30, lineHeight: 34 },
    detail: { color: colors.muted, fontSize: type.tiny, fontWeight: '600' },
  });
}
