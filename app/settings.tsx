import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { getColorTheme, getCourseDistanceUnit, setColorTheme, setCourseDistanceUnit } from '@/src/db/repo';
import { COPY } from '@/src/domain/playerCopy';
import type { CourseDistanceUnit } from '@/src/domain/courseDistance';
import { COLOR_THEME_IDS, type ColorThemeId } from '@/src/domain/colorTheme';
import { BigButton } from '@/src/ui/BigButton';
import { HowToBody } from '@/src/ui/HowToBody';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Screen } from '@/src/ui/Screen';
import { FullSheet } from '@/src/ui/Sheet';
import { tapTarget, type, type ColorPalette } from '@/src/ui/theme';

export default function SettingsScreen() {
  const { db, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [howToOpen, setHowToOpen] = useState(false);
  const unit = getCourseDistanceUnit(db);
  const themeId = getColorTheme(db);

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
      <BigButton label={COPY.howTo} variant="secondary" onPress={() => setHowToOpen(true)} />
      <BigButton label={COPY.bag} variant="secondary" onPress={() => router.push('/bag')} />
      <FullSheet visible={howToOpen} title={COPY.howTo} onClose={() => setHowToOpen(false)}>
        <HowToBody />
      </FullSheet>
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
  });
}
