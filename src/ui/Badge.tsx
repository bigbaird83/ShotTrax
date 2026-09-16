import { StyleSheet, Text, View } from 'react-native';
import type { ShotFixQuality, ShotSource } from '../domain/types';
import { colors } from './theme';

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
        <Text style={styles.text}>NO GPS</Text>
      </View>
    );
  }
  if (open) {
    return (
      <View style={[styles.badge, styles.open]}>
        <Text style={styles.text}>OPEN</Text>
      </View>
    );
  }
  if (!quality || quality === 'good') {
    return (
      <View style={[styles.badge, styles.good]}>
        <Text style={styles.text}>GOOD</Text>
      </View>
    );
  }
  if (quality === 'soft') {
    return (
      <View style={[styles.badge, styles.soft]}>
        <Text style={[styles.text, styles.dark]}>SOFT</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.forced]}>
      <Text style={styles.text}>FORCED</Text>
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
  if (!includesSoft && !includesForced) return null;
  return (
    <View style={styles.row}>
      {includesSoft ? <QualityBadge quality="soft" /> : null}
      {includesForced ? <QualityBadge quality="forced" /> : null}
    </View>
  );
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
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dark: { color: colors.bg },
  good: { backgroundColor: '#1F4A2C' },
  soft: { backgroundColor: colors.amber },
  forced: { backgroundColor: colors.orange },
  open: { backgroundColor: colors.line },
  manual: { backgroundColor: '#3A4A5C' },
});
