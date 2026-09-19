import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COPY } from '@/src/domain/playerCopy';
import { useColors } from './ColorThemeProvider';
import { type, type ColorPalette } from './theme';

/** Fuller replayable how-to. User-opened only — never a first-launch modal. */
export function HowToBody() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Text style={styles.mark}>✓</Text>
        <Text style={styles.line}>{COPY.howToMark}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.mark}>✓</Text>
        <Text style={styles.line}>{COPY.howToFinish}</Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    box: { gap: 16, padding: 16 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    mark: { color: colors.lime, fontSize: type.hole, fontWeight: '900', lineHeight: 28 },
    line: { flex: 1, color: colors.cream, fontSize: type.body, fontWeight: '800', lineHeight: 28 },
  });
}
