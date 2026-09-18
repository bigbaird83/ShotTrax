import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getCourseDistanceUnit, setCourseDistanceUnit } from '@/src/db/repo';
import { COPY } from '@/src/domain/playerCopy';
import type { CourseDistanceUnit } from '@/src/domain/courseDistance';
import { BigButton } from '@/src/ui/BigButton';
import { Screen } from '@/src/ui/Screen';
import { colors, tapTarget, type } from '@/src/ui/theme';

export default function SettingsScreen() {
  const { db, bump } = useDb();
  const unit = getCourseDistanceUnit(db);

  const setUnit = (next: CourseDistanceUnit) => {
    setCourseDistanceUnit(db, next);
    bump();
  };

  return (
    <Screen>
      <Text style={styles.title}>{COPY.settings}</Text>
      <Text style={styles.label}>{COPY.courseDistanceSetting}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setUnit('mi')}
          style={[styles.chip, unit === 'mi' && styles.chipOn]}>
          <Text style={styles.chipText}>{COPY.miles}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setUnit('km')}
          style={[styles.chip, unit === 'km' && styles.chipOn]}>
          <Text style={styles.chipText}>{COPY.kilometers}</Text>
        </Pressable>
      </View>
      <BigButton label={COPY.bag} variant="secondary" onPress={() => router.push('/bag')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
  label: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1,
    minHeight: tapTarget,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  chipOn: { borderColor: colors.lime, backgroundColor: '#1C3A24' },
  chipText: { color: colors.cream, fontSize: type.button, fontWeight: '800' },
});
