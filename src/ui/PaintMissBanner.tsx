import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { PaintMissNotice } from '@/src/domain/paintMiss';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

export function PaintMissBanner({ notice }: { notice: PaintMissNotice | null }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!notice) return null;
  const loud = notice.loud;
  return (
    <View
      testID={notice.testID}
      accessibilityRole="alert"
      accessibilityLiveRegion={loud ? 'assertive' : 'polite'}
      style={loud ? styles.loud : styles.quiet}>
      <Text style={loud ? styles.loudTitle : styles.quietTitle}>{notice.title}</Text>
      {notice.detail ? (
        <Text style={loud ? styles.loudDetail : styles.quietDetail}>{notice.detail}</Text>
      ) : null}
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    loud: {
      backgroundColor: colors.amber,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 2,
    },
    quiet: {
      borderWidth: 1,
      borderColor: colors.orange,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
    },
    loudTitle: { color: colors.onAccent, fontSize: type.meta, fontWeight: '800' },
    loudDetail: { color: colors.onAccent, fontSize: type.tiny, fontWeight: '700' },
    quietTitle: { color: colors.orange, fontSize: type.meta, fontWeight: '800' },
    quietDetail: { color: colors.orange, fontSize: type.tiny, fontWeight: '700' },
  });
}
