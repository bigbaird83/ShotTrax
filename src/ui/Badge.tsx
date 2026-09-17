import { StyleSheet, Text, View } from 'react-native';
import { COPY } from '../domain/playerCopy';
import type { ShotFixQuality, ShotSource } from '../domain/types';
import { colors, type } from './theme';

export function QualityBadge({
  quality,
  open,
  source,
}: {
  quality?: ShotFixQuality | null;
  open?: boolean;
  source?: ShotSource;
}) {
  if (source === 'no_gps' || quality === 'none') {
    return (
      <View style={[styles.badge, styles.manual]}>
        <Text style={styles.text}>Logged</Text>
      </View>
    );
  }
  if (open) {
    return (
      <View style={[styles.badge, styles.open]}>
        <Text style={styles.text}>{COPY.inPlay}</Text>
      </View>
    );
  }
  if (quality === 'soft') {
    return (
      <View style={[styles.badge, styles.soft]}>
        <Text style={styles.text}>{COPY.approximate}</Text>
      </View>
    );
  }
  return null;
}

export function AverageBadges({
  includesSoft,
  includesForced,
}: {
  includesSoft: boolean;
  includesForced: boolean;
}) {
  if (!includesSoft && !includesForced) return null;
  return <View style={styles.row} />;
}

const styles = StyleSheet.create({
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
  open: { backgroundColor: colors.line },
  manual: { backgroundColor: '#3A4A5C' },
  soft: { backgroundColor: '#5A4A22' },
});
