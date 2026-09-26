import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COPY } from '../domain/playerCopy';
import type { ShotFixQuality, ShotSource } from '../domain/types';
import { useColors } from './ColorThemeProvider';
import { tint } from './surface';
import { mapInk, type, type ColorPalette } from './theme';

function useBadgeStyles() {
  const colors = useColors();
  return useMemo(() => makeStyles(colors), [colors]);
}

export function QualityBadge({
  quality,
  open,
  source,
  onMap = false,
}: {
  quality?: ShotFixQuality | null;
  open?: boolean;
  source?: ShotSource;
  /** Inside a map chip: light ink on the dark scrim in every theme. */
  onMap?: boolean;
}) {
  const styles = useBadgeStyles();
  const text = onMap ? [styles.text, styles.onMapText] : styles.text;
  if (source === 'placed') {
    return (
      <View style={[styles.badge, styles.placed]}>
        <Text style={text}>{COPY.placed}</Text>
      </View>
    );
  }
  if (source === 'no_gps' || quality === 'none') {
    return (
      <View style={[styles.badge, styles.manual]}>
        <Text style={text}>Logged</Text>
      </View>
    );
  }
  if (open) {
    return (
      <View style={[styles.badge, styles.open]}>
        <Text style={text}>{COPY.inPlay}</Text>
      </View>
    );
  }
  if (quality === 'soft' || quality === 'forced') {
    return (
      <View style={[styles.badge, styles.soft]}>
        <Text style={text}>{COPY.approximate}</Text>
      </View>
    );
  }
  return null;
}

export function HoleOutBadge({
  label,
  testID = 'hole-out-badge',
}: {
  label?: string;
  testID?: string;
}) {
  const styles = useBadgeStyles();
  return (
    <View style={[styles.badge, styles.holeOut]} testID={testID}>
      <Text style={styles.holeOutText}>{label ?? COPY.holeOut}</Text>
    </View>
  );
}

export function AverageBadges({
  includesSoft,
  includesForced,
}: {
  includesSoft: boolean;
  includesForced: boolean;
}) {
  const styles = useBadgeStyles();
  if (!includesSoft && !includesForced) return null;
  return <View style={styles.row} />;
}

/** Tinted pills: each state keeps its hue in light and dark presets; ink is the theme text. */
function makeStyles(colors: ColorPalette) {
  const pill = (hue: string) =>
    colors.flat
      ? { backgroundColor: colors.bg, borderWidth: 1, borderColor: hue }
      : { backgroundColor: tint(hue, 0.22), borderWidth: 1, borderColor: tint(hue, 0.45) };
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 6 },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      minHeight: 24,
      justifyContent: 'center',
    },
    text: {
      color: colors.cream,
      fontSize: type.tiny,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    onMapText: { color: mapInk.text },
    open: pill(colors.muted),
    manual: pill(colors.muted),
    placed: pill(colors.good),
    soft: pill(colors.amber),
    holeOut: pill(colors.lime),
    holeOutText: {
      color: colors.lime,
      fontSize: type.tiny,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
  });
}
