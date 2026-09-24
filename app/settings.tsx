import { router } from 'expo-router';
import type { ComponentProps } from 'react';
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
import { formatBuildStamp, readBuildStamp } from '@/src/domain/buildStamp';
import { COPY } from '@/src/domain/playerCopy';
import type { CourseDistanceUnit } from '@/src/domain/courseDistance';
import { COLOR_THEME_IDS, type ColorThemeId } from '@/src/domain/colorTheme';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Icon } from '@/src/ui/Icon';
import { Screen } from '@/src/ui/Screen';
import { cardBorder, tint } from '@/src/ui/surface';
import { ThemeSwatch } from '@/src/ui/ThemeSwatch';
import { ThunderbirdPinSheetPicker } from '@/src/ui/ThunderbirdPinSheetPicker';
import { type, type ColorPalette } from '@/src/ui/theme';

type IconName = ComponentProps<typeof Icon>['name'];

export default function SettingsScreen() {
  const { db, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const unit = getCourseDistanceUnit(db);
  const themeId = getColorTheme(db);
  const pinSheet = getThunderbirdPinSheet(db);
  const buildStamp = useMemo(() => formatBuildStamp(readBuildStamp()), []);

  const setUnit = (next: CourseDistanceUnit) => {
    setCourseDistanceUnit(db, next);
    bump();
  };

  const setTheme = (next: ColorThemeId) => {
    setColorTheme(db, next);
    bump();
  };

  const linkRow = (icon: IconName, glyph: string, color: string, label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.rowPressed]}>
      <View style={[styles.rowIcon, { backgroundColor: tint(color) }]}>
        <Icon name={icon} color={color} size={18} glyph={glyph} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Icon name="chevron.right" color={colors.muted} size={15} glyph="›" />
    </Pressable>
  );

  return (
    <Screen>
      <Text style={styles.title}>{COPY.settings}</Text>

      <Text style={styles.groupLabel}>{COPY.colorTheme}</Text>
      <View style={styles.themeGrid}>
        {COLOR_THEME_IDS.map((id) => (
          <ThemeSwatch key={id} id={id} selected={themeId === id} onPress={() => setTheme(id)} />
        ))}
      </View>

      <Text style={styles.groupLabel}>{COPY.courseDistance}</Text>
      <View style={styles.list}>
        <View style={styles.listRow}>
          <View style={[styles.rowIcon, { backgroundColor: tint(colors.lime) }]}>
            <Icon name="ruler" color={colors.lime} size={18} glyph="↔" />
          </View>
          <Text style={styles.rowLabel}>{COPY.courseDistance}</Text>
          <View style={styles.segment}>
            {(['mi', 'km'] as const).map((next) => (
              <Pressable
                key={next}
                accessibilityRole="button"
                accessibilityLabel={next === 'mi' ? COPY.miles : COPY.kilometers}
                accessibilityState={{ selected: unit === next }}
                onPress={() => setUnit(next)}
                style={[styles.segmentItem, unit === next && styles.segmentOn]}>
                <Text style={[styles.segmentText, unit === next && styles.segmentTextOn]}>{next}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <ThunderbirdPinSheetPicker
        selected={pinSheet}
        onSelect={(sheet) => {
          setThunderbirdPinSheet(db, sheet);
          bump();
        }}
      />

      <View style={styles.list}>
        {linkRow('bag.fill', '⛳', colors.amber, COPY.bag, () => router.push('/bag'))}
        <View style={styles.divider} />
        {linkRow('arrow.left.arrow.right', '⇄', colors.good, COPY.roundsTransfer, () =>
          router.push('/rounds-transfer'),
        )}
        <View style={styles.divider} />
        {linkRow('plus', '+', colors.red, COPY.contributeCourse, () => router.push('/contribute-course'))}
      </View>

      <Text style={styles.groupLabel}>{COPY.credits}</Text>
      <Text style={styles.credits}>{COPY.courseDataCredits}</Text>
      <Text style={styles.contact}>{COPY.contactLine}</Text>
      {buildStamp ? (
        <Text style={styles.stamp} selectable>
          {buildStamp}
        </Text>
      ) : null}
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    title: { color: colors.cream, fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
    groupLabel: {
      color: colors.muted,
      fontSize: type.kicker,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      marginTop: 8,
      marginHorizontal: 4,
    },
    themeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
    list: {
      backgroundColor: colors.bgElevated,
      borderRadius: 22,
      overflow: 'hidden',
      ...cardBorder(colors),
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      minHeight: 64,
    },
    rowPressed: { backgroundColor: colors.accentWash },
    rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, color: colors.cream, fontSize: type.body, fontWeight: '800' },
    divider: { height: colors.flat ? 2 : 1, backgroundColor: colors.line, marginLeft: 60 },
    segment: { flexDirection: 'row', backgroundColor: colors.accentWash, borderRadius: 12, padding: 3 },
    segmentItem: { minWidth: 48, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    segmentOn: { backgroundColor: colors.lime },
    segmentText: { color: colors.muted, fontSize: type.meta, fontWeight: '800' },
    segmentTextOn: { color: colors.onAccent },
    credits: { color: colors.muted, fontSize: type.meta, fontWeight: '600', marginHorizontal: 4 },
    contact: { color: colors.cream, fontSize: type.body, fontWeight: '800', marginHorizontal: 4 },
    stamp: { color: colors.muted, fontSize: type.meta, fontWeight: '600', marginTop: 8, marginHorizontal: 4 },
  });
}
