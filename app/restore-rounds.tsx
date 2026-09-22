import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { useDb } from '@/src/db/DbProvider';
import { restoreRoundHistory } from '@/src/db/repo';
import { COPY } from '@/src/domain/playerCopy';
import { formatRestoreSummary } from '@/src/domain/roundTransfer';
import { BigButton } from '@/src/ui/BigButton';
import { useColors } from '@/src/ui/ColorThemeProvider';
import { Screen } from '@/src/ui/Screen';
import { type, type ColorPalette } from '@/src/ui/theme';

export default function RestoreRoundsScreen() {
  const { db, bump } = useDb();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [raw, setRaw] = useState('');

  const restore = () => {
    const result = restoreRoundHistory(db, raw);
    if (!result.ok) {
      Alert.alert(COPY.restoreRoundsTitle, COPY.restoreRoundsFailed);
      return;
    }
    if (result.rounds === 0) {
      Alert.alert(COPY.restoreRoundsTitle, COPY.restoreRoundsEmpty);
      return;
    }
    bump();
    Alert.alert(
      COPY.restoreRoundsTitle,
      formatRestoreSummary({
        rounds: result.rounds,
        shots: result.shots,
        rejectedShots: result.rejectedShots,
      }),
    );
    router.back();
  };

  return (
    <Screen>
      <Text style={styles.lede}>{COPY.restoreRoundsHint}</Text>
      <TextInput
        value={raw}
        onChangeText={setRaw}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={COPY.restoreRoundsHint}
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <BigButton label={COPY.restoreRoundsAction} onPress={restore} />
    </Screen>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    lede: { color: colors.muted, fontSize: type.body, lineHeight: 22 },
    input: {
      minHeight: 180,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      padding: 12,
      color: colors.cream,
      fontSize: type.meta,
      backgroundColor: colors.bgElevated,
      textAlignVertical: 'top',
    },
  });
}
