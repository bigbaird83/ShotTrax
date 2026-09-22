import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import {
  getColorTheme,
  getCourseDistanceUnit,
  getThunderbirdPinSheet,
  setColorTheme,
  setCourseDistanceUnit,
  setThunderbirdPinSheet,
} from '@/src/db/repo';
import { COPY } from '@/src/domain/playerCopy';
import type { CourseDistanceUnit } from '@/src/domain/courseDistance';
import { COLOR_THEME_IDS, type ColorThemeId } from '@/src/domain/colorTheme';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Screen } from '@/src/ui/Screen';
import { ThunderbirdPinSheetPicker } from '@/src/ui/ThunderbirdPinSheetPicker';
import { tapTarget, type, type ColorPalette } from '@/src/ui/theme';

export default function SettingsScreen() {
  const { db, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const unit = getCourseDistanceUnit(db);
  const themeId = getColorTheme(db);
  const pinSheet = getThunderbirdPinSheet(db);

  const setUnit = (next: CourseDistanceUnit) => {
    setCourseDistanceUnit(db, next);
    bump();
  };

  const setTheme = (next: ColorThemeId) => {
    setColorTheme(db, next);
    bump();
  };

  return (
    <Screen>
      <Text style={styles.title}>{COPY.settings}</Text>
      <Text style={styles.label}>{COPY.colorTheme}</Text>
      <View style={styles.themeCol}>
        {COLOR_THEME_IDS.map((id) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: themeId === id }}
            onPress={() => setTheme(id)}
            style={[styles.chip, themeId === id && styles.chipOn]}>
            <Text style={[styles.chipText, themeId === id && styles.chipTextOn]}>
              {id === 'dark-lime'
                ? COPY.themeDarkLime
                : id === 'light'
                  ? COPY.themeLight
                  : COPY.themeHighContrast}
            </Text>
          </Pressable>
        ))}
      </View>
      <ThunderbirdPinSheetPicker
        selected={pinSheet}
        onSelect={(sheet) => {
          setThunderbirdPinSheet(db, sheet);
          bump();
        }}
      />
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
      <Text style={styles.creditsTitle}>{COPY.credits}</Text>
      <Text style={styles.credits}>{COPY.courseDataCredits}</Text>
      <Text style={styles.contact}>{COPY.contactLine}</Text>
      <BigButton label={COPY.requestThisCourse} variant="secondary" onPress={() => router.push('/request-course')} />
      <BigButton label={COPY.contributeCourse} variant="ghost" onPress={() => router.push('/contribute-course')} />
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: type.hole, fontWeight: '900' },
    label: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
    row: { flexDirection: 'row', gap: 10 },
    themeCol: { gap: 10 },
    chip: {
      flex: 1,
      minHeight: tapTarget,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgElevated,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    chipOn: { borderColor: colors.cream, backgroundColor: colors.accentWash },
    chipText: { color: colors.cream, fontSize: type.button, fontWeight: '800' },
    chipTextOn: { color: colors.cream },
    creditsTitle: { color: colors.cream, fontSize: type.body, fontWeight: '800', marginTop: 8 },
    credits: { color: colors.muted, fontSize: type.meta, fontWeight: '600' },
    contact: { color: colors.cream, fontSize: type.body, fontWeight: '800' },
  });
}
